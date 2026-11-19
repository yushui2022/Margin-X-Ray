import test from "node:test";
import assert from "node:assert/strict";
import { buildCreatorReport, explainCreatorReport, creatorIssueResult } from "../server/creator-report.mjs";
import rubric from "../research/creator-issue-rubric.json" with { type: "json" };
import { evidenceScoreFor } from "../src/shared/creator-evidence-score.ts";
import samples from "../research/creator-screening.json" with { type: "json" };

const handle = "fixture_only";
const observedAt = "2026-11-19T00:00:00Z";
function collection(id = handle, posts = []) {
  return { profile: { handle: id, name: "Sample account", bio: "", followers: 1000000, url: `https://www.tiktok.com/@${id}` },
    posts, observedAt, provider: "test fixture", warnings: [] };
}
function post(id, caption, user = handle) {
  return { id, caption, url: `https://www.tiktok.com/@${user}/video/${id}`, publishedAt: null };
}

test("new public captions produce traceable leads, independent of formal score and human-selected coverage", () => {
  const original = post("120", "#ad try this sample");
  const live = collection(handle, [original, original, post("121", "#adventure hike"), post("122", "#ad", "other_creator")]);
  const report = buildCreatorReport(handle, live);
  assert.equal(report.posts.length, 2);
  assert.equal(report.score.value, null);
  assert.equal(report.coverage.value, 11);
  assert.equal(report.coverage.points.leads, 0);
  assert.equal(report.leads.length, 1);
  assert.equal(report.leads[0].url, original.url);
  assert.equal(report.leads[0].observedAt, observedAt);
  assert.equal(report.score.version, rubric.version);
  assert.match(report.explanation, /pending/);
  assert.throws(() => buildCreatorReport("different", live), /does not match/);
});

test("repeated observations preserve every seed coverage total and dated archive evidence", () => {
  for (const sample of samples.creators) {
    const originalPosts = sample.status === "sampled" ? sample.posts : [];
    const result = buildCreatorReport(sample.handle, collection(sample.handle, originalPosts));
    assert.equal(result.coverage.value, evidenceScoreFor(sample.handle).total, sample.handle);
  }
  const nik = buildCreatorReport("nikkietutorials", collection("nikkietutorials"));
  assert.equal(nik.coverage.productCount, 3);
  assert.equal(nik.screenings.length, 3);
  assert.ok(nik.screenings.every(item => item.sources.length && item.checkedAt === "2026-11-18"));
  assert.ok(nik.coverage.archivedSources.some(source => source.observedAt === "2026-11-17"));
});

test("an eligible review can rate an unseeded handle and link each source; invalid admission remains pending", () => {
  const source = { label: "Fixture primary source", url: "https://example.test/evidence", observedAt: rubric.windowEnd };
  const review = { handle, version: rubric.version, windowStart: rubric.windowStart, windowEnd: rubric.windowEnd,
    reviewedAt: rubric.windowEnd, selectionMethod: "All fixture products in the sample", complete: true,
    products: [1, 2, 3].map(id => ({ id: String(id), name: "Fixture " + id, variant: "1 set", creatorLink: source,
      reviewSources: [source], reviewNote: "Inspected fictional product record", issues: [], outcome: "no-documented-issue" })) };
  const archive = { version: rubric.version, reviews: [review] };
  assert.equal(creatorIssueResult(handle, archive).value, 0);
  assert.equal(creatorIssueResult("other", archive).status, "pending");
  review.products[1].outcome = "documented-issue";
  review.products[1].issues.push({ id: "fictitious-issue", status: "confirmed", occurredAt: rubric.windowEnd, severity: "serious",
    assessment: "Fixture assessment", kind: "recall", source });
  const score = creatorIssueResult(handle, archive);
  assert.deepEqual([score.value, score.frequency, score.severity, score.reviewed, score.affected], [30.8, 23.3, 7.5, 3, 1]);
  assert.deepEqual(score.sources, [source]);
  assert.deepEqual(creatorIssueResult(handle, { ...archive, reviews: [review, review] }).sources, []);
  review.products[1].issues = null;
  assert.equal(creatorIssueResult(handle, archive).status, "pending");
});

test("optional model can select explanations; it never receives raw captions or determines the score", async () => {
  const report = buildCreatorReport(handle, collection(handle, [post("123", "#ad UntrustedTextFromPost")]));
  assert.equal(await explainCreatorReport(report), report.explanation);
  const options = { apiKey: "fixture-token", model: "fixture-model", baseUrl: "https://example.test/v1" };
  const respond = (facts, checkRequest = () => {}) => async (url, opts) => {
    checkRequest(url, opts);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ facts }) } }] });
  };
  const valid = await explainCreatorReport(report, { ...options, fetchImpl: respond(["coverage","leads"], (url, opts) => {
    assert.equal(url.href, "https://example.test/v1/chat/completions");
    assert.equal(opts.redirect, "error");
    assert.ok(!opts.body.includes("UntrustedTextFromPost"));
    assert.ok(!opts.body.includes(handle));
  }) });
  assert.match(valid, /Onion Score is pending/);
  assert.match(valid, /10\.5\/100 under evidence-v3/);
  assert.match(valid, /1 post for product follow-up/);
  for (const fetchImpl of [respond(["Invented score 99"]), respond(["__proto__"]), async () => { throw Error("Provider offline"); },
    async () => new Response("invalid upstream data"), async () => new Response("x".repeat(40000))]) {
    assert.equal(await explainCreatorReport(report, { ...options, fetchImpl }), report.explanation);
  }
  assert.equal(report.score.value, null);
});
