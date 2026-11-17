import test from "node:test";
import assert from "node:assert/strict";
import { issuePoints, ISSUE_RUBRIC, ISSUE_VERSION, ISSUE_SCORES, issueFor, issueRank, type CreatorIssueReview, type ProductIssue } from "../src/shared/creator-issues";
import { PUBLIC_CREATORS, directoryPage } from "../src/shared/creator-directory";
import { onionScore } from "../src/shared/onion-index";

const source = { label: "Fictional primary source", url: "https://example.test/document", observedAt: "2026-11-17" };
function sample(): CreatorIssueReview {
  return { handle: "fictional", version: ISSUE_VERSION, windowStart: ISSUE_RUBRIC.windowStart, windowEnd: ISSUE_RUBRIC.windowEnd, reviewedAt: "2026-11-17", complete: true, selectionMethod: "All three distinct products in the fictional sample", products: [0, 1, 2].map(id => ({ id: `product-${id}`, name: `Fictional product ${id}`, variant: "Reviewed model A", creatorLink: source, reviewSources: [source], outcome: "no-documented-issue", reviewNote: "Fictional completed primary-source check; no documented issue in this sample.", issues: [] })) };
}
function addIssue(review: CreatorIssueReview, index: number, severity: ProductIssue["severity"]) {
  review.products[index]!.outcome = "documented-issue";
  review.products[index]!.issues.push({ id: `issue-${index}`, status: "confirmed", occurredAt: "2026-10-01", severity, assessment: "Fictional source-reviewed severity assessment for the exact model.", kind: "recall", source });
}

test("problem frequency and severity score reviewed products, not confidence or votes", () => {
  const review = sample();
  assert.deepEqual(issuePoints(review), { total: 0, frequency: 0, severity: 0, affected: 0, reviewed: 3 });
  addIssue(review, 0, "serious");
  assert.deepEqual(issuePoints(review), { total: 30.8, frequency: 23.3, severity: 7.5, affected: 1, reviewed: 3 });
  const first = issuePoints(review)!.total;
  review.products[0]!.issues.push({ ...review.products[0]!.issues[0]! });
  assert.equal(issuePoints(review)!.total, first, "Repeating the same problem cannot inflate the score");
  addIssue(review, 1, "serious");
  assert.ok(issuePoints(review)!.total > first, "Problems across more products increase the score");
  addIssue(review, 2, "critical");
  assert.equal(issuePoints(review)!.total, 95);
  for (const product of review.products) for (const issue of product.issues) issue.severity = "critical";
  assert.equal(issuePoints(review)!.total, 100);
  assert.equal(onionScore(issuePoints(review)!.total)!.band.id, "rotten");
});

test("missing, disputed, insufficient, mismatched and undated reviews stay pending", () => {
  const mutations: ((review: CreatorIssueReview) => void)[] = [
    r => { r.complete = false; }, r => { r.version = "wrong"; }, r => { r.windowStart = "2020-01-01"; },
    r => { r.selectionMethod = ""; }, r => { r.products.pop(); }, r => { r.products[1]!.id = r.products[0]!.id; },
    r => { r.products[0]!.outcome = "unresolved"; }, r => { r.products[0]!.reviewSources = []; },
    r => { r.products[0]!.creatorLink = { ...source, url: "javascript:alert(1)" }; },
    r => { r.products[0]!.reviewNote = ""; }, r => { r.products[0]!.variant = ""; },
    r => { addIssue(r, 0, "minor"); r.products[0]!.issues[0]!.status = "alleged"; },
    r => { addIssue(r, 0, "minor"); r.products[0]!.issues[0]!.status = "disputed"; },
    r => { addIssue(r, 0, "minor"); r.products[0]!.issues[0]!.occurredAt = "2024-10-01"; },
    r => { addIssue(r, 0, "minor"); r.products[0]!.issues[0]!.occurredAt = "2026-02-30"; },
    r => { addIssue(r, 0, "minor"); r.products[0]!.issues[0]!.assessment = ""; },
    r => { addIssue(r, 0, "minor"); r.products[0]!.issues[0]!.source = { ...source, observedAt: "2025-01-01" }; },
    r => { addIssue(r, 0, "minor"); r.products[0]!.outcome = "no-documented-issue"; },
    r => { r.products[0]!.outcome = "documented-issue"; },
  ];
  assert.equal(issuePoints(undefined), null);
  for (const mutate of mutations) { const review = sample(); mutate(review); assert.equal(issuePoints(review), null); }
});

test("existing listing and caption research never becomes a product-problem allegation", () => {
  assert.equal(ISSUE_SCORES.size, 0);
  for (const creator of PUBLIC_CREATORS) {
    assert.equal(issueFor(creator.handle)!.points, null);
    assert.equal(issueRank(creator.handle), null);
    assert.equal(onionScore(ISSUE_SCORES.get(creator.handle)), null);
  }
});

test("highest problem scores rank first, with pending after reviewed zero in either direction", () => {
  const profiles = PUBLIC_CREATORS.slice(0, 4);
  const issueScores = new Map([[profiles[0]!.handle, 0], [profiles[1]!.handle, 80], [profiles[2]!.handle, 30.8]]);
  const options = { query: "", category: "All", page: 1, issueScores };
  const high = directoryPage({ ...options, sort: "issues" }, profiles);
  assert.deepEqual(high.items.map(item => item.handle), [profiles[1]!.handle, profiles[2]!.handle, profiles[0]!.handle, profiles[3]!.handle]);
  const low = directoryPage({ ...options, sort: "issues-low" }, profiles);
  assert.deepEqual(low.items.map(item => item.handle), [profiles[0]!.handle, profiles[2]!.handle, profiles[1]!.handle, profiles[3]!.handle]);
});
