import { computeWaterfall, defaultAssumptions } from "./pricing";
import type {
  Factory,
  FactoryTier,
  FunnelReason,
  ScanResult,
  SupplyOffer,
  SupplyReport,
  SupplyTier,
} from "./types";

const PROVIDER_LABEL = {
  onebound: "OneBound 1688 image search",
  "alibaba-open": "1688 open platform image search",
} as const;

export function parseFxRate(value: string): number | undefined {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1000) return undefined;
  return rate;
}

export function parseOneBoundSearch(payload: unknown): {
  scanned: number;
  offers: SupplyOffer[];
} {
  assertOneBoundOk(payload);
  const root = asRecord(payload) ?? {};
  const items = asRecord(root.items);
  const rows = asArray(items?.item ?? root.item);
  const scanned = positiveInt(items?.real_total_results) ?? rows.length;
  return {
    scanned,
    offers: rows
      .map((row, index) => offerFromSearchRow(row, index))
      .filter((offer): offer is SupplyOffer => Boolean(offer)),
  };
}

export function parseOneBoundItem(payload: unknown): Partial<SupplyOffer> | null {
  assertOneBoundOk(payload);
  const root = asRecord(payload) ?? {};
  const item = asRecord(root.item) ?? root;
  const tiers = tiersFromPriceRange(item.priceRange);
  const price = firstPrice(item.promotion_price, item.batch_price, item.price);
  const resolved = tiers.length ? tiers : price ? [{ moq: positiveInt(item.min_num) ?? 1, unitCny: price }] : [];
  if (!resolved.length) return null;
  const shop = shopName(item.nick);
  const location = text(item.location);
  return {
    ...(text(item.title) ? { title: text(item.title) } : {}),
    tiers: resolved,
    ...(location ? { location } : {}),
    ...(shop ? { shopName: shop } : {}),
    ...(text(item.detail_url) ? { detailUrl: text(item.detail_url) } : {}),
  };
}

export function parseAlibabaImageSearch(payload: unknown): {
  scanned: number;
  offers: SupplyOffer[];
} {
  const root = asRecord(payload) ?? {};
  const errorCode = root.errorCode ?? root.error_code;
  if (errorCode !== undefined && String(errorCode) !== "0" && String(errorCode) !== "0000") {
    throw new Error(text(root.errorMessage) ?? text(root.errorMsg) ?? `1688 returned ${String(errorCode)}.`);
  }
  const result = asRecord(root.result) ?? root;
  if (result.success === false) {
    throw new Error(text(result.message) ?? "1688 image search failed.");
  }
  const rows = asArray(result.result ?? result.productList ?? result.offerList ?? result.offers);
  const scanned = positiveInt(result.totalResults ?? result.total) ?? rows.length;
  return {
    scanned,
    offers: rows
      .map((row, index) => offerFromAlibabaRow(row, index))
      .filter((offer): offer is SupplyOffer => Boolean(offer)),
  };
}

export function mergeOfferDetail(
  offer: SupplyOffer,
  detail: Partial<SupplyOffer> | null,
): SupplyOffer {
  if (!detail) return offer;
  return {
    ...offer,
    title: detail.title || offer.title,
    tiers: detail.tiers?.length ? detail.tiers : offer.tiers,
    ...(detail.location ? { location: detail.location } : {}),
    ...(detail.shopName ? { shopName: detail.shopName } : {}),
    ...(detail.detailUrl ? { detailUrl: detail.detailUrl } : {}),
  };
}

export function buildSupplyReport(
  provider: SupplyReport["provider"],
  scanned: number,
  offers: SupplyOffer[],
  fxRate?: number,
): SupplyReport {
  const priced = offers.filter((offer) => offer.tiers.length > 0);
  const shown = cheapest(priced).slice(0, 3);
  const amounts = shown.flatMap((offer) => offer.tiers.map((tier) => tier.unitCny));
  const cnyLabel = amounts.length
    ? `${formatCny(Math.min(...amounts))}–${formatCny(Math.max(...amounts))}`
    : "No priced listings";
  return {
    provider,
    scanned,
    priced: priced.length,
    offers: shown,
    ...(fxRate ? { fxRate } : {}),
    cnyLabel,
    note: "1688 listing prices only. Registry, headcount and lawsuit checks were not run.",
  };
}

