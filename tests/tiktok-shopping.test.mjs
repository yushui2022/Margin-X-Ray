import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { lookupVideo } from "../server/video-lookup.mjs";
import { createShoppingCheck, shoppingInput } from "../server/shopping-check.mjs";
import { parseShopDetail, parseTikTokJson, shoppingAnchors, shopProducts } from "../server/tiktok-shopping.mjs";

const productId = "1729999999999999999";
const skuId = "1729999999999999801";
const postId = "7729999999999999864";
const link = "https://www.tiktok.com/@example/video/" + postId;
const date = Math.floor(Date.now()/1000) - 100;
const item = { aweme_id: postId, author: { unique_id: "example" }, create_time: date, desc: "New things", anchors: [{
  component_key: "anchor_complex_shop", extra: JSON.stringify([{ id: productId, type: 33, keyword: "Hand mixer",
    extra: '{"product_id":' + productId + ',"title":"Acme Hand Mixer","price":0}' }]),
}] };
const product = { product_id: productId, title: "Acme Hand Mixer", specifications: [{name:"Brand",value:"Acme"},{name:"Model",value:"MQ32"}],
  default_sku_id: skuId, price: {currency: "USD", min_sku_price: "1.25"}, skus: [{
    sku_id: skuId, stock: 3, status: 0, sku_sale_props: [{prop_value:"Blue"}],
    barcode: "1234567890128", price: {sale_price_decimal:"19.50", origin_price_decimal:"30.00", currency_name:"USD"}
  }] };
const detail = { product_data: { page_config: { components_map: [{ component_name:"product_info", component_data:{product_info:product} }] } } };

function fixture(routes, seen) {
  return async (target, init) => {
    const url = new URL(target); seen.push(url);
    assert.equal(url.origin, "https://api.tikhub.io"); assert.equal(init.headers.Authorization, "Bearer test-token");
    const payload = routes[url.pathname.split("/").pop()];
    if (!payload) throw Error("Unexpected request " + url.pathname);
    return Response.json({code:200,data:payload});
  };
}

test("a new post resolves its shopping attachment and seller's SKU pricing without an archived match", async () => {
  const seen = [];
  const result = await lookupVideo(link,{token:"test-token",fetchImpl:fixture({fetch_one_video_v3:{aweme_detail:item},fetch_product_detail_v3:detail},seen)});
  assert.equal(seen.length,2);
  assert.equal(seen[1].searchParams.get("product_id"),productId);
  assert.equal(seen[1].searchParams.get("region"),"US");
  assert.equal(result.status,"priced"); assert.equal(result.commerce.length,1);
  const [row] = result.commerce;
  assert.equal(row.detailStatus,"read");
  assert.deepEqual([row.productId,row.brand,row.model,row.sourceUrl],[productId,"Acme","MQ32",link]);
  assert.deepEqual(row.variants,[{skuId, variant:"Blue",gtin:"1234567890128",price:19.5,currency:"USD",available:true}]);
});

test("numeric TikTok IDs keep their precision and only product anchors or scoped share links become evidence", () => {
  assert.equal(parseTikTokJson('{"id":'+productId+'}').id,productId);
  const query = new URLSearchParams({ec_shared_reflux_dynamic_params:JSON.stringify({placeholder_product_id:productId})});
  const base = {aweme_id:postId,anchors:[{type:7,id:productId,keyword:"event"},{component_key:"anchor_complex_shop",id:skuId,extra:"bad"}]};
  assert.deepEqual(shoppingAnchors(base),[]);
  assert.deepEqual(shoppingAnchors({...base,share_info:{share_url:link+"?"+query}}),[{productId,name:""}]);
  assert.deepEqual(shoppingAnchors({...base,share_info:{share_url:link+"123?"+query}}),[]);
});

