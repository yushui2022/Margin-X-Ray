import assert from "node:assert/strict";
import test from "node:test";
import archive from "../research/creator-products.json";
import assessments from "../research/creator-confidence-assessments.json";
import rubric from "../research/creator-issue-rubric.json";
import sample from "../research/issue-screening-sample.json";
import ledger from "../research/issue-screening-records.json";
import receipt from "../research/issue-screening-receipt.json";

test("the frozen screening batch resolves every target to its market, evidence and search receipt", () => {
  assert.equal(sample.id, ledger.sampleId);
  assert.equal(sample.id, receipt.sampleId);
  assert.equal(sample.rubricVersion, rubric.version);
  assert.equal(sample.windowStart, rubric.windowStart);
  assert.equal(sample.windowEnd, rubric.windowEnd);
  assert.equal(new Set(sample.productIds).size, 21);
  assert.deepEqual(ledger.products.map(p => p.id), sample.productIds);
  assert.deepEqual(Object.keys(receipt.matches).sort(), [...sample.productIds].sort());
  for (const row of ledger.products) {
    const target = archive.products.find(item => item.id === row.id)!;
    const evidence = assessments.products.find(item => item.productId === row.id)!;
    assert.ok(target.sources.includes(evidence.relationshipSource));
    assert.ok(target.sources.includes(evidence.listingSource));
    assert.equal(row.group.startsWith("NL"), target.price.market === "Netherlands");
    const sources = [...ledger.checks[row.group as keyof typeof ledger.checks], ...(row.extra ?? [])];
    assert.ok(sources.every(key => Object.hasOwn(ledger.sources, key)));
    const logged = receipt.matches[row.id as keyof typeof receipt.matches];
    assert.deepEqual(Object.keys(logged).sort(), sources.filter(key => Object.hasOwn(receipt.sources, key)).sort());
  }
});

test("the receipt distinguishes unavailable coverage from a searched source with no matching entries", () => {
  const events = receipt.sources.cosmetics;
  assert.ok(events.exportUpdated > sample.windowStart && events.latestAvailable < sample.windowStart);
  assert.equal(events.inWindow, 0);
  assert.equal(events.firstInWindow, null);
  assert.ok(receipt.sources.eu.inWindow > 0 && receipt.sources.eu.inWindow < receipt.sources.eu.totalRows);
  assert.equal(receipt.matches["nimya-cream"].eu.length, 0);
});
