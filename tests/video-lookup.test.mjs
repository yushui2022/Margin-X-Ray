import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createVideoLookup, lookupVideo, parseVideoAddress } from "../server/video-lookup.mjs";
import { findProductCandidates } from "../server/creator-product-traces.mjs";

const post = { handle: "example123", id: "1234567890123456789" };
const url = `https://www.tiktok.com/@${post.handle}/video/${post.id}`;
const sourceUrl = "https://electronics.sony.com/audio/headphones/truly-wireless-earbuds/p/wf1000xm6-s";

function publicPage(desc, changes = {}) {
  const itemStruct = { id: post.id, author: { uniqueId: post.handle }, createTime: "1720000000", desc, ...changes };
  const state = { __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode: 0, itemInfo: { itemStruct } } } };
  return new Response('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">' + JSON.stringify(state) + "</script>");
}

test("video addresses validate origin, normalize exact post, and preserve share-token case", () => {
  assert.deepEqual(parseVideoAddress(url + "?lang=en&x=1"), { ...post, url });
  assert.equal(parseVideoAddress("m.tiktok.com/@Example123/video/" + post.id)?.url, url);
  for (const input of ["https://vm.tiktok.com/AbC12/", "https://vt.tiktok.com/AbC12", "https://www.tiktok.com/t/AbC12"]) {
    assert.match(parseVideoAddress(input)?.url, /AbC12\/$/);
  }
  for (const input of ["", null, url.replace("www.tiktok.com", "example.net"), "https://user@vm.tiktok.com/AAAAA",
    "https://vm.tiktok.com:9443/AAAAAA", "https://www.tiktok.com/@example123", "http://127.0.0.1/video/example",
    "https://www.tiktok.com/@example123/video/1/another", "https://www.tiktok.com/@example./video/12345678"]) {
    assert.equal(parseVideoAddress(input), null);
  }
});

test("public post match requires exact ID and account, keeps variants and follows explicit catalog URLs", async () => {
  const lookup = async caption => lookupVideo(url, { fetchImpl: async () => publicPage(caption) });
  const result = await lookup("Sponsored: Feastables Milk Chocolate.");
  assert.equal(result.video.provider, "TikTok public post");
  assert.equal(result.video.url, url);
  assert.ok(result.video.publishedAt.startsWith("2024-"));
  assert.deepEqual(result.products.map(p => p.id), ["feastables-standard", "feastables-king"]);
  assert.ok(result.products.every(p => p.match === "candidate" && p.listingUrl.startsWith("https://")));
  const exact = await lookup("Shop here " + sourceUrl + "?utm_source=tiktok");
  assert.deepEqual(exact.products.map(p => p.id), ["arun-sony"]);
  assert.equal(exact.video.mentionedUrls[0], sourceUrl + "?utm_source=tiktok");
  assert.equal((await lookup("Hello!")).products.length, 0);
});

test("short link redirects never receive provider credentials", async () => {
  const seen = [], auth = [];
  const result = await lookupVideo("https://vm.tiktok.com/AbCdEf", { token: "fixture", fetchImpl: async (target, init) => {
    auth.push({ host: new URL(target).hostname, token: init.headers.Authorization });
    if (new URL(target).hostname === "api.tikhub.io") {
      return new Response(null, { status: 503 });
    }
    seen.push(String(target)); assert.equal(init.headers.Authorization, undefined);
    if (seen.length === 1) return new Response(null, { status: 302, headers: { location: "https://www.tiktok.com/t/ZZZZZ" } });
    if (seen.length === 2) return new Response(null, { status: 301, headers: { location: url + "?_r=1" } });
    return publicPage("Outdoor walk");
  } });
  assert.equal(result.video.url, url);
  assert.equal(seen.length, 3);
  assert.ok(auth.some(row => row.host === "api.tikhub.io"));
  for (const row of auth) assert.equal(row.token, row.host === "api.tikhub.io" ? "Bearer fixture" : undefined);
  let calls = 0;
  await assert.rejects(lookupVideo("https://vt.tiktok.com/AbCdEf", { fetchImpl: async () => {
    calls++; return new Response(null, { status: 302, headers: { location: "https://example.org/product" } });
  } }), { status: 404 });
  assert.equal(calls, 1);
});

test("superseded shade links stay on their own listing in videos and creator research", async () => {
  for (const [kit, shade] of [["matte", "43927621632242"], ["velvet", "44109989216498"]]) {
    const original = `https://kyliecosmetics.com/products/${kit}-lip-kit?variant=${shade}`;
    const caption = `Kylie Cosmetics ${kit} lip kit. ${original}`;
    const clip = await lookupVideo(url, { fetchImpl: async () => publicPage(caption) });
    assert.deepEqual(clip.products, []);
    assert.deepEqual(clip.listedProducts.map(item => item.url), [original]);
    const groups = findProductCandidates(post.handle, { posts: [clip.video], observedAt: "2026-11-18" });
    assert.deepEqual(groups.flatMap(group => group.listings.map(listing => [listing.id, listing.url])), [[undefined, original]]);
  }
});

test("current seller URLs and a supplemental product name resolve independently of the frozen archive", async () => {
  const bare = "https://kyliecosmetics.com/products/matte-lip-kit?variant=48399747481842";
  const mascara = "https://www.ulta.com/p/kylash-volume-mascara-pimprod2038642?sku=2608568";
  for (const [caption, id, page] of [[bare + "&utm_source=example", "kylie-matte", bare], [mascara, "kylie-kylash", mascara],
    ["My Kylie Cosmetics Kylash Volume Mascara", "kylie-kylash", "https://kyliecosmetics.com/products/kylash-volume-mascara?variant=44379326906610"]]) {
    const clip = await lookupVideo(url, { fetchImpl: async () => publicPage(caption) });
    assert.deepEqual(clip.products.map(item => [item.id, item.listingUrl, item.match]), [[id, page, "candidate"]]);
    assert.deepEqual(clip.listedProducts, []);
    const groups = findProductCandidates(post.handle, { posts: [clip.video], observedAt: "2026-11-18" });
    assert.deepEqual(groups.flatMap(group => group.listings.map(item => [item.id, item.url])), [[id, page]]);
  }
});