test("zero, missing, group-level and foreign prices cannot become a variant offer", () => {
  const unpriced={...product, skus:[{sku_id:skuId,price:{sale_price_decimal:"0.00",currency_name:"USD"}}]};
  for (const p of [unpriced,{...unpriced,skus:[{sku_id:skuId}]}, {...unpriced,skus:[{sku_id:skuId,price:{sale_price_decimal:"19.50",currency_name:"SGD"}}]}]) {
    const row = parseShopDetail({product_data:{initialData:{productInfo:p}}},productId,"US");
    assert.equal(row.status,"identified");assert.equal(row.variants[0].price,null);
  }
  assert.equal(parseShopDetail(detail,skuId,"US"),null);
  const failed = structuredClone(detail);
  failed.product_data.page_config.components_map[0].component_data.error_code = 503;
  assert.equal(parseShopDetail(failed,productId,"US"),null);
});

test("a profile checks at most five exact-author posts and preserves the creator's website and post evidence", async () => {
  const seen = [];
  const posts = Array.from({length:7},(_,n)=>({...item,aweme_id:(BigInt(postId)+BigInt(n)).toString(), anchors:n===1?item.anchors:[]}));
  posts[0]={...posts[0],author:{unique_id:"other"}};
  const data = {fetch_user_profile:{userInfo:{user:{uniqueId:"Example",signature:"Founder of Acme",bioLink:{link:"https://acme.test/shop"}}}},
    fetch_user_post_videos:{aweme_list:posts},fetch_product_detail_v3:detail};
  const result = await lookupVideo("@Example", {token:"test-token",fetchImpl:fixture(data,seen)});
  assert.equal(seen[1].searchParams.get("count"),"5");
  assert.deepEqual(result.sample,{checked:4,limit:5});assert.equal(result.kind,"profile");assert.equal(result.status,"priced");
  assert.deepEqual(result.websiteUrls,["https://acme.test/shop"]);assert.equal(result.brandClue,"Acme");
  assert.equal(result.commerce[0].sourceUrl,"https://www.tiktok.com/@example/video/"+posts[1].aweme_id);
});

test("a profile without commerce reports the sampled evidence and a GB attachment doesn't borrow a US price", async () => {
  const handleData={fetch_user_profile:{userInfo:{user:{uniqueId:"example",signature:"Outdoor walks"}}},
    fetch_user_post_videos:{aweme_list:[{...item,anchors:[]}]}};
  const creator=await lookupVideo("https://www.tiktok.com/@example",{token:"test-token",fetchImpl:fixture(handleData,[])});
  assert.equal(creator.status,"no_evidence");assert.equal(creator.sample.checked,1);
  assert.deepEqual(creator.commerce,[]);
  const seen=[];
  const gb=await lookupVideo(link,{token:"test-token",market:"GB",fetchImpl:fixture({fetch_one_video_v3:{aweme_detail:item}},seen)});
  assert.equal(seen.length,1);assert.equal(gb.commerce[0].market,"GB");assert.equal(gb.commerce[0].status,"identified");
  assert.equal(gb.commerce[0].detailStatus,"unsupported_market");
  assert.deepEqual(gb.commerce[0].variants,[]);
});

