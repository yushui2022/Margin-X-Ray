import test from "node:test";
import assert from "node:assert/strict";
import { confidencePoints, confidenceFor, confidenceRank, CONFIDENCE_SCORES, type ConfidenceInput } from "../src/shared/creator-confidence";
import { PUBLIC_CREATORS, directoryPage } from "../src/shared/creator-directory";
import { onionScore } from "../src/shared/onion-index";
import data from "../research/creator-products.json";
import assessments from "../research/creator-confidence-assessments.json";

const input: ConfidenceInput = { matchedSample: true, coverage: 62.3, completeReview: true, products: [
  { id: "one", relationship: "direct-primary", listing: "indexed-primary", corroboration: "product-line" },
  { id: "two", relationship: "direct-primary", listing: "direct-primary", corroboration: "none" },
  { id: "three", relationship: "direct-primary", listing: "direct-primary", corroboration: "none" },
] };

test("confidence uses weakest source provenance, capped coverage and reviewed cross-checks", () => {
  assert.deepEqual(confidencePoints(input), { sources: 34.7, coverage: 24.9, corroboration: 3.3, total: 62.9 });
  assert.deepEqual(confidencePoints({ ...input, products: [...input.products, input.products[0]!] }), confidencePoints(input), "Duplicate product IDs add no confidence");
  const best = confidencePoints({ ...input, coverage: 100, products: [{ id: "x", relationship: "direct-primary", listing: "direct-primary", corroboration: "exact-offer" }] })!;
  assert.equal(best.total, 100);
  const secondary = confidencePoints({ ...input, products: [{ id: "x", relationship: "secondary", listing: "direct-primary", corroboration: "none" }] })!;
  assert.equal(secondary.sources, 12);
  assert.equal(secondary.corroboration, 0, "Two sources do not automatically prove corroboration");
});

test("incomplete or unreviewed research has no numeric Onion Score", () => {
  for (const override of [{ matchedSample: false }, { completeReview: false }, { products: [] }, { coverage: NaN }, { coverage: -1 }, { coverage: 101 }]) {
    assert.equal(confidencePoints({ ...input, ...override }), null);
  }
  for (const creator of PUBLIC_CREATORS) {
    const report = confidenceFor(creator.handle)!;
    if (!report.points) {
      assert.equal(confidenceRank(creator.handle), null);
      assert.equal(onionScore(CONFIDENCE_SCORES.get(creator.handle)), null);
    }
  }
});

test("all accepted products have explicit traceable assessments and reconciled report totals", () => {
  assert.equal(assessments.products.length, data.products.length);
  assert.equal(new Set(assessments.products.map(item => item.productId)).size, data.products.length);
  assert.equal(CONFIDENCE_SCORES.size, 12);
  for (const creator of PUBLIC_CREATORS) {
    const report = confidenceFor(creator.handle)!;
    for (const item of report.reviewed) {
      assert.ok(item.product.sources.includes(item.relationship.id));
      assert.ok(item.product.sources.includes(item.listing.id));
      assert.ok(item.review.note.length > 30);
      if (item.review.corroboration === "product-line") {
        assert.equal(item.review.relationshipProvenance, "direct-primary");
        assert.match(item.relationship.url, /tiktok\.com/);
        assert.ok(!item.listing.url.includes("tiktok.com"));
      }
    }
    if (report.points) {
      const { sources, coverage, corroboration, total } = report.points;
      assert.equal(Math.round(sources * 10) + Math.round(coverage * 10) + Math.round(corroboration * 10), Math.round(total * 10));
      assert.equal(onionScore(total)!.value, total);
      assert.equal(confidenceRank(creator.handle), 1 + [...CONFIDENCE_SCORES.values()].filter(score => score > total).length);
    }
  }
});

test("confidence ranking has stable ties, pending last in both directions, and global ranks survive filters", () => {
  const profiles = PUBLIC_CREATORS.slice(0, 4);
  const scores = new Map([[profiles[0]!.handle, 0], [profiles[1]!.handle, 50], [profiles[2]!.handle, 50]]);
  for (const sort of ["confidence", "confidence-low"] as const) {
    const page = directoryPage({ query: "", category: "All", sort, page: 1, confidenceScores: scores }, profiles);
    assert.equal(page.items.at(-1)!.handle, profiles[3]!.handle);
    assert.equal(page.items[sort === "confidence" ? 2 : 0]!.handle, profiles[0]!.handle);
    const tied = page.items.filter(item => scores.get(item.handle) === 50);
    assert.deepEqual(tied, [...tied].sort((a, b) => a.name.localeCompare(b.name) || a.handle.localeCompare(b.handle)));
  }
  const rank = confidenceRank("nikkietutorials");
  const filtered = directoryPage({ query: "nikkie", category: "All", sort: "confidence", page: 1, confidenceScores: CONFIDENCE_SCORES });
  assert.equal(filtered.items.length, 1);
  assert.equal(confidenceRank(filtered.items[0]!.handle), rank);
});
