import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { once } from "node:events";
import { createVideoLookup, lookupVideo, parseProfileAddress } from "../server/video-lookup.mjs";

const handle = "sample_store";
const profile = "https://www.tiktok.com/@" + handle;
const ids = ["7500000000000000001", "7500000000000000002", "7500000000000000003",
  "7500000000000000004", "7500000000000000005", "7500000000000000006"];
const products = ["1711111111111111101", "1711111111111111102", "1711111111111111103"];
const link = id => profile + "/video/" + id;
const api = data => Response.json({ code: 200, data });
const outage = () => new Response(null, { status: 503 });
const anchors = productId => [{ type: 33, id: productId, keyword: "An attached product" }];
const appPost = (id, fields) => ({ aweme_id: id, author: { unique_id: handle, sec_uid: "current" }, desc: "Public caption", ...fields });
const hubProfile = () => api({ userInfo: { user: { uniqueId: handle, secUid: "current" } } });

function publicEmbed() {
  const data = { ["/embed/@" + handle]: { userInfo: { uniqueId: handle },
    videoList: ids.map(id => ({ id, desc: "Short caption", authorUniqueId: handle })) } };
  return new Response('<script id="__FRONTITY_CONNECT_STATE__">' + JSON.stringify({ source: { data } }) + "</script>");
}

