import worker from "../worker/index.js";

const eventRows = new Map();
let plannerRow = null;
const userPlannerRows = new Map();
const DB = {
  prepare(sql) {
    return {
      sql, args: [],
      bind(...args) { this.args = args; return this; },
      async all() {
        if (sql.includes("FROM user_planner_states")) return { results: userPlannerRows.has(this.args[0]) ? [userPlannerRows.get(this.args[0])] : [] };
        if (sql.includes("FROM planner_states")) return { results: plannerRow ? [plannerRow] : [] };
        return { results: [...eventRows.values()] };
      },
      async run() {
        if (sql.includes("INSERT INTO user_planner_states")) {
          const [user_id,state_json,revision,updated_at,updated_by] = this.args;
          userPlannerRows.set(user_id,{user_id,state_json,revision,updated_at,updated_by});
        } else if (sql.includes("UPDATE user_planner_states")) {
          const [state_json,revision,updated_at,updated_by,user_id] = this.args;
          userPlannerRows.set(user_id,{...userPlannerRows.get(user_id),state_json,revision,updated_at,updated_by});
        } else if (sql.includes("INSERT INTO planner_states")) {
          const [id,state_json,revision,updated_at,updated_by] = this.args;
          plannerRow = { id,state_json,revision,updated_at,updated_by };
        } else if (sql.includes("UPDATE planner_states")) {
          const [state_json,revision,updated_at,updated_by] = this.args;
          plannerRow = { ...plannerRow,state_json,revision,updated_at,updated_by };
        } else {
          const [space_id,area,shop_name,category,status,start_date,end_date,contact,notes,updated_at] = this.args;
          eventRows.set(space_id,{space_id,area,shop_name,category,status,start_date,end_date,contact,notes,updated_at});
        }
        return { success:true };
      },
    };
  },
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
};

const authHeaders = { "content-type":"application/json", "oai-authenticated-user-id":"user-1", "oai-authenticated-user-email":"team@example.com" };
const planner = { schemaVersion:2,activeEventId:"event-1",events:[{id:"event-1",name:"Test",spaces:{},draftLayout:{},publishedLayout:{},versions:[]}],updatedAt:Date.now() };
const put = await worker.fetch(new Request("https://example.test/api/planner",{method:"PUT",headers:authHeaders,body:JSON.stringify({data:planner,baseRevision:0})}),{DB});
if(!put.ok) throw new Error(`Planner PUT failed: ${put.status}`);
const get = await worker.fetch(new Request("https://example.test/api/planner",{headers:authHeaders}),{DB});
const saved = await get.json();
if(saved.revision!==1 || saved.data.activeEventId!=="event-1") throw new Error("Planner GET failed");
const conflict = await worker.fetch(new Request("https://example.test/api/planner",{method:"PUT",headers:authHeaders,body:JSON.stringify({data:planner,baseRevision:0})}),{DB});
if(conflict.status!==409) throw new Error("Concurrent edit was not rejected");
const anonymous = await worker.fetch(new Request("https://example.test/api/planner",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({data:planner,baseRevision:1})}),{DB});
if(anonymous.status!==401) throw new Error("Anonymous write was not rejected");
const user2Headers={"content-type":"application/json","oai-authenticated-user-id":"user-2","oai-authenticated-user-email":"other@example.com"};
const user2Get=await worker.fetch(new Request("https://example.test/api/planner",{headers:user2Headers}),{DB});
if((await user2Get.json()).data!==null)throw new Error("User data was not isolated");
const me = await worker.fetch(new Request("https://example.test/api/me",{headers:authHeaders}),{DB});
if(!(await me.json()).authenticated) throw new Error("Member identity was not detected");
console.log("Worker storage and collaboration contract passed");
