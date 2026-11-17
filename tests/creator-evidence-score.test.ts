import test from "node:test";
import assert from "node:assert/strict";
import { evidencePoints, evidenceScoreFor, EVIDENCE_SCORES, coveragePoints, type EvidenceInput } from "../src/shared/creator-evidence-score";
import { directoryPage, PUBLIC_CREATORS } from "../src/shared/creator-directory";
import { brandLeadsFor, screeningFor } from "../src/shared/creator-screening";
import research from "../research/creator-products.json";

const empty: EvidenceInput = { matchedSample: false, captionIds: [], commercialUrls: [], products: [] };

test("granular evidence rubric deduplicates records and posts, caps volume, and reserves financial proof", () => {
  assert.equal(evidencePoints(empty).total, 0);
  assert.equal(evidencePoints({ ...empty, matchedSample: true, captionIds: ["1", "1", "", "2"] }).total, 11);
  const full = { matchedSample: true, captionIds: Array.from({ length: 20 }, (_, i) => String(i)), commercialUrls: ["a", "b", "c", "d"], products: research.products };
  const capped = evidencePoints(full);
  assert.equal(capped.total, 80);
  assert.equal(capped.compensation + capped.costs, 0);
  const product = research.products.find(product => product.postUrl)!;
  const one = { ...empty, commercialUrls: ["a"], products: [product] };
  assert.equal(evidencePoints(one).total, 18.7, "Unavailable TikTok access must not discard independent evidence");
  assert.deepEqual(evidencePoints({ ...one, commercialUrls: ["a", "a"], products: [product, product] }), evidencePoints(one));
  assert.equal(evidencePoints({ ...one, products: [product, { ...product, id: "other-variant" }] }).linkage, 3.3, "Two variants from one post only earn one linkage award");
  assert.equal(evidencePoints({ ...empty, captionIds: ["1", "2"] }).captions, 0, "Mismatched accounts cannot earn sampling points");
});

test("missing product metadata earns no corresponding points and unknown condition notes are only documentation", () => {
  const product = research.products[0]!;
  const incomplete = { ...product, variant: "", price: { ...product.price, amount: 0, market: "", conditions: "" } };
  const result = evidencePoints({ ...empty, products: [incomplete] });
  assert.equal(result.products, 3.3);
  assert.equal(result.variants + result.prices + result.context, 0);
  assert.equal(evidencePoints({ ...empty, products: [{ ...product, sources: ["unresolved-source"] }] }).total, 0);
  assert.equal(evidencePoints({ ...empty, products: [{ ...product, price: { ...product.price, amount: Number.NaN } }] }).prices, 0);
  const unknown = evidencePoints({ ...empty, products: [{ ...product, price: { ...product.price, conditions: "Shipping, tax and stock unknown." } }] });
  assert.equal(unknown.context, 1.7);
  assert.equal(unknown.compensation + unknown.costs, 0);
});

test("fractional coverage is monotonic, capped and derived from counts rather than artificial variation", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(n => coveragePoints(n, 4, 15)), [0, 3.8, 7.5, 11.3, 15, 15]);
  assert.deepEqual([0, 1, 2, 3, 4].map(n => coveragePoints(n, 3, 10)), [0, 3.3, 6.7, 10, 10]);
  assert.equal(evidenceScoreFor("nikkietutorials")!.total, 62.3);
  assert.ok([...EVIDENCE_SCORES.values()].some(value => value % 1 !== 0));
});

test("all 500 scores reconcile to dated source evidence and preserve unknown trust ratings", () => {
  assert.equal(EVIDENCE_SCORES.size, 500);
  for (const profile of PUBLIC_CREATORS) {
    const result = evidenceScoreFor(profile.handle)!;
    const sample = screeningFor(profile.handle)!;
    assert.ok(Number.isFinite(result.total) && result.total >= 0 && result.total <= 80);
    assert.equal(result.total, Math.round(result.dimensions.reduce((sum, dimension) => sum + dimension.points, 0) * 10) / 10);
    assert.equal(result.observedAt, sample.observedAt);
    assert.equal(result.dimensions.length, 10);
    assert.equal(result.dimensions.reduce((sum, dimension) => sum + dimension.maximum, 0), 100);
    assert.equal(Math.round(result.groups.reduce((sum, group) => sum + group.points, 0) * 10) / 10, result.total);
    assert.equal(result.identity, sample.status === "sampled" && sample.platformHandle === profile.handle && sample.posts.some(post => post.caption.trim()) ? 10 : 0);
    assert.equal(result.captions, result.identity ? Math.min(20, new Set(sample.posts.filter(post => post.caption.trim()).map(post => post.id)).size) / 2 : 0);
    assert.equal(result.leads, Math.round(Math.min(4, new Set(brandLeadsFor(profile.handle).map(lead => lead.url)).size) * 37.5) / 10);
    assert.equal(result.prices, Math.round(Math.min(3, research.products.filter(product => product.handle === profile.handle).length) * 100 / 3) / 10);
    assert.equal(result.compensation + result.costs, 0);
    assert.equal(profile.score, null, "Research coverage is not a verified transparency rating");
    for (const dimension of result.dimensions) {
      assert.ok(dimension.points >= 0 && dimension.points <= dimension.maximum);
      if (dimension.points > 0) assert.ok(dimension.sources.length);
      for (const source of dimension.sources) assert.equal(new URL(source.url).protocol, "https:");
    }
  }
  assert.equal(evidenceScoreFor("not-in-directory"), undefined);
  assert.equal(evidenceScoreFor("yahia_x")!.total, 0);
});

test("evidence ranking sorts numbers, preserves zero, and resolves ties without followers", () => {
  const fixtures = PUBLIC_CREATORS.slice(0, 3).map((profile, i) => ({ ...profile, handle: `test${i}`, name: ["Zed", "Ann", "Bee"][i]!, followers: [999999999, 1, 500][i] }));
  const scores = new Map([["test0", 0], ["test1", 50], ["test2", 50]]);
  const options = { query: "", category: "All", sort: "evidence" as const, page: 1, evidenceScores: scores };
  assert.deepEqual(directoryPage(options, fixtures).items.map(profile => profile.handle), ["test1", "test2", "test0"]);
  assert.deepEqual(directoryPage({ ...options, sort: "evidence-low" }, fixtures).items.map(profile => profile.handle), ["test0", "test1", "test2"]);
  assert.deepEqual(directoryPage(options, fixtures.map(profile => ({ ...profile, followers: 0 }))).items.map(profile => profile.handle), ["test1", "test2", "test0"]);
  const all = [];
  for (let page = 1; page <= 25; page++) all.push(...directoryPage({ ...options, evidenceScores: EVIDENCE_SCORES, page }).items);
  assert.equal(new Set(all.map(profile => profile.handle)).size, 500);
  for (let i = 1; i < all.length; i++) assert.ok(EVIDENCE_SCORES.get(all[i - 1]!.handle)! >= EVIDENCE_SCORES.get(all[i]!.handle)!);
});