function publicPost(id, fields) {
  const itemStruct = { id, author: { uniqueId: handle }, desc: "Full caption", ...fields };
  const detail = { statusCode: 0, itemInfo: { itemStruct } };
  return new Response('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">' +
    JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": detail } }) + "</script>");
}

function tikHubRoutes(route) {
  const requests = [];
  return {
    requests,
    fetchImpl: async (target, init) => {
      const url = new URL(target);
      requests.push(url);
      assert.equal(url.origin, "https://api.tikhub.io");
      assert.equal(init.redirect, "error");
      assert.ok(init.headers.Authorization);
      return route(url.pathname.split("/").pop(), url.searchParams);
    },
  };
}

test("TikHub-only profiles can use the handle for the app feed during a web profile outage", async () => {
  const { requests, fetchImpl } = tikHubRoutes((path, params) => {
    if (path === "fetch_user_profile") return outage();
    if (path === "fetch_user_post_videos") {
      assert.equal(params.get("unique_id"), handle);
      assert.equal(params.has("sec_user_id"), false);
      assert.equal(params.get("count"), "5");
      assert.equal(params.get("region"), "GB");
      return api({ aweme_list: [appPost(ids[0], { anchors: anchors(products[0]) }),
        appPost(ids[1], { is_close_friends_only: true, anchors: anchors(products[1]) })] });
    }
    assert.fail("Unexpected TikHub call");
  });
  const r = await lookupVideo(profile, { fetchImpl, token: "fixture", tikhubOnly: true, market: "GB" });
  assert.equal(requests.length, 2);
  assert.deepEqual(r.sample, { checked: 1, limit: 5 });
  assert.equal(r.sampledPosts[0].provider, "TikHub");
  assert.deepEqual(r.commerce.map(item => [item.productId, item.sourceUrl]), [[products[0], link(ids[0])]]);
});

test("TikHub-only profiles hydrate exact sampled IDs, reject identity changes and exclude a newly private post", async () => {
  const readIds = [];
  const { requests, fetchImpl } = tikHubRoutes((path, params) => {
    if (path === "fetch_user_profile") return hubProfile();
    if (path === "fetch_user_post_videos") return api({ aweme_list: ids.map(id => appPost(id)) });
    assert.equal(path, "fetch_one_video_v3");
    const id = params.get("aweme_id"); readIds.push(id);
    const fields = id === ids[0] ? { author: { unique_id: handle, sec_uid: "another" } }
      : id === ids[1] ? { status: { private_status: 1 } } : { anchors: anchors(products[ids.indexOf(id) - 2]) };
    return api({ aweme_detail: appPost(id, fields) });
  });
  const r = await lookupVideo("@" + handle, { fetchImpl, token: "fixture", tikhubOnly: true, market: "GB" });
  assert.deepEqual(readIds, ids.slice(0, 5));
  assert.equal(requests.length, 7);
  assert.deepEqual(r.sampledPosts.map(p => p.url), ids.slice(2, 5).map(link));
  assert.deepEqual(r.commerce.map(item => [item.productId, item.sourceUrl]), products.map((p, i) => [p, link(ids[i + 2])]));
});

test("public embed captions are enriched from their verified post pages up to the product cap", async () => {
  const paths = [];
  const r = await lookupVideo(profile, { token: "", fetchImpl: async (target, init) => {
    const url = new URL(target); paths.push(url.href);
    assert.equal(url.origin, "https://www.tiktok.com");
    assert.equal(init.headers.Authorization, undefined);
    if (url.pathname.includes("/embed/")) return publicEmbed();
    const id = url.pathname.split("/").pop();
    return publicPost(id, { anchors: anchors(products[ids.indexOf(id)]) });
  } });
  assert.deepEqual(paths, ["https://www.tiktok.com/embed/@" + handle, ...ids.slice(0, 3).map(link)]);
  assert.deepEqual(r.sample, { checked: 5, limit: 5 });
  assert.deepEqual(r.commerce.map(p => p.sourceUrl), ids.slice(0, 3).map(link));
  assert.deepEqual(r.sampledPosts.map(p => p.provider),
    ["TikTok public post", "TikTok public post", "TikTok public post", "TikTok public embed", "TikTok public embed"]);
});

test("an unavailable TikHub detail endpoint gets one attempt; the incomplete sample remains retryable", async () => {
  const { requests, fetchImpl } = tikHubRoutes(path => {
    if (path === "fetch_user_profile") return hubProfile();
    if (path === "fetch_user_post_videos") return api({ aweme_list: ids.map(id => appPost(id)) });
    assert.equal(path, "fetch_one_video_v3");
    return outage();
  });
  const r = await lookupVideo(profile, { fetchImpl, token: "fixture", tikhubOnly: true });
  assert.equal(requests.length, 3);
  assert.equal(r.status, "partial");
  assert.deepEqual(r.sample, { checked: 5, limit: 5 });
  assert.deepEqual(r.commerce, []);
});

test("a TikHub-only lookup never substitutes archive, public TikTok, or a caption catalog match", async () => {
  const id = "7606015834678381831";
  const known = "https://www.tiktok.com/@mrwhosetheboss/video/" + id;
  for (const raw of [known, "@mrwhosetheboss"]) {
    await assert.rejects(lookupVideo(raw, { tikhubOnly: true, token: "", fetchImpl: () => assert.fail("unexpected call") }), { status: 503 });
    const { requests, fetchImpl } = tikHubRoutes(outage);
    await assert.rejects(lookupVideo(raw, { tikhubOnly: true, token: "fixture", fetchImpl }), { status: 503 });
    assert.ok(requests.every(url => url.hostname === "api.tikhub.io"));
  }
  const { fetchImpl } = tikHubRoutes(path => path === "fetch_one_video_v3"
    ? api({ aweme_detail: { aweme_id: id, author: { unique_id: "mrwhosetheboss" }, desc: "Sony WF-1000XM6" } })
    : outage());
  const r = await lookupVideo(known, { tikhubOnly: true, token: "fixture", fetchImpl });
  assert.deepEqual(r.products, []);
  assert.deepEqual(r.commerce, []);
  assert.equal(r.video.provider, "TikHub");
});

test("a TikHub privacy flag is terminal for the profile even if the web profile call failed", async () => {
  const { requests, fetchImpl } = tikHubRoutes(path => path === "fetch_user_profile" ? outage()
    : api({ aweme_list: [appPost(ids[0], { author: { unique_id: handle, secret: 1 } })] }));
  await assert.rejects(lookupVideo(profile, { token: "fixture", fetchImpl }), { status: 404 });
  assert.equal(requests.length, 2);
});

test("profile addresses canonicalize handles, mobile links and tracking parameters to the same URL", () => {
  for (const value of ["@Sample_Store", "https://m.tiktok.com/@Sample_Store/?ref=sample"]) {
    assert.deepEqual(parseProfileAddress(value), { handle, url: profile });
  }
  for (const value of ["https://other.example/@" + handle, link(ids[0]), "@sample_store."]) {
    assert.equal(parseProfileAddress(value), null);
  }
});

test("the original SKU selection survives when TikHub returns only a different default variant", async () => {
  const requested = "1777777777777777701", other = "1777777777777777702";
  const url = "https://shop.tiktok.com/us/pdp/" + products[0] + "?sku_id=" + requested;
  const { fetchImpl } = tikHubRoutes(path => {
    if (path === "fetch_one_video_v3") return api({ aweme_detail: appPost(ids[0], { desc: url, anchors: anchors(products[0]) }) });
    assert.equal(path, "fetch_product_detail_v3");
    return api({ product_data: { initialData: { productInfo: { title: "Example", product_id: products[0], default_sku_id: other,
      skus: [{ sku_id: other, price: { sale_price_decimal: "10", currency_name: "USD" } }] } } } });
  });
  for (const input of [url, link(ids[0])]) {
    const { commerce } = await lookupVideo(input, { token: "fixture", tikhubOnly: true, fetchImpl });
    assert.equal(commerce[0].requestedSkuId, requested);
    assert.equal(commerce[0].selectedSkuId, undefined);
    assert.equal(commerce[0].defaultSkuId, other);
  }
});

test("the legacy HTTP route retries partial TikHub profiles and keeps the TikHub-only policy under its rate limit", async t => {
  let recovered = false;
  const { requests, fetchImpl } = tikHubRoutes(path => {
    if (path === "fetch_user_profile") return hubProfile();
    if (path === "fetch_user_post_videos") return recovered
      ? api({ aweme_list: [appPost(ids[0], { anchors: anchors(products[0]) })] }) : outage();
    assert.fail("unexpected data source");
  });
  const service = createVideoLookup({ fetchImpl, token: "fixture", dailyLimit: 2, tikhubOnly: true });
  const server = http.createServer((req, res) => void service.handle(req, res));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = "http://127.0.0.1:" + server.address().port + "/api/video-lookup";
  const submit = url => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, market: "GB" }) });
  assert.equal((await (await submit(profile)).json()).status, "partial");
  recovered = true;
  assert.equal((await (await submit(profile)).json()).commerce[0].sourceUrl, link(ids[0]));
  assert.equal((await submit("https://www.tiktok.com/@mrwhosetheboss/video/7606015834678381831")).status, 429);
  assert.equal(requests.length, 4);
});

