import assert from "node:assert/strict";
import test from "node:test";
import { findShopSellers } from "../server/shop-web-market.mjs";
import { reviewedShopLead } from "../server/shop-web-reviewed.mjs";
import { compareTikTokShopOffers } from "../server/shop-web.mjs";
import { SHOP_ONION_VERSION, shopOnionVerdict } from "../src/shared/shop-onion.mjs";
import calibration from "../research/shop-price-benchmark-checks.json" with { type: "json" };

const id = (n) => String(1800000000000000000n + BigInt(n));
const original = {
  productId: id(0),
  listingUrl: "https://shop.tiktok.com/us/pdp/" + id(0),
  brand: "Mica & Elm",
  name: "Mica & Elm Aurora Travel Desk Lamp Sapphire Blue",
  model: "AT-847",
  seller: "Original Official",
  sellerId: id(100),
};
const query = "Mica Elm travel lamp";
function hit(number, title, name = "Retail " + number, sellerId = id(200 + number)) {
  return { product_id: id(number), title, seller_info: { shop_name: name, seller_id: sellerId } };
}
function detail(row, price = "28.50") {
  return {
    product_data: {
      initialData: {
        productInfo: {
          product_id: row.product_id,
          title: row.title,
          seller: { name: row.seller_info.shop_name, seller_id: row.seller_info.seller_id },
          skus: [
            { sku_id: id(999), is_available: true, price: { sale_price_decimal: price, currency_name: "USD" } },
          ],
        },
      },
    },
  };
}
function endpoint(rows, getDetail = detail) {
  const calls = [];
  return {
    calls,
    hub: async (path, params) => {
      calls.push({ path, params });
      if (path.endsWith("fetch_search_products_list_v2"))
        return { code: 0, data: { component_data: { products: rows } } };
      assert.equal(path, "shop/web/fetch_product_detail_v3");
      return getDetail(rows.find((row) => row.product_id === params.product_id));
    },
  };
}

function reviewedExample(option = "Disney Princess") {
  const observation = calibration.observations.find(({product, checks}) =>
    product.variants[checks[0].variantIndex].variant === option);
  const {product,checks:[check]} = observation;
  const variant = product.variants[check.variantIndex];
  const lead = reviewedShopLead("US",product,variant);
  const offer = check.offers.find(o => o.skuId === lead.skuId);
  function currentDetail() {
    const row = {product_id:lead.id,title:offer.name,seller_info:{shop_name:offer.seller,seller_id:offer.sellerId}};
    const payload = detail(row,"42.25");
    const info = payload.product_data.initialData.productInfo;
    if (offer.netWeight) info.specifications = [{name:"Net weight",value:offer.netWeight}];
    Object.assign(info.skus[0],{sku_id:lead.skuId,sku_sale_props:[{prop_value:offer.variant}]});
    return info;
  }
  return {product,variant,lead,offer,variantIndex:check.variantIndex,currentDetail};
}

test("a reviewed SKU is requested immediately, and only a newly read price survives a search outage", async () => {
  const {product,variant,lead,offer,variantIndex,currentDetail} = reviewedExample();
  assert.deepEqual(Object.keys(lead).sort(), ["basis","id","sellerId","skuId","url"]);
  for (const [market,source,sku] of [["GB",product,variant],["US",{...product,sellerId:id(0)},variant],
    ["US",{...product,productId:id(0)},variant],["US",product,{...variant,skuId:id(0)}]])
    assert.equal(reviewedShopLead(market,source,sku),undefined);
  const calls = [];
  const hub = async (path,params) => {
    calls.push(path);
    if (path.includes("search")) throw Error("search down");
    assert.equal(params.product_id,lead.id);
    return {product_data:{initialData:{productInfo:currentDetail()}}};
  };
  const check = await compareTikTokShopOffers(product,{hub,variantIndex});
  assert.equal(calls.length,2);
  assert.ok(calls[0].includes("product_detail"));
  assert.equal(check.followUp.status,"unavailable");
  assert.equal(check.comparison,null);
  assert.equal(check.offers[0].url,lead.url);
  assert.notEqual(offer.price,check.offers[0].price);
  const verdict = shopOnionVerdict({scope:"tiktok-shop",market:"US",commerce:[product],
    checks:[{...check,productIndex:0,variantIndex}]},{version:SHOP_ONION_VERSION});
  assert.equal(verdict.items[0].peerPrice,42.25);
  assert.equal(verdict.basis,"similar");
});

