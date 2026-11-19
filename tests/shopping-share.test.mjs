import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as pause } from "node:timers/promises";
import { renderShoppingShareCard } from "../server/shopping-share-card.mjs";
import { createShoppingJobs } from "../server/shopping-jobs.mjs";
import { shoppingInput } from "../server/shopping-check.mjs";

const mainProduct = "1730000000000000111", otherProduct = "1730000000000000112";
const mainSku = "1730000000000000211", otherSku = "1730000000000000212";
const marketUrl = id => "https://shop.tiktok.com/us/pdp/" + id;
const video = "https://www.tiktok.com/@creator/video/7655555555555555555";

function scoredReport() {
  const name = 'Stanley Quencher tumbler <script>alert("card")</script>';
  const peer = marketUrl(otherProduct) + "?sku_id=" + otherSku + "&utm_campaign=private-campaign";
  return { kind:"video", market:"US", scope:"tiktok-shop", status:"compared", methodVersion:"tikhub-shop-v1.1", internalSecret:"provider-secret",
    video:{ handle:"creator",url:video,caption:"Contact person@example.com or https://shop.example/item?token=private-campaign",
      provider:"TikHub", sourceUrl:video, observedAt:"2026-11-19", screenshot:"private-image" },
    sample:{ checked:1,limit:1 }, sources:[{url:"javascript:alert(1)",label:"bad"},
      {url:"https://www.tiktok.com/shop/s?search_key=blue%20tumbler&utm_campaign=private-campaign",label:"Shop search"},
      {url:"https://outside.example/shop/s?search_key=private-campaign",label:"Other source"}], steps:[], authorization:"private-auth",
    commerce:[{ productId:mainProduct,name,market:"US",listingUrl:marketUrl(mainProduct),seller:"Main shop",sellerId:"1731000000000000111",
      variants:[{skuId:mainSku, variant:"Blue 40 oz", price:60, currency:"USD", available:true}]}],
    checks:[{ productIndex:0,variantIndex:0,status:"compared", offers:[{
      name,variant:"Blue 40 oz",price:50,currency:"USD",url:peer,seller:"Other shop",sellerId:"1731000000000000112",skuId:otherSku,
      match:"exact",verifiedShop:true,available:true,privatePayload:"private-offer"
    }],comparison:{ basis:"item",sourcePrice:60,alternativePrice:50,currency:"USD",difference:10,alternativeUrl:peer }}] };
}

