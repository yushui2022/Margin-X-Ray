import test from "node:test";
import assert from "node:assert/strict";
import {
  consumerVerdict,
  fairnessOf,
  matchStrengthOf,
} from "../src/shared/consumer";
import { computeWaterfall, defaultAssumptions } from "../src/shared/pricing";
import type { ScanResult } from "../src/shared/types";

function result(patch: Partial<ScanResult> = {}): ScanResult {
  return {
    scanId: "s1",
    dataSource: "demo",
    generatedAt: "2026-11-16T00:00:00.000Z",
    product: {
      title: "Neck fan",
      sourceUrl: "https://example.com/p",
      platform: "tiktok",
      retailUsd: 59.9,
      retailSource: "page",
    },
    priceRange: {
      fobMinUsd: 2.4,
      fobMaxUsd: 4.1,
      basis: "test",
      confidence: "medium",
    },
    waterfall: null,
    assumptions: null,
    factories: [],
    funnel: { scanned: 0, excludedByReason: [], verified: 0, note: "" },
    sources: [],
    disclaimers: [],
    ...patch,
  };
}

test("consumer verdict compares retail with factory cost and the fair range", () => {
  const assumptions = defaultAssumptions(59.9, 3.1);
  const waterfall = computeWaterfall(59.9, assumptions);
  const verdict = consumerVerdict(result(), waterfall, assumptions);

  assert.equal(verdict.retailUsd, 59.9);
  assert.equal(verdict.factoryLowUsd, 2.4);
  assert.equal(verdict.factoryHighUsd, 4.1);
  assert.equal(verdict.factorySource, "listing");
  assert.equal(verdict.markupX, 18.4);
  assert.ok(verdict.fairLowUsd !== null && verdict.fairHighUsd !== null);
  assert.ok(verdict.fairHighUsd > verdict.fairLowUsd);
  assert.ok(verdict.fairLowUsd > verdict.landedUsd!);
  assert.equal(verdict.fairness, "extreme");
  assert.equal(verdict.matchCount, null);
  assert.equal(verdict.matchStrength, "unknown");
});

test("a retail price inside the fair range is not flagged", () => {
  const assumptions = defaultAssumptions(15, 3.1);
  const waterfall = computeWaterfall(15, assumptions);
  const verdict = consumerVerdict(
    result({
      product: {
        title: "Neck fan",
        sourceUrl: "https://example.com/p",
        platform: "tiktok",
        retailUsd: 15,
        retailSource: "page",
      },
    }),
    waterfall,
    assumptions,
  );
  assert.equal(verdict.fairness, "fair");
  assert.ok(verdict.premiumX !== null && verdict.premiumX < 1.1);
});

test("missing retail price produces nulls instead of a flattering number", () => {
  const verdict = consumerVerdict(
    result({
      product: {
        title: "Neck fan",
        sourceUrl: "https://example.com/p",
        platform: "tiktok",
        retailUsd: null,
        retailSource: "not found",
      },
    }),
    null,
    null,
  );
  assert.equal(verdict.retailUsd, null);
  assert.equal(verdict.markupX, null);
  assert.equal(verdict.fairLowUsd, null);
  assert.equal(verdict.fairness, "unknown");
});

test("fairness and match thresholds stay explicit", () => {
  assert.equal(fairnessOf(null), "unknown");
  assert.equal(fairnessOf(1.0), "fair");
  assert.equal(fairnessOf(1.4), "above");
  assert.equal(fairnessOf(2.5), "well-above");
  assert.equal(fairnessOf(3.1), "extreme");

  assert.equal(matchStrengthOf(null), "unknown");
  assert.equal(matchStrengthOf(0), "none");
  assert.equal(matchStrengthOf(1), "low");
  assert.equal(matchStrengthOf(3), "medium");
  assert.equal(matchStrengthOf(5), "medium");
  assert.equal(matchStrengthOf(20), "high");
});
