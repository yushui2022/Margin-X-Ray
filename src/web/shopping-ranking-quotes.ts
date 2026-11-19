import { SHOP_ONION_VERSION, shopOnionVerdict, type ShopOnionVersion } from "../shared/shop-onion.mjs";
import type { Check, Product } from "./shopping-live";

export interface RankingObservation {
  product: Product;
  checks: Omit<Check, "followUp">[];
  sourceUrl: string;
  observedAt: string;
}

export interface RankingReceiptObservation extends RankingObservation {
  receiptVersion: ShopOnionVersion;
}

type Offer = Check["offers"][number];
interface Quote {
  offer: Offer;
  observedAt: string;
  eligible: boolean;
}
interface CandidateLink {url:string; label:string; reason?:string}
export interface CandidateNote extends CandidateLink {productId:string; skuId:string; observedAt:string}
interface Group {
  quotes: Map<string, Quote>;
  candidates: Map<string, CandidateLink>;
  calibrated: boolean;
}
export interface RankingBaseline {
  productId: string;
  skuId: string;
  currency: string;
  basis: "exact" | "similar";
  calibrated: boolean;
  sourcePrice: number;
  peerPrice: number;
  observedAt: string;
  shops: {seller:string; url:string; price:number; observedAt:string; title:string; variant?:string | null}[];
  candidates: CandidateLink[];
}

function groupKey(observation: RankingObservation, check: RankingObservation["checks"][number]) {
  const {product,observedAt} = observation;
  const v = product.variants[check.variantIndex];
  if (!v?.skuId || !v.currency || !product.sellerId || (product.market && product.market !== "US")) return null;
  return JSON.stringify([observedAt.slice(0,10),product.sellerId,product.productId,v.skuId,v.currency]);
}

function listingId(url: string) {
  return /^https:\/\/(?:shop\.|www\.)tiktok\.com\/(?:shop\/)?us\/pdp\/(\d{8,24})(?:\?|$)/.exec(url)?.[1];
}

// The latest direct observation of each seller SKU wins, including an explicit
// loss of availability. The scoring rubric subsequently takes one price per shop.
export function collectRankingQuotes(observations: RankingObservation[], notes: CandidateNote[] = [], calibrations: RankingObservation[] = []) {
  const groups = new Map<string, Group>();
  const fixedKeys = new Set(calibrations.flatMap(o => o.checks.map(c => groupKey(o,c))));
  const panels = new Set(calibrations);
  for (const observation of [...observations,...calibrations]) {
    for (const check of observation.checks) {
      const key = groupKey(observation,check);
      if (!key) continue;
      const group = groups.get(key) ?? {quotes:new Map<string, Quote>(), candidates:new Map<string, CandidateLink>(),calibrated:fixedKeys.has(key)};
      groups.set(key,group);
      const verdict = shopOnionVerdict({scope:"tiktok-shop",market:"US",commerce:[observation.product],
        checks:[{...check,productIndex:0}]},{version:SHOP_ONION_VERSION});
      const admitted = new Set(verdict.items.flatMap(i => i.peers.map(p => p.url)));
      for (const link of check.sources ?? []) {
        const id = listingId(link.url);
        if (id && id !== observation.product.productId && !group.candidates.get(id)?.reason) group.candidates.set(id,link);
      }
      for (const offer of check.offers ?? []) {
        const id = listingId(offer.url);
        if (!id || !offer.sellerId || !offer.skuId || id === observation.product.productId ||
          offer.sellerId === observation.product.sellerId) continue;
        const time = new Date(offer.observedAt || observation.observedAt);
        if (!Number.isFinite(time.valueOf())) continue;
        const at = time.toISOString();
        if (at.slice(0,10) !== observation.observedAt.slice(0,10)) continue;
        if (new URL(offer.url).searchParams.get("sku_id") !== offer.skuId) continue;
        if (offer.weightConflict) {
          group.candidates.set(id,{url:offer.url,label:offer.seller || offer.name,reason:offer.weightConflict});
        }
        // More creators can join a frozen edition without repricing its common
        // reference stores. Only a new calibration can replace a panel quote.
        if (group.calibrated && !panels.has(observation)) continue;
        const slot = JSON.stringify([id,offer.skuId]), prev = group.quotes.get(slot);
        const eligible = admitted.has(offer.url) && offer.available === true;
        // A candidate omitted from a receipt's cheapest-per-shop shortlist is
        // not evidence of a withdrawal. Explicit stock/terms can retire a quote.
        if (!eligible && offer.available === true && !offer.weightConflict) continue;
        if (!prev || at > prev.observedAt || (at === prev.observedAt &&
          (Number(eligible) < Number(prev.eligible) || (eligible === prev.eligible && (offer.price ?? 0) > (prev.offer.price ?? 0)))))
          group.quotes.set(slot,{offer,observedAt:at,eligible});
      }
      // Additional checked listings are leads only; they never enter the price pool.
      for (const note of notes) {
        const id = listingId(note.url);
        if (id && id !== observation.product.productId && note.productId === observation.product.productId &&
          note.skuId === observation.product.variants[check.variantIndex]?.skuId &&
          note.observedAt.slice(0,10) === observation.observedAt.slice(0,10))
          group.candidates.set(id,{url:note.url,label:note.label,reason:note.reason});
      }
    }
  }
  return groups;
}