async function harness(t,{run,now=Date.now,retentionMs=1000*60*60*24,path=":memory:",dailyLimit}={}) {
  let calls = 0;
  const service = createShoppingJobs({ databasePath:path, publicBaseUrl:"https://onion.example", normalize:shoppingInput,
    run:async input => {calls++; return run ? run(input) : scoredReport();}, now,retentionMs,dailyLimit,pollMs:10 });
  const server = http.createServer(async (req,res) => {if (!await service.handle(req,res)) res.writeHead(404).end();});
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  let closed = false;
  const close = async () => { if (!closed) { closed=true;service.close();await new Promise(resolve=>server.close(resolve));} };
  t.after(close);
  const origin = "http://127.0.0.1:" + server.address().port;
  const request = (path,opts) => fetch(origin+path,opts);
  const jobs = "/api/shopping-jobs/";
  async function create(url=video) {
    const res = await request(jobs.slice(0,-1), {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
    return (await res.json()).id;
  }
  async function finished(id) {
    for (let i=0;i<150;i++) {
      const job=await (await request(jobs+id)).json();
      if (job.status==="ready" || job.status==="failed") return job;
      await pause(8);
    }
    throw Error("Job did not finish");
  }
  return {create,finished,close,request,read:id=>request(jobs+id),share:(id,extra)=>request(jobs+id+"/share",{method:"POST",...extra}),
    calls:()=>calls};
}

test("a price report is private until published, publishing is idempotent, and permalinks render without another check", async t => {
  const s=await harness(t);
  const id=await s.create(); await s.finished(id);
  assert.equal((await s.request("/r/"+id)).status,404);
  assert.equal((await s.request("/r/"+id+"/card.png")).status,404);
  assert.equal((await s.request("/api/shopping-jobs/"+id+"/share")).status,405);
  assert.equal((await s.share(id,{headers:{Origin:"https://foreign.example"}})).status,403);
  assert.equal((await s.share(id,{headers:{"Sec-Fetch-Site":"cross-site"}})).status,403);
  assert.equal((await s.share(id,{body:'{"sharedPayload":"override"}'})).status,400);
  assert.equal((await s.share(id,{body:"x".repeat(300)})).status,413);
  const both=await Promise.all([s.share(id),s.share(id,{body:"{}",headers:{"Content-Type":"application/json"}})]);
  for (const r of both) {assert.equal(r.status,200); assert.deepEqual(await r.json(),{url:"/r/"+id});}
  const page=await s.request("/r/"+id,{headers:{Host:"poison.example","X-Forwarded-Host":"wrong.example"}});
  const html=await page.text();
  assert.equal(page.status,200);
  assert.match(html,/Rotten Onion Score 20\/100/);
  assert.match(html,/Verified same variant/); assert.match(html,/\$60\.00/); assert.match(html,/\$50\.00/);
  assert.match(html,/Stanley Quencher tumbler &lt;script&gt;/);
  assert.doesNotMatch(html,/<script>alert|poison\.example|wrong\.example|private-|person@example|javascript:/);
  assert.ok(html.includes('property="og:url" content="https://onion.example/r/'+id+'"'));
  assert.ok(html.includes('property="og:image" content="https://onion.example/r/'+id+'/card.png"'));
  const href=html.match(/id="report-link" href="([^"]+)"/)[1].replaceAll("&amp;","&");
  const route=new URL(href,"https://onion.example");
  assert.equal(route.origin,"https://onion.example"); assert.ok(route.hash.startsWith("#shop/video?"));
  const query=new URLSearchParams(route.hash.split("?")[1]); assert.equal(query.get("job"),id);assert.equal(query.get("url"),video);
  assert.ok(page.headers.get("content-security-policy").includes("script-src 'sha256-"));
  const restored=await (await s.read(id)).json(); const json=JSON.stringify(restored);
  assert.doesNotMatch(json,/private-|provider-secret|person@example|javascript:/);
  assert.equal(new URL(restored.report.sources[0].url).searchParams.get("search_key"),"blue tumbler");
  assert.equal(new URL(restored.report.sources[1].url).searchParams.has("search_key"),false);
  assert.equal(restored.report.shopOnion.basis,"exact"); assert.equal(restored.report.shopOnion.score,20);
  assert.equal(restored.report.commerce[0].variants[0].skuId,mainSku);
  const head=await s.request("/r/"+id,{method:"HEAD"});
  assert.equal(head.status,200);assert.equal(await head.text(),"");
  const cardHead=await s.request("/r/"+id+"/card.png",{method:"HEAD"});
  assert.equal(cardHead.headers.get("content-type"),"image/png");assert.equal(await cardHead.text(),"");
  const card=await s.request("/r/"+id+"/card.png");
  const bytes=Buffer.from(await card.arrayBuffer());
  assert.equal(bytes.subarray(1,4).toString(),"PNG"); assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),630);
  assert.equal((await s.request("/r/"+id+"/card.png",{headers:{"If-None-Match":card.headers.get("etag")}})).status,304);
  assert.equal(s.calls(),1);
});

test("shared snapshots survive job pruning and restart; unpublished expired jobs and unknown routes stay unavailable",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"onion-share-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"jobs.sqlite");let clock=10000;
  const opts={path,now:()=>clock,retentionMs:10};
  const s=await harness(t,opts);
  const published=await s.create(), other=await s.create("https://www.tiktok.com/@other");
  await s.finished(published);await s.finished(other); await s.share(published);
  const original=await (await s.read(published)).json();
  clock+=20;
  await s.close();
  const restarted=await harness(t,{...opts,run:()=>{throw Error("A shared read started work");}});
  assert.equal((await restarted.request("/r/"+published)).status,200);
  assert.deepEqual(await (await restarted.read(published)).json(),original);
  assert.equal((await restarted.share(published)).status,200);
  assert.equal((await restarted.read(other)).status,404);assert.equal((await restarted.share(other)).status,404);
  for (const path of ["/r","/r/abc","/r/"+randomUUID(),"/r/"+published+"/junk","/r/"+published+"/card.png/sub"]) assert.equal((await restarted.request(path)).status,404);
  assert.equal((await restarted.share("not-a-uuid")).status,404);
  assert.equal((await restarted.request("/r/"+published,{method:"POST"})).status,405);
  assert.equal(restarted.calls(),0);
});

