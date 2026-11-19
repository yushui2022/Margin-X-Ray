import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createCreatorResearch } from "../server/creator-research.mjs";
import { findProductCandidates } from "../server/creator-product-traces.mjs";
import { checkRecallSources } from "../server/creator-source-checks.mjs";

function sample(handle, caption = "A public caption.") {
  return { profile: { handle, name: "Fixture", followers: null, bio: "", url: "https://www.tiktok.com/@" + handle },
    posts: [{ id: "12345", url: "https://www.tiktok.com/@" + handle + "/video/12345", caption, publishedAt: null }],
    observedAt: "2026-11-18", provider: "Test source", warnings: [] };
}

async function service(t, options) {
  const app = createCreatorResearch({ databasePath: ":memory:", collect: async handle => sample(handle),
    env: {}, pollMs: 25, ...options });
  const server = http.createServer((req, res) => { void app.handle(req, res); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    app.close();
    await new Promise(resolve => server.close(resolve));
  });
  return {
    app,
    request: async (handle, method = "GET", init = {}) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/creator-research/${handle}`, { method, ...init });
      return { status: res.status, data: await res.json() };
    },
  };
}

async function until(query, condition) {
  for (let i = 0; i < 150; i++) {
    const result = await query();
    if (condition(result)) return result;
    await delay(10);
  }
  assert.fail("Timed out waiting for job state");
}

test("research requires an explicit same-origin start and deduplicates concurrent lookups", async t => {
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { request } = await service(t, { collect: async handle => { calls++; await wait; return sample(handle); } });
  assert.equal((await request("Example_ID")).data.status, "idle");
  assert.equal((await request(".bad", "POST")).status, 400);
  assert.equal((await request("example_id", "POST", { headers: { origin: "https://other.example" } })).status, 403);
  assert.equal((await request("example_id", "POST", { body: "ignored" })).status, 400);
  assert.equal(calls, 0);
  const starts = await Promise.all([request("example_id", "POST"), request("Example_ID", "POST")]);
  assert.deepEqual(starts.map(r => r.status), [202, 202]);
  await until(() => request("example_id"), r => r.data.stage === "collecting");
  release();
  const ready = await until(() => request("example_id"), r => r.data.status === "ready");
  assert.equal(ready.data.report.score.value, null);
  assert.equal(ready.data.report.coverage.value, 10.5);
  assert.equal((await request("example_id", "POST")).data.report.provider, "Test source");
  assert.equal(calls, 1);
});

test("failed refresh retains the last report, enforces cooldown, permits a later recovery", async t => {
  let clock = Date.now(), fail = false;
  const { request } = await service(t, { now: () => clock, cacheMs: 100, cooldownMs: 2000,
    collect: async handle => { if (fail) throw new Error("sensitive fixture error"); return sample(handle); } });
  await request("example", "POST");
  await until(() => request("example"), r => r.data.status === "ready");
  clock += 101;
  fail = true;
  await request("example", "POST");
  const failed = await until(() => request("example"), r => r.data.status === "failed");
  assert.equal(failed.data.report.handle, "example");
  assert.equal(failed.data.stale, true);
  assert.doesNotMatch(JSON.stringify(failed.data), /sensitive/);
  assert.equal((await request("example", "POST")).status, 429);
  fail = false;
  clock += 2001;
  await request("example", "POST");
  await until(() => request("example"), r => r.data.status === "ready");
});

test("a posts outage allows an early retry and preserves a previously complete sample", async t => {
  let clock = Date.now(), partial = true;
  const { request } = await service(t, { now: () => clock, collect: async handle => partial
    ? { ...sample(handle), posts: [], postsUnavailable: true } : sample(handle) });
  await request("example", "POST");
  const first = await until(() => request("example"), r => r.data.status === "ready");
  assert.equal(Date.parse(first.data.freshUntil) - clock, 300_000);
  clock += 300_001;
  partial = false;
  await request("example", "POST");
  const full = await until(() => request("example"), r => r.data.status === "ready");
  assert.equal(full.data.report.posts.length, 1);
  clock = Date.parse(full.data.freshUntil) + 1;
  partial = true;
  await request("example", "POST");
  const failed = await until(() => request("example"), r => r.data.status === "failed");
  assert.deepEqual(failed.data.report, full.data.report);
});

test("restart resumes an interrupted job and preserves both the report and global request allowance", async t => {
  const dir = await mkdtemp(join(tmpdir(), "onion-agent-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { databasePath: join(dir, "reports.sqlite"), env: { CREATOR_RESEARCH_DAILY_LIMIT: "1" } };
  const first = await service(t, { ...options, collect: (_handle, { signal }) => new Promise((_resolve, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })) });
  await first.request("example", "POST");
  await until(() => first.request("example"), r => r.data.stage === "collecting");
  first.app.close();
  const second = await service(t, options);
  const done = await until(() => second.request("example"), r => r.data.status === "ready");
  assert.equal(done.data.report.handle, "example");
  assert.equal((await second.request("another", "POST")).status, 429);
  second.app.close();
  const third = await service(t, options);
  assert.deepEqual((await third.request("example")).data.report, done.data.report);
});

test("a new account can yield source-linked product leads and a bounded official search", async () => {
  const data = sample("not_preseeded", "Feastables Milk Chocolate. UPC: 036000291452. UPC: 036000291453.");
  const candidates = findProductCandidates("not_preseeded", data);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].listings.length, 2);
  assert.equal(candidates[0].postUrl, data.posts[0].url);
  assert.deepEqual(findProductCandidates("other", data), []);
  assert.deepEqual(findProductCandidates("not_preseeded", sample("not_preseeded", "Drench it #ad")), []);
  const checks = await checkRecallSources("not_preseeded", data.posts, { candidates, fetchImpl: async url => {
    assert.equal(url.hostname, "api.fda.gov");
    const query = url.searchParams.get("search");
    assert.match(query, /recall_initiation_date:\[20251118 TO 20261117\]/);
    if (query.includes("code_info")) return Response.json({ error: { code: "NOT_FOUND", message: "No matches found!" } }, { status: 404 });
    return Response.json({ results: [{ recall_number: "EXAMPLE-1" }] });
  } });
  assert.deepEqual(checks.map(check => check.status), ["candidates", "no-match"]);
  assert.match(checks[0].detail, /EXAMPLE-1/);
  assert.equal((await checkRecallSources("not_preseeded", data.posts, { fetchImpl: async () => Response.json({}, { status: 404 }) }))[0].status, "unavailable");
  assert.deepEqual(await checkRecallSources("not_preseeded", [], { fetchImpl: () => assert.fail("No applicable U.S. food target") }), []);
});
