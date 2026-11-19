import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { shoppingInput } from "../server/shopping-check.mjs";
import { createShoppingJobs } from "../server/shopping-jobs.mjs";

const profileUrl = handle => "https://www.tiktok.com/@" + handle;

function gate() {
  let resolve;
  const wait = new Promise((ok) => {
    resolve = ok;
  });
  return { wait, resolve };
}

async function start(t, options = {}) {
  const app = createShoppingJobs({
    databasePath: ":memory:",
    normalize: shoppingInput,
    run: async (input) => ({ input }),
    pollMs: 20,
    ...options,
  });
  const server = http.createServer(async (req, res) => {
    if (!(await app.handle(req, res))) res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    app.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = "http://127.0.0.1:" + server.address().port + "/api/shopping-jobs";
  async function request(url, options) {
    const res = await fetch(url, options);
    return { code: res.status, data: await res.json() };
  }
  return {
    app,
    post: (body, extra = {}) =>
      request(base, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", ...extra },
      }),
    read: (id) => request(base + "/" + id),
    raw: (path, options = {}) => request(base + path, options),
  };
}

async function until(fn, accept) {
  for (let i = 0; i < 200; i++) {
    const out = await fn();
    if (accept(out)) return out;
    await delay(10);
  }
  assert.fail("Shopping job did not reach the expected state");
}

async function fileDatabase(t) {
  const dir = await mkdtemp(join(tmpdir(), "onion-shopping-job-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, "jobs.sqlite");
}

test("concurrent normalized submits share a job; polling preserves input/stage without running more work", async (t) => {
  const ready = gate();
  let calls = 0;
  const s = await start(t, {
    run: async (input, { onStage }) => {
      calls++;
      onStage("comparison");
      await ready.wait;
      return { status: "priced", checks: [{ comparison: null }], source: input.url };
    },
  });
  assert.equal((await s.post({ url: "@sample" }, { origin: "https://outside.example" })).code, 403);
  assert.equal((await s.raw("")).code, 405);
  assert.equal((await s.read("missing")).code, 404);
  assert.equal((await s.post({ query: "a", url: profileUrl("sample") })).code, 400);
  assert.equal(calls, 0);
  const submits = await Promise.all([s.post({ url: "@Sample" }), s.post({ market: "US", url: "@sample" })]);
  assert.deepEqual(
    submits.map((r) => r.code),
    [202, 202],
  );
  const { id } = submits[0].data;
  assert.equal(id, submits[1].data.id);
  const live = await until(
    () => s.read(id),
    (r) => r.data.stage === "comparison",
  );
  assert.deepEqual(live.data.input, {
    kind: "profile",
    market: "US",
    url: "https://www.tiktok.com/@sample",
  });
  assert.equal(live.data.status, "running");
  assert.ok(!live.data.report);
  ready.resolve();
  const done = await until(
    () => s.read(id),
    (r) => r.data.status === "ready",
  );
  assert.equal(done.data.report.checks[0].comparison, null);
  assert.deepEqual((await s.post({ url: "@sample" })).data, done.data);
  for (let i = 0; i < 4; i++) assert.equal((await s.read(id)).data.id, id);
  assert.equal(calls, 1);
});

test("market, source and selected variant each take their own durable request ID", async (t) => {
  const s = await start(t);
  const productId = "1730000000000000111";
  const first = { url: "https://www.tiktok.com/shop/pdp/" + productId, market: "US" };
  const blue = { ...first, selection: { productId, skuId: "1730000000000000221" } };
  const red = { ...first, selection: { productId, skuId: "1730000000000000222" } };
  const results = await Promise.all([first, blue, red, { ...blue, market: "GB" }].map((input) => s.post(input)));
  assert.equal(new Set(results.map((r) => r.data.id)).size, 4);
  const duplicate = await s.post({ selection: { skuId: blue.selection.skuId, productId }, url: first.url });
  assert.equal(duplicate.data.id, results[1].data.id);
  assert.deepEqual(duplicate.data.input.selection, blue.selection);
});

test("retries mint a new ID while stale/failed GET requests stay read-only", async (t) => {
  let time = 1000,
    count = 0;
  const s = await start(t, {
    now: () => time,
    cacheMs: 100,
    cooldownMs: 15,
    retentionMs: 1000,
    run: async () => {
      count++;
      if (count === 1) throw Error("private upstream secret");
      return { status: "priced", commerce: [{ detailStatus: count === 2 ? "unavailable" : "read" }], sequence: count };
    },
  });
  const input = { url: profileUrl("desk_lights") };
  const id = (await s.post(input)).data.id;
  const failed = await until(
    () => s.read(id),
    (r) => r.data.status === "failed",
  );
  assert.doesNotMatch(failed.data.error, /private upstream/);
  assert.equal(failed.data.retryAfterMs, 15);
  assert.equal(failed.data.retryable, true);
  assert.equal((await s.post(input)).data.id, id);
  time += 16;
  const next = (await s.post(input)).data.id;
  assert.notEqual(next, id);
  await until(
    () => s.read(next),
    (r) => r.data.status === "ready",
  );
  assert.equal((await s.read(id)).data.status, "failed");
  assert.equal((await s.read(next)).data.retryAfterMs, 15);
  time += 16;
  const third = (await s.post(input)).data.id;
  assert.notEqual(next, third);
  await until(
    () => s.read(third),
    (r) => r.data.status === "ready",
  );
  time += 101;
  for (const key of [id, next, third]) await s.read(key);
  assert.equal((await s.read(next)).data.report.sequence, 2);
  assert.equal(count, 3);
  time += 1000;
  assert.equal((await s.read(next)).code, 404);
});

test("an incomplete seller follow-up can retry after cooldown while a completed search keeps its cache", async t => {
  let now = 1000;
  const outcomes = ["time_limit", "unavailable", "no_more_shops"];
  const s = await start(t, { now: () => now, cacheMs: 100, cooldownMs: 15,
    run: async () => ({ status:"priced", checks:[{status:"insufficient", followUp:{status:outcomes.shift()}}] }) });
  const input = {url: profileUrl("desk_lights")};
  const ids = new Set();
  for (const partial of [true,true,false]) {
    const {id} = (await s.post(input)).data;
    ids.add(id);
    const {data} = await until(() => s.read(id), r => r.data.status === "ready");
    assert.equal(data.retryAfterMs, partial ? 15 : undefined);
    now += 16;
    if (!partial) assert.equal((await s.post(input)).data.id, id);
  }
  assert.equal(ids.size, 3);
});

test("queue admission, concurrency and limits persist across restarts without charging repeat reads", async (t) => {
  const databasePath = await fileDatabase(t);
  const opts = { databasePath, concurrency: 1, dailyLimit: 2, clientLimit: 2, queueLimit: 2 };
  const s = await start(t, {
    ...opts,
    run: async (_input, { signal, onStage }) => {
      onStage("retailers");
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      );
    },
  });
  const a = (await s.post({ url: "@one" })).data.id;
  await until(
    () => s.read(a),
    (r) => r.data.stage === "retailers",
  );
  const b = (await s.post({ url: "@two" })).data.id;
  assert.equal((await s.read(b)).data.status, "queued");
  assert.equal((await s.post({ url: "@three" })).code, 429);
  s.app.close();
  let active = 0,
    peak = 0;
  const restarted = await start(t, {
    ...opts,
    run: async (input) => {
      active++;
      peak = Math.max(peak, active);
      await delay(25);
      active--;
      return { source: input.url };
    },
  });
  await Promise.all(
    [a, b].map((id) =>
      until(
        () => restarted.read(id),
        (r) => r.data.status === "ready",
      ),
    ),
  );
  assert.equal(peak, 1);
  assert.equal((await restarted.read(a)).data.report.source, profileUrl("one"));
  assert.equal((await restarted.post({ url: "@one" })).data.id, a);
  assert.equal((await restarted.post({ url: "@new" })).code, 429);
  restarted.app.close();
  const persisted = await start(t, {
    ...opts,
    run: async () => assert.fail("Reading a persisted report started work"),
  });
  assert.equal((await persisted.read(b)).data.report.source, profileUrl("two"));
});

test("a new local worker recovers a hard-crashed process immediately and keeps its job ID", async (t) => {
  const databasePath = await fileDatabase(t);
  const script = `
    import http from "node:http";
    import { createShoppingJobs } from ${JSON.stringify(new URL("../server/shopping-jobs.mjs", import.meta.url).href)};
    const jobs=createShoppingJobs({databasePath:process.argv[1],normalize:x=>x,run:async (_input,{onStage})=>{
      onStage("retailers"); return new Promise(()=>{});
    }});
    const server=http.createServer((req,res)=>void jobs.handle(req,res));
    server.listen(0,"127.0.0.1",()=>console.log(server.address().port));
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, databasePath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });
  const [line] = await once(child.stdout, "data");
  const base = "http://127.0.0.1:" + Number(String(line).trim()) + "/api/shopping-jobs";
  const job = await (
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: profileUrl("recover"), kind: "profile", market: "US" }),
    })
  ).json();
  await until(
    async () => (await fetch(base + "/" + job.id)).json(),
    (r) => r.stage === "retailers",
  );
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  const s = await start(t, { databasePath, run: async (input) => ({ recovered: input.url }) });
  const found = await until(
    () => s.read(job.id),
    (r) => r.data.status === "ready",
  );
  assert.equal(found.data.report.recovered, profileUrl("recover"));
});

test("independent workers honor the same SQLite claims and fencing; timeout frees the local queue", async (t) => {
  const databasePath = await fileDatabase(t),
    ready = gate();
  let active = 0,
    peak = 0;
  const runner = async (input, { onStage }) => {
    active++;
    peak = Math.max(active, peak);
    onStage("comparison");
    try {
      await ready.wait;
      return { source: input.url };
    } finally {
      active--;
    }
  };
  const options = { databasePath, concurrency: 1, run: runner };
  const a = await start(t, options),
    b = await start(t, options);
  const inputs = [{ url: "@x" }, { url: "@y" }];
  const ids = await Promise.all([a.post(inputs[0]), b.post(inputs[0])]);
  assert.equal(ids[0].data.id, ids[1].data.id);
  await until(
    () => a.read(ids[0].data.id),
    (r) => r.data.status === "running",
  );
  ids.push(await b.post(inputs[1]));
  assert.equal((await b.read(ids[2].data.id)).data.status, "queued");
  ready.resolve();
  await until(
    () => a.read(ids[2].data.id),
    (r) => r.data.status === "ready",
  );
  assert.equal(peak, 1);
  const late = gate();
  const timed = await start(t, {
    concurrency: 1,
    jobTimeoutMs: 25,
    run: async (input, { onStage }) => {
      if (input.url === profileUrl("slow")) {
        await late.wait;
        onStage("late");
      }
      return { source: input.url };
    },
  });
  const slow = (await timed.post({ url: "@slow" })).data.id;
  const fast = (await timed.post({ url: "@fast" })).data.id;
  await until(
    () => timed.read(slow),
    (r) => r.data.status === "failed",
  );
  const ok = await until(
    () => timed.read(fast),
    (r) => r.data.status === "ready",
  );
  assert.equal(ok.data.report.source, profileUrl("fast"));
  late.resolve();
  await delay(10);
  assert.equal((await timed.read(slow)).data.stage, "failed");
});
