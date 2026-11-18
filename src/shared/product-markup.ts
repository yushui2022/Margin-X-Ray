export const HIGH_PRICE_MULTIPLE = 3;

/** Prices must share a currency and merchandise basis. Units are identical items. */
export function compareUnitPrices(retail: number, retailUnits: number, quote: number, quoteUnits: number) {
  if (![retail, quote].every(n => Number.isFinite(n) && n > 0) ||
      ![retailUnits, quoteUnits].every(n => Number.isSafeInteger(n) && n > 0)) return null;
  const salePerUnit = retail / retailUnits;
  const quotePerUnit = quote / quoteUnits;
  const multiple = salePerUnit / quotePerUnit;
  const spread = salePerUnit - quotePerUnit;
  if (![salePerUnit, quotePerUnit, multiple].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(spread)) return null;
  // Dividing decimal pack prices can put an exact threshold one machine epsilon below it.
  const atThreshold = Math.abs(multiple - HIGH_PRICE_MULTIPLE) <= Number.EPSILON * HIGH_PRICE_MULTIPLE;
  return { salePerUnit, quotePerUnit, multiple, spread, high: multiple >= HIGH_PRICE_MULTIPLE || atThreshold };
}
