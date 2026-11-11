import test from "node:test";
import assert from "node:assert/strict";
import { consumeSse, parseSseBlock } from "../src/shared/sse";

const encoder = new TextEncoder();

test("parseSseBlock parses event and data fields", () => {
  const event = parseSseBlock('event: progress\ndata: {"percent":20}');
  assert.deepEqual(event, {
    event: "progress",
    data: '{"percent":20}',
  });
});

test("parseSseBlock joins multiple data lines and ignores comments", () => {
  const event = parseSseBlock(": keepalive\nevent: message\ndata: hello\ndata: world");
  assert.equal(event?.event, "message");
  assert.equal(event?.data, "hello\nworld");
});

test("consumeSse buffers events split across TCP-like chunks", async () => {
  const chunks = [
    'event: progress\ndata: {"scanId":"s1","per',
    'cent":20}\n\n',
    'event: complete\ndata: {"scanId":"s1"}\n\n',
  ];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  const events: string[] = [];
  await consumeSse(stream, (event) => {
    events.push(`${event.event}:${event.data}`);
  });

  assert.deepEqual(events, [
    'progress:{"scanId":"s1","percent":20}',
    'complete:{"scanId":"s1"}',
  ]);
});

test("consumeSse handles CRLF frames and a final unsplit frame", async () => {
  const payload =
    'event: progress\r\ndata: {"percent":50}\r\n\r\n' +
    'event: complete\r\ndata: {"ok":true}';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });

  const events: string[] = [];
  await consumeSse(stream, (event) => {
    events.push(event.event);
  });

  assert.deepEqual(events, ["progress", "complete"]);
});
