import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as flush } from "node:timers/promises";
import { loadCreatorSuggestions } from "../src/web/shopping-creator-lookup";

function observe(term: string, delayMs = 0) {
  const controller = new AbortController();
  const frames: { handles: string[]; state: string }[] = [];
  loadCreatorSuggestions(term, controller.signal, delayMs, (accounts, state) => {
    frames.push({handles: accounts.map(account => account.handle), state});
  });
  return { frames, controller };
}

function accounts(...handles: string[]) {
  return Response.json({creators: handles.map(handle => ({handle, name: handle, avatar: null}))});
}

test("late prefix results help the active query and its exact response takes precedence", async t => {
  const pending = new Map<string, (response: Response) => void>();
  const fetcher = t.mock.method(globalThis, "fetch", (url: string) =>
    new Promise<Response>(resolve => pending.set(new URL(url).searchParams.get("q")!, resolve)));
  const prefix = observe("looks");
  prefix.controller.abort();
  const current = observe("looksby");
  const submitted = observe("looksby");
  assert.equal(fetcher.mock.callCount(), 2);
  pending.get("looks")!(accounts("looksbybeth", "looks_by_jamie", "looks_other"));
  await flush();
  const preview = {state:"loading", handles:["looksbybeth", "looks_by_jamie"]};
  assert.deepEqual(current.frames.at(-1), preview);
  assert.deepEqual(submitted.frames.at(-1), preview);
  assert.equal(prefix.frames.length, 1);

  // A broader query may still be in flight when the exact one completes.
  observe("loo");
  pending.get("looksby")!(accounts());
  await flush();
  const framesAfterFinal = current.frames.length;
  pending.get("loo")!(accounts("looksbyanother"));
  await flush();
  assert.equal(current.frames.length, framesAfterFinal);
  assert.deepEqual(current.frames.at(-1), {state:"complete", handles:[]});
  assert.deepEqual(observe("looksby", 250).frames, [{state:"complete", handles:[]}]);
  assert.deepEqual(observe("looks", 250).frames[0], {state:"complete", handles:["looksbybeth", "looks_by_jamie", "looks_other"]});
  assert.equal(fetcher.mock.callCount(), 3);

  const narrower = observe("looksbybeth", 250);
  assert.deepEqual(narrower.frames[0], {state:"loading", handles:["looksbybeth"]});
  narrower.controller.abort();
});

test("failed searches can retry, expired searches fetch again and history stays bounded", async t => {
  let time = Date.now();
  t.mock.method(Date, "now", () => time);
  let ok = false;
  const fetcher = t.mock.method(globalThis, "fetch", async () =>
    ok ? accounts("example_account") : new Response("", {status:503}));
  const first = observe("retry this");
  await flush();
  assert.equal(first.frames.at(-1)?.state, "unavailable");
  ok = true;
  const retry = observe("retry this");
  await flush();
  assert.equal(retry.frames.at(-1)?.state, "complete");
  time += 5 * 60_000 + 1;
  const expired = observe("retry this");
  assert.deepEqual(expired.frames, [{state:"loading", handles:[]}]);
  await flush();
  assert.equal(fetcher.mock.callCount(), 3);
  for (let i = 0; i < 32; i++) {
    observe("bounded " + i);
    await flush();
  }
  assert.equal(observe("retry this").frames[0].state, "loading");
  await flush();
  assert.equal(fetcher.mock.callCount(), 36);
});
