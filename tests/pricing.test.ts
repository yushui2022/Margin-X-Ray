import test from "node:test";
import assert from "node:assert/strict";
import {
  computeWaterfall,
  defaultAssumptions,
  unitPriceAtMoq,
} from "../src/shared/pricing";
import type { FactoryTier } from "../src/shared/types";

test("computeWaterfall produces a transparent landed-cost model", () => {
  const assumptions = defaultAssumptions(59.9, 3.1);
  const result = computeWaterfall(59.9, assumptions);

  assert.equal(result.retailUsd, 59.9);
  assert.equal(result.fobUsd, 3.1);
  assert.equal(result.shippingUsd, 2.2);
  assert.equal(result.dutyUsd, 0.78);
  assert.equal(result.landedUsd, 6.08);
  assert.equal(result.platformFeeUsd, 3.59);
  assert.equal(result.affiliateUsd, 11.98);
  assert.equal(result.netUsd, 15.18);
  assert.equal(result.netMarginPct, 25.3);
  assert.equal(result.grossMarginPct, 94.8);
  assert.ok(result.contributionUsd > result.netUsd);
});

test("computeWaterfall handles negative margins without hiding them", () => {
  const assumptions = defaultAssumptions(59.9, 70);
  const result = computeWaterfall(59.9, assumptions);

  assert.ok(result.netUsd < 0);
  assert.ok(result.netMarginPct < 0);
  assert.ok(result.grossMarginPct < 0);
});

test("computeWaterfall returns zero percentages for a zero retail price", () => {
  const assumptions = defaultAssumptions(0, 3);
  const result = computeWaterfall(0, assumptions);

  assert.equal(result.retailUsd, 0);
  assert.equal(result.contributionMarginPct, 0);
  assert.equal(result.netMarginPct, 0);
  assert.equal(result.grossMarginPct, 0);
});

test("unitPriceAtMoq selects the best published tier at or below the target", () => {
  const tiers: FactoryTier[] = [
    { moq: 2000, unitUsd: 2.55 },
    { moq: 100, unitUsd: 3.85 },
    { moq: 500, unitUsd: 3.1 },
  ];

  assert.equal(unitPriceAtMoq(tiers, 100)?.unitUsd, 3.85);
  assert.equal(unitPriceAtMoq(tiers, 300)?.unitUsd, 3.85);
  assert.equal(unitPriceAtMoq(tiers, 500)?.unitUsd, 3.1);
  assert.equal(unitPriceAtMoq(tiers, 1000)?.unitUsd, 3.1);
  assert.equal(unitPriceAtMoq(tiers, 5000)?.unitUsd, 2.55);
  assert.equal(unitPriceAtMoq([], 500), null);
});
