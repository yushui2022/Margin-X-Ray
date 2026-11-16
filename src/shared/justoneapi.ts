/**
 * JustOneAPI 1688 image-search parser.
 *
 * JustOneAPI wraps every endpoint in { code, message, data }. The parser is
 * deliberately tolerant about container names because the payload has changed
 * between endpoint versions, but it never invents a price: a row without a
 * numeric CNY price is dropped.
 */

import type { SupplyOffer, SupplyTier } from "./types";

export interface JustOneAPIResult {
  scanned: number;
  offers: SupplyOffer[];
}

export function parseJustOneAPIResponse(payload: unknown): JustOneAPIResult {
  const root = asRecord(payload);
  if (!root) throw new Error("JustOneAPI returned a response that was not an object.");

  const code = numberField(root.code);
  if (code !== undefined && code !== 0) {
    throw new Error(justOneAPIErrorMessage(code, stringField(root.message)));
  }

  const data = asRecord(root.data) ?? root;
  const rows = firstArray(data, [
    "result",
    "items",
    "offerList",
    "productList",
    "list",
    "products",
    "itemList",
    "records",
  ]);
  const scanned =
    positiveInt(
      data.total ??
        data.totalCount ??
        data.totalResults ??
        data.resultCount ??
        data.count,
    ) ?? rows.length;

  const offers: SupplyOffer[] = [];
  rows.forEach((row, index) => {
    const offer = offerFromRow(row, index);
    if (offer) offers.push(offer);
  });

  return { scanned, offers };
}

export function justOneAPIErrorMessage(code: number, message?: string): string {
  const detail = message?.trim();
  const known: Record<number, string> = {
    100: "JustOneAPI rejected the token or the token is inactive.",
    101: "JustOneAPI requires this caller to be whitelisted.",
    202: "This JustOneAPI endpoint does not accept one of the requested parameters.",
    300: "This JustOneAPI endpoint does not exist or is inactive.",
    301: "JustOneAPI could not collect the result. Retry the scan.",
    302: "JustOneAPI rate limit reached. Retry later.",
    303: "JustOneAPI daily quota is used up for this endpoint.",
    400: "JustOneAPI rejected the request parameters.",
    404: "JustOneAPI endpoint not found.",
    500: "JustOneAPI had an internal error.",
    503: "JustOneAPI is temporarily unavailable.",
    600: "JustOneAPI permission denied for this endpoint.",
    601: "JustOneAPI account balance is insufficient.",
    602: "The JustOneAPI token budget limit has been reached.",
  };
  const base = known[code] ?? `JustOneAPI returned code ${code}.`;
  return detail ? `${base} ${detail}` : base;
}

function offerFromRow(row: unknown, index: number): SupplyOffer | null {
  const item = asRecord(row);
  if (!item) return null;

  const title =
    stringField(item.title) ??
    stringField(item.subject) ??
    stringField(item.offerTitle) ??
    stringField(item.name);
  const tiers = tiersFrom(item);
  if (!title || !tiers.length) return null;

  const id =
    stringField(item.offerId) ??
    stringField(item.productId) ??
    stringField(item.id) ??
    stringField(item.num_iid) ??
    `justoneapi-${index}`;

  const location = locationFrom(item);
  const shopName = stringField(item.shopName) ?? stringField(item.sellerName);
  const companyName =
    stringField(item.companyName) ??
    stringField(item.supplierName) ??
    stringField(item.company);
  const factoryFlag = booleanField(item.isFactory ?? item.factoryFlag);
  const verifiedFlag = booleanField(item.verifiedSupplier ?? item.verifiedFlag);
  const detailUrl = detailUrlFrom(item);
  const sales = salesFrom(item);

  return {
    id: `justoneapi:${id}`,
    title,
    provider: "justoneapi",
    tiers,
    ...(location ? { location } : {}),
    ...(shopName ? { shopName } : {}),
    ...(companyName ? { companyName } : {}),
    ...(factoryFlag !== undefined ? { factoryFlag } : {}),
    ...(verifiedFlag !== undefined ? { verifiedFlag } : {}),
    ...(detailUrl ? { detailUrl } : {}),
    ...(sales !== undefined ? { sales } : {}),
  };
}

function tiersFrom(item: Record<string, unknown>): SupplyTier[] {
  const priceInfo = asRecord(item.priceInfo);
  const ranges = [
    item.priceRange,
    item.priceRanges,
    priceInfo?.priceRange,
    priceInfo?.priceRanges,
    item.ladderPrice,
  ];
  for (const range of ranges) {
    const tiers = tiersFromRange(range);
    if (tiers.length) return tiers;
  }

  const price =
    positiveNumber(item.price) ??
    positiveNumber(item.priceStr) ??
    positiveNumber(item.unitPrice) ??
    positiveNumber(priceInfo?.price);
  if (!price) return [];
  const moq =
    positiveInt(
      item.moq ??
        item.minOrderQuantity ??
        item.quantityBegin ??
        item.beginAmount ??
        item.minNum,
    ) ?? 1;
  return [{ moq, unitCny: price }];
}

function tiersFromRange(value: unknown): SupplyTier[] {
  if (!Array.isArray(value)) return [];
  const tiers: SupplyTier[] = [];
  for (const row of value) {
    if (Array.isArray(row) && row.length >= 2) {
      const moq = positiveInt(row[0]);
      const unitCny = positiveNumber(row[1]);
      if (moq && unitCny) tiers.push({ moq, unitCny });
      continue;
    }
    const record = asRecord(row);
    if (!record) continue;
    const moq = positiveInt(
      record.moq ?? record.startQuantity ?? record.beginAmount ?? record.minOrderQuantity,
    );
    const unitCny = positiveNumber(
      record.price ?? record.unitPrice ?? record.unitCny ?? record.priceCny,
    );
    if (moq && unitCny) tiers.push({ moq, unitCny });
  }
  return tiers.sort((a, b) => a.moq - b.moq);
}

function locationFrom(item: Record<string, unknown>): string | undefined {
  const direct = stringField(item.location) ?? stringField(item.sendAddress);
  if (direct) return direct;
  const province = stringField(item.province);
  const city = stringField(item.city);
  if (province && city && province !== city) return `${province} ${city}`;
  return province ?? city;
}

function detailUrlFrom(item: Record<string, unknown>): string | undefined {
  const url =
    stringField(item.detailUrl) ??
    stringField(item.detailPageUrl) ??
    stringField(item.offerUrl) ??
    stringField(item.url) ??
    stringField(item.link);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function salesFrom(item: Record<string, unknown>): number | undefined {
  return positiveInt(
    item.sales ?? item.sale ?? item.monthSold ?? item.soldCount ?? item.tradeCount,
  );
}

function firstArray(
  record: Record<string, unknown>,
  keys: string[],
): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || undefined;
}

function numberField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value);
  }
  return undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = numberField(value);
  return number !== undefined && number > 0 && number < 1_000_000
    ? number
    : undefined;
}

function positiveInt(value: unknown): number | undefined {
  const number = positiveNumber(value);
  return number === undefined ? undefined : Math.round(number);
}

function booleanField(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return undefined;
}
