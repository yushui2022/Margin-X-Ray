import assert from "node:assert/strict";
import test from "node:test";
import { readCreatorLookup } from "../src/web/shopping-creator-live";

const headers = { "Content-Type": "application/x-ndjson; charset=utf-8" };

test("live stages arrive before the result, across line and multibyte character boundaries", async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const stages: string[] = [];
  let profileRead!: () => void;
  const firstStage = new Promise<void>(resolve => { profileRead = resolve; });
  const reading = readCreatorLookup(new Response(stream, { headers }), event => {
    stages.push(event.stage);
    if (event.stage === "profile") profileRead();
  });

  controller.enqueue(encoder.encode('{"type":"stage","sta'));
  controller.enqueue(encoder.encode('ge":"profile"}\r\n'));
  await firstStage;
  assert.deepEqual(stages, ["profile"]);
  const report = { handle: "example", name: "洋葱" };
  const remaining = [
    "", '{"type":"stage","stage":"posts"}', '{"type":"stage","stage":"decision","checkedPosts":5,"products":0}',
    JSON.stringify({ type: "result", report }),
  ].join("\n");
  for (const byte of encoder.encode(remaining)) controller.enqueue(Uint8Array.of(byte));
  controller.close();
  assert.deepEqual(await reading, { type: "result", report });
  assert.deepEqual(stages, ["profile", "posts", "decision"]);
});

test("cached JSON reports do not synthesize stages and HTTP errors preserve their code", async () => {
  const report = { handle: "example", score: null };
  const noStage = () => assert.fail("A JSON response cannot announce a live stage");
  assert.deepEqual(await readCreatorLookup(Response.json(report), noStage), { type:"result", report });
  assert.deepEqual(await readCreatorLookup(Response.json({ code: "not_found" }, { status:404 }), noStage), { type:"error", code:"not_found" });
});

test("an explicit stream error or a missing terminal event never completes a report", async () => {
  const stages: string[] = [];
  const onStage = (event: {stage: string}) => { stages.push(event.stage); };
  const incomplete = new Response('{"type":"stage","stage":"profile"}\n', { headers });
  assert.deepEqual(await readCreatorLookup(incomplete, onStage), { type:"error", code:"interrupted" });
  assert.deepEqual(stages, ["profile"]);
  const failed = new Response('{"type":"error","code":"inaccessible"}', { headers });
  assert.deepEqual(await readCreatorLookup(failed, onStage), { type:"error", code:"inaccessible" });
});
