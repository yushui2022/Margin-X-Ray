import test from "node:test";
import assert from "node:assert/strict";
import { brandScenario, commissionScenario, scenarioNumber } from "../src/shared/creator-economics";
import research from "../research/creator-products.json";
import profiles from "../assets/creators/sources.json";

test("scenario inputs preserve unknown values and reject invalid amounts", () => {
  for (const input of ["", "  ", "invalid", "NaN", "Infinity", "1e309", "-1"]) assert.equal(scenarioNumber(input), null);
  assert.equal(scenarioNumber("0"), 0);
  assert.equal(scenarioNumber(" 27.99 "), 27.99);
});

test("affiliate commission is gross income on the supplied eligible base", () => {
  assert.equal(commissionScenario(50, 15), 7.5);
  assert.equal(commissionScenario(50, 0), 0);
  assert.equal(commissionScenario(0, 15), 0);
  assert.equal(commissionScenario(50, 100), 50);
  for (const [base, rate] of [[null, 15], [50, null], [50, -1], [50, 101], [-1, 15], [Infinity, 15], [50, NaN]]) {
    assert.equal(commissionScenario(base!, rate!), null);
  }
});

test("brand scenarios distinguish gross margin, contribution and loss", () => {
  assert.deepEqual(brandScenario(40, 10, 6), { gross: 30, contribution: 24, grossMarginPct: 75, contributionMarginPct: 60 });
  assert.deepEqual(brandScenario(10, 12, 3), { gross: -2, contribution: -5, grossMarginPct: -20, contributionMarginPct: -50 });
  assert.deepEqual(brandScenario(0, 12, 3), { gross: -12, contribution: -15, grossMarginPct: null, contributionMarginPct: null });
  for (const inputs of [[40, null, 0], [40, 10, null], [null, 10, 2], [40, -1, 2], [40, 1, Infinity], [NaN, 1, 2], [0, Number.MAX_VALUE, Number.MAX_VALUE]]) {
    assert.equal(brandScenario(inputs[0]!, inputs[1]!, inputs[2]!), null);
  }
});

test("collected products retain traceable sources without factual earnings claims", () => {
  const sources = new Set(research.sources.map((source) => source.id));
  assert.equal(sources.size, research.sources.length);
  assert.equal(new Set(research.products.map((product) => product.id)).size, research.products.length);
  assert.equal(new Set(research.creators.map((creator) => creator.handle)).size, research.creators.length);
  const checkSources = (ids: string[]) => {
    assert.ok(ids.length > 0);
    for (const id of ids) assert.ok(sources.has(id), `Missing source: ${id}`);
  };
  for (const source of research.sources) {
    assert.equal(new URL(source.url).protocol, "https:");
    assert.ok(source.excerpt && source.access);
  }
  for (const creator of research.creators) {
    assert.ok(profiles.some((item) => item.handle === creator.handle), `Missing profile for ${creator.handle}`);
    assert.ok(research.products.some((item) => item.handle === creator.handle));
    checkSources(creator.brandSources);
    for (const lead of creator.leads) checkSources(lead.sources);
  }
  for (const product of research.products) {
    assert.ok(profiles.some((profile) => profile.handle === product.handle));
    assert.ok(research.creators.some((creator) => creator.handle === product.handle));
    assert.ok(["third-party", "founder-brand", "collaboration"].includes(product.kind));
    assert.ok(["USD", "EUR"].includes(product.price.currency));
    assert.ok(Number.isFinite(product.price.amount) && product.price.amount > 0);
    assert.ok(product.price.conditions && product.price.market && product.confidence && product.shopStatus);
    checkSources(product.sources);
    if (product.kind === "third-party") assert.ok(product.postUrl);
  }
  for (const [key, value] of Object.entries(research.unknownEconomics)) {
    if (key !== "appliesTo") assert.equal(value, null, `Unsubstantiated economics: ${key}`);
  }
  assert.ok(!research.products.some((product) => /missha/i.test(product.name)), "Unresolved SKU must not become a priced product");
  assert.ok(research.products.filter((product) => product.handle === "glamzilla").every((product) => product.kind !== "founder-brand"));
});