export function applySupply(
  result: ScanResult,
  report: SupplyReport | undefined,
  fxRate?: number,
): ScanResult {
  if (!report || !report.offers.length) return result;
  const currency = fxRate ? "USD" : "CNY";
  const factories = report.offers.map((offer) => toFactory(offer, currency, fxRate));
  const usdValues = factories.flatMap((factory) =>
    currency === "USD" ? [factory.fobMinUsd, factory.fobMaxUsd] : [],
  );
  const priceRange = usdValues.length
    ? {
        fobMinUsd: Math.min(...usdValues),
        fobMaxUsd: Math.max(...usdValues),
        basis: `1688 CNY price / ${fxRate} CNY per USD. Not freight or duty.`,
        confidence: "medium" as const,
      }
    : null;
  const assumptions =
    priceRange && result.product.retailUsd
      ? defaultAssumptions(result.product.retailUsd, priceRange.fobMinUsd)
      : result.assumptions;
  const waterfall =
    assumptions && result.product.retailUsd
      ? computeWaterfall(result.product.retailUsd, assumptions)
      : result.waterfall;
  const hidden = Math.max(0, report.priced - report.offers.length);
  const unpriced = Math.max(0, report.scanned - report.priced);
  const excluded: FunnelReason[] = [
    ...(unpriced ? [{ reason: "No price on the listing", count: unpriced }] : []),
    ...(hidden ? [{ reason: "Higher price than the 3 shown", count: hidden }] : []),
  ];
  return {
    ...result,
    supply: report,
    factories,
    priceRange,
    assumptions,
    waterfall,
    funnel: {
      scanned: report.scanned,
      excludedByReason: excluded,
      verified: report.offers.length,
      note: report.note,
    },
    sources: [
      ...result.sources,
      {
        label: PROVIDER_LABEL[report.provider],
        asOf: new Date().toISOString(),
      },
    ],
    qualityWarning: fxRate
      ? "These are 1688 listing prices converted with the saved CNY per USD rate. They are not a factory audit or a freight quote."
      : "These are 1688 listing prices in CNY. No CNY per USD rate is saved, so the profit model was not switched to these prices.",
  };
}

function toFactory(
  offer: SupplyOffer,
  currency: "USD" | "CNY",
  fxRate?: number,
): Factory {
  const tiers: FactoryTier[] = offer.tiers.map((tier) => ({
    moq: tier.moq,
    unitUsd: currency === "USD" && fxRate ? roundMoney(tier.unitCny / fxRate) : tier.unitCny,
    currency,
    note: `${formatCny(tier.unitCny)} on 1688`,
  }));
  const amounts = tiers.map((tier) => tier.unitUsd);
  const shop = offer.shopName && !offer.shopName.startsWith("_sopid") ? offer.shopName : offer.title;
  return {
    id: offer.id,
    maskedName: shop.slice(0, 80),
    location: offer.location ?? "1688 listing",
    fobMinUsd: Math.min(...amounts),
    fobMaxUsd: Math.max(...amounts),
    tiers,
    currency,
    signals: [
      {
        label: "1688 price",
        value: offer.tiers.map((tier) => `MOQ ${tier.moq}: ${formatCny(tier.unitCny)}`).join("; "),
        source: PROVIDER_LABEL[offer.provider],
      },
      ...(offer.sales !== undefined
        ? [{ label: "Sales", value: String(offer.sales), source: PROVIDER_LABEL[offer.provider] }]
        : []),
      ...(offer.detailUrl
        ? [{ label: "Listing", value: offer.detailUrl, source: PROVIDER_LABEL[offer.provider] }]
        : []),
      ...(currency === "USD" && fxRate
        ? [{ label: "FX", value: `${fxRate} CNY per USD`, source: "Extension settings" }]
        : []),
    ],
    confidence: "medium",
    confidenceReason:
      "Price comes from a 1688 listing returned by image search. The shop name is not a registry-verified factory.",
  };
}

