import test from "node:test";
import assert from "node:assert/strict";
import { assessPrice, type SupplierObservation } from "../src/shared/price-comparison";
import { archivedAssessment, markupRecord } from "../src/shared/markup-records";

const retail = { units: 10, amount: 30, market: "US", currency: "USD", observedAt: "2026-11-18", url: "https://retail.example/item" };
function offer(id: string, patch: Partial<SupplierObservation> = {}): SupplierObservation {
  return { ...retail, amount: 24, units: 24, supplierId: id, label: id, match: "same", note: "", url: `https://${id}.example/box`, ...patch };
}

test("three independent Winco quotes span both sides of the cutoff", () => {
  const result = archivedAssessment(markupRecord("winco-msp-4p")!);
  assert.equal(result.status, "mixed");
  assert.equal(result.sources.length, 3);
  assert.equal(result.min, 5.82 / 2.99);
  assert.equal(result.max, 5.82 / 1.58);
  assert.equal(archivedAssessment(markupRecord("feastables-king")!).status, "single");
  assert.equal(archivedAssessment(markupRecord("nikkie-biodance-mist")!).status, "pending");
});

test("a repeated supplier, a retail self-comparison and older tiers cannot corroborate a price gap", () => {
  const quotes = [offer("one"), offer("one", { amount: 12, observedAt: "2026-11-17" }), offer("alias", { url: "https://www.one.example/other" }), offer("shop", { url: retail.url })];
  assert.equal(assessPrice(retail, quotes).status, "single");
  assert.equal(assessPrice(retail, [...quotes, offer("two")]).status, "high");
  assert.equal(assessPrice(retail, [offer("one", { amount: 48 }), offer("two", { amount: 72 })]).status, "below");
});

test("incompatible offers never contribute to the range, including invalid and out-of-window dates", () => {
  const invalid = [{currency:"EUR"}, {market:"CA"}, {match:"similar"}, {amount:null}, {units:0}, {observedAt:"2026-02-30"}, {observedAt:"2026-10-18"}];
  const result = assessPrice(retail, invalid.map(p => offer("other", p)));
  assert.equal(result.status, "pending");
  assert.equal(result.excluded.length, invalid.length);
  assert.equal(assessPrice(retail, [offer("limit", {observedAt:"2026-10-19"})]).status, "single");
});