test("incomplete and failed checks cannot publish; unavailable evidence yields an explicit unscored report",async t=>{
  let resume;const gate=new Promise(r=>resume=r);
  const s=await harness(t,{run:async input=>{
    if (input.kind==="video") {await gate;throw Error("private upstream debug");}
    return {kind:"profile",status:"no_evidence",market:"US",video:{handle:"walker",url:input.url},commerce:[],checks:[]};
  }});
  const id=await s.create();
  assert.equal((await s.share(id)).status,409);resume();
  assert.equal((await s.finished(id)).status,"failed");
  assert.equal((await s.share(id)).status,409);assert.equal((await s.request("/r/"+id)).status,404);
  const other=await s.create("https://www.tiktok.com/@walker");await s.finished(other);await s.share(other);
  const html=await (await s.request("/r/"+other)).text();
  assert.match(html,/@walker · Unscored/);assert.doesNotMatch(html,/0\/100|save \$/i);
});

test("comparable-product evidence is labeled as an estimate in share previews",async t=>{
  const r=scoredReport(); const p=r.commerce[0];
  p.name = "Stanley Quencher H2.0 FlowState tumbler 40 oz stainless steel";
  const c=r.checks[0]; c.status="candidates";c.comparison=null;c.offers[0].match="candidate";c.offers[0].name=p.name;
  const s=await harness(t,{run:()=>r});const id=await s.create();await s.finished(id);await s.share(id);
  const snapshot=await (await s.read(id)).json();assert.equal(snapshot.report.shopOnion.basis,"similar");
  const html=await (await s.request("/r/"+id)).text();
  assert.match(html,/comparable products/i);assert.match(html,/Comparable product benchmark/);
  assert.doesNotMatch(html,/verified same variant|confirmed savings|save \$/i);
});

test("a stored v1 decision stays historical when first shared, including reports saved before methodVersion",async t=>{
  const archived=scoredReport();
  const s=await harness(t,{run:async()=>archived});
  const submitted=await s.create();await s.finished(submitted);
  const response=await s.share(submitted);assert.equal(response.status,200);
  const v1=await (await s.read(submitted)).json();
  assert.equal(v1.report.shopOnion.version,"shop-onion-v1");assert.equal(v1.report.shopOnion.score,20);
  assert.equal(v1.report.shopOnion.decision,undefined);
  const html=await (await s.request("/r/"+submitted)).text();
  assert.match(html,/Historical scoring method · shop-onion-v1/);assert.doesNotMatch(html,/How the decision was reached/);
  delete archived.methodVersion;
  const earlier=await s.create("https://www.tiktok.com/@earlier");const reopened=await s.finished(earlier);
  assert.equal(reopened.report.methodVersion,"tikhub-shop-v1");
  await s.share(earlier);
  const frozen=await (await s.read(earlier)).json();
  assert.equal(frozen.report.shopOnion.version,"shop-onion-v1");assert.equal(frozen.report.shopOnion.score,20);
});