test("a fresh pinned SKU can lose stock, change seller or change option, fill and terms", async () => {
  const {product,lead,variantIndex,currentDetail} = reviewedExample("21N Ivory");
  const changes = [
    p => {p.seller.seller_id = id(647);},
    p => {p.skus[0].sku_id = id(648);},
    p => {p.skus[0].price.currency_name = "GBP";},
    p => {p.skus[0].price.sale_price_decimal = "0";},
    p => {p.skus[0].is_available = false;},
    p => {p.skus[0].sku_sale_props = [{prop_value:"15C Fair Porcelain"}];},
    p => {p.specifications = [{name:"Net weight",value:"4.5 g"}];},
    p => {p.title += " 2-pack";},
  ];
  for (const change of [null,...changes]) {
    const hub = async (path,params) => {
      if (path.includes("search")) return {code:0,data:{component_data:{products:[]}}};
      assert.equal(params.product_id,lead.id);
      const payload = currentDetail();
      change?.(payload);
      return {product_data:{initialData:{productInfo:payload}}};
    };
    const check = await compareTikTokShopOffers(product,{hub,variantIndex});
    const verdict = shopOnionVerdict({scope:"tiktok-shop",market:"US",commerce:[product],
      checks:[{...check,productIndex:0,variantIndex}]},{version:SHOP_ONION_VERSION});
    assert.equal(verdict.basis,change ? "none" : "similar",String(change));
  }
});

test("a reviewed address shares the five-detail budget with new search candidates and is fetched once", async () => {
  const {product,variant,lead,offer,currentDetail} = reviewedExample();
  const retained = {product_id:lead.id,title:offer.name,seller_info:{shop_name:offer.seller,seller_id:offer.sellerId}};
  const rows = [retained,...Array.from({length:6},(_,i) => hit(i + 1,product.name))];
  const {hub,calls} = endpoint(rows, row => row === retained ? {product_data:{initialData:{productInfo:currentDetail()}}} : detail(row));
  const results = await findShopSellers(product,"Disney hockey",{market:"US",variant,hub,considerAnotherShop:()=>"Need another shop."});
  const ids = calls.filter(c => c.path.includes("product_detail")).map(c => c.params.product_id);
  assert.equal(ids.length,5);
  assert.equal(new Set(ids).size,5);
  assert.equal(ids[0],lead.id);
  assert.equal(results.counts.detailsRequested,5);
  assert.ok(calls.filter(c => c.path.includes("search")).length <= 2);
});

test("ranks branded original-title matches across the first twenty results before requesting only two distinct sellers", async () => {
  const rows = [
    hit(1, "Travel Lamp Generic"),
    hit(2, "Mica & Elm Hand Soap"),
    hit(3, "Other travel desk lamp"),
    hit(4, original.name, original.seller, id(500)),
    hit(5, original.name, "Alias retailer", original.sellerId),
  ];
  for (let n = 6; n <= 16; n++) rows.push(hit(n, "Garden hose"));
  rows.push(hit(17, "Mica & Elm Aurora Travel Desk Lamp", "Lighting Mall"));
  rows.push(hit(18, "Mica & Elm AT-847 Aurora Desk Lamp in Blue", "Supplier East"));
  rows.push(hit(19, original.name, "Lighting Mall"));
  rows.push(hit(20, "Lumens ceiling light"));
  rows.push(hit(21, original.name, "Outside the search budget"));
  const { calls, hub } = endpoint(rows);
  const searched = await findShopSellers(original, query, { hub, market: "US" });
  assert.equal(searched.status, "searched");
  assert.deepEqual(searched.counts, { checked: 20, detailsRequested: 2, detailsRead: 2 });
  assert.deepEqual(
    calls.slice(1).map((c) => c.params.product_id),
    [id(19), id(18)],
  );
  assert.deepEqual(
    searched.products.map((p) => p.productId),
    [id(19), id(18)],
  );
  assert.ok(searched.products.every((p) => p.confirmedDistinctShop && p.variants[0].price === 28.5));
  assert.deepEqual(
    searched.sources.slice(1).map((s) => s.url),
    searched.products.map((p) => p.listingUrl),
  );
});

