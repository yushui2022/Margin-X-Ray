export interface SseEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  let id: string | undefined;
  let retry: number | undefined;
  const data: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") {
      event = value || "message";
    } else if (field === "data") {
      data.push(value);
    } else if (field === "id") {
      id = value;
    } else if (field === "retry") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) retry = parsed;
    }
  }

  if (!data.length) return null;
  return {
    event,
    data: data.join("\n"),
    ...(id !== undefined ? { id } : {}),
    ...(retry !== undefined ? { retry } : {}),
  };
}

/**
 * Consumes an SSE stream without assuming that TCP chunks align with events.
 * A naive `chunk.split("\n")` loses partial JSON lines; this buffers instead.
 */
export async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseBlock(block);
        if (event) await onEvent(event);
        boundary = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (buffer.trim()) {
      const event = parseSseBlock(buffer);
      if (event) await onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}