test("v2 freezes the public evidence and buying decision together, including a justified material premium",async t=>{
  const r=scoredReport();r.methodVersion="tikhub-shop-v2";
  const main=r.commerce[0], check=r.checks[0], candidate=check.offers[0];
  main.name="Hand carved solid oak chair";main.material="solid oak";main.warranty="24 months";
  main.variants[0].variant="Black 18 inch";main.variants[0].price=60;
  candidate.name=main.name;candidate.material="solid oak";candidate.warranty="24 months";candidate.variant=main.variants[0].variant;
  candidate.match="candidate";check.status="candidates";check.comparison=null;
  check.followUp={status:"complete",reason:"Two queries returned the same shop.",internalCode:"private-diagnostics"};
  r.shopOnion={version:"shop-onion-v2",score:98,decision:{reason:"private-supplied-decision",privateDebug:"private-debug"}};
  const s=await harness(t,{run:()=>r});const id=await s.create();await s.finished(id);
  await s.share(id);const publicReport=(await (await s.read(id)).json()).report;
  const verdict=publicReport.shopOnion, d=verdict.decision;
  assert.equal(verdict.version,"shop-onion-v2");assert.equal(verdict.premiumPct,20);assert.equal(verdict.score,0);assert.equal(d.state,"within");
  assert.equal(d.context.category,"variable");assert.equal(d.context.baseAllowancePct,25);
  assert.equal(publicReport.commerce[0].material,"solid oak");assert.equal(publicReport.checks[0].offers[0].warranty,"24 months");
  assert.deepEqual(publicReport.checks[0].followUp,{status:"complete",reason:"Two queries returned the same shop."});
  assert.doesNotMatch(JSON.stringify(publicReport),/private-/);
  const html=await(await s.request("/r/"+id)).text();
  assert.ok(html.includes(d.action));assert.ok(html.includes(d.label));assert.match(html,/25% editorial allowance/i);
  assert.ok(html.toLowerCase().includes(d.confidence+" confidence"));assert.match(html,/\$60\.00/);assert.match(html,/\$50\.00/);
  const og=html.match(/property="og:description" content="([^"]*)"/)[1];
  assert.ok(og.includes(d.action));assert.match(og,/20% above comparable listings/);assert.match(og,/\$60\.00 vs \$50\.00/);
  assert.ok(html.includes("How the decision was reached"));assert.doesNotMatch(html,/Historical scoring method/);
  const image=Buffer.from(await (await s.request("/r/"+id+"/card.png")).arrayBuffer());
  assert.deepEqual(image,renderShoppingShareCard(publicReport));
  for (const change of [{action:"Check the edition"},{reason:"Warranty terms differ."},{confidence:"high"},
    {context:{...d.context,allowancePct:5}}]) {
    const modified={...publicReport,shopOnion:{...verdict,decision:{...d,...change}}};
    assert.notDeepEqual(image,renderShoppingShareCard(modified));
  }
  assert.equal(s.calls(),1);
});

test("reassessing a shared historical report is read-only on its evidence and idempotent through expiry and restarts",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"onion-reviewed-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  let clock=Date.UTC(2026,10,19), upcalls=0;
  const options={path:join(dir,"jobs.sqlite"),now:()=>clock,retentionMs:20,run:()=>{upcalls++;return scoredReport();}};
  const s=await harness(t,options);
  const sourceId=await s.create();await s.finished(sourceId);await s.share(sourceId);
  const original=await(await s.read(sourceId)).json();assert.equal(original.report.shopOnion.score,20);
  clock += 90; // The live source row expires. Explicitly published evidence survives.
  const rechecks=await Promise.all(Array.from({length:4},()=>s.request("/api/shopping-jobs/"+sourceId+"/reassess",{method:"POST"})));
  const copies=await Promise.all(rechecks.map(async res=>{assert.equal(res.status,200);return res.json();}));
  const fresh=copies[0];assert.ok(copies.every(report=>report.id===fresh.id));assert.notEqual(fresh.id,sourceId);
  assert.equal(fresh.status,"ready");assert.deepEqual(fresh.report.commerce,original.report.commerce);
  assert.deepEqual(fresh.report.checks,original.report.checks);assert.equal(fresh.report.video.observedAt,original.report.video.observedAt);
  assert.equal(fresh.report.shopOnion.version,"shop-onion-v3");assert.equal(fresh.report.shopOnion.score,76);
  assert.equal(fresh.report.methodVersion,"tikhub-shop-v3.1");assert.deepEqual(fresh.report.reassessment,{
    sourceJobId:sourceId,sourceVersion:"shop-onion-v1",reviewedAt:new Date(clock).toISOString()
  });
  assert.deepEqual(await(await s.read(sourceId)).json(),original);assert.equal(upcalls,1);
  assert.equal((await s.request("/r/"+fresh.id)).status,404);
  clock+=100;await s.close();
  const reopened=await harness(t,options);
  const restored=await(await reopened.request("/api/shopping-jobs/"+sourceId+"/reassess",{method:"POST"})).json();
  assert.equal(restored.id,fresh.id);assert.deepEqual(restored.report.reassessment,fresh.report.reassessment);assert.equal(upcalls,1);
  assert.deepEqual(await(await reopened.share(fresh.id)).json(),{url:"/r/"+fresh.id});
  const frozen=await(await reopened.read(fresh.id)).json();assert.deepEqual(frozen.report.reassessment,fresh.report.reassessment);
  const html=await(await reopened.request("/r/"+fresh.id)).text();assert.ok(html.includes('href="/r/'+sourceId+'"'));assert.match(html,/using prices already recorded/);
  assert.match(html,/within 5% of the peer price scores 50/);
  const card=await reopened.request("/r/"+fresh.id+"/card.png");
  assert.equal(card.status,200);assert.match(card.headers.get("etag"),/-3"$/);
  const twice=await(await reopened.request("/api/shopping-jobs/"+fresh.id+"/reassess",{method:"POST"})).json();
  assert.equal(twice.id,fresh.id);assert.equal(upcalls,1);
});