test("a transient single-video failure can recover only the exact public post from TikHub's bounded feed", async () => {
  const check = async (rows) => {
    const {fetchImpl} = tikHubRoutes(path => {
      if (path === "fetch_one_video_v3") return outage();
      if (path === "fetch_user_post_videos") return api({aweme_list: rows});
      return hubProfile();
    });
    return lookupVideo(link(ids[0]), {tikhubOnly:true, fetchImpl, token:"test"});
  };
  const report = await check([appPost(ids[1]), appPost(ids[0], {desc:"Recovered original caption"})]);
  assert.equal(report.video.caption,"Recovered original caption");
  await assert.rejects(check([appPost(ids[1])]), {status:503});
  await assert.rejects(check([appPost(ids[0], {status:{private_status:1}})]), {status:404});
});

test("strict shared video checks obtain the canonical post through TikHub alone", async () => {
  const raw = "https://vm.tiktok.com/Abcde12345/";
  const {requests,fetchImpl} = tikHubRoutes((path,params) => {
    if (path === "fetch_user_profile") return hubProfile();
    assert.equal(path,"fetch_one_video_by_share_url"); assert.equal(params.get("share_url"),raw);
    return api({aweme_detail:appPost(ids[0])});
  });
  const report = await lookupVideo(raw,{tikhubOnly:true,fetchImpl,token:"test"});
  assert.equal(report.video.url,link(ids[0])); assert.ok(requests.every(u=>u.origin==="https://api.tikhub.io"));
});
