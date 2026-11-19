import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createCreatorWorker } from "../server/pages-creator-worker.mjs";

function testDatabase() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../server/pages-creator-schema.sql",import.meta.url),"utf8"));
  return { sql, prepare(query) {
    const statement = sql.prepare(query);
    return { bind(...parameters) {
      return { first: () => statement.get(...parameters), run: () => ({ meta: statement.run(...parameters) }) };
    } };
  }, batch(statements) {
    sql.exec("BEGIN");
    try { const results = statements.map(s => s.run()); sql.exec("COMMIT"); return results; }
    catch (e) { sql.exec("ROLLBACK"); throw e; }
  } };
}
const request = (who, options) => new Request("https://reports.example/api/creators/"+who, options);
const env = () => ({ CREATOR_CACHE: testDatabase(), TIKHUB_TOKEN: "test-only" });
const profile = handle => ({ handle, sample: { limit: 5, checked: 2 }, posts: [], products: [], status: "no_evidence", score: null });

test("concurrent requests share one reservation; completion is cached and globally metered", async () => {
  const state = env(); let entered, release, calls = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const worker = createCreatorWorker(async handle => { calls++; entered(); await wait; return profile(handle); });
  const first = worker.fetch(request("Creator1"), state);
  await started;
  const concurrent = await worker.fetch(request("creator1"), state);
  assert.equal(concurrent.status, 429);
  assert.equal((await concurrent.json()).code, "busy");
  release();
  assert.equal((await (await first).json()).status, "no_evidence");
  assert.equal((await (await worker.fetch(request("CREATOR1"), state)).json()).handle, "creator1");
  assert.equal(calls, 1);
  assert.equal(state.CREATOR_CACHE.sql.prepare("SELECT used FROM creator_live_budget").get().used, 1);
  state.CREATOR_CACHE.sql.exec("UPDATE creator_live_budget SET used=60");
  const limited = await worker.fetch(request("creator2"), state);
  assert.equal(limited.status, 429); assert.equal((await limited.json()).code,"rate_limited");
  assert.equal(state.CREATOR_CACHE.sql.prepare("SELECT count(*) AS n FROM creator_live_cache").get().n,1);
  assert.equal((await worker.fetch(request("creator1"), state)).status, 200);
});

test("identifier restrictions, CORS, retryable failures and negative-cache distinctions", async () => {
  const state = env(); const failure = Object.assign(new Error("private upstream details"), {status:404});
  const worker = createCreatorWorker(async h => { throw h === "private" ? Object.assign(new Error(),{privateProfile:true,status:404}) : h === "missing" ? failure : new Error("private upstream details"); });
  for (const h of ["a/b","@someone","foo?market=GB","end."]) assert.equal((await worker.fetch(request(h), state)).status,400);
  assert.equal((await worker.fetch(request("any",{method:"POST"}),state)).status,405);
  assert.equal((await worker.fetch(request("any",{headers:{Origin:"https://other.example"}}),state)).status,403);
  assert.equal((await worker.fetch(request("any",{method:"OPTIONS",headers:{Origin:"https://yushui2022.github.io"}}),state)).headers.get("Access-Control-Allow-Origin"),"https://yushui2022.github.io");
  for (const [handle,expected,code] of [["missing",404,"not_found"],["private",403,"inaccessible"],["temporary",503,"unavailable"]]) {
    for (let n=0;n<2;n++) {
      const response=await worker.fetch(request(handle,{headers:{Origin:"https://yushui2022.github.io"}}),state);
      assert.equal(response.status,expected);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"),"https://yushui2022.github.io");
      const data=await response.json(); assert.equal(data.code,code); assert.doesNotMatch(data.message,/private upstream details/);
    }
  }
  assert.equal(state.CREATOR_CACHE.sql.prepare("SELECT used FROM creator_live_budget").get().used,3);
});

test("typing tim queries TikHub once, returns true user names and avatars, and does not consume report quota", async () => {
  const {searchLiveCreators}=await import("../server/creator-live-suggestions.mjs");
  const state=env(), routes=[];
  const img="https://p19-common-sign.tiktokcdn-eu.com/avatar.jpeg?sig=foo";
  const worker=createCreatorWorker(async handle=>profile(handle),(q,token)=>searchLiveCreators(q,token,async (url,init)=>{
    routes.push(url);
    assert.equal(init.headers.Authorization,"Bearer test-only");
    return Response.json({code:200,data:{status_code:0,user_list:[
      {user_info:{unique_id:"Tim",nickname:"Timothy",avatar_thumb:{url_list:[img]}}},
      {user_info:{unique_id:"Tim",nickname:"duplicate"}},
      {user_info:{unique_id:"private",private_account:1}},
      {user_info:{unique_id:"tim.t",nickname:"T",avatar_medium:{url_list:["https://untrusted.example/b.jpg"]}}},
    ]}});
  }));
  const first=await worker.fetch(new Request("https://reports.example/api/creator-suggestions?q=%40Tim"),state);
  assert.equal(first.status,200); assert.deepEqual((await first.json()).creators,[
    {handle:"tim",name:"Timothy",avatar:img},{handle:"tim.t",name:"T",avatar:null}
  ]);
  assert.equal((await worker.fetch(new Request("https://reports.example/api/creator-suggestions?q=tim"),state)).status,200);
  assert.equal(routes.length,1);assert.equal(routes[0].pathname,"/api/v1/tiktok/app/v3/fetch_user_search_result");
  assert.equal(routes[0].searchParams.get("keyword"),"tim");
  const report=await worker.fetch(request("tim"),state);
  assert.equal((await report.json()).handle,"tim");
  assert.equal(state.CREATOR_CACHE.sql.prepare("SELECT count(*) AS n FROM creator_live_budget").get().n,2);
});

