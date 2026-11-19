import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { createShoppingCheck, shoppingInput } from "../server/shopping-check.mjs";
import { createShoppingScreenshot, screenshotEvidence, validateScreenshot } from "../server/shopping-screenshot.mjs";

async function withServer(handler, fn) {
  const server = http.createServer((req, res) => void handler.handle(req, res));
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  try { await fn("http://127.0.0.1:" + server.address().port); }
  finally { await new Promise(done => server.close(done)); }
}
const post = (base, body) => fetch(base + "/api/shopping-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const clip = "https://www.tiktok.com/@cookingtest/video/7111111111111111111";
const variants = [{skuId:"black",price:29,currency:"USD",available:true},{skuId:"accessory",price:3,currency:"USD",available:true}];
const item = {productId:"p1",name:"Frother set",listingUrl:"https://shop.tiktok.com/us/pdp/1700000000000000011",defaultSkuId:"black",variants};
const source = {kind:"video",video:{url:clip,handle:"cookingtest"},sample:{checked:1,limit:1},
  commerce:[],listedProducts:[],products:[],websiteUrls:[],status:"no_evidence",message:"Checked the post."};

test("a shopping submission verifies the linked source variant again when the shopper switches options",async () => {
  let hits = 0; const checked = [];
  const service = createShoppingCheck({lookup:async()=>{hits++;return {...source,commerce:[item]};},
    compare:async(product,{variantIndex})=>{checked.push(product.variants[variantIndex].skuId);return {status:"candidates",comparison:null,offers:[],message:"Price not established."};}});
  await withServer(service,async base=>{
    const first = await (await post(base,{url:clip})).json();
    assert.equal(first.status,"priced"); assert.equal(first.checks[0].variantIndex,0);
    const second = await (await post(base,{url:clip,selection:{productId:"p1",skuId:"accessory",price:0.01}})).json();
    assert.equal(second.checks[0].variantIndex,1); assert.deepEqual(checked,["black","accessory"]); assert.equal(hits,1);
    assert.equal((await post(base,{url:clip,selection:{productId:"p1",skuId:"missing"}})).status,409);
  });
});

test("a creator with an external storefront and no native product has no live price", async () => {
  let checks = 0;
  const service = createShoppingCheck({
    lookup: async (url, options) => {
      assert.equal(url, clip); assert.equal(options.tikhubOnly, true);
      return {...source, websiteUrls:["https://brand.example.com"], listedProducts:[{url:"https://brand.example.com/products/frother"}]};
    },
    compare: async () => { checks++; }
  });
  await withServer(service, async base => {
    const report = await (await post(base, {url:clip})).json();
    assert.equal(report.scope,"tiktok-shop"); assert.equal(report.status,"no_evidence");
    assert.deepEqual(report.commerce,[]); assert.deepEqual(report.listedProducts,[]); assert.equal(checks,0);
  });
});

test("a profile compares one source variant per product up to the three-product limit", async () => {
  const service = createShoppingCheck({
    lookup: async () => ({...source, sample:{checked:5,limit:5}, commerce:[1,2,3].map(n=>({...item,productId:String(n)}))}),
    compare: async () => ({status:"insufficient",offers:[],comparison:null,message:"No verified same variant."})
  });
  const stages = [];
  const report = await service.run(shoppingInput({url:"@cookingtest"}), {onStage:stage=>stages.push(stage)});
  assert.deepEqual(stages,["source","comparison","decision"]);
  assert.equal(report.checks.length,3); assert.ok(report.checks.every(c => c.variantIndex === 0));
  assert.match(report.message,/Checked 3 products/);
});

test("a requested SKU missing from the returned options requires shopper selection", async () => {
  const service = createShoppingCheck({
    lookup: async () => ({...source, commerce:[{...item, requestedSkuId:"missing", variants:[variants[0]]}]}),
    compare: async () => { throw Error("Unexpected comparison"); }
  });
  const report = await service.run(shoppingInput({url:clip}));
  assert.deepEqual(report.checks,[]); assert.equal(report.steps.at(-1).status,"needs_input");
});

test("ambiguous SKU sets require selection and never use the cheapest accessory",async()=>{
  const service=createShoppingCheck({lookup:async()=>({...source,commerce:[{...item,defaultSkuId:null}]}),
    compare:async()=>{throw Error("unexpected comparison");}});
  await withServer(service,async base=>{
    const r=await(await post(base,{url:clip})).json();
    assert.deepEqual(r.checks,[]);assert.equal(r.steps.at(-1).status,"needs_input");
  });
});

test("an inaccessible TikTok source returns the upstream error without initiating retailer discovery", async () => {
  const service = createShoppingCheck({lookup: async () => { throw Object.assign(Error("Source unavailable"), {status:503}); }});
  await withServer(service, async base => {
    const r = await post(base,{url:"@cookingtest"});
    assert.equal(r.status,503); assert.equal((await r.json()).error,"Source unavailable");
  });
});

test("recognizes direct shop links, account and invalid inputs",()=>{
  assert.equal(shoppingInput({url:"@NewShop"}).url,"https://www.tiktok.com/@newshop");
  assert.equal(shoppingInput({url:"https://shop.tiktok.com/uk/pdp/gift/1234567890123456789"}).market,"GB");
  assert.equal(shoppingInput({url:"https://www.tiktok.com/shop/pdp/1234567890123456789"}).kind,"website");
  assert.throws(()=>shoppingInput({url:"http://127.0.0.1/x"}),{status:400});
  assert.throws(()=>shoppingInput({query:"needle",url:clip}),{status:400});
  assert.throws(()=>shoppingInput({query:"cheap frother"}),{status:400});
  assert.throws(()=>shoppingInput({url:"https://amazon.com/dp/frother"}),{status:400});
  assert.throws(()=>shoppingInput({url:"https://www.tiktok.com/about"}),{status:400});
  assert.equal(shoppingInput({url:"https://m.tiktok.com/@NewShop/?tracking=1"}).url, shoppingInput({url:"@NewShop"}).url);
  assert.equal(shoppingInput({url:clip+"?tracking=1"}).url, clip);
});

test("screenshot OCR keeps multiple account and product links as separate leads and ignores email addresses",()=>{
  const found=screenshotEvidence(clip+"\n@cookingtest\n@other_account\nkitmaker.com/products/whisk\ncontact person@company.com");
  assert.deepEqual(found.candidates.map(r=>r.kind),["video","website","profile"]);
  assert.ok(!JSON.stringify(found.candidates).includes("company"));
  assert.deepEqual(screenshotEvidence("MILK FROTHER\n3-in-1").candidates,[]);
  assert.deepEqual(screenshotEvidence("").candidates,[]);
  const listing = screenshotEvidence("https://www.tiktok.com/view/product/1710000000000000001?sku_id=1710000000000000002&tracking=1").candidates;
  assert.equal(listing.length,1); assert.equal(listing[0].url,"https://www.tiktok.com/shop/pdp/1710000000000000001?sku_id=1710000000000000002");
});

test("rejects malformed, oversized and cross-origin screenshots before OCR",async()=>{
  let reads=0;
  const api=createShoppingScreenshot({readText:async()=>{reads++;return "@abc";}});
  const big=Buffer.alloc(33); Buffer.from("89504e470d0a1a0a","hex").copy(big); big.writeUInt32BE(13,8);big.write("IHDR",12);big.writeUInt32BE(20000,16);big.writeUInt32BE(20000,20);
  assert.throws(()=>validateScreenshot(big,"image/png"),{status:422});
  await withServer(api, async base=>{
    const send=(headers,body)=>fetch(base+"/api/shopping-screenshot",{method:"POST",headers,body});
    assert.equal((await send({"Content-Type":"image/png",Origin:"https://unrelated.example"},"no")).status,403);
    assert.equal((await send({"Content-Type":"text/html"},"no")).status,415);
    assert.equal((await send({"Content-Type":"image/png"},big)).status,422);
    assert.equal(reads,0);
  });
});

test("partial listing-detail outages can be retried while other sourced items remain visible", async () => {
  let calls = 0;
  const service = createShoppingCheck({
    lookup: async () => {
      calls++;
      const missing = {...item,productId:"missing",variants:[],detailStatus:"unavailable"};
      return {...source,commerce:[item, calls === 1 ? missing : {...item,productId:"recovered"}]};
    },
    compare: async () => ({status:"insufficient",offers:[],comparison:null,message:"No match."})
  });
  const input = shoppingInput({url:clip});
  const first = await service.run(input); assert.ok(first.steps.some(s=>s.status==="unavailable"));
  assert.doesNotMatch(first.message,/Choose a variant/);
  const second = await service.run(input); assert.equal(second.checks.length,2); assert.equal(calls,2);
});