test("pasted shop listings preserve market and a verified user-selected SKU without synthetic post attribution", async () => {
  const {parseShopListing} = await import("../server/video-lookup.mjs");
  const canonical = "https://shop.tiktok.com/us/pdp/"+productId+"?sku_id="+skuId;
  for (const raw of ["https://shop.tiktok.com/us/pdp/example/"+productId+"?sku_id="+skuId,
    "https://www.tiktok.com/view/product/"+productId+"?region=US&skuId="+skuId]) {
    assert.equal(parseShopListing(raw).url,canonical);
    const seen=[];
    const r=await lookupVideo(raw,{token:"test-token",fetchImpl:fixture({fetch_product_detail_v3:detail},seen)});
    assert.equal(seen.length,1); assert.equal(r.kind,"website");assert.equal(r.video,undefined);
    assert.equal(r.commerce[0].selectedSkuId,skuId);assert.equal(r.commerce[0].listingUrl,canonical);
    assert.equal(r.commerce[0].sourceUrl,canonical);
  }
  assert.equal(parseShopListing("https://shop.tiktok.com.evil.org/us/pdp/"+productId),null);
  assert.equal(parseShopListing("https://www.tiktok.com/shop/pdp/"+productId).productId,productId);
  assert.equal(parseShopListing("https://shop.tiktok.com/gb/pdp/product-name/"+productId).market,"GB");
  const seen=[];
  const uk=await lookupVideo("https://shop.tiktok.com/uk/pdp/"+productId,{token:"test-token",fetchImpl:fixture({},seen)});
  assert.equal(uk.commerce[0].market,"GB"); assert.equal(seen.length,0); assert.equal(uk.status,"partial");
});

test("a TikTok listing in the caption retains its selected SKU and post source even without a native cart", async () => {
  const result=await lookupVideo(link,{token:"test-token",fetchImpl:fixture({
    fetch_one_video_v3:{aweme_detail:{...item,anchors:[],desc:"My choice https://shop.tiktok.com/view/product/"+productId+"?sku_id="+skuId}},
    fetch_product_detail_v3:detail
  },[])});
  assert.equal(result.commerce[0].selectedSkuId,skuId);
  assert.equal(result.commerce[0].sourceUrl,link);
  assert.equal(result.status,"priced");
});

test("a foundation check follows the shade named in the post and asks for a choice if it is ambiguous", async () => {
  const shades = ["15C Fair Porcelain", "21N Ivory", "1N2 Ecru"];
  const skus = shades.map((shade, index) => ({...product.skus[0], sku_id:"172999999999999980" + (index + 1), sku_sale_props:[{prop_value:shade}]}));
  for (const [caption, selected] of [
    ["Wearing shade “21N” today",1], ["Shade: 1N2 Ecru",2], ["My pick is 21N Ivory",1],
    ["Swatching shades 15C and 21N",null], ["Wearing shade 45N",null], ["A new foundation",0],
  ]) {
    const fetchImpl = fixture({
      fetch_one_video_v3:{aweme_detail:{...item,desc:caption}},
      fetch_product_detail_v3:{product_data:{initialData:{productInfo:{...product,title:"Cushion foundation",skus}}}},
    },[]);
    const agent = createShoppingCheck({
      lookup:(url, options) => lookupVideo(url,{...options,token:"test-token",fetchImpl}),
      compare:async () => ({status:"insufficient",offers:[],sources:[],comparison:null,message:"No comparable offer."}),
    });
    const result = await agent.run(shoppingInput({url:link}));
    assert.deepEqual(result.checks.map(check => check.variantIndex), selected === null ? [] : [selected], caption);
    if (selected === null) assert.equal(result.commerce[0].captionSkuId,null);
    else if (selected > 0) assert.equal(result.commerce[0].captionSkuId, skus[selected].sku_id);
  }
});

test("seller identity requires consistent exact account IDs on the product detail", () => {
  const sellerId = "7500000000000000111";
  const detailsFor = shopSeller => ({ product_data: { page_config: { components_map: [
    { component_name: "product_info", component_data: {
      product_info: { ...product, seller_id: sellerId }, shop_info: { seller_id: shopSeller, shop_name: "Example Shop" }
    } }
  ] } } });
  assert.equal(parseShopDetail(detailsFor(sellerId),productId,"US").sellerId,sellerId);
  assert.equal(parseShopDetail(detailsFor("7500000000000000119"),productId,"US").sellerId,null);
});

