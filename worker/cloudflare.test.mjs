import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { verifiedIdentity } from './cloudflare.js';

function database() {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0001_planner_state.sql','0002_user_planner_states.sql','0003_planner_members.sql']) db.exec(readFileSync(new URL('../drizzle/'+name, import.meta.url),'utf8'));
  return { prepare(sql) { let params = []; return { bind(...values) { params = values; return this; }, async all() { return {results:db.prepare(sql).all(...params)}; }, async run() { return {meta:{changes:Number(db.prepare(sql).run(...params).changes)}}; } }; } };
}
const env = () => ({ DB: database(), ACCESS_ISSUER: 'https://test.cloudflareaccess.com', ACCESS_AUD: 'planner-audience' });
const context = email => ({ access: { aud:'planner-audience', async getIdentity() { return { email, name:email }; } } });
const req = (path, method='GET', data) => new Request('https://planner.example'+path, {method, headers:{origin:'https://planner.example','content-type':'application/json'}, ...(data ? {body:JSON.stringify(data)} : {}) });
const data = {schemaVersion:2, events:[{id:'event-1',draftLayout:{'1':{left:23.4,top:41.2,widthM:2,depthM:3}}}]};

test('forged identity headers do not grant admin rights', async () => {
  const request = new Request('https://planner.example/api/members',{headers:{'oai-authenticated-user-id':'fake','oai-authenticated-user-email':'npodech@gmail.com'}});
  assert.equal((await worker.fetch(request,env(),{})).status,401);
});
test('verified admin can manage roles; editor cannot; revoked user loses access', async () => {
  const e=env(), admin=context('npodech@gmail.com'), user=context('member@example.com');
  assert.equal((await worker.fetch(req('/api/members','POST',{email:'member@example.com',role:'editor'}),e,admin)).status,200);
  assert.equal((await worker.fetch(req('/api/members'),e,user)).status,403);
  assert.equal((await worker.fetch(req('/api/planner','PUT',{data,baseRevision:0}),e,user)).status,200);
  assert.equal((await worker.fetch(req('/api/members','PATCH',{email:'member@example.com',role:'viewer'}),e,admin)).status,200);
  assert.equal((await worker.fetch(req('/api/planner','PUT',{data,baseRevision:1}),e,user)).status,403);
  await worker.fetch(req('/api/members?email=member%40example.com','DELETE'),e,admin);
  assert.equal((await worker.fetch(req('/api/planner'),e,user)).status,403);
});
test('cross-device coordinates round trip; stale revisions cannot overwrite; users are isolated', async () => {
  const e=env(), admin=context('npodech@gmail.com');
  const response=await worker.fetch(req('/api/planner','PUT',{data,baseRevision:0}),e,admin);
  assert.equal(response.status,200);
  const saved=await (await worker.fetch(req('/api/planner'),e,admin)).json();
  assert.deepEqual(saved.data,data);
  assert.equal((await worker.fetch(req('/api/planner','PUT',{data:{...data,updatedAt:1},baseRevision:0}),e,admin)).status,409);
  await worker.fetch(req('/api/members','POST',{email:'other@example.com',role:'editor'}),e,admin);
  const other=await (await worker.fetch(req('/api/planner'),e,context('other@example.com'))).json();
  assert.equal(other.data,null);
});
test('cross-origin writes are rejected', async () => {
  const request = new Request('https://planner.example/api/planner',{method:'PUT',headers:{origin:'https://attacker.example','content-type':'application/json'},body:JSON.stringify({data})});
  assert.equal((await worker.fetch(request,env(),context('npodech@gmail.com'))).status,403);
});
test('JWT signature, audience, issuer and expiry are checked', async () => {
  const key = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk = await crypto.subtle.exportKey('jwk',key.publicKey); jwk.kid='test-key';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{assert.equal(url,'https://test.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});};
  const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const make=async override=>{
    const part=b64({alg:'RS256',kid:jwk.kid})+'.'+b64({iss:'https://test.cloudflareaccess.com',aud:['planner-audience'],sub:'user-1',email:'npodech@gmail.com',exp:Date.now()/1000+60,...override});
    const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(part));
    return new Request('https://planner.example/api/me',{headers:{'cf-access-jwt-assertion':part+'.'+Buffer.from(signature).toString('base64url')}});
  };
  try {
    assert.equal((await verifiedIdentity(await make({}),env())).email,'npodech@gmail.com');
    for(const override of [{exp:1},{aud:['other-app']},{iss:'https://wrong.cloudflareaccess.com'},{nbf:Date.now()/1000+3600}]) assert.equal(await verifiedIdentity(await make(override),env()),null);
    const forged=await make({}); const token=forged.headers.get('cf-access-jwt-assertion');
    forged.headers.set('cf-access-jwt-assertion', token.slice(0,token.lastIndexOf('.')+1)+'AAAA');
    assert.equal(await verifiedIdentity(forged,env()),null);
  } finally {globalThis.fetch=originalFetch;}
});
