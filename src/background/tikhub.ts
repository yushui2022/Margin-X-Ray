import { awemeIdFromUrl, parseTikHubVideo } from "../shared/identity";
import type { PageContext, TikHubVideo } from "../shared/types";
import { isAbortError, linkAbort } from "./deadline";

const ORIGIN = "https://api.tikhub.io";
const cache = new Map<string, { at: number; video: TikHubVideo }>();
const CACHE_MS = 10 * 60 * 1000;

export async function fetchTikHubVideo(
  token: string,
  context: PageContext,
  parent?: AbortSignal,
): Promise<TikHubVideo> {
  const id =
    awemeIdFromUrl(context.url) ??
    (context.identifiers?.videoId && /^\d{6,}$/.test(context.identifiers.videoId)
      ? context.identifiers.videoId
      : undefined);
  const douyin = /douyin\.com|iesdouyin\.com/i.test(context.url);
  const cacheKey = douyin ? context.url : id ?? context.url;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  if (!douyin && id) {
    try {
      const video = await getVideo(
        token,
        `/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${encodeURIComponent(id)}`,
        parent,
      );
      if (video) {
        writeCache(cacheKey, video);
        return video;
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }

  const video = await getVideo(
    token,
    `/api/v1/hybrid/video_data?url=${encodeURIComponent(context.url)}`,
    parent,
  );
  if (!video) throw new Error("TikHub returned no video for this link.");
  writeCache(cacheKey, video);
  return video;
}

export async function testTikHub(token: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, message: "Enter a TikHub token first." };
  const deadline = linkAbort(undefined, 12_000);
  try {
    const payload = await tikhubGet(
      trimmed,
      "/api/v1/tikhub/user/get_user_info",
      deadline.signal,
    );
    const root = asRecord(payload);
    const user = asRecord(root?.user_data);
    const balance = user?.balance;
    const credit = user?.free_credit;
    const balanceText =
      typeof balance === "number" ? ` Balance ${balance}.` : "";
    const creditText =
      typeof credit === "number" ? ` Free credit ${credit}.` : "";
    return {
      ok: true,
      message: `TikHub connected.${balanceText}${creditText}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "TikHub could not be reached.",
    };
  } finally {
    deadline.cancel();
  }
}

async function getVideo(
  token: string,
  path: string,
  parent?: AbortSignal,
): Promise<TikHubVideo | null> {
  const payload = await tikhubGet(token, path, parent);
  const root = asRecord(payload);
  const code = root?.code;
  if (typeof code === "number" && code !== 200) {
    const message =
      stringField(root?.message_zh) ??
      stringField(root?.message) ??
      `TikHub returned code ${code}.`;
    throw new Error(message);
  }
  return parseTikHubVideo(payload);
}

async function tikhubGet(
  token: string,
  path: string,
  parent?: AbortSignal,
): Promise<unknown> {
  const deadline = linkAbort(parent, 20_000);
  try {
    const response = await fetch(`${ORIGIN}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: deadline.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(httpError(response.status, text, token));
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("TikHub returned a response that was not JSON.");
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new DOMException("Aborted", "AbortError");
    }
    throw error;
  } finally {
    deadline.cancel();
  }
}

function httpError(status: number, body: string, secret: string): string {
  if (status === 401 || status === 403) return "TikHub rejected the token.";
  const cleaned = secret ? body.split(secret).join("…") : body;
  const compact = cleaned.replace(/\s+/g, " ").trim().slice(0, 180);
  return `TikHub returned HTTP ${status}${compact ? `: ${compact}` : ""}.`;
}

function readCache(key: string): TikHubVideo | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return hit.video;
}

function writeCache(key: string, video: TikHubVideo): void {
  cache.set(key, { at: Date.now(), video });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}
