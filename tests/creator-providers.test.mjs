import assert from "node:assert/strict";
import test from "node:test";
import { collectCreator } from "../server/creator-providers.mjs";

const user = { uniqueId: "Test_User", nickname: "Test User", signature: "Send to hello@example.com", secUid: "test-sec-uid" };
const post = { author: { uniqueId: "test_user", secUid: user.secUid }, id: "7399999999999999999", desc: "An original caption", createTime: "1700000000" };
const api = data => Response.json({ code: 200, data });
const profile = () => api({ userInfo: { user, stats: { followerCount: 512 } } });

function embed(creator = user, videos = [{ id: post.id, authorUniqueId: user.uniqueId, desc: "An embed caption" }]) {
  const page = { userInfo: creator, videoList: videos };
  const state = { source: { data: { "/embed/@test_user": page } } };
  return new Response(`<script id="__FRONTITY_CONNECT_STATE__">${JSON.stringify(state)}</script>`);
}

test("TikHub uses the matched secUid for one dated, capped public post sample", async () => {
  const calls = [];
  const unrelated = { ...post, id: "101", author: { uniqueId: "somebody_else" } };
  const unsafeNumber = { ...post, id: Number(post.id) };
  const otherSecUid = { ...post, id: "102", author: { uniqueId: user.uniqueId, secUid: "old-holder" } };
  const more = Array.from({ length: 20 }, (_, i) => ({ ...post, id: String(i + 300) }));
  const report = await collectCreator("Test_User", {
    token: "server-token",
    fetchImpl: async (input, options) => {
      const url = new URL(input);
      calls.push(url);
      assert.equal(url.origin, "https://api.tikhub.io");
      assert.equal(options.headers.Authorization, "Bearer server-token");
      assert.equal(options.redirect, "manual");
      if (url.pathname.endsWith("fetch_user_profile")) return profile();
      return api({ itemList: [unrelated, otherSecUid, unsafeNumber, { ...post, privateItem: true }, post, post, ...more] });
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("uniqueId"), "test_user");
  assert.equal(calls[1].searchParams.get("secUid"), user.secUid);
  assert.equal(calls[1].searchParams.get("count"), "15");
  assert.equal(report.provider, "TikHub");
  assert.match(report.observedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(report.profile.followers, 512);
  assert.equal(report.profile.bio, "Send to [contact email omitted]");
  assert.equal(report.posts.length, 15);
  assert.deepEqual(report.posts[0], { id: post.id, caption: post.desc, url: `https://www.tiktok.com/@test_user/video/${post.id}`, publishedAt: "2023-11-14T22:13:20.000Z" });
  assert.deepEqual(report.warnings, []);
});

test("a rejected token or mismatched TikHub identity can recover from the public embed; credential never leaves TikHub", async () => {
  for (const failure of [() => new Response("a-secret", { status: 401 }), () => api({ userInfo: { user: { ...user, uniqueId: "other" } } })]) {
    const hosts = [];
    const sample = await collectCreator("test_user", { token: "a-secret", fetchImpl: async (input, options) => {
      const url = new URL(input);
      hosts.push(url.hostname);
      if (url.hostname === "api.tikhub.io") return failure();
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(url.href, "https://www.tiktok.com/embed/@test_user");
      return embed();
    } });
    assert.deepEqual(hosts, ["api.tikhub.io", "www.tiktok.com"]);
    assert.equal(sample.posts[0].publishedAt, null);
    assert.equal(sample.profile.followers, null);
    assert.equal(sample.provider, "TikTok public embed");
    assert.ok(sample.warnings.length);
    assert.doesNotMatch(JSON.stringify(sample), /a-secret/);
  }
});

test("an interrupted post feed returns either an identified embed sample or an explicit partial profile", async () => {
  for (const usableEmbed of [true, false]) {
    const result = await collectCreator("test_user", { token: "token", fetchImpl: async url => {
      if (String(url).includes("fetch_user_profile")) return profile();
      if (String(url).includes("fetch_user_post")) return api({ statusCode: 1002 });
      return usableEmbed ? embed() : new Response("blocked");
    } });
    assert.equal(result.profile.followers, 512);
    assert.equal(result.posts.length, usableEmbed ? 1 : 0);
    assert.equal(result.postsUnavailable, usableEmbed ? undefined : true);
    assert.equal(result.provider, usableEmbed ? "TikHub + TikTok public embed" : "TikHub");
    assert.ok(result.warnings.length);
  }
});

test("an explicitly empty feed is complete; a missing or unmatchable feed is partial", async () => {
  for (const [videos, unavailable] of [[[], undefined], [null, true], [[{ ...post, author: { uniqueId: "other" } }], true]]) {
    const sample = await collectCreator("test_user", { token: "", fetchImpl: async () => embed(user, videos) });
    assert.equal(sample.postsUnavailable, unavailable);
    assert.deepEqual(sample.posts, []);
  }
  let embedCalls = 0;
  const sample = await collectCreator("test_user", { token: "token", fetchImpl: async url => {
    if (String(url).includes("fetch_user_profile")) return profile();
    if (String(url).includes("fetch_user_post")) return api({ itemList: [] });
    embedCalls++;
    return embed();
  } });
  assert.deepEqual(sample.posts, []);
  assert.equal(sample.postsUnavailable, undefined);
  assert.equal(embedCalls, 0);
  const recovered = await collectCreator("test_user", { token: "token", fetchImpl: async url => {
    if (String(url).includes("fetch_user_profile")) return profile();
    if (String(url).includes("fetch_user_post")) return api({ itemList: [{ ...post, author: { uniqueId: "other" } }] });
    return embed();
  } });
  assert.equal(recovered.posts.length, 1);
  assert.equal(recovered.postsUnavailable, undefined);
});

test("a transient fetch retries once, long rate limits and redirects never replay or follow", async () => {
  let calls = 0;
  const ok = await collectCreator("test_user", { token: "", fetchImpl: async () => ++calls === 1 ? new Response("", { status: 503 }) : embed() });
  assert.equal(ok.posts.length, 1);
  assert.equal(calls, 2);
  for (const [status, headers] of [[429, { "Retry-After": "60" }], [302, { Location: "https://example.org" }]]) {
    calls = 0;
    await assert.rejects(collectCreator("test_user", { token: "", fetchImpl: async (_, opts) => {
      calls++;
      assert.equal(opts.redirect, "manual");
      return new Response(null, { status, headers });
    } }), { code: "SOURCE_UNAVAILABLE" });
    assert.equal(calls, 1);
  }
});

test("unavailable public profiles, provider failures, and account mismatch remain distinguishable", async () => {
  for (const [response, code] of [
    [() => new Response(null, { status: 404 }), "PROFILE_INACCESSIBLE"],
    [() => embed({ ...user, privateAccount: true }), "PROFILE_INACCESSIBLE"],
    [() => new Response("challenge"), "SOURCE_UNAVAILABLE"],
    [() => embed({ ...user, uniqueId: "another" }), "SOURCE_UNAVAILABLE"],
  ]) {
    await assert.rejects(collectCreator("test_user", { token: "", fetchImpl: async () => response() }), { code });
  }
  let count = 0;
  await assert.rejects(collectCreator("test_user", { token: "t", fetchImpl: async () => {
    count++;
    return api({ userInfo: { user: { ...user, privateAccount: true } } });
  } }), { code: "PROFILE_INACCESSIBLE" });
  assert.equal(count, 1);
});

test("bad handles, oversize payloads and cancelled collections return without disclosing upstream content", async () => {
  const idle = () => assert.fail("provider was contacted");
  await assert.rejects(collectCreator("https://example.com", { fetchImpl: idle }), { code: "INVALID_HANDLE" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(collectCreator("test_user", { token: "token", fetchImpl: idle, signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(collectCreator("test_user", { token: "", fetchImpl: async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)) }), { code: "SOURCE_UNAVAILABLE" });
});