test("failed search can resolve a verified exact profile; malformed input produces no upstream lookup", async()=>{
  const {searchLiveCreators,suggestionQuery}=await import("../server/creator-live-suggestions.mjs");
  assert.equal(suggestionQuery("周 杰伦"),"周 杰伦");assert.equal(suggestionQuery("https://site"),null);
  const urls=[];
  const matches=await searchLiveCreators("tim","test",async url=>{
    urls.push(url.pathname);
    if(url.pathname.endsWith("fetch_user_search_result"))return new Response(null,{status:503});
    return Response.json({code:200,data:{userInfo:{user:{uniqueId:"tim",nickname:"Tim",avatarThumb:"https://p16.tiktokcdn.com/a.jpg"}}}});
  });
  assert.deepEqual(matches.creators.map(r=>r.handle),["tim"]);assert.equal(urls.length,2);
  const state=env();const worker=createCreatorWorker(null,()=>{throw Error("unexpected");});
  assert.equal((await worker.fetch(new Request("https://reports.example/api/creator-suggestions?q=a"),state)).status,400);
  assert.equal(state.CREATOR_CACHE.sql.prepare("SELECT count(*) AS n FROM creator_live_cache").get().n,0);
});

test("a verified search identity still opens when both public video feeds are unreadable",async()=>{
  const {lookupVideo}=await import("../server/video-lookup.mjs");
  const {liveProfileFallback}=await import("../server/creator-live-suggestions.mjs");
  const called=[];
  const result=await lookupVideo("https://www.tiktok.com/@verified_new",{
    tikhubOnly:true,market:"US",token:"test",profileFallback:liveProfileFallback,fetchImpl:async target=>{
      called.push(target.pathname);
      const payload=target.pathname.endsWith("fetch_user_profile")?{statusCode:209002}
        :target.pathname.endsWith("fetch_user_search_result")?{user_list:[
          {user_info:{unique_id:"not_verified_new",nickname:"Wrong"}},
          {user_info:{unique_id:"verified_new",sec_uid:"A123",signature:"Real bio",nickname:"Verified New",aweme_count:94}}]}
        :{status_code:0,status_msg:"No more videos"};
      if(target.pathname.includes("fetch_user_post_videos"))assert.equal(target.searchParams.get("sec_user_id"),"A123");
      return Response.json({code:200,data:payload});
    }
  });
  assert.equal(result.status,"partial");assert.equal(result.displayName,"Verified New");assert.equal(result.video.caption,"Real bio");
  assert.equal(result.sample.checked,0);assert.deepEqual(result.commerce,[]);
  assert.equal(called.length,4);
});

test("publishing suggestions also saves a private identity for clicking if the post provider fails", async () => {
  const state=env(), handle="timofficial";
  const entry={handle,name:"TIM",avatar:"https://p16.tiktokcdn.com/face.jpg"};
  const worker=createCreatorWorker(async (who,token,identity) => {
    assert.equal(identity.handle,who); assert.equal(identity.secUid,"server-only"); throw new Error("post service unavailable");
  }, async()=>({creators:[entry],identities:[{...entry,secUid:"server-only",bio:"My channel"}]}));
  const choice=await worker.fetch(new Request("https://reports.example/api/creator-suggestions?q=tim"),state);
  assert.deepEqual(await choice.json(),{creators:[entry]});
  const report=await worker.fetch(request(handle),state);
  assert.equal(report.status,200);
  const data=await report.json();
  assert.equal(data.status,"partial");assert.equal(data.name,"TIM");assert.equal(data.avatar,entry.avatar);
  assert.equal(data.bio,"My channel");assert.equal(data.sample.checked,0);assert.deepEqual(data.posts,[]);
  assert.deepEqual(data.products,[]);assert.equal(data.score,null);assert.ok(!("secUid" in data));
});
test("real product pipeline completes with a verified public profile but no linked products", async (t) => {
  const state=env();
  t.mock.method(globalThis,"fetch", async (url,options)=>{
    assert.equal(options.redirect,"manual");
    if(url.pathname.endsWith("fetch_user_profile")) return Response.json({code:200,data:{userInfo:{user:{uniqueId:"harry",secUid:"verified"}}}});
    assert.ok(url.pathname.endsWith("fetch_user_post_videos"));
    return Response.json({code:200,data:{aweme_list:[]}});
  });
  const response=await createCreatorWorker().fetch(request("harry"),state);
  const data=await response.json();assert.equal(response.status,200);
  assert.equal(data.status,"no_evidence");assert.equal(data.sample.checked,0);assert.deepEqual(data.products,[]);assert.equal(data.score,null);
});
