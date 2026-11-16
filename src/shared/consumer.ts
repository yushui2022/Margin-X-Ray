/**
 * Consumer-facing verdict model.
 *
 * Every number here is derived from the same cost model the report already
 * shows. Nothing is invented: a missing input produces `null`, and the UI says
 * so instead of filling a flattering number.
 */

import type { CostAssumptions, CostWaterfall, ScanResult } from "./types";

export type Fairness = "fair" | "above" | "well-above" | "extreme" | "unknown";
export type MatchStrength = "high" | "medium" | "low" | "none" | "unknown";
export type FactorySource = "listing" | "assumption" | "none";

export interface ConsumerVerdict {
  retailUsd: number | null;
  factoryLowUsd: number | null;
  factoryHighUsd: number | null;
  factoryMidUsd: number | null;
  factorySource: FactorySource;
  landedUsd: number | null;
  fairLowUsd: number | null;
  fairHighUsd: number | null;
  /** Retail price divided by estimated factory cost. */
  markupX: number | null;
  /** Retail price divided by the top of the fair range. */
  premiumX: number | null;
  fairness: Fairness;
  /** Number of priced near-identical 1688 listings behind the scan. */
  matchCount: number | null;
  matchStrength: MatchStrength;
}

const FAIR_LOW_MARGIN_PCT = 15;
const FAIR_HIGH_MARGIN_PCT = 25;

export function consumerVerdict(
  result: ScanResult,
  waterfall: CostWaterfall | null,
  assumptions: CostAssumptions | null,
): ConsumerVerdict {
  const retailUsd = positive(result.product.retailUsd);

  const listingLow = positive(result.priceRange?.fobMinUsd);
  const listingHigh = positive(result.priceRange?.fobMaxUsd);
  const assumedFob = positive(assumptions?.fobUsd);
  const factorySource: FactorySource = listingLow && listingHigh
    ? "listing"
    : assumedFob
      ? "assumption"
      : "none";
  const factoryLowUsd = listingLow ?? assumedFob;
  const factoryHighUsd = listingHigh ?? assumedFob;
  const factoryMidUsd =
    factoryLowUsd && factoryHighUsd ? (factoryLowUsd + factoryHighUsd) / 2 : null;

  const landedUsd =
    positive(waterfall?.landedUsd) ??
    (factoryMidUsd && assumptions
      ? factoryMidUsd +
        Math.max(0, assumptions.shippingPerUnitUsd) +
        factoryMidUsd * (Math.max(0, assumptions.dutyRatePct) / 100)
      : null);

  const fairLowUsd =
    landedUsd && assumptions
      ? fairRetail(landedUsd, assumptions, FAIR_LOW_MARGIN_PCT)
      : null;
  const fairHighUsd =
    landedUsd && assumptions
      ? fairRetail(landedUsd, assumptions, FAIR_HIGH_MARGIN_PCT)
      : null;

  const markupX =
    retailUsd && factoryMidUsd ? round1(retailUsd / factoryMidUsd) : null;
  const premiumX =
    retailUsd && fairHighUsd ? round2(retailUsd / fairHighUsd) : null;

  const matchCount = result.supply ? result.supply.priced : null;

  return {
    retailUsd,
    factoryLowUsd,
    factoryHighUsd,
    factoryMidUsd,
    factorySource,
    landedUsd,
    fairLowUsd,
    fairHighUsd,
    markupX,
    premiumX,
    fairness: fairnessOf(premiumX),
    matchCount,
    matchStrength: matchStrengthOf(matchCount),
  };
}

export function fairnessOf(premiumX: number | null): Fairness {
  if (premiumX === null) return "unknown";
  if (premiumX <= 1.1) return "fair";
  if (premiumX <= 1.6) return "above";
  if (premiumX <= 3) return "well-above";
  return "extreme";
}

export function matchStrengthOf(count: number | null): MatchStrength {
  if (count === null) return "unknown";
  if (count >= 20) return "high";
  if (count >= 5) return "medium";
  if (count >= 1) return "low";
  return "none";
}

export function fairnessLabel(fairness: Fairness): string {
  switch (fairness) {
    case "fair":
      return "Within the fair range";
    case "above":
      return "Above the fair range";
    case "well-above":
      return "Well above the fair range";
    case "extreme":
      return "Extreme markup";
    default:
      return "Not enough data";
  }
}

export function matchLabel(strength: MatchStrength, count: number | null): string {
  const n = count ?? 0;
  switch (strength) {
    case "high":
      return `${n} near-identical 1688 listings`;
    case "medium":
      return `${n} near-identical 1688 listings`;
    case "low":
      return `${n} near-identical 1688 listing${n === 1 ? "" : "s"}`;
    case "none":
      return "No near-identical listing found";
    default:
      return "No 1688 image search in this report";
  }
}

function fairRetail(
  landedUsd: number,
  assumptions: CostAssumptions,
  targetMarginPct: number,
): number | null {
  const feesPct =
    Math.max(0, assumptions.platformFeePct) +
    Math.max(0, assumptions.paymentPct) +
    Math.max(0, assumptions.returnRatePct);
  const denominator = 1 - feesPct / 100 - targetMarginPct / 100;
  if (denominator <= 0.1) return null;
  const price =
    (landedUsd + Math.max(0, assumptions.fulfillmentPerUnitUsd)) / denominator;
  return price > 0 && Number.isFinite(price) ? round2(price) : null;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