export function rankWithQuotes(observations: RankingReceiptObservation[], groups: ReturnType<typeof collectRankingQuotes>) {
  const commerce = observations.map(o => o.product);
  const rawChecks = observations.flatMap((o,productIndex) => o.checks.map(c => ({...c,productIndex})));
  const report = {kind:"profile",scope:"tiktok-shop",market:"US",commerce,checks:rawChecks};
  const rawReceipts = observations.map(({product,checks,receiptVersion}) =>
    shopOnionVerdict({kind:"video",scope:"tiktok-shop",market:"US",commerce:[product],
      checks:checks.map(check => ({...check,productIndex:0}))},{version:receiptVersion}));
  const checks = rawChecks.map(check => {
    const obs = observations[check.productIndex], key = groupKey(obs,check), group = key && groups.get(key);
    if (!group) return check;
    const offers = [...group.quotes.values()].filter(q => q.eligible).map(q => q.offer)
      .sort((a,b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.url.localeCompare(b.url));
    const exact = offers.find(o => o.match === "exact");
    const v = obs.product.variants[check.variantIndex];
    const comparison = exact?.price && v.price && v.currency ? {
      sourcePrice:v.price,alternativePrice:exact.price,alternativeUrl:exact.url,
      difference:v.price-exact.price,basis:"item",currency:v.currency,
    } : null;
    return {...check,offers,comparison,status:comparison ? "compared" : "candidates"};
  });
  const verdict = shopOnionVerdict({...report,checks},{version:SHOP_ONION_VERSION});
  const candidateLinks = rawChecks.flatMap(check => {
    const obs = observations[check.productIndex], key = groupKey(obs,check), group = key && groups.get(key);
    return group ? [{productId:obs.product.productId,skuId:obs.product.variants[check.variantIndex].skuId!,
      links:[...group.candidates.values()].sort((a,b) => a.url.localeCompare(b.url))}] : [];
  });
  const baselines: RankingBaseline[] = [];
  for (const item of verdict.items) {
    const obs = observations[item.productIndex], check = obs.checks.find(c => c.variantIndex === item.variantIndex)!;
    const group = groups.get(groupKey(obs,check)!)!;
    const selected = new Map([...group.quotes.values()].filter(q => q.eligible).map(q => [q.offer.url,q]));
    const shops = item.peers.map(peer => {
      const quote = selected.get(peer.url)!;
      return {...peer,observedAt:quote.observedAt,title:quote.offer.name,variant:quote.offer.variant};
    });
    const included = new Set(item.peers.map(peer => listingId(peer.url)));
    baselines.push({productId:obs.product.productId,skuId:obs.product.variants[item.variantIndex].skuId!,
      currency:item.currency,basis:item.basis,calibrated:group.calibrated,sourcePrice:item.sourcePrice,peerPrice:item.peerPrice,shops,
      observedAt:shops.map(s => s.observedAt).sort().at(-1)!,
      candidates:[...group.candidates].filter(([id]) => !included.has(id)).map(([,link]) => link).sort((a,b) => a.url.localeCompare(b.url))});
  }
  return {rawReceipts,verdict,baselines,candidateLinks};
}
