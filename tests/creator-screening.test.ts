import test from "node:test";
import assert from "node:assert/strict";
import profiles from "../assets/creators/sources.json";
import screening from "../research/creator-screening.json";
import captionReviews from "../research/creator-caption-reviews.json";
import brandLeads from "../research/creator-brand-leads.json";
import { brandLeadsFor, screeningFor, screeningLabel, SCREENING_TOTALS } from "../src/shared/creator-screening";

test("every directory account has a dated, identity-matched public sampling outcome", () => {
  assert.equal(screening.creators.length, 500);
  assert.deepEqual(new Set(screening.creators.map((record) => record.handle)), new Set(profiles.map((profile) => profile.handle)));
  const postIds = new Set<string>();
  for (const record of screening.creators) {
    assert.equal(record.sourceUrl, `https://www.tiktok.com/embed/@${record.handle}`);
    assert.equal(record.observedAt, screening.observedAt);
    assert.ok(Number.isFinite(Date.parse(record.retrievedAt)));
    assert.equal(record.retrievedAt.slice(0, 10), record.observedAt);
    assert.ok(record.access);
    if (record.status === "sampled") {
      assert.equal(record.platformHandle, record.handle);
      assert.equal(record.httpStatus, 200);
      assert.equal(record.error, null);
      assert.match(record.sha256!, /^[a-f0-9]{64}$/);
    } else {
      assert.equal(record.status, "unavailable");
      assert.ok(record.error);
      assert.equal(record.posts.length, 0);
      assert.equal(record.platformHandle, null);
    }
    for (const post of record.posts) {
      assert.match(post.id, /^\d+$/);
      assert.equal(post.url, `https://www.tiktok.com/@${record.handle}/video/${post.id}`);
      assert.ok(!postIds.has(post.id), `Duplicate or misattributed post ${post.id}`);
      postIds.add(post.id);
      assert.equal(post.publishedAt, null, "Do not infer publication dates from post IDs");
      assert.deepEqual(Object.keys(post).sort(), ["caption", "id", "publishedAt", "triageCues", "url"]);
      assert.doesNotMatch(post.caption, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    }
    assert.doesNotMatch(record.bio, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  }
  assert.equal(SCREENING_TOTALS.posts, postIds.size);
  assert.equal(SCREENING_TOTALS.sampled + SCREENING_TOTALS.unavailable, 500);
});

test("manually selected leads resolve to exact source captions, never to automatic keyword matches", () => {
  const reviewIds = new Set<string>();
  for (const review of captionReviews.reviews) {
    const id = `${review.handle}/${review.postId}`;
    assert.ok(!reviewIds.has(id), `Repeated review ${id}`);
    reviewIds.add(id);
    const record = screeningFor(review.handle);
    const post = record?.posts.find((item) => item.id === review.postId);
    assert.ok(post, `Missing caption ${id}`);
    const lead = brandLeadsFor(review.handle).find((item) => item.url === post.url);
    assert.ok(lead);
    assert.equal(lead.excerpt, post.caption);
    assert.equal(lead.observedAt, record!.observedAt);
    assert.ok(lead.note && lead.title);
    assert.ok(!("price" in lead));
  }
  for (const lead of brandLeads.leads) {
    assert.ok(screeningFor(lead.handle));
    assert.equal(new URL(lead.url).protocol, "https:");
    assert.ok(lead.excerpt && lead.access && lead.note);
    assert.equal(lead.observedAt, screening.observedAt);
  }
  assert.equal(profiles.reduce((total, profile) => total + brandLeadsFor(profile.handle).length, 0), captionReviews.reviews.length + brandLeads.leads.length);
});

test("sampling status preserves failed access and does not create scores or earnings", () => {
  assert.equal(screeningLabel("unknown-account"), "Research not started");
  for (const record of screening.creators) {
    const label = screeningLabel(record.handle);
    assert.equal(label, record.status === "sampled" ? `${record.posts.length} public posts sampled` : "Public sample unavailable");
    assert.ok(!("score" in record));
    assert.ok(!("earnings" in record));
    assert.equal(profiles.find((profile) => profile.handle === record.handle)!.score, null);
  }
});
