import archive from "../../research/creator-products.json";
import assessments from "../../research/creator-confidence-assessments.json";
import checks from "../../research/product-quote-checks.json";
import { assessPrice, type SupplierObservation } from "./price-comparison";

export const quoteDate = checks.observedAt;

export function supplierForBarcode(barcode: string, currency: string) {
  if (!/^\d{8,14}$/.test(barcode)) return undefined;
  return checks.records.find(check => check.barcode.padStart(14, "0") === barcode.padStart(14, "0") && check.currency === currency);
}

interface RetailListing {
  id: string;
  name: string;
  url: string;
  alias?: string;
  label: string;
  amount: number;
  market: string;
  conditions: string;
  currency: string;
  observedAt: string;
  handle?: string;
}

const listings: RetailListing[] = [];
for (const product of archive.products) {
  const assessment = assessments.products.find(entry => entry.productId === product.id);
  const source = archive.sources.find(entry => entry.id === assessment?.listingSource);
  if (source) listings.push({ id: product.id, name: product.name, handle: product.handle, ...product.price,
    label: source.label, url: source.url, observedAt: archive.observedAt });
}
for (const check of checks.records) {
  if (check.retailListing) listings.push({ id: check.productId, ...check.retailListing,
    currency: check.currency, observedAt: quoteDate });
}

export function markupRecord(id?: string) {
  const listing = listings.find(entry => entry.id === id);
  if (!listing) return undefined;
  const quote = checks.records.find(entry => entry.productId === listing.id && entry.currency === listing.currency);
  return { listing, quote };
}

export function observationsFor(quote: typeof checks.records[number]): SupplierObservation[] {
  return [{ supplierId: quote.supplierId, label: quote.quoteLabel, url: quote.quoteUrl, match: quote.match,
    amount: quote.quoteAmount, units: quote.quoteUnits, observedAt: quoteDate, currency: quote.currency, market: quote.quoteMarket,
    note: quote.matchNote }, ...(quote.otherQuotes ?? [])];
}

export function archivedAssessment(record: NonNullable<ReturnType<typeof markupRecord>>) {
  const { listing, quote } = record;
  return assessPrice({ ...listing, units: quote?.retailUnits ?? NaN }, quote ? observationsFor(quote) : []);
}

export function listingUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch { /* No usable listing URL. */ }
  return undefined;
}

function lookupKey(raw: string) {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

/** Preserve variant and market parameters when opening a dated observation. */
export function markupHref(raw: string) {
  const url = listingUrl(raw);
  if (!url) return "#markup";
  const key = lookupKey(url);
  const listing = listings.find(entry => lookupKey(entry.url) === key || (entry.alias && lookupKey(entry.alias) === key));
  return listing ? `#markup/${listing.id}` : `#markup/item?${new URLSearchParams({ url })}`;
}