test("search failure, unreadable or wrong-ID details, and a successful empty search have distinct evidence", async () => {
  for (const hub of [
    async () => {
      throw Error("private");
    },
    async () => ({ code: 0, data: {} }),
  ]) {
    const r = await findShopSellers(original, query, { hub, market: "US" });
    assert.equal(r.status, "unavailable");
    assert.equal(r.reason, "search_unavailable");
    assert.equal(r.counts.detailsRequested, 0);
    assert.doesNotMatch(JSON.stringify(r), /private/);
  }
  const rows = [hit(1, original.name), hit(2, "Mica & Elm desk lamp")];
  const failed = await findShopSellers(original, query, {
    market: "US",
    ...endpoint(rows, (row) => {
      if (row.product_id === id(1)) throw Error("network");
      return detail(hit(99, "Different listing"));
    }),
  });
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.reason, "details_unavailable");
  assert.equal(failed.counts.detailsRead, 0);
  assert.deepEqual(
    failed.sources.slice(1).map((s) => s.url),
    rows.map((row) => "https://shop.tiktok.com/us/pdp/" + row.product_id),
  );
  const empty = await findShopSellers(original, query, { ...endpoint([]), market: "US" });
  assert.equal(empty.status, "searched");
  assert.equal(empty.reason, "no_results");
  assert.equal(empty.sources.length, 1);
});

test("keeps a verified listing if its peer detail is unavailable; seller identity is checked against the listing", async () => {
  const rows = [hit(1, original.name), hit(2, "Mica & Elm travel lamp")];
  const partial = await findShopSellers(original, query, {
    market: "US",
    ...endpoint(rows, (row) => {
      if (row.product_id === id(1)) throw Error("temporary");
      return detail(row);
    }),
  });
  assert.equal(partial.status, "searched");
  assert.deepEqual(partial.counts, { checked: 2, detailsRequested: 2, detailsRead: 1 });
  assert.deepEqual(
    partial.products.map((x) => x.productId),
    [id(2)],
  );
  const conflict = await findShopSellers(original, query, {
    market: "US",
    ...endpoint(rows, (row) => {
      const response = detail(row);
      response.product_data.initialData.productInfo.seller.seller_id = original.sellerId;
      return response;
    }),
  });
  assert.equal(conflict.status, "searched");
  assert.equal(conflict.reason, "sellers_unverified");
  assert.equal(conflict.counts.detailsRead, 2);
  assert.deepEqual(conflict.products, []);
  const none = await findShopSellers(original, query, {
    ...endpoint([hit(1, original.name, "Original Store"), hit(2, "Battery for motorcycle")]),
    market: "US",
  });
  assert.equal(none.reason, "no_eligible_sellers");
  assert.equal(none.counts.detailsRequested, 0);
});

