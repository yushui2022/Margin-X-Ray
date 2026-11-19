import data from "../../research/retail-comparisons.json";
import archive from "../../research/creator-products.json";

export const RETAIL_PREMIUM_VERSION = data.version;
const minimum = data.minimumFamilies;
const aliases: Readonly<Record<string, string>> = data.familyAliases;

export interface ConsumerOffer {
  seller: string;
  url: string;
  kind: string;
  sku: string;
  quantity: number;
  market: string;
  currency: string;
  amount: number;
  shipping: number | null;
  taxIncluded: boolean | null;
  available: boolean | null;
  observedAt: string;
  note: string;
  sources: { label: string; url: string }[];
}

export interface RetailCase {
  productId: string;
  familyId: string;
  handle: string;
  name: string;
  variant: string;
  market: string;
  currency: string;
  relation: "creator-offer" | "founder-store" | "retail-reference";
  matchNote: string;
  sourceUrl: string;
  reference: ConsumerOffer;
  alternative: ConsumerOffer;
}

type ComparisonStatus = "delivered" | "item-only" | "unavailable" | "stale";
export interface RetailComparison extends RetailCase {
  status: ComparisonStatus;
  delta: number | null;
  premiumPercent: number | null;
  reason: string;
}

const records = data.records as RetailCase[];
const families = new Map(records.map(row => [row.productId, row.familyId]));
const samples = new Map(data.samples.map(sample => [sample.handle, sample]));
const today = () => new Date().toISOString().slice(0, 10);

export function retailFamilyId(productId: string) {
  return families.get(productId) ?? (Object.hasOwn(aliases, productId) ? aliases[productId]! : productId);
}

function day(value: string) {
  const t = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value ? t / 86400000 : NaN;
}

function host(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.hostname.replace(/^www\./, "") : "";
  } catch { return ""; }
}

function validPrice(value: number | null, zeroAllowed: boolean): value is number {
  if (value === null || !Number.isFinite(value)) return false;
  const cents = Math.round(value * 100);
  return (zeroAllowed ? cents >= 0 : cents > 0) && Number.isSafeInteger(cents) && cents / 100 === value;
}

export function assessRetailComparison(record: RetailCase, asOf = today()): RetailComparison {
  const { reference, alternative } = record;
  const offers = [reference, alternative];
  function pending(status: ComparisonStatus, reason: string): RetailComparison {
    return { ...record, status, delta: null, premiumPercent: null, reason };
  }
  if (!host(reference.url) || !host(alternative.url) || host(reference.url) === host(alternative.url)
      || reference.seller.trim().toLowerCase() === alternative.seller.trim().toLowerCase()
      || offers.some(offer => offer.kind !== "consumer" || !offer.seller.trim() || !validPrice(offer.amount, false))) {
    return pending("unavailable", "Two independently sourced consumer offers with usable item prices are required.");
  }
  if (!reference.sku || reference.sku !== alternative.sku || !Number.isSafeInteger(reference.quantity)
      || reference.quantity < 1 || reference.quantity !== alternative.quantity || !record.market || !/^[A-Z]{3}$/.test(record.currency)
      || offers.some(offer => offer.market !== record.market || offer.currency !== record.currency)) {
    return pending("unavailable", "The variant, pack, market and currency must match.");
  }
  const now = day(asOf);
  const dates = offers.map(offer => day(offer.observedAt));
  if (!Number.isFinite(now) || dates.some(value => !Number.isFinite(value) || value > now)) {
    return pending("unavailable", "A valid observation date is needed for both offers.");
  }
  if (dates.some(value => now - value > data.freshDays) || Math.abs(dates[0]! - dates[1]!) > data.pairWindowDays) {
    return pending("stale", "Refresh the dated offers before relying on this comparison.");
  }
  if (offers.some(offer => offer.available !== true)) {
    return pending("unavailable", "Both offers need confirmed availability for this variant.");
  }
  if (offers.some(offer => offer.shipping !== null && !validPrice(offer.shipping, true))) {
    return pending("unavailable", "A recorded delivery charge is invalid.");
  }
  if (reference.taxIncluded !== null && alternative.taxIncluded !== null && reference.taxIncluded !== alternative.taxIncluded) {
    return pending("unavailable", "The listed item prices have different tax treatments.");
  }
  const delivered = offers.every(offer => offer.taxIncluded === true && offer.shipping !== null);
  const priceInCents = (offer: ConsumerOffer) => Math.round(offer.amount * 100) + (delivered ? Math.round(offer.shipping! * 100) : 0);
  if (offers.some(offer => !Number.isSafeInteger(priceInCents(offer)))) {
    return pending("unavailable", "The recorded total exceeds the supported currency range.");
  }
  const alternativeCents = priceInCents(alternative);
  const deltaCents = priceInCents(reference) - alternativeCents;
  return {
    ...record, status: delivered ? "delivered" : "item-only", delta: deltaCents / 100,
    premiumPercent: 100 * deltaCents / alternativeCents,
    reason: delivered ? "One order from each shop, including tax and standard delivery for this market."
      : "Listed item prices only. A tax-inclusive total and standard delivery charge are needed for both offers.",
  };
}

