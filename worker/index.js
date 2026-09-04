const SPACE_IDS = [...Array.from({ length: 24 }, (_, index) => String(index + 1)), "EVENT"];
const VALID_STATUSES = new Set(["available", "hold", "confirmed", "setup"]);
const VALID_MEMBER_ROLES = new Set(["editor", "viewer"]);
const ADMIN_EMAIL = "npodech@gmail.com";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function requestIdentity(request) {
  const id = request.headers.get("oai-authenticated-user-id") || "";
  const email = (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
  const encodedName = request.headers.get("oai-authenticated-user-full-name") || "";
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let name = "";
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encodedName); } catch (_) {}
  }
  return { id, email, name };
}

async function memberAccess(db, identity) {
  if (!identity.id) return { authenticated:false, access:false, role:"visitor", status:"anonymous" };
  if (identity.email === ADMIN_EMAIL) return { authenticated:true, access:true, role:"admin", status:"active" };
  const { results = [] } = await db.prepare(`SELECT email, name, role, status FROM planner_members WHERE email = ?`).bind(identity.email).all();
  const member = results[0];
  return { authenticated:true, access:member?.status === "active", role:VALID_MEMBER_ROLES.has(member?.role) ? member.role : "editor", status:member?.status || "not_invited" };
}

async function listMembers(db, identity) {
  const { results = [] } = await db.prepare(`SELECT email, name, role, status, created_at, updated_at FROM planner_members ORDER BY created_at DESC`).all();
  return [{ email:ADMIN_EMAIL, name:identity.name || "Nattawut Podech", role:"admin", status:"active", protected:true }, ...results];
}

function normalizeSpace(id, value) {
  const assignment = value?.assignment ?? {};
  const status = VALID_STATUSES.has(assignment.status) ? assignment.status : "available";
  return {
    id,
    area: value?.area === "" || value?.area == null ? null : Number(value.area),
    shopName: String(assignment.shopName ?? "").slice(0, 160),
    category: String(assignment.category ?? "").slice(0, 160),
    status,
    startDate: String(assignment.startDate ?? "").slice(0, 10),
    endDate: String(assignment.endDate ?? "").slice(0, 10),
    contact: String(assignment.contact ?? "").slice(0, 240),
    notes: String(assignment.notes ?? "").slice(0, 2000),
  };
}

async function readState(db) {
  const statement = db.prepare(`
    SELECT space_id, area, shop_name, category, status, start_date, end_date, contact, notes, updated_at
    FROM event_spaces
  `);
  const { results = [] } = await statement.all();
  if (!results.length) return { spaces: null, updatedAt: null };
  const spaces = {};
  for (const row of results) {
    spaces[row.space_id] = {
      area: row.area == null ? "" : String(row.area),
      assignment: {
        shopName: row.shop_name ?? "",
        category: row.category ?? "",
        status: VALID_STATUSES.has(row.status) ? row.status : "available",
        startDate: row.start_date ?? "",
        endDate: row.end_date ?? "",
        contact: row.contact ?? "",
        notes: row.notes ?? "",
      },
    };
  }
  const complete = SPACE_IDS.every(id => spaces[id]);
  return { spaces: complete ? spaces : null, updatedAt: Math.max(...results.map(row => Number(row.updated_at) || 0)) };
}

async function writeState(db, body) {
  if (!body?.spaces || !SPACE_IDS.every(id => body.spaces[id])) {
    return json({ error: "Invalid plan state" }, 400);
  }
  const current = await readState(db);
  const baseUpdatedAt = Number(body.baseUpdatedAt) || 0;
  const currentUpdatedAt = Number(current.updatedAt) || 0;
  if (current.spaces && baseUpdatedAt && currentUpdatedAt !== baseUpdatedAt) {
    return json(current, 409);
  }
  const updatedAt = Number(body.updatedAt) || Date.now();
  const sql = `
    INSERT INTO event_spaces (
      space_id, area, shop_name, category, status, start_date, end_date, contact, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(space_id) DO UPDATE SET
      area = excluded.area,
      shop_name = excluded.shop_name,
      category = excluded.category,
      status = excluded.status,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      contact = excluded.contact,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `;
  const statements = SPACE_IDS.map(id => {
    const value = normalizeSpace(id, body.spaces[id]);
    if (value.area != null && (!Number.isFinite(value.area) || value.area < 0)) throw new Error(`Invalid area for ${id}`);
    return db.prepare(sql).bind(
      value.id, value.area, value.shopName, value.category, value.status,
      value.startDate, value.endDate, value.contact, value.notes, updatedAt,
    );
  });
  await db.batch(statements);
  return json({ ok: true, updatedAt, spaceCount: SPACE_IDS.length });
}

async function readLegacyPlanner(db) {
  const { results = [] } = await db.prepare(`
    SELECT state_json, revision, updated_at, updated_by
    FROM planner_states
    WHERE id = 1
  `).all();
  const row = results[0];
  if (!row) return { data: null, revision: 0, updatedAt: null, updatedBy: "" };
  try {
    return { data: JSON.parse(row.state_json), revision: Number(row.revision) || 0, updatedAt: Number(row.updated_at) || null, updatedBy: row.updated_by || "" };
  } catch (_) {
    return { data: null, revision: Number(row.revision) || 0, updatedAt: Number(row.updated_at) || null, updatedBy: row.updated_by || "" };
  }
}

async function readPlanner(db, userId, email = "") {
  const { results = [] } = await db.prepare(`
    SELECT state_json, revision, updated_at, updated_by
    FROM user_planner_states
    WHERE user_id = ?
  `).bind(userId).all();
  const row = results[0];
  if (!row && email.toLowerCase() === "npodech@gmail.com") return readLegacyPlanner(db);
  if (!row) return { data: null, revision: 0, updatedAt: null, updatedBy: "" };
  try { return { data: JSON.parse(row.state_json), revision: Number(row.revision) || 0, updatedAt: Number(row.updated_at) || null, updatedBy: row.updated_by || "" }; }
  catch (_) { return { data: null, revision: Number(row.revision) || 0, updatedAt: Number(row.updated_at) || null, updatedBy: row.updated_by || "" }; }
}