test("unsupported markets, absent credentials and unknown seller identities never incur a lookup", async () => {
  const hub = async () => {
    throw Error("Unexpected call");
  };
  const absent = await findShopSellers(original, query, { market: "US" });
  assert.equal(absent.status, "unavailable");
  assert.equal(absent.reason, "not_configured");
  const foreign = await findShopSellers(original, query, { market: "GB", hub });
  assert.equal(foreign.status, "unsupported_market");
  const unknown = await findShopSellers({ ...original, seller: "", sellerId: null }, query, { market: "US", hub });
  assert.equal(unknown.status, "seller_unknown");
  assert.equal(unknown.counts.checked, 0);
  const { hub: valid } = endpoint([hit(1, original.name)]);
  const byId = await findShopSellers({ ...original, seller: "" }, query, { market: "US", hub: valid });
  assert.equal(byId.products[0].confirmedDistinctShop, true);
  const onlyName = await findShopSellers({ ...original, sellerId: null }, query, { market: "US", hub: valid });
  assert.equal(onlyName.products[0].confirmedDistinctShop, false);
});

test("seller search keeps a named product title when its selected variant has no model or edition in the title", async () => {
  const {compareTikTokShopOffers} = await import("../server/shop-web.mjs");
  for (const [name,brand,variant,required] of [
    ["The Let Them Theory: A Life-Changing Tool That Millions of People Can’t Stop Talking About",null,"Default",/let them theory/],
    ["SHASHIBO Magic Magnetic Puzzle Cube All Colorful Design Fidget Building STEM STEAM 3D Travel Toy Great Gift for Ages 8+","SHASHIBO","Renaissance",/magic magnetic puzzle cube/],
    ["[Cardi B' Pick Eye Cream] HEVEBLUE Black Yuja Bean Lifting Auto Eye Cream + Eye Cream Set",null,"Default / Default",/heveblue black yuja bean/],
  ]) {
    const {hub,calls} = endpoint([]);
    const item = {...original, market:"US", name, brand, model:null, variants:[{variant,price:29.99,currency:"USD",available:true}]};
    const result = await compareTikTokShopOffers(item,{hub});
    assert.ok(calls.length >= 1 && calls.length <= 2);
    assert.equal(new Set(calls.map(c => c.params.search_word)).size,calls.length);
    assert.match(calls[0].params.search_word,required);
    assert.doesNotMatch(calls[0].params.search_word,/changing tool/);
    assert.equal(result.comparison,null);
  }
});

// Public source and wrong offer observed in the 2026-11-19 local profile run.
test("Spider-Man tool bench search keeps the product type and drops the Newegg PS4 game", async () => {
  const { compareTikTokShopOffers } = await import("../server/shop-web.mjs");
  const toy = {
    productId: "1731176397038522481",
    listingUrl: "https://shop.tiktok.com/us/pdp/1731176397038522481",
    name: "Marvel Spider-Man, Spidey and His Amazing Friends, NASCAR & Transformers Pit Stop Tool Bench Playset – Pretend Play Racing & Real Tool Fun for Kids 4+, Official Licensed",
    brand: "Marvel",
    seller: "World Tech Toys 2.0",
    sellerId: "7496114746742376561",
    market: "US",
    variants: [
      {
        skuId: "1732004415659217009",
        variant: "Spidey and His Amazing Friends",
        gtin: null,
        price: 59.99,
        currency: "USD",
        available: true,
      },
    ],
  };
  const game = {
    product_id: "1730615679080698582",
    title: "Marvel's Spider-Man: Game of the Year Edition - PlayStation 4",
    seller_info: { shop_name: "Newegg, Inc.", seller_id: "7495122322888035030" },
  };
  const { hub, calls } = endpoint([game], (row) => {
    const p = detail(row, "55.14");
    p.product_data.initialData.productInfo.skus[0].sku_sale_props = [{ prop_value: "PS4 Video Games" }];
    return p;
  });
  const check = await compareTikTokShopOffers(toy, { hub });
  const firstSearch = calls.find(call => call.params.search_word);
  assert.match(firstSearch.params.search_word, /tool bench playset/i);
  assert.match(firstSearch.params.search_word, /spidey/i);
  assert.deepEqual(check.offers, []);
  assert.equal(check.comparison, null);
});

