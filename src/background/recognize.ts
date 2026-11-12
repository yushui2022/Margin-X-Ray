import { parseBaiduProduct } from "../shared/identity";
import type { ProductRecognition, RecognitionImageSource } from "../shared/types";
import { isAbortError, linkAbort } from "./deadline";

const TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token";
const PRODUCT_URL = "https://aip.baidubce.com/rest/2.0/image-classify/v1/product";

let cachedToken: { key: string; token: string; expiresAt: number } | null = null;

export async function recognizeProduct(input: {
  apiKey: string;
  secretKey: string;
  imageBase64?: string;
  imageUrl?: string;
  imageSource: RecognitionImageSource;
  frameTimeSec?: number;
  signal?: AbortSignal;
}): Promise<ProductRecognition> {
  const parsed = await callProduct(input, false);
  return {
    provider: "baidu-product",
    name: parsed.name,
    score: parsed.score,
    imageSource: input.imageSource,
    ...(input.frameTimeSec !== undefined ? { frameTimeSec: input.frameTimeSec } : {}),
  };
}

export async function testRecognizer(
  apiKey: string,
  secretKey: string,
): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim() || !secretKey.trim()) {
    return { ok: false, message: "Enter the Baidu API key and secret key first." };
  }
  try {
    await fetchToken(apiKey.trim(), secretKey.trim(), undefined, true);
    return { ok: true, message: "Baidu product recognition accepted the keys." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Baidu could not be reached.",
    };
  }
}

async function callProduct(
  input: {
    apiKey: string;
    secretKey: string;
    imageBase64?: string;
    imageUrl?: string;
    signal?: AbortSignal;
  },
  retried: boolean,
): Promise<{ name: string; score: number }> {
  const token = await fetchToken(input.apiKey, input.secretKey, input.signal, false);
  const body = new URLSearchParams();
  if (input.imageBase64) body.set("image", input.imageBase64);
  else if (input.imageUrl) body.set("url", input.imageUrl);
  else throw new Error("No image was available for product recognition.");
  body.set("top_num", "5");

  const deadline = linkAbort(input.signal, 20_000);
  try {
    const response = await fetch(`${PRODUCT_URL}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: deadline.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Baidu returned HTTP ${response.status}.`);
    }
    const payload = JSON.parse(text) as unknown;
    const parsed = parseBaiduProduct(payload);
    if ("error" in parsed) {
      const root = payload && typeof payload === "object" ? (payload as { error_code?: number }) : {};
      if (!retried && (root.error_code === 110 || root.error_code === 111)) {
        cachedToken = null;
        return callProduct(input, true);
      }
      throw new Error(parsed.error);
    }
    return parsed;
  } catch (error) {
    if (isAbortError(error)) throw new DOMException("Aborted", "AbortError");
    if (error instanceof SyntaxError) {
      throw new Error("Baidu returned a response that was not JSON.");
    }
    throw scrub(error, [input.apiKey, input.secretKey, token]);
  } finally {
    deadline.cancel();
  }
}

async function fetchToken(
  apiKey: string,
  secretKey: string,
  parent: AbortSignal | undefined,
  force: boolean,
): Promise<string> {
  if (
    !force &&
    cachedToken &&
    cachedToken.key === apiKey &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.token;
  }
  const url = new URL(TOKEN_URL);
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("client_secret", secretKey);
  const deadline = linkAbort(parent, 12_000);
  try {
    const response = await fetch(url, { signal: deadline.signal, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Baidu token request returned HTTP ${response.status}.`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error("Baidu token response was not JSON.");
    }
    const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    if (typeof root.error === "string" || typeof root.error_description === "string") {
      const message =
        typeof root.error_description === "string"
          ? root.error_description
          : "Baidu rejected the API key.";
      throw new Error(message);
    }
    const token = typeof root.access_token === "string" ? root.access_token : "";
    const expiresIn = typeof root.expires_in === "number" ? root.expires_in : 0;
    if (!token || expiresIn <= 0) {
      throw new Error("Baidu did not return an access token.");
    }
    cachedToken = {
      key: apiKey,
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return token;
  } catch (error) {
    if (isAbortError(error)) throw new DOMException("Aborted", "AbortError");
    throw scrub(error, [apiKey, secretKey]);
  } finally {
    deadline.cancel();
  }
}

function scrub(error: unknown, secrets: string[]): Error {
  const message = error instanceof Error ? error.message : "Baidu request failed.";
  const cleaned = secrets.reduce(
    (text, secret) => (secret ? text.split(secret).join("…") : text),
    message,
  );
  return new Error(cleaned);
}

export function imageBase64(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match?.[1]) return null;
  const compact = match[1].replace(/\s+/g, "");
  if (compact.length < 32 || compact.length > 1_800_000) return null;
  return compact;
}