test("uncatalogued products in sourced captions have a direct listing continuation without fetching the shop", async () => {
  const amazon = "https://www.amazon.co.uk/example-product/dp/B012345678?th=1";
  const direct = "https://brand.example/en-gb/collections/kitchen/products/green-skillet?variant=22";
  const shop = "https://shop.tiktok.com/us/pdp/wireless-headphones/1732549723094488060";
  const other = [
    "https://www.amazon.com/s?k=skillet", "https://brand.example/", "https://brand.example/products/all",
    "https://brand.example/search?q=skillet", "https://brand.example/redirect?to=/products/item",
    "https://vm.tiktok.com/Abcd1234", "https://checkout.internal/products/teapot",
  ];
  const result = await lookupVideo(url, { fetchImpl: async target => {
    assert.equal(target, url);
    return publicPage([amazon, direct, shop, direct, ...other].join(" "));
  } });
  assert.deepEqual(result.products, []);
  assert.deepEqual(result.listedProducts, [
    { label: "Amazon item B012345678", url: amazon }, { label: "Product listing on brand.example", url: direct },
    { label: "TikTok Shop item 1732549723094488060", url: shop },
  ]);
});

test("video-only oEmbed metadata, wrong creators and neighbouring posts cannot stand in for a match", async () => {
  for (const wrong of [{ author: { uniqueId: "other" } }, { id: "9999999999999999999" }, { privateItem: true }]) {
    await assert.rejects(lookupVideo(url, { fetchImpl: async target => String(target).includes("/oembed")
      ? Response.json({ type: "video", embed_product_id: post.id, html: "<iframe></iframe>" }) : publicPage("Wrong record", wrong) }), { status: 404 });
  }
  const result = await lookupVideo(url, { fetchImpl: async target => String(target).includes("/oembed")
    ? Response.json({ type: "video", author_url: "https://www.tiktok.com/@" + post.handle, html: '<blockquote data-video-id="' + post.id + '">', title: "Verified caption" })
    : new Response("no metadata") });
  assert.equal(result.video.provider, "TikTok oEmbed");
});

test("configured TikHub fallback accepts only the requested account and passes credentials only to its fixed host", async () => {
  const fetchImpl = async (target, init) => {
    if (new URL(target).hostname === "api.tikhub.io") {
      assert.equal(init.headers.Authorization, "Bearer fixture-token");
      assert.equal(init.redirect, "error");
      assert.equal(new URL(target).searchParams.get("aweme_id"), post.id);
      return Response.json({ code: 200, data: { aweme_details: [
        { aweme_id: "9999999999999999", author: { unique_id: post.handle }, desc: "Different post" },
        { aweme_id: post.id, author: { unique_id: post.handle }, desc: "Sony WF-1000XM6" },
      ] } });
    }
    assert.equal(init.headers.Authorization, undefined);
    return new Response(null, { status: 503 });
  };
  const result = await lookupVideo(url, { fetchImpl, token: "fixture-token" });
  assert.equal(result.video.provider, "TikHub");
  assert.deepEqual(result.products.map(p => p.id), ["arun-sony"]);
});

test("archived post fallback retains historical provenance and keeps the promoted variant unresolved", async () => {
  const known = "https://www.tiktok.com/@mrwhosetheboss/video/7606015834678381831";
  const result = await lookupVideo(known, { fetchImpl: async () => new Response(null, { status: 503 }) });
  assert.equal(result.video.observedAt, "2026-11-17");
  assert.match(result.video.provider, /Archived source/);
  assert.equal(result.video.sourceUrl, "https://www.nutcake.com/creators/mrwhosetheboss");
  assert.equal(result.products[0].match, "documented");
  assert.match(result.products[0].variant, /unverified/);
});

test("HTTP video lookup validates requests, coalesces work, caches reports and bounds upstream calls", async t => {
  let calls = 0;
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const service = createVideoLookup({ token: "", dailyLimit: 1, fetchImpl: async () => {
    calls++; await gate; return publicPage("Public caption");
  } });
  const server = http.createServer((req, res) => { void service.handle(req, res); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/video-lookup`;
  const submit = (link, headers = {}) => fetch(endpoint, { method: "POST", body: JSON.stringify({ url: link }), headers: { "Content-Type": "application/json", ...headers } });
  assert.equal((await fetch(endpoint)).status, 405);
  assert.equal((await submit(url, { origin: "https://example.org" })).status, 403);
  assert.equal((await submit("https://invalid.test/")).status, 400);
  assert.equal((await submit("x".repeat(5000))).status, 413);
  assert.equal((await submit(url, { "content-type": "text/plain" })).status, 415);
  const pending = [submit(url), submit(url + "?lang=en")];
  unblock();
  const responses = await Promise.all(pending);
  assert.ok(responses.every(r => r.ok));
  assert.equal((await (await submit(url)).json()).video.id, post.id);
  assert.equal(calls, 1);
  assert.equal((await submit(url.replace(post.id, "9999999999"))).status, 429);
  const archiveWhenBusy = await submit("https://www.tiktok.com/@mrwhosetheboss/video/7606015834678381831");
  assert.equal(archiveWhenBusy.status, 200);
  assert.match((await archiveWhenBusy.json()).video.provider, /Archived source/);
  assert.equal(calls, 1);
});