// The same-type source/alternative remain visible with matching accessories, even when
// TikTok prices cannot yield a verified same-SKU difference.
test("milk frother stays a candidate across different titles, with the chosen stand configuration", async () => {
  const { compareTikTokShopOffers } = await import("../server/shop-web.mjs");
  const item = {
    productId: "1729440114305504109",
    listingUrl: "https://shop.tiktok.com/us/pdp/1729440114305504109",
    name: "ODIFORGO 3-in-1 Rechargeable Button-Activated Non-Pressurised Modern Milk Frother - Handheld Coffee Equipment for Daily Use, Detachable Stainless Steel Whisk, 3-Speed Control, Food-Grade ABS, Convenient Charging, Power Level Glow (Black)",
    brand: "ODIFORGO",
    seller: "ODIFORGO",
    sellerId: "7495470774378990445",
    market: "US",
    variants: [
      { variant: "Without Stand-Black", gtin: null, price: 24.99, currency: "USD", available: true },
      { variant: "Stand+Black", gtin: null, price: 33.99, currency: "USD", available: true },
    ],
  };
  const row = {
    product_id: "1730104487518245235",
    title:
      "ODIFORGO Compact Yet Powerful Automatic Button-Operated Milk Frother - 1500mAh Cordless USB-C Rechargeable, 3-Speeds, 3 Detachable 304 Steel Whisks, Easy-to-Use Kitchen Gadget for At-Home Espresso, Cold Foam Creations (Black)",
    seller_info: { shop_name: "ODIFORGO HOME", seller_id: id(222) },
  };
  const { hub, calls } = endpoint([row], (r) => {
    const p = detail(r, "25.38"),
      product = p.product_data.initialData.productInfo;
    product.skus = ["without stand Black", "with stand Black"].map((label, i) => ({
      ...product.skus[0],
      sku_id: id(999 + i),
      sku_sale_props: [{ prop_value: label }],
    }));
    return p;
  });
  for (const [index, label] of ["without stand Black", "with stand Black"].entries()) {
    const checked = await compareTikTokShopOffers(item, { variantIndex: index, hub });
    assert.deepEqual(
      checked.offers.map((o) => [o.variant, o.match]),
      [[label, "candidate"]],
    );
    assert.equal(checked.comparison, null);
  }
  assert.match(calls[0].params.search_word, /milk frother/i);
});

test("search codes and confirmed barcodes can identify a differently titled SKU; placeholder brands cannot verify a model", async () => {
  const { compareTikTokShopOffers } = await import("../server/shop-web.mjs");
  const code = "036000291452";
  const item = {
    ...original,
    market: "US",
    variants: [{ gtin: code, variant: "Sapphire", mpn: "AT-847", price: 59.99, currency: "USD", available: true }],
  };
  const coded = { ...hit(8, "Portable Q001"), barcode: code };
  const { hub } = endpoint([coded], (row) => {
    const p = detail(row);
    Object.assign(p.product_data.initialData.productInfo.skus[0], {
      gtin: code,
      sku_sale_props: [{ prop_value: "Sapphire" }],
    });
    return p;
  });
  const verified = await compareTikTokShopOffers(item, { hub });
  assert.equal(verified.comparison?.alternativePrice, 28.5);
  item.variants[0].gtin = null;
  for (const brand of ["Generic", "Unbranded", "Unknown"]) {
    const r = endpoint([hit(9, item.name)], (row) => {
      const p = detail(row),
        product = p.product_data.initialData.productInfo;
      product.brand_name = brand;
      Object.assign(product.skus[0], { mpn: "AT-847", sku_sale_props: [{ prop_value: "Sapphire" }] });
      return p;
    });
    const result = await compareTikTokShopOffers({ ...item, brand }, { hub: r.hub });
    assert.equal(result.comparison, null);
    assert.equal(result.offers[0]?.match, "candidate");
  }
});

