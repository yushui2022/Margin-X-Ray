import { compareUnitPrices } from "./product-markup";

export const PRICE_CHECK_VERSION = "listing-gap-v2";
export const PRICE_WINDOW_DAYS = 30;

export interface RetailObservation {
  amount: number;
  units: number;
  market: string;
  currency: string;
  observedAt: string;
  url: string;
}

/** Inputs belong to one product record and use listed merchandise prices before delivery. */
export interface SupplierObservation extends Omit<RetailObservation, "amount"> {
  amount: number | null;
  match: string;
  supplierId: string;
  label: string;
  note: string;
}

function day(iso: string) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? t / 86400000 : NaN;
}

function host(url: string) {
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol)) return parsed.hostname.replace(/^www\./, "");
  } catch { /* Missing listing evidence. */ }
  return "";
}

export function assessPrice(retail: RetailObservation, quotes: SupplierObservation[]) {
  const excluded: { label: string; reason: string }[] = [];
  const rows: { offer: SupplierObservation; comparison: NonNullable<ReturnType<typeof compareUnitPrices>> }[] = [];
  const retailHost = host(retail.url);
  for (const offer of quotes) {
    const comparison = compareUnitPrices(retail.amount, retail.units, offer.amount ?? NaN, offer.units);
    const supplierHost = host(offer.url);
    const distance = Math.abs(day(retail.observedAt) - day(offer.observedAt));
    let reason = "";
    if (!comparison) reason = "A pack price or item count is missing or invalid.";
    else if (offer.match !== "same") reason = "The variant and unit still need a match.";
    else if (!offer.currency || !offer.market || offer.currency !== retail.currency || offer.market !== retail.market) reason = "Market or currency differs.";
    else if (!Number.isFinite(distance) || distance > PRICE_WINDOW_DAYS) reason = "Outside the comparison date window.";
    else if (!offer.supplierId || !retailHost || !supplierHost || retailHost === supplierHost) reason = "An independent supplier listing is needed.";
    if (reason || !comparison) excluded.push({ label: offer.label, reason });
    else rows.push({ offer, comparison });
  }
  // A repeat observation cannot add another supplier. Use its latest eligible quote.
  // At equal dates prefer the higher per-item cost for a conservative comparison.
  rows.sort((a, b) => b.offer.observedAt.localeCompare(a.offer.observedAt) || b.comparison.quotePerUnit - a.comparison.quotePerUnit);
  const seen = new Set<string>();
  const hosts = new Set<string>();
  const sources = rows.filter(({ offer }) => {
    const domain = host(offer.url);
    if (seen.has(offer.supplierId) || hosts.has(domain)) return false;
    seen.add(offer.supplierId);
    hosts.add(domain);
    return true;
  }).sort((a, b) => a.comparison.multiple - b.comparison.multiple);
  const low = sources[0]?.comparison;
  const high = sources.at(-1)?.comparison;
  const status = !low || !high ? "pending" : sources.length === 1 ? "single" : low.high ? "high" : high.high ? "mixed" : "below";
  return { status, sources, excluded, min: low?.multiple, max: high?.multiple } as const;
}
