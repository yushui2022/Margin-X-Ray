import { isAbortError, linkAbort } from "./deadline";
import {
  mergeOfferDetail,
  parseOneBoundItem,
  parseOneBoundSearch,
} from "../shared/supply";
import type { SupplyOffer } from "../shared/types";

const ENDPOINT = "https://api-gw.onebound.cn/1688";

export async function searchOneBound(input: {
  key: string;
  secret: string;
  imageUrl?: string;
  imageBase64?: string;
  detailLimit?: number;
  signal?: AbortSignal;
}): Promise<{ scanned: number; offers: SupplyOffer[] }> {
  const imgid = input.imageUrl ?? input.imageBase64;
  if (!imgid) throw new Error("No image was available for OneBound image search.");
  const searched = parseOneBoundSearch(
    await oneBoundCall("item_search_img", { imgid }, input),
  );
  const detailLimit = Math.max(0, input.detailLimit ?? 0);
  if (detailLimit === 0) return searched;
  const top = [...searched.offers].sort(
    (a, b) => lowestCny(a) - lowestCny(b),
  );
  const detailed: SupplyOffer[] = [];
  for (const offer of top.slice(0, detailLimit)) {
    const numIid = offer.id.replace(/^onebound:/, "");
    if (!/^\d+$/.test(numIid)) {
      detailed.push(offer);
      continue;
    }
    try {
      const detail = parseOneBoundItem(
        await oneBoundCall("item_get", { num_iid: numIid }, input),
      );
      detailed.push(mergeOfferDetail(offer, detail));
    } catch (error) {
      if (isAbortError(error)) throw error;
      detailed.push(offer);
    }
  }
  const detailedIds = new Set(detailed.map((offer) => offer.id));
  const rest = top.slice(detailLimit).filter((offer) => !detailedIds.has(offer.id));
  return { scanned: searched.scanned, offers: [...detailed, ...rest] };
}

function lowestCny(offer: SupplyOffer): number {
  return Math.min(...offer.tiers.map((tier) => tier.unitCny));
}

async function oneBoundCall(
  api: "item_search_img" | "item_get",
  params: Record<string, string>,
  input: { key: string; secret: string; signal?: AbortSignal },
): Promise<unknown> {
  const deadline = linkAbort(input.signal, 25_000);
  const body = new URLSearchParams({
    key: input.key,
    secret: input.secret,
    cache: "no",
    result_type: "json",
    lang: "cn",
    ...params,
  });
  try {
    const response = await fetch(`${ENDPOINT}/${api}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: deadline.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OneBound returned HTTP ${response.status}.`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("OneBound returned a response that was not JSON.");
    }
  } catch (error) {
    if (isAbortError(error)) throw new DOMException("Aborted", "AbortError");
    const message = error instanceof Error ? error.message : "OneBound request failed.";
    throw new Error(message.split(input.secret).join("…").split(input.key).join("…"));
  } finally {
    deadline.cancel();
  }
}