test("a khaki listing does not become a candidate for a yellow rocking chair", async () => {
  const { compareTikTokShopOffers } = await import("../server/shop-web.mjs");
  const item = {...original, name:"Teddy Fabric Rocking Chair", market:"US",
    variants:[{variant:"Yellow- Color blocking", price:99.21, currency:"USD", available:true}]};
  const {hub} = endpoint([hit(8,"Soft Fabric Rocking Chair")], row => {
    const p = detail(row);
    p.product_data.initialData.productInfo.skus[0].sku_sale_props = [{prop_value:"khaki"}];
    return p;
  });
  const check = await compareTikTokShopOffers(item,{hub});
  assert.deepEqual(check.offers,[]); assert.equal(check.comparison,null);
});

test("a single exact shop triggers further discovery, while two exact sellers close the check", async () => {
  const {compareTikTokShopOffers} = await import("../server/shop-web.mjs");
  const gtin = "036000291452";
  const item = {...original,market:"US",variants:[{skuId:id(500),gtin,variant:"Aurora Sapphire",price:60,currency:"USD",available:true}]};
  const rows = [1,2,3,4].map(n=>hit(n,original.name));
  for (const enough of [true,false]) {
    const {hub,calls}=endpoint(rows,row=>{
      const p=detail(row);
      const entry=p.product_data.initialData.productInfo;
      entry.skus[0].sku_sale_props=[{prop_value:"Aurora Sapphire"}];
      entry.skus[0].is_available = true;
      if (row.product_id === id(1) || row.product_id === id(enough ? 2 : 3)) entry.skus[0].gtin=gtin;
      return p;
    });
    const result=await compareTikTokShopOffers(item,{hub});
    assert.equal(calls.filter(c=>c.path.includes("search_products")).length,enough ? 1 : 2);
    assert.equal(calls.filter(c=>c.path.includes("product_detail")).length,enough ? 2 : 3);
    assert.equal(result.comparison.alternativePrice,28.5);
    assert.equal(result.followUp?.status,enough ? undefined : "checked");
  }
});

test("a second TikHub search adds fresh seller links, independently checked SKUs, and no repeat-shop quotes", async () => {
  const variant = {skuId:id(500),gtin:"036000291452",variant:"Aurora Sapphire",price:60,currency:"USD",available:true};
  const rows = [hit(1,original.name), hit(2,original.name,"Another name",id(201)), hit(3,original.name)];
  const calls = [];
  const hub = async (route,params) => {
    calls.push({route,params});
    if (route.includes("search_products")) {
      const hits = params.search_word === query ? rows.slice(0,1) : rows;
      return {code:0,data:{component_data:{products:hits}}};
    }
    return detail(rows.find(row=>row.product_id===params.product_id));
  };
  const found = await findShopSellers(original,query,{market:"US", hub,variant,considerAnotherShop:items=>items.length<2 && "Need another shop."});
  assert.deepEqual(calls.filter(c=>c.route.includes("search")).map(c=>c.params.search_word),[query,variant.gtin]);
  assert.deepEqual(calls.filter(c=>c.params.product_id).map(c=>c.params.product_id),[id(1),id(3)]);
  assert.deepEqual(found.products.map(p=>new URL(p.sourceUrl).searchParams.get("search_key")),[query,variant.gtin]);
  assert.deepEqual(found.counts,{checked:4,detailsRequested:2,detailsRead:2});
  assert.equal(found.followUp.status,"checked");
});