test("detail requests preserve source order and retry only the unread product with at most two requests in flight", async () => {
  const ids = [productId, "1729999999999999998", "1729999999999999997", "1729999999999999996"];
  const requests = [];
  let active = 0, peak = 0;
  const hub = async (path, params, signal) => {
    assert.equal(path, "shop/web/fetch_product_detail_v3");
    assert.equal(params.region, "US"); assert.ok(signal instanceof AbortSignal);
    const id = params.product_id;
    const firstRead = !requests.includes(id);
    requests.push(id); active++; peak = Math.max(peak, active);
    try {
      await delay(2, undefined, { signal });
      if (id === ids[0] && firstRead) throw Object.assign(new Error("unavailable"), { status: 503 });
      const skus = id === ids[1] ? [] : product.skus;
      return { product_data: { initialData: { productInfo: { ...product, product_id: id, skus } } } };
    } finally { active--; }
  };
  const anchors = ids.map(id => ({ productId: id, sourceUrl: link, selectedSkuId: skuId }));
  const rows = await shopProducts([anchors[0], ...anchors], { market: "US", hub });
  assert.deepEqual(requests.slice(0, 3), ids.slice(0, 3));
  assert.deepEqual(requests.slice(3), [ids[0]]);
  assert.equal(peak, 2);
  assert.deepEqual(rows.map(r => [r.productId, r.status, r.detailStatus]), [
    [ids[0], "priced", "read"], [ids[1], "identified", "read"], [ids[2], "priced", "read"],
  ]);
  assert.equal(rows[0].selectedSkuId, skuId);
  assert.equal(rows[0].sourceUrl, link);
});

test("unreadable or incomplete SKU details stay unavailable, retaining only verified source evidence", async () => {
  const anchor = { productId, sourceUrl: link, name: "A known attachment" };
  for (const payload of [{}, { product_data: { initialData: { productInfo: { product_id: productId, title: "Verified item" } } } }]) {
    let calls = 0;
    const [row] = await shopProducts([anchor], { market: "US", hub: async () => { calls++; return payload; } });
    assert.equal(calls, 2);
    assert.equal(row.detailStatus, "unavailable");
    assert.deepEqual(row.variants, []);
    assert.equal(row.sourceUrl, link);
    assert.equal(row.name, payload.product_data ? "Verified item" : anchor.name);
  }
  const [withoutHub] = await shopProducts([anchor], { market: "US", hub: null });
  assert.equal(withoutHub.detailStatus, "unavailable");
});

test("authentication, missing listings, cancellation and a long rate-limit window do not replay a detail request", async () => {
  const anchors = [{ productId, sourceUrl: link }];
  for (const status of [401, 404, 429]) {
    let calls = 0;
    const [row] = await shopProducts(anchors, { market: "US", hub: async () => {
      calls++;
      throw Object.assign(new Error("upstream"), { status: 503, upstreamStatus: status, retryAfterMs: status === 429 ? 60000 : 0 });
    } });
    assert.equal(calls, 1);
    assert.equal(row.detailStatus, "unavailable");
  }
  const controller = new AbortController();
  let calls = 0;
  const [row] = await shopProducts(anchors, { market: "US", signal: controller.signal, hub: async (_path, _params, signal) => {
    calls++; controller.abort();
    signal.throwIfAborted();
  } });
  assert.equal(calls, 1); assert.equal(row.detailStatus, "unavailable");
});

test("TikHub HTTP error classification reaches the listing lookup without sending credentials to another host", async () => {
  const source = "https://shop.tiktok.com/us/pdp/" + productId;
  for (const status of [401, 503]) {
    const seen = [];
    const report = await lookupVideo(source, { token: "test-token", tikhubOnly: true, fetchImpl: async (target, init) => {
      seen.push(String(target));
      assert.equal(new URL(target).hostname, "api.tikhub.io");
      assert.equal(init.headers.Authorization, "Bearer test-token");
      return seen.length === 1 ? new Response(null, { status }) : Response.json({ code: 200, data: detail });
    } });
    assert.equal(seen.length, status === 401 ? 1 : 2);
    assert.equal(report.commerce[0].detailStatus, status === 401 ? "unavailable" : "read");
  }
});