async function writePlanner(request, db, body, userId, email = "") {
  if (!body?.data?.events?.length || body.data.schemaVersion !== 2) return json({ error: "Invalid planner data" }, 400);
  const stateJson = JSON.stringify(body.data);
  if (stateJson.length > 2_000_000) return json({ error: "Planner data is too large" }, 413);
  const { results = [] } = await db.prepare(`SELECT state_json, revision, updated_at, updated_by FROM user_planner_states WHERE user_id = ?`).bind(userId).all();
  let current = results[0] ? await readPlanner(db, userId, email) : { data:null, revision:0, updatedAt:null, updatedBy:"" };
  if(!current.data && email.toLowerCase()==="npodech@gmail.com") current=await readLegacyPlanner(db);
  const baseRevision = Number(body.baseRevision) || 0;
  if (current.data && current.revision !== baseRevision) return json(current, 409);
  const updatedAt = Date.now();
  const updatedBy = email || userId;
  if (!results[0]) {
    try {
      await db.prepare(`
        INSERT INTO user_planner_states (user_id, state_json, revision, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(userId, stateJson, current.revision + 1, updatedAt, updatedBy).run();
      return json({ ok: true, revision: current.revision + 1, updatedAt, updatedBy });
    } catch (_) {
      return json(await readPlanner(db,userId,email),409);
    }
  }
  const nextRevision = current.revision + 1;
  const result=await db.prepare(`
    UPDATE user_planner_states
    SET state_json = ?, revision = ?, updated_at = ?, updated_by = ?
    WHERE user_id = ? AND revision = ?
  `).bind(stateJson, nextRevision, updatedAt, updatedBy, userId, current.revision).run();
  if (!result?.meta?.changes) return json(await readPlanner(db,userId,email),409);
  return json({ ok: true, revision: nextRevision, updatedAt, updatedBy });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/me" && request.method === "GET") {
      const identity = requestIdentity(request);
      const access = env.DB ? await memberAccess(env.DB, identity) : { authenticated:Boolean(identity.id), access:false, role:"visitor", status:"unavailable" };
      return json({ ...identity, ...access });
    }
    if (url.pathname === "/api/members") {
      if (!env.DB) return json({ error:"Database binding unavailable" }, 503);
      const identity=requestIdentity(request),access=await memberAccess(env.DB,identity);
      if (!access.authenticated) return json({ error:"Sign in required" }, 401);
      if (access.role !== "admin") return json({ error:"Admin only" }, 403);
      if (request.method === "GET") return json({ members:await listMembers(env.DB,identity) });
      if (request.method === "POST") {
        const body=await request.json(),email=String(body?.email||"").trim().toLowerCase(),name=String(body?.name||"").trim().slice(0,120),role=VALID_MEMBER_ROLES.has(body?.role)?body.role:"editor";
        if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error:"Invalid email" },400);
        if (email===ADMIN_EMAIL) return json({ error:"Admin account is protected" },400);
        const now=Date.now();
        await env.DB.prepare(`INSERT INTO planner_members (email, name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, status = 'active', updated_at = excluded.updated_at`).bind(email,name,role,now,now).run();
        return json({ ok:true, members:await listMembers(env.DB,identity) });
      }
      if (request.method === "PATCH") {
        const body=await request.json(),email=String(body?.email||"").trim().toLowerCase(),role=String(body?.role||"");
        if (!email || email===ADMIN_EMAIL || !VALID_MEMBER_ROLES.has(role)) return json({ error:"Invalid member update" },400);
        const result=await env.DB.prepare(`UPDATE planner_members SET role = ?, updated_at = ? WHERE email = ?`).bind(role,Date.now(),email).run();
        if (!result?.meta?.changes) return json({ error:"Member not found" },404);
        return json({ ok:true, members:await listMembers(env.DB,identity) });
      }
      if (request.method === "DELETE") {
        const email=String(url.searchParams.get("email")||"").trim().toLowerCase();
        if (!email || email===ADMIN_EMAIL) return json({ error:"Protected account" },400);
        await env.DB.prepare(`DELETE FROM planner_members WHERE email = ?`).bind(email).run();
        return json({ ok:true, members:await listMembers(env.DB,identity) });
      }
      return json({ error:"Method not allowed" },405);
    }
    if (url.pathname === "/api/planner") {
      if (!env.DB) return json({ error: "Database binding unavailable" }, 503);
      const identity=requestIdentity(request),userId=identity.id,email=identity.email,access=await memberAccess(env.DB,identity);
      if (request.method === "GET") {
        if (!access.authenticated) return json({data:null,revision:0,updatedAt:null,updatedBy:"",authenticated:false,access:false});
        if (!access.access) return json({ error:"Account is not authorized",authenticated:true,access:false },403);
        return json({...(await readPlanner(env.DB,userId,email)),authenticated:true,access:true,role:access.role});
      }
      if (request.method === "PUT") {
        if (!userId) return json({ error: "Sign in required" }, 401);
        if (!access.access) return json({ error:"Account is not authorized" },403);
        if (access.role === "viewer") return json({ error:"Read only account" },403);
        try { return await writePlanner(request, env.DB, await request.json(),userId,email); }
        catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400); }
      }
      return json({ error: "Method not allowed" }, 405);
    }
    if (url.pathname === "/api/state") {
      return json({ error: "Legacy endpoint retired" }, 410);
    }
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