test("a second empty or failed query retains known evidence and respects cancellation and the detail budget",async()=>{
  const rows = Array.from({length:12},(_,i)=>hit(i+1,original.name));
  const variant = {gtin:"036000291452"};
  for (const mode of ["limit","failure","cancel","empty primary"]) {
    const calls = [], controller = new AbortController();
    const hub = async (route,params) => {
      calls.push({route,params});
      if (route.includes("search_products")) {
        if (mode==="failure" && params.search_word===variant.gtin) throw Error("Provider unavailable");
        const hits = params.search_word===variant.gtin ? rows.slice(5) : mode==="empty primary" ? [] : rows.slice(0,5);
        return {code:0,data:{component_data:{products:hits}}};
      }
      if (mode==="cancel") controller.abort();
      return detail(rows.find(row=>row.product_id===params.product_id));
    };
    const found = await findShopSellers(original,query,{market:"US",hub,variant,signal:controller.signal,considerAnotherShop:()=>"Need another shop."});
    const searches = calls.filter(c=>c.route.includes("search")).length;
    assert.equal(searches,mode==="cancel" ? 1 : 2);
    assert.ok(found.products.length && found.products.length <= 5);
    assert.equal(found.followUp.status,mode==="failure" ? "unavailable" : mode==="cancel" ? "time_limit" : "checked");
    if (mode==="limit") assert.equal(found.counts.detailsRequested,5);
    if (mode==="empty primary") assert.equal(found.products[0].productId,rows[5].product_id);
  }
});

test("combined search evidence keeps the latest observation per listing, rejects the original shop, and prices only the verified SKU", async () => {
  const {tikTokShopPriceCheck} = await import("../server/shop-web.mjs");
  const code = "036000291452";
  const variant = {skuId:id(90), variant:"Aurora Sapphire", gtin:code, price:60, currency:"USD", available:true};
  const rows = [hit(1,original.name),hit(2,original.name)];
  const found = await findShopSellers(original,query,{market:"US",variant,...endpoint(rows,row=>{
    const p = detail(row);
    p.product_data.initialData.productInfo.skus[0].gtin = code;
    p.product_data.initialData.productInfo.skus[0].sku_sale_props = [{prop_value:"Aurora Sapphire"}];
    return p;
  })});
  const [one,two] = found.products;
  const fresh = {...one,observedAt:"2026-11-19T15:00:00Z",variants:[{...one.variants[0],price:22}]};
  const old = {...one,observedAt:"2026-11-19T14:00:00Z",variants:[{...one.variants[0],price:5}]};
  const check = tikTokShopPriceCheck({...original,market:"US"},variant,{...found,products:[
    fresh,old,two,{...old,productId:id(8),sellerId:original.sellerId},{...old,market:"GB",productId:id(9)},
  ]});
  assert.deepEqual(check.offers.map(o=>o.price),[22,28.5]);
  assert.equal(check.comparison.alternativePrice,22);
});

test("listed material and warranty conflicts survive the detail lookup and prevent an exact savings claim", async () => {
  const {compareTikTokShopOffers}=await import("../server/shop-web.mjs");
  const {shopTermDifference}=await import("../src/shared/shop-price-terms.mjs");
  const row=hit(1,"Mica Elm Aurora Desk Lamp");
  const originalOffer={...original,market:"US",warranty:"2 years",variants:[{skuId:id(500),gtin:"036000291452",variant:"Aurora Sapphire",available:true,price:60,currency:"USD"}]};
  const {hub}=endpoint([row],candidate=>{
    const p=detail(candidate);
    const info=p.product_data.initialData.productInfo; info.specifications=[{name:"Warranty Period",value:"6 months"},{name:"Material",value:"MDF"}];
    info.skus[0].gtin="036000291452";info.skus[0].sku_sale_props=[{prop_value:"Aurora Sapphire"}];return p;
  });
  const result=await compareTikTokShopOffers(originalOffer,{hub});
  assert.equal(result.comparison,null);assert.equal(result.offers[0].material,"MDF");assert.equal(result.offers[0].warranty,"6 months");
  assert.match(shopTermDifference(originalOffer,result.offers[0]),/24 months.*6/);
  assert.match(shopTermDifference({material:"Solid oak"},{material:"MDF"}),/Solid oak.*MDF/);
  assert.equal(shopTermDifference({warranty:"1 year"}, {warranty:"12 months"}),null);
  assert.equal(shopTermDifference({material:"Premium wood",warranty:"See terms"}, {material:"MDF",warranty:"none"}),null);
});
