import test from "node:test";
import assert from "node:assert/strict";
import { evidencePoints, evidenceScoreFor, EVIDENCE_SCORES } from "../src/shared/creator-evidence-score";
import { directoryPage, PUBLIC_CREATORS } from "../src/shared/creator-directory";
import { brandLeadsFor, screeningFor } from "../src/shared/creator-screening";
import research from "../research/creator-products.json";

test("evidence rubric counts distinct sources, caps volume, and never assumes financial proof", () => {
  assert.deepEqual(evidencePoints({ hasPublicSample: false, commercialUrls: [], productIds: [] }), { sample: 0, commercial: 0, prices: 0, financial: 0, total: 0 });
  assert.equal(evidencePoints({ hasPublicSample: true, commercialUrls: [], productIds: [] }).total, 20);
  assert.equal(evidencePoints({ hasPublicSample: true, commercialUrls: ["a", "a"], productIds: ["p", "p"] }).total, 45);
  const capped = evidencePoints({ hasPublicSample: true, commercialUrls: ["a", "b", "c", "d"], productIds: ["p", "q", "r"] });
  assert.equal(capped.total, 80);
  assert.equal(capped.financial, 0);
  assert.equal(evidencePoints({ hasPublicSample: false, commercialUrls: ["a"], productIds: ["p"] }).total, 25, "Unavailable TikTok access must not discard independent evidence");
});

test("all 500 scores reconcile to dated source evidence and preserve unknown trust ratings", () => {
  assert.equal(EVIDENCE_SCORES.size, 500);
  for (const profile of PUBLIC_CREATORS) {
    const result = evidenceScoreFor(profile.handle)!;
    const sample = screeningFor(profile.handle)!;
    assert.ok(Number.isInteger(result.total) && result.total >= 0 && result.total <= 80);
    assert.equal(result.total, result.dimensions.reduce((sum, dimension) => sum + dimension.points, 0));
    assert.equal(result.observedAt, sample.observedAt);
    assert.equal(result.sample, sample.status === "sampled" && sample.posts.length ? 20 : 0);
    assert.equal(result.commercial, Math.min(3, new Set(brandLeadsFor(profile.handle).map(lead => lead.url)).size) * 10);
    assert.equal(result.prices, Math.min(2, research.products.filter(product => product.handle === profile.handle).length) * 15);
    assert.equal(result.financial, 0);
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