test("a private old report can be locally rescored without publishing it or exposing its read key",async t=>{
  const s=await harness(t);const old=await s.create();const oldReport=await s.finished(old);
  const updated=await(await s.request("/api/shopping-jobs/"+old+"/reassess",{method:"POST",body:"{}"})).json();
  assert.equal(updated.report.reassessment.sourceJobId,old);
  assert.equal(await s.create(),old); // Normal cached lookup does not reuse the review record.
  assert.deepEqual(await(await s.read(old)).json(),oldReport);
  await s.share(updated.id);
  assert.equal((await s.request("/r/"+old)).status,404);
  const frozen=await(await s.read(updated.id)).json();assert.equal(frozen.report.reassessment.sourceVersion,"shop-onion-v1");
  assert.equal(frozen.report.reassessment.sourceJobId,undefined);assert.ok(frozen.report.reassessment.reviewedAt);
  assert.doesNotMatch(JSON.stringify(frozen),/private-/);assert.equal(s.calls(),1);
});

test("reassessment rejects input injection and unavailable evidence without scheduling collection",async t=>{
  let release;const wait=new Promise(r=>release=r);
  const s=await harness(t,{run:async()=>{await wait;return {scope:"tiktok-shop",methodVersion:"tikhub-shop-v1.1",commerce:[],checks:[]};}});
  const old=await s.create(),url="/api/shopping-jobs/"+old+"/reassess";
  assert.equal((await s.request(url)).status,405);
  assert.equal((await s.request(url,{method:"POST",headers:{Origin:"https://outside.example"}})).status,403);
  assert.equal((await s.request(url,{method:"POST",body:'{"report":{"shopOnion":{"score":1}}}'})).status,400);
  assert.equal((await s.request(url,{method:"POST"})).status,409);
  release();await s.finished(old);
  const unavailable=await s.request(url,{method:"POST"});assert.equal(unavailable.status,422);
  assert.match((await unavailable.json()).error,/no saved SKU price/);
  assert.equal((await s.request("/api/shopping-jobs/"+randomUUID()+"/reassess",{method:"POST"})).status,404);
  assert.equal(s.calls(),1);
});

test("local reassessment has a bounded allowance separate from live collection and repeats are free",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"onion-review-limit-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"jobs.sqlite");const base=await harness(t,{path});
  const first=await base.create(),second=await base.create("https://www.tiktok.com/@second");await base.finished(first);await base.finished(second);
  await base.close();
  const limited=await harness(t,{path,dailyLimit:1});const again=id=>limited.request("/api/shopping-jobs/"+id+"/reassess",{method:"POST"});
  const a=await again(first);assert.equal(a.status,200);const review=(await a.json()).id;
  assert.equal((await again(second)).status,429);assert.equal((await(await again(first)).json()).id,review);
  assert.equal(limited.calls(),0);
});
