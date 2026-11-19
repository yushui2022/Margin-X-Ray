import test from "node:test";
import assert from "node:assert/strict";
import {
  assessRetailComparison, creatorPremium, retailComparison, retailFamilyId, summarizePremium,
  type ConsumerOffer, type RetailCase
} from "../src/shared/retail-premium";

const asOf = "2026-11-18";
const base = retailComparison("kylie-matte", asOf)!;

function example(family: string, amount: number, alternativeAmount = 10, sku = family): RetailCase {
  return {
    ...base, productId: family + "/" + sku, familyId: family, handle: "test",
    reference: { ...base.reference, amount, sku, shipping: 0 },
    alternative: { ...base.alternative, amount: alternativeAmount, sku, shipping: 0 },
  };
}

test("source-backed retail totals are distinct from creator sale attribution", () => {
  const sony = retailComparison("arun-sony", asOf)!;
  assert.equal(sony.status, "delivered");
  assert.equal(sony.delta, 1.01);
  assert.equal(sony.relation, "retail-reference");
  assert.equal(creatorPremium(sony.handle, asOf).matched, 0);
  assert.equal(base.status, "delivered");
  assert.equal(base.delta, 8.95);
  assert.equal(base.reference.amount, base.alternative.amount);
  assert.equal(base.reference.sku, "4064941008675");
  assert.match(base.reference.url, /48399747481842/);
  assert.equal(base.relation, "founder-store");
  const index = creatorPremium(base.handle, asOf);
  assert.equal(index.identified, 3);
  assert.equal(index.matched, 3);
  assert.equal(index.medianPremium, 25.6);
  assert.equal(index.value, 20.4);
  assert.ok(index.selection?.includes("Oregon"));
  const haus = retailComparison("haus-bronzer", asOf)!;
  assert.equal(haus.status, "item-only");
  assert.equal(haus.delta, 0);
  assert.equal(creatorPremium(haus.handle, asOf).matched, 0);
  assert.equal(retailComparison("unresearched", asOf), undefined);
});

test("both stock and exact comparable consumer units are required", () => {
  for (const change of [
    { kind: "supplier" }, { seller: base.reference.seller }, { url: base.reference.url }, { url: "unknown" },
    { sku: "different" }, { quantity: 2 }, { market: "Chicago" }, { currency: "GBP" },
    { amount: 0.001 }, { amount: 0 }, { amount: NaN }, { available: null }, { available: false }, { shipping: -1 },
  ] satisfies Partial<ConsumerOffer>[]) {
    const row = assessRetailComparison({ ...base, alternative: { ...base.alternative, ...change } }, asOf);
    assert.equal(row.status, "unavailable", JSON.stringify(change));
    assert.equal(row.delta, null);
    assert.equal(row.premiumPercent, null);
  }
});

test("unknown charges allow a labeled item-price result with no delivered-price premium", () => {
  for (const change of [{ shipping: null }, { taxIncluded: null }]) {
    const partial = assessRetailComparison({ ...base, alternative: { ...base.alternative, ...change } }, asOf);
    assert.equal(partial.status, "item-only");
    assert.equal(partial.delta, 0);
    assert.equal(summarizePremium(base.handle, [], [partial]).matched, 0);
  }
  assert.equal(assessRetailComparison({ ...base, alternative: { ...base.alternative, taxIncluded: false } }, asOf).status, "unavailable");
});

test("future, invalid, out-of-window or staggered observations cannot contribute savings", () => {
  const checkDate = (observedAt: string) => assessRetailComparison({ ...base, reference: { ...base.reference, observedAt } }, asOf);
  assert.equal(checkDate("2026-11-19").status, "unavailable");
  assert.equal(checkDate("2026-02-31").status, "unavailable");
  assert.equal(checkDate("2026-11-11").status, "delivered");
  assert.equal(checkDate("2026-11-10").status, "stale");
  assert.equal(assessRetailComparison(base, "2026-12-18").status, "delivered");
  const stale = assessRetailComparison(base, "2026-12-19");
  assert.equal(stale.status, "stale");
  assert.equal(stale.delta, null);
  const index = creatorPremium(base.handle, "2026-12-19");
  assert.equal(index.matched, 0);
  assert.equal(index.identified, 3);
  assert.equal(index.value, null);
});

test("equal, more expensive and cheaper offers retain their sign in minor units", () => {
  assert.equal(assessRetailComparison(example("a", 0.3, 0.2), asOf).delta, 0.1);
  assert.equal(assessRetailComparison(example("a", 0.2, 0.3), asOf).delta, -0.1);
  assert.equal(assessRetailComparison(example("a", 0.2, 0.2), asOf).delta, 0);
});

test("coverage and medians give one vote to each distinct family", () => {
  const compare = (family: string, amount: number, sku?: string) => assessRetailComparison(example(family, amount, 10, sku), asOf);
  const records = [
    compare("a", 50, "small"), compare("a", 10, "small"), compare("a", 20, "large"),
    compare("b", 13), compare("c", 9),
  ];
  const index = summarizePremium("test", ["a", "d", "d"], records);
  assert.deepEqual(index, {
    version: "retail-premium-v1", minimum: 3, matched: 3, identified: 4,
    includedProductIds: ["a/large", "a/small", "b/b", "c/c"], medianPremium: 30, value: 23.1,
  });
  assert.deepEqual(summarizePremium("test", ["d"], [...records].reverse()), index);
  const lower = summarizePremium("test", [], ["a", "b", "c"].map(id => compare(id, 9)));
  assert.equal(lower.value, 0);
  assert.equal(lower.medianPremium, -10);
  const under = summarizePremium("test", [], records.slice(0, -1));
  assert.equal(under.matched, 2);
  assert.equal(under.value, null);
  assert.equal(summarizePremium("test", [], [{ ...records[0]!, sourceUrl: "" }]).matched, 0);
  assert.equal(retailFamilyId("feastables-standard"), retailFamilyId("feastables-king"));
  assert.equal(retailFamilyId("constructor"), "constructor");
});