function offerFromSearchRow(row: unknown, index: number): SupplyOffer | null {
  const item = asRecord(row);
  if (!item) return null;
  const price = firstPrice(item.promotion_price, item.price);
  if (!price) return null;
  const id = text(item.num_iid) ?? `row-${index}`;
  return {
    id: `onebound:${id}`,
    title: text(item.title) ?? "1688 listing",
    provider: "onebound",
    tiers: [{ moq: 1, unitCny: price }],
    ...(text(item.detail_url) ? { detailUrl: text(item.detail_url) } : {}),
    ...(positiveInt(item.sales) !== undefined ? { sales: positiveInt(item.sales) } : {}),
  };
}

function offerFromAlibabaRow(row: unknown, index: number): SupplyOffer | null {
  const item = asRecord(row);
  if (!item) return null;
  const priceInfo = asRecord(item.priceInfo);
  const tiers = tiersFromPriceRange(item.priceRange ?? priceInfo?.priceRange);
  const price = firstPrice(
    priceInfo?.price,
    priceInfo?.consignPrice,
    item.price,
    item.priceStr,
  );
  const moq = positiveInt(item.quantityBegin ?? item.minOrderQuantity ?? item.moq) ?? 1;
  const resolved = tiers.length ? tiers : price ? [{ moq, unitCny: price }] : [];
  if (!resolved.length) return null;
  const id = text(item.offerId ?? item.productId ?? item.openOfferId) ?? `row-${index}`;
  const location = text(item.city ?? item.province);
  const shop = text(item.companyName ?? item.sellerName ?? item.company);
  return {
    id: `alibaba:${id}`,
    title: text(item.subject ?? item.title) ?? "1688 listing",
    provider: "alibaba-open",
    tiers: resolved,
    ...(location ? { location } : {}),
    ...(shop ? { shopName: shop } : {}),
    ...(text(item.detailUrl ?? item.detailPageUrl) ? { detailUrl: text(item.detailUrl ?? item.detailPageUrl) } : {}),
  };
}

function tiersFromPriceRange(value: unknown): SupplyTier[] {
  if (!Array.isArray(value)) return [];
  const tiers: SupplyTier[] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const moq = positiveInt(row[0]);
    const unitCny = positiveNumber(row[1]);
    if (!moq || !unitCny) continue;
    tiers.push({ moq, unitCny });
  }
  return tiers.sort((a, b) => a.moq - b.moq);
}

function assertOneBoundOk(payload: unknown): void {
  const root = asRecord(payload);
  if (!root) throw new Error("OneBound returned an unreadable response.");
  const code = root.error_code === undefined ? "0000" : String(root.error_code);
  if (code === "0000") return;
  if (code === "2000") return;
  const reason = text(root.reason) ?? text(root.error) ?? `OneBound error ${code}.`;
  throw new Error(reason);
}

function cheapest(offers: SupplyOffer[]): SupplyOffer[] {
  return [...offers].sort((a, b) => lowest(a) - lowest(b));
}

function lowest(offer: SupplyOffer): number {
  return Math.min(...offer.tiers.map((tier) => tier.unitCny));
}

function firstPrice(...values: unknown[]): number | undefined {
  for (const value of values) {
    const price = positiveNumber(value);
    if (price) return price;
  }
  return undefined;
}

function shopName(value: unknown): string | undefined {
  const name = text(value);
  if (!name || name.startsWith("_sopid")) return undefined;
  return name;
}

function formatCny(amount: number): string {
  return `CNY ${amount.toFixed(2)}`;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function positiveInt(value: unknown): number | undefined {
  const number = positiveNumber(value);
  if (!number) return undefined;
  return Math.round(number);
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    const number = match ? Number(match[0]) : NaN;
    if (Number.isFinite(number) && number > 0) return number;
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const trimmed = String(value).replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}
