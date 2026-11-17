import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCreatorFeedback } from "../server/creator-feedback.mjs";

async function start(databasePath, version = "test-v1") {
  const feedback = createCreatorFeedback({ databasePath, handles: new Set(["alice", "bob"]), version });
  const server = http.createServer((req, res) => { void feedback.handle(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    async request({ cookie, vote, handle = "alice", queryVersion = version, ...options } = {}) {
      const response = await fetch(`${base}/api/creator-feedback?handle=${handle}&version=${queryVersion}`, {
        method: vote === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
        ...(vote === undefined ? {} : { body: JSON.stringify({ vote }) }), ...options,
      });
      return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0], data: await response.json() };
    },
    close: async () => { await new Promise(resolve => server.close(resolve)); feedback.close(); },
  };
}

test("shared feedback persists, deduplicates retries, switches, withdraws and isolates creator/version", async () => {
  const dir = await mkdtemp(join(tmpdir(), "onion-votes-"));
  const databasePath = join(dir, "votes.sqlite");
  let app = await start(databasePath);
  try {
    const first = await app.request();
    assert.deepEqual(first.data, { handle: "alice", version: "test-v1", up: 0, down: 0, yourVote: null });
    const cookie = first.cookie;
    const otherCookie = (await app.request()).cookie;
    assert.notEqual(cookie, otherCookie);
    await Promise.all(Array.from({ length: 8 }, () => app.request({ cookie, vote: "up" })));
    assert.deepEqual((await app.request({ cookie })).data, { handle: "alice", version: "test-v1", up: 1, down: 0, yourVote: "up" });
    await app.request({ cookie: otherCookie, vote: "down" });
    assert.equal((await app.request({ cookie })).data.down, 1);
    const switched = await app.request({ cookie, vote: "down" });
    assert.equal(switched.data.up, 0);
    assert.equal(switched.data.down, 2);
    const withdrawn = await app.request({ cookie, vote: null });
    assert.equal(withdrawn.data.down, 1);
    assert.equal(withdrawn.data.yourVote, null);
    assert.equal((await app.request({ handle: "bob", cookie: otherCookie })).data.down, 0);
    await app.close(); app = await start(databasePath);
    assert.equal((await app.request({ cookie: otherCookie })).data.yourVote, "down");
    await app.close(); app = await start(databasePath, "test-v2");
    assert.equal((await app.request({ cookie: otherCookie })).data.down, 0);
    assert.equal((await app.request({ queryVersion: "test-v1" })).status, 409);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("feedback rejects unknown creators, invalid choices, cross-origin writes and oversized bodies", async () => {
  const app = await start(":memory:");
  try {
    const cookie = (await app.request()).cookie;
    assert.equal((await app.request({ handle: "unknown", cookie, vote: "up" })).status, 404);
    assert.equal((await app.request({ cookie, vote: "invalid" })).status, 400);
    assert.equal((await app.request({ vote: "up" })).status, 409);
    assert.equal((await app.request({ cookie, vote: "up", headers: { Origin: "https://other.example", Cookie: cookie } })).status, 403);
    assert.equal((await app.request({ cookie, vote: "up", body: "{" })).status, 400);
    assert.equal((await app.request({ cookie, vote: "up", body: "x".repeat(5000) })).status, 413);
    assert.equal((await app.request({ cookie })).data.up, 0);
  } finally { await app.close(); }
});
