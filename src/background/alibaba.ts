import { isAbortError, linkAbort } from "./deadline";
import { parseAlibabaImageSearch } from "../shared/supply";
import type { SupplyOffer } from "../shared/types";

const API = "com.alibaba.linkplus/alibaba.cross.similar.offer.search";

export async function searchAlibabaOpen(input: {
  appKey: string;
  appSecret: string;
  accessToken: string;
  imageUrl: string;
  signal?: AbortSignal;
}): Promise<{ scanned: number; offers: SupplyOffer[] }> {
  const urlPath = `param2/1/${API}/${input.appKey}`;
  const params: Record<string, string> = {
    access_token: input.accessToken,
    picUrl: input.imageUrl,
    page: "1",
  };
  params._aop_signature = await signAop(urlPath, params, input.appSecret);
  const url = new URL(`https://gw.open.1688.com/openapi/${urlPath}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const deadline = linkAbort(input.signal, 25_000);
  try {
    const response = await fetch(url, { signal: deadline.signal, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`1688 open platform returned HTTP ${response.status}.`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error("1688 open platform returned a response that was not JSON.");
    }
    return parseAlibabaImageSearch(payload);
  } catch (error) {
    if (isAbortError(error)) throw new DOMException("Aborted", "AbortError");
    const message = error instanceof Error ? error.message : "1688 image search failed.";
    throw new Error(
      message
        .split(input.appSecret)
        .join("…")
        .split(input.accessToken)
        .join("…"),
    );
  } finally {
    deadline.cancel();
  }
}

async function signAop(
  urlPath: string,
  params: Record<string, string>,
  secret: string,
): Promise<string> {
  const base =
    urlPath +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base));
  return [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
