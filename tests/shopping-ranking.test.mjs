import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rankShopSamples } from "../src/web/shopping-ranking-data.ts";
import { SHOP_ONION_V2, SHOP_ONION_VERSION } from "../src/shared/shop-onion.mjs";

const date = "2026-11-19T00:00:00.000Z";
function sample(handle, post, price, comparable = true, observedAt = date) {
  const sourceUrl = `https://www.tiktok.com/@${handle}/video/${post}`;
  const product = {
    productId:"110000001", listingUrl:"https://shop.tiktok.com/us/pdp/110000001", sellerId:"100000001",
    name:"Widget Mini", sourceUrl, observedAt, variants:[{skuId:"130000001", variant:"Mini", price,currency:"USD",available:true}],
  };
  const offer = {name:"Widget Mini", sellerId:"100000002", skuId:"130000002", match:"exact", price:20,currency:"USD",available:true,
    url:"https://shop.tiktok.com/us/pdp/110000002?sku_id=130000002"};
  const checks = comparable ? [{productIndex:0, variantIndex:0, status:"compared", offers:[offer],
    comparison:{basis:"item", sourcePrice:price, alternativePrice:20, alternativeUrl:offer.url, currency:"USD"}}] : [];
  return {handle,sourceUrl,observedAt,report:{scope:"tiktok-shop",market:"US",commerce:[product],checks}};
}
const rank = samples => rankShopSamples({formatVersion:1,version:SHOP_ONION_V2,samples});

test("current ranks share ties, center parity at 50, and preserve old zero scores and missing evidence", () => {
  const a = sample("bravo","101",40);
  const rows = rank([a,sample("pending","102",40,false),sample("alpha","103",40),
    sample("charlie","104",20),sample("cheap","105",10)]);
  assert.deepEqual(rows.map(row => [row.handle,row.rank,row.verdict.score]),
    [["alpha",1,90],["bravo",1,90],["charlie",3,50],["cheap",4,0],["pending",null,null]]);
  const parity = rows.find(row => row.handle === "charlie");
  assert.equal(parity.verdict.version, SHOP_ONION_VERSION);
  assert.equal(parity.rawReceipts[0].version, SHOP_ONION_V2);
  assert.equal(parity.rawReceipts[0].score, 0);
});

test("repeat posts count one product using the newest price observation, even when that check is unrated", () => {
  const first = sample("bravo","100",40);
  const latest = sample("bravo","101",20,false,"2026-11-20T01:00:00Z");
  first.observedAt = "2026-11-21T00:00:00Z";
  for (const samples of [[first,latest],[latest,first]]) {
    const [row] = rank(samples);
    assert.equal(row.posts.length,2);
    assert.equal(row.verdict.linkedCount,1);
    assert.equal(row.verdict.score,null);
    assert.equal(row.observations[0].sourceUrl,latest.sourceUrl);
  }
});

test("a saved post cannot attribute another creator's product or another market's price to the ranking", () => {
  const wrongPost = sample("bravo","100",40);
  wrongPost.report.commerce[0].sourceUrl = "https://www.tiktok.com/@someoneelse/video/222";
  const uk = sample("alpha","102",40);
  uk.report.market = "GB";
  const [row] = rank([wrongPost,uk]);
  assert.equal(row.handle,"bravo");
  assert.equal(row.verdict.linkedCount,0);
  assert.equal(row.rank,null);
});

test("an edition applies the latest quote for a seller SKU to equal original prices and keeps each post receipt", () => {
  const first = sample("early","101",40);
  const last = sample("later","102",40,true,"2026-11-19T11:00:00Z");
  const check = last.report.checks[0];
  check.offers[0].price = check.comparison.alternativePrice = 30;
  for (const inputs of [[first,last],[last,first]]) {
    const rows = rank(inputs);
    assert.equal(rows[0].verdict.score,rows[1].verdict.score);
    assert.ok(rows.every(row => row.baselines[0].peerPrice === 30 && row.baselines[0].shops.length === 1));
    assert.notEqual(rows[0].rawReceipts[0].score,rows[1].rawReceipts[0].score);
  }
  last.report.commerce[0].observedAt = "2026-11-20T00:01:00Z";
  assert.deepEqual(rank([first,last]).map(r=>r.baselines[0].peerPrice).sort(),[20,30]);
});

test("a later unavailable seller SKU retires the edition quote while the older dated receipt stays readable", () => {
  const first = sample("early","101",40);
  const last = sample("later","102",40,true,"2026-11-19T11:00:00Z");
  last.report.checks[0].offers[0].available = false;
  assert.ok(rank([first,last]).every(r=>r.verdict.score === null));
  assert.notEqual(rank([first,last]).find(r=>r.handle==="early").rawReceipts[0].score,null);
});

