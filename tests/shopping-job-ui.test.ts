import assert from "node:assert/strict";
import test from "node:test";
import { followJob, tikTokCheckRoute, withJob } from "../src/web/shopping-job";

const creator = "https://www.tiktok.com/@example";
const id = "550e8400-e29b-41d4-a716-446655440000";

test("live shopping inputs require TikTok sources and accept bare handles in creator mode", () => {
  const profile = tikTokCheckRoute("@example");
  assert.equal(tikTokCheckRoute("example", true), profile);
  assert.equal(tikTokCheckRoute(creator, true), profile);
  assert.match(tikTokCheckRoute("https://vm.tiktok.com/ZExample/")!, /^#shop\/video\?/);
  assert.match(tikTokCheckRoute("https://shop.tiktok.com/us/pdp/1234567890")!, /^#shop\/site\?/);
  assert.equal(tikTokCheckRoute("https://amazon.com/dp/B012345678"), null);
  assert.equal(tikTokCheckRoute("generic milk frother"), null);
  assert.equal(tikTokCheckRoute("https://www.tiktok.com/@example/video/1234567890", true), null);
  const inUK = withJob(profile!, "GB", id);
  assert.equal(new URLSearchParams(inUK.split("?")[1]).get("job"), id);
  assert.equal(withJob(inUK, "US"), profile);
});

test("opening a saved report only reads its job and restores its selected SKU", async t => {
  const selection = { productId: "item", skuId: "blue" };
  const input = { url: creator, market: "US", selection };
  const mock = t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    assert.equal(path, "/api/shopping-jobs/" + id);
    assert.equal(init.method || "GET", "GET");
    assert.equal(init.body, undefined);
    return Response.json({id, status: "ready", input, report: {status: "priced"}});
  });
  const job = await followJob(input, id, new AbortController().signal, () => {}, () => {});
  assert.equal(mock.mock.callCount(), 1);
  assert.deepEqual(job.input?.selection, selection);
});

test("a new job is submitted once and all progress reads use its saved id", async t => {
  const calls: string[] = [];
  const input = {url:creator,market:"US"};
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    calls.push((init.method || "GET") + " " + path);
    if (calls.length === 1) {
      assert.deepEqual(JSON.parse(String(init.body)),input);
      return Response.json({id, status:"queued", input});
    }
    return Response.json({id, status:"failed", input, error:"Unavailable", retryable:true});
  });
  const states: string[] = [];
  const job = await followJob(input, undefined, new AbortController().signal, row => states.push(row.status), () => {});
  assert.equal(job.status, "failed");
  assert.deepEqual(states, ["queued", "failed"]);
  assert.deepEqual(calls, ["POST /api/shopping-jobs", "GET /api/shopping-jobs/" + id]);
});
