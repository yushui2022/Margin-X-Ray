/**
 * JustOneAPI 1688 image-search client.
 *
 * Flow: convert-image (URL or JPEG base64 -> image reference) then
 * search-item-by-image (reference -> 1688 listings). Both calls are made from
 * the service worker so the token never reaches the page.
 */

import {
  justOneAPIErrorMessage,
  parseJustOneAPIResponse,
  type JustOneAPIResult,
} from "../shared/justoneapi";
import { isAbortError, linkAbort } from "./deadline";

const ORIGIN = "https://api.justoneapi.com";
const SEARCH_PATH = "/api/1688/search-item-by-image/v1";
const CONVERT_PATH = "/api/1688/convert-image/v1";
const PROBE_PATH = "/api/1688/search-factory/v1";
const JPEG_LIMIT_BYTES = 100_000;

export async function searchJustOneAPI(input: {
  token: string;
  imageUrl?: string;
  imageBase64?: string;
  isFactory?: boolean;
  verifiedSupplier?: boolean;
  signal?: AbortSignal;
}): Promise<JustOneAPIResult> {
  const token = input.token.trim();
  if (!token) throw new Error("No JustOneAPI token is saved.");

  const image = await imagePayload(input);
  if (!image) {
    throw new Error(
      "JustOneAPI needs a public image URL or a JPEG under 100 KB, and neither was available.",
    );
  }

  const reference = await convertImage(token, image, input.signal);
  const url = new URL(`${ORIGIN}${SEARCH_PATH}`);
  url.searchParams.set("token", token);
  url.searchParams.set("imgUrl", reference);
  url.searchParams.set("pageSize", "20");
  if (input.isFactory) url.searchParams.set("isFactory", "true");
  if (input.verifiedSupplier) url.searchParams.set("verifiedSupplier", "true");

  const payload = await request(token, url, { signal: input.signal, timeoutMs: 60_000 });
  return parseJustOneAPIResponse(payload);
}

/**
 * Token check without a billable search call: the factory-search endpoint
 * validates the token before parameters, so a 400 still proves the token works.
 */
export async function probeJustOneAPI(
  token: string,
): Promise<{ ok: boolean; message: string }> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, message: "Enter a JustOneAPI token first." };

  const url = new URL(`${ORIGIN}${PROBE_PATH}`);
  url.searchParams.set("token", trimmed);
  const deadline = linkAbort(undefined, 20_000);
  try {
    const response = await fetch(url, {
      signal: deadline.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error("JustOneAPI returned a response that was not JSON.");
    }
    const root =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const code = typeof root.code === "number" ? root.code : undefined;
    const message = typeof root.message === "string" ? root.message : undefined;

    if (code === 400 || code === 0) {
      return {
        ok: true,
        message: "JustOneAPI accepted the token. No billable search was run.",
      };
    }
    return {
      ok: false,
      message: justOneAPIErrorMessage(code ?? -1, message),
    };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, message: "The JustOneAPI check timed out." };
    }
    return {
      ok: false,
      message: scrub(
        error instanceof Error ? error.message : "JustOneAPI could not be reached.",
        trimmed,
      ),
    };
  } finally {
    deadline.cancel();
  }
}

async function convertImage(
  token: string,
  image: { url?: string; base64?: string },
  signal?: AbortSignal,
): Promise<string> {
  const url = new URL(`${ORIGIN}${CONVERT_PATH}`);
  url.searchParams.set("token", token);
  const body = image.url
    ? { url: image.url, searchApiEndpoint: "standard" }
    : { imgBase64: image.base64, searchApiEndpoint: "standard" };

  const payload = await request(token, url, {
    method: "POST",
    json: body,
    signal,
    timeoutMs: 45_000,
  });
  const reference = imageReference(payload);
  if (!reference) {
    throw new Error("JustOneAPI did not return an image reference.");
  }
  return reference;
}

function imageReference(payload: unknown): string | null {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  if (!root) return null;
  if (typeof root.data === "string" && root.data.trim()) return root.data.trim();

  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : undefined;
  const keys = ["imgUrl", "imageUrl", "img", "image", "url", "imgId", "imageId", "id"];
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function request(
  token: string,
  url: URL,
  options: {
    method?: "GET" | "POST";
    json?: unknown;
    signal?: AbortSignal;
    timeoutMs: number;
  },
): Promise<unknown> {
  const deadline = linkAbort(options.signal, options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      ...(options.json !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.json),
          }
        : {}),
      signal: deadline.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.replace(/\s+/g, " ").trim().slice(0, 160);
      try {
        const parsed = JSON.parse(text) as { code?: number; message?: string };
        detail = justOneAPIErrorMessage(
          typeof parsed.code === "number" ? parsed.code : -1,
          parsed.message,
        );
      } catch {
        // Keep the trimmed body.
      }
      throw new Error(`JustOneAPI returned HTTP ${response.status}: ${detail}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("JustOneAPI returned a response that was not JSON.");
    }
  } catch (error) {
    if (isAbortError(error)) throw new DOMException("Aborted", "AbortError");
    throw new Error(
      scrub(
        error instanceof Error ? error.message : "JustOneAPI request failed.",
        token,
      ),
    );
  } finally {
    deadline.cancel();
  }
}

async function imagePayload(input: {
  imageUrl?: string;
  imageBase64?: string;
}): Promise<{ url?: string; base64?: string } | null> {
  if (input.imageUrl && /^https?:\/\//i.test(input.imageUrl)) {
    return { url: input.imageUrl };
  }
  if (!input.imageBase64) return null;
  const dataUrl = input.imageBase64.startsWith("data:image/")
    ? input.imageBase64
    : `data:image/jpeg;base64,${input.imageBase64}`;
  const base64 = await jpegBase64Under(dataUrl, JPEG_LIMIT_BYTES);
  return base64 ? { base64 } : null;
}

/**
 * JustOneAPI accepts JPEG base64 up to 100 KB. Browser frames are larger, so
 * downscale and re-encode in the service worker. Returns null when the runtime
 * cannot decode the image.
 */
export async function jpegBase64Under(
  dataUrl: string,
  maxBytes: number,
): Promise<string | null> {
  const match = dataUrl.match(
    /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i,
  );
  if (!match?.[1]) return null;
  const compact = match[1].replace(/\s+/g, "");
  const isJpeg = /^data:image\/(?:jpeg|jpg)/i.test(dataUrl);
  if (isJpeg && base64Bytes(compact) <= maxBytes) return compact;

  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return null;
  }

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
      for (const shrink of [1, 0.8, 0.65, 0.5, 0.4]) {
        const width = Math.max(1, Math.round(bitmap.width * scale * shrink));
        const height = Math.max(1, Math.round(bitmap.height * scale * shrink));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(bitmap, 0, 0, width, height);
        for (const quality of [0.82, 0.68, 0.55, 0.45]) {
          const out = await canvas.convertToBlob({ type: "image/jpeg", quality });
          if (out.size <= maxBytes) {
            return bytesToBase64(new Uint8Array(await out.arrayBuffer()));
          }
        }
      }
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
  return null;
}

function base64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function scrub(message: string, secret: string): string {
  return secret ? message.split(secret).join("…") : message;
}