export function retailComparison(id: string, asOf = today()) {
  const record = records.find(item => item.productId === id);
  return record && assessRetailComparison(record, asOf);
}

export function retailComparisons(asOf = today()) {
  return records.map(record => assessRetailComparison(record, asOf));
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function oldestObservation(row: RetailComparison) {
  return row.reference.observedAt < row.alternative.observedAt ? row.reference.observedAt : row.alternative.observedAt;
}

export function summarizePremium(handle: string, identifiedFamilies: readonly string[], comparisons: readonly RetailComparison[]) {
  const families = new Set(identifiedFamilies.filter(Boolean));
  const byFamily = new Map<string, Map<string, RetailComparison>>();
  for (const row of comparisons) {
    if (row.handle !== handle || !row.familyId) continue;
    families.add(row.familyId);
    if (row.status !== "delivered" || !["creator-offer", "founder-store"].includes(row.relation)
        || !host(row.sourceUrl) || row.premiumPercent === null || !Number.isFinite(row.premiumPercent)) continue;
    let variants = byFamily.get(row.familyId);
    if (!variants) {
      variants = new Map();
      byFamily.set(row.familyId, variants);
    }
    // A repeated receipt for one variant contributes at most once. Keep the
    // latest complete pair, using the lower premium for same-day ties.
    const key = [row.market, row.currency, row.reference.sku, row.reference.quantity].join("|");
    const previous = variants.get(key);
    if (!previous || oldestObservation(row) > oldestObservation(previous)
        || (oldestObservation(row) === oldestObservation(previous) && row.premiumPercent < previous.premiumPercent!)) variants.set(key, row);
  }
  const matched = byFamily.size;
  const grouped = [...byFamily.values()].map(variants => [...variants.values()]);
  const familyMedians = grouped.map(variants => median(variants.map(variant => variant.premiumPercent!)));
  const includedProductIds = [...new Set(grouped.flat().map(row => row.productId))].sort();
  const p = matched >= minimum ? median(familyMedians) : null;
  return {
    version: RETAIL_PREMIUM_VERSION, minimum, matched, identified: families.size, includedProductIds,
    medianPremium: p === null ? null : Math.round(p * 10) / 10,
    value: p === null ? null : p <= 0 ? 0 : Math.round(1000 * p / (100 + p)) / 10,
  };
}

export function creatorPremium(handle: string, asOf = today(), extraFamilies: readonly string[] = []) {
  const archived = archive.products.filter(product => product.handle === handle).map(product => retailFamilyId(product.id));
  const sample = samples.get(handle);
  return {
    ...summarizePremium(handle, [...archived, ...(sample?.families ?? []), ...extraFamilies.map(retailFamilyId)], retailComparisons(asOf)),
    selection: sample?.selection ?? null,
  };
}
