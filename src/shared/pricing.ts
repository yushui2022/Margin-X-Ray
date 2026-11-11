import type {
  CostAssumptions,
  CostWaterfall,
  FactoryTier,
  ScanResult,
} from "./types";

/**
 * Illustrative defaults only. These are deliberately editable in the HUD.
 * They are NOT tax, legal, or accounting advice.
 */
export function defaultAssumptions(
  retailUsd: number,
  fobUsd: number,
): CostAssumptions {
  return {
    fobUsd: round2(Math.max(0, fobUsd)),
    shippingPerUnitUsd: 2.2,
    dutyRatePct: 25,
    platformFeePct: 6,
    affiliatePct: 20,
    paymentPct: 3,
    fulfillmentPerUnitUsd: 4.5,
    returnRatePct: 8,
    adPct: 20,
    ...(retailUsd > 0 ? {} : {}),
  };
}

export function computeWaterfall(
  retailUsd: number,
  assumptions: CostAssumptions,
): CostWaterfall {
  const retail = safeNumber(retailUsd);
  const fob = Math.max(0, safeNumber(assumptions.fobUsd));
  const shipping = Math.max(0, safeNumber(assumptions.shippingPerUnitUsd));
  const duty = fob * pct(assumptions.dutyRatePct);
  const landed = fob + shipping + duty;

  const platformFee = retail * pct(assumptions.platformFeePct);
  const affiliate = retail * pct(assumptions.affiliatePct);
  const payment = retail * pct(assumptions.paymentPct);
  const fulfillment = Math.max(0, safeNumber(assumptions.fulfillmentPerUnitUsd));
  const returns = retail * pct(assumptions.returnRatePct);

  const contribution =
    retail - landed - platformFee - affiliate - payment - fulfillment - returns;
  const ad = retail * pct(assumptions.adPct);
  const net = contribution - ad;

  return {
    retailUsd: round2(retail),
    fobUsd: round2(fob),
    shippingUsd: round2(shipping),
    dutyUsd: round2(duty),
    landedUsd: round2(landed),
    platformFeeUsd: round2(platformFee),
    affiliateUsd: round2(affiliate),
    paymentUsd: round2(payment),
    fulfillmentUsd: round2(fulfillment),
    returnsUsd: round2(returns),
    contributionUsd: round2(contribution),
    contributionMarginPct: retail > 0 ? round1((contribution / retail) * 100) : 0,
    adUsd: round2(ad),
    netUsd: round2(net),
    netMarginPct: retail > 0 ? round1((net / retail) * 100) : 0,
    grossMarginPct: retail > 0 ? round1(((retail - fob) / retail) * 100) : 0,
  };
}

export function assumptionsForResult(result: ScanResult): CostAssumptions | null {
  const retail = result.product.retailUsd;
  if (retail === null || !Number.isFinite(retail) || retail <= 0) {
    return null;
  }

  if (result.assumptions) {
    return { ...result.assumptions, fobUsd: Math.max(0, result.assumptions.fobUsd) };
  }

  if (result.priceRange) {
    const mid = (result.priceRange.fobMinUsd + result.priceRange.fobMaxUsd) / 2;
    return defaultAssumptions(retail, mid);
  }

  return null;
}

export function unitPriceAtMoq(
  tiers: FactoryTier[],
  targetMoq: number,
): FactoryTier | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.moq - b.moq);
  const eligible = sorted.filter((tier) => tier.moq <= Math.max(1, targetMoq));
  return eligible.length ? eligible[eligible.length - 1] ?? null : sorted[0] ?? null;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function pct(value: number): number {
  return Math.max(0, safeNumber(value)) / 100;
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