test("new post observations cannot reprice a separately calibrated edition", () => {
  const first = sample("first","101",40,true,"2026-11-19T09:00:00Z");
  const last = sample("second","102",40,true,"2026-11-19T11:00:00Z");
  const panel = sample("reference","103",40,true,"2026-11-19T10:00:00Z");
  const c = panel.report.checks[0];c.offers[0].price = c.comparison.alternativePrice = 31;
  const observations = [{product:panel.report.commerce[0],checks:[c],sourceUrl:panel.sourceUrl,observedAt:panel.observedAt}];
  const rows = rankShopSamples({formatVersion:1,version:SHOP_ONION_VERSION,samples:[first,last]},observations);
  assert.deepEqual(rows.map(r=>r.baselines.map(b=>[b.calibrated,b.peerPrice])),[[[true,31]],[[true,31]]]);
  assert.ok(rows.every(r=>r.rawReceipts[0].items[0].peerPrice===20));
});

test("the named-shade benchmark needs matching fill and counts one offer per other shop", () => {
  const s=sample("beauty","101",32.5);
  const p=s.report.commerce[0],v=p.variants[0],c=s.report.checks[0];
  p.name="TIRTIR Mask Fit AI Filter Cushion 18g";p.brand="TIRTIR";v.variant="21N Ivory";
  c.status="candidates";c.comparison=null;
  const quote=(listing,shop,price,weight) => ({name:"TIRTIR Mask Fit Red Cushion",netWeight:weight,sellerId:shop,
    seller:"Shop "+shop,skuId:listing,variant:"21N Ivory",match:"candidate",available:true,verifiedShop:true,
    price,currency:"USD",url:"https://shop.tiktok.com/us/pdp/"+listing+"?sku_id="+listing});
  c.offers=[quote("210000001","100000002",25,"18g"),quote("210000002","100000002",35,"18g"),
    quote("210000003","100000003",29,"0.63oz"),quote("210000004","100000004",8,"4.5g"),
    {...quote("210000005","100000005",11,"18g"),weightConflict:"Inconsistent fill measurements."}];
  const [r]=rank([s]);
  assert.equal(r.rawReceipts[0].score,null);
  assert.equal(r.baselines[0].peerPrice,27);
  assert.deepEqual(r.baselines[0].shops.map(x=>x.price),[25,29]);
  assert.equal(r.baselines[0].candidates[0].reason,"Inconsistent fill measurements.");
  v.variant="17N Vanilla";
  assert.equal(rank([s])[0].verdict.score,null);
});

test("mixed archive editions retain the original method per product, including a reassessment of the same evidence", () => {
  const earlier = sample("mixed","100001",20);
  const regraded = structuredClone(earlier);
  regraded.report.shopOnion = {version:SHOP_ONION_VERSION};
  const later = sample("mixed","100002",20);
  const product = later.report.commerce[0];
  product.productId = "110000003";
  product.listingUrl = "https://shop.tiktok.com/us/pdp/110000003";
  const v2 = {formatVersion:1,version:SHOP_ONION_V2,samples:[earlier]};
  const v3 = {formatVersion:1,version:SHOP_ONION_VERSION,samples:[later,regraded]};
  for (const archives of [[v2,v3],[v3,v2]]) {
    const [row] = rankShopSamples(archives);
    assert.equal(row.posts.length, 2);
    assert.deepEqual(row.verdict.items.map(item => item.score), [50,50]);
    assert.deepEqual(row.rawReceipts.map(r => [r.version,r.score]), [[SHOP_ONION_V2,0],[SHOP_ONION_VERSION,50]]);
  }
});

test("the seed command preserves versionless legacy seeds and new methods when its output is imported again", async t => {
  const dir = await mkdtemp(join(tmpdir(), "onion-ranking-seed-"));
  t.after(() => rm(dir, {recursive:true,force:true}));
  const archived = sample("mixed","100001",20);
  const current = sample("mixed","100001",20);
  for (const s of [archived,current]) Object.assign(s.report, {
    kind:"video",video:{handle:s.handle,url:s.sourceUrl,provider:"TikHub",observedAt:date},
  });
  const product = current.report.commerce[0];
  product.productId = "110000003";
  product.listingUrl = "https://shop.tiktok.com/us/pdp/110000003";
  current.report.methodVersion = "tikhub-shop-v3.1";
  const first = join(dir,"v2.json"), second = join(dir,"new-job.json"), combined = join(dir,"combined.json");
  await writeFile(first,JSON.stringify({formatVersion:1,version:SHOP_ONION_V2,samples:[archived]}));
  await writeFile(second,JSON.stringify({status:"ready",input:{kind:"video",market:"US",url:current.sourceUrl},report:current.report}));
  const script = fileURLToPath(new URL("../scripts/seed-shop-price-ranking.mjs",import.meta.url));
  const run = (...files) => JSON.parse(execFileSync(process.execPath,[script,...files],{encoding:"utf8"}));
  const portable = run(first,second);
  assert.equal(portable.version, SHOP_ONION_VERSION);
  assert.deepEqual(portable.samples.map(s => s.report.shopOnion.version), [SHOP_ONION_V2,SHOP_ONION_VERSION]);
  await writeFile(combined,JSON.stringify(portable));
  assert.deepEqual(run(combined), portable);
  const [row] = rankShopSamples(portable);
  assert.equal(row.posts.length,1);
  assert.equal(row.verdict.score,50);
  assert.deepEqual(row.rawReceipts.map(r => r.score),[0,50]);
});
