import assert from "node:assert/strict";
import test from "node:test";
import { shopOnionVerdict, shopOnionVersionForReport, SHOP_ONION_SCALE } from "../src/shared/shop-onion.mjs";
import { completeShoppingCheck } from "../server/shopping-check.mjs";

const v1 = (report) => shopOnionVerdict(report, { version: "shop-onion-v1" });
const id = (n) => String(1700000000000000000n + BigInt(n));
const url = (productId, skuId) =>
  "https://shop.tiktok.com/us/pdp/" + productId + (skuId ? "?sku_id=" + skuId : "");
const title =
  "Marvel Spider-Man, Spidey and His Amazing Friends, NASCAR & Transformers Pit Stop Tool Bench Playset";
const edition = "Spidey and His Amazing Friends";
function original(price = 59.99, n = 1) {
  return {
    productId: id(n),
    sellerId: id(100 + n),
    seller: "World Tech Toys 2.0",
    market: "US",
    brand: "Marvel",
    name: title,
    listingUrl: url(id(n)),
    variants: [{ skuId: id(500 + n), variant: edition, available: true, price, currency: "USD" }],
  };
}
function shopOffer(price, n = 10, match = "candidate") {
  return {
    skuId: id(500 + n),
    url: url(id(n), id(500 + n)),
    sellerId: id(100 + n),
    seller: "Other shop " + n,
    name: "Marvel Spider-Man | Spidey and His Amazing Friends | Team NASCAR Pit Stop Tool Bench Playset",
    variant: edition + " Tool Bench Playset",
    price,
    currency: "USD",
    available: true,
    match,
    verifiedShop: true,
  };
}
function checkFor(productIndex, source, offers, exact) {
  return {
    productIndex,
    variantIndex: 0,
    status: exact ? "compared" : "candidates",
    offers,
    comparison: exact
      ? {
          basis: "item",
          sourcePrice: source.variants[0].price,
          alternativePrice: exact.price,
          alternativeUrl: exact.url,
          currency: "USD",
        }
      : null,
  };
}
function report(commerce, checks) {
  return { scope: "tiktok-shop", market: "US", commerce, checks };
}

test("a pre-score TikHub snapshot uses the edition matched across two shops as a reference", () => {
  const source = original(),
    peer = shopOffer(49.95);
  const old = report([source], [checkFor(0, source, [peer])]);
  const result = v1(old);
  assert.equal(result.version, "shop-onion-v1");
  assert.deepEqual(
    [result.basis, result.score, result.scoredCount, result.linkedCount],
    ["similar", 20, 1, 1],
  );
  assert.ok(Math.abs(result.premiumPct - 20.1001) < 0.0001);
  assert.equal(result.items[0].peerUrl, peer.url);
  assert.equal(result.items[0].peerPrice, 49.95);
  assert.equal(old.checks[0].comparison, null);
});

test("a typical similar-product price uses one quote per shop before taking the median", () => {
  const source = original(40);
  const lower = shopOffer(20),
    duplicate = { ...shopOffer(10, 11), sellerId: lower.sellerId };
  const higher = shopOffer(30, 12);
  const r = v1(report([source], [checkFor(0, source, [lower, duplicate, higher])]));
  assert.equal(r.items[0].peerPrice, 20);
  assert.equal(r.items[0].peerCount, 2);
  assert.equal(r.items[0].peerUrl, "");
  assert.equal(r.items[0].peerSeller, "");
  assert.deepEqual(
    r.items[0].peers.map((p) => p.price),
    [10, 30],
  );
  assert.equal(r.score, 100);
});

test("similar matches require compatible product forms and distinguishing options, even when names overlap", () => {
  const source = original(),
    peer = shopOffer(40);
  const reject = (s, p) => {
    const val = v1(report([s], [checkFor(0, s, [p])]));
    assert.equal(val.score, null);
    assert.equal(val.premiumPct, null);
    assert.equal(val.basis, "none");
  };
  for (const changed of [
    { name: "Marvel Spider-Man video game for PlayStation", variant: "PS4 Video Games" },
    { name: "Marvel Spider-Man video game", variant: peer.variant },
    { name: peer.name + " 2-pack" },
    { variant: "Another Character Tool Bench Playset" },
    { available: null },
    { name: "Refurbished " + peer.name },
    { condition: "used" },
    { verifiedShop: false },
    { sellerId: source.sellerId },
    { price: 0 },
    { currency: "GBP" },
    { url: "https://brand.example.com/pdp/123456789" },
    { url: "https://shop.tiktok.com/uk/pdp/" + id(10) + "?sku_id=" + peer.skuId },
  ])
    reject(source, { ...peer, ...changed });
  for (const option of ["Black", "Sapphire", "One Size", "Marvel", "Default Title", "SKU 12", ""]) {
    const s = original();
    s.variants[0].variant = option;
    reject(s, { ...peer, variant: option });
  }
  reject({ ...source, name: "Open-box " + source.name }, peer);
  const unknownStock = original();
  unknownStock.variants[0].available = null;
  reject(unknownStock, peer);
  const s = original();
  s.variants[0].variant = "Without stand Black";
  reject(s, { ...peer, variant: "With stand Black" });
});

test("an eligible verified SKU uses the lowest exact in-stock shop price before cheaper similar candidates", () => {
  const s = original(35),
    best = shopOffer(20, 10, "exact"),
    next = shopOffer(25, 20, "exact");
  const c = checkFor(
    0,
    s,
    [shopOffer(5), { ...shopOffer(3, 11, "exact"), available: false }, next, best],
    best,
  );
  const scored = v1(report([s], [c]));
  assert.equal(scored.score, 75);
  assert.equal(scored.basis, "exact");
  assert.equal(scored.items[0].peerPrice, 20);
  assert.equal(scored.items[0].peerCount, 2);
  assert.equal(scored.items[0].peerUrl, best.url);
  // Earlier snapshots without the scope/score fields can qualify only with all native exact-match evidence.
  const old = { market: "US", commerce: [s], checks: [c] };
  assert.equal(v1(old).score, 75);
  for (const comparison of [
    { ...c.comparison, basis: "delivered" },
    { ...c.comparison, sourcePrice: 20 },
    { ...c.comparison, alternativePrice: next.price, alternativeUrl: next.url },
  ]) {
    assert.equal(v1(report([s], [{ ...c, comparison }])).score, null);
  }
});

test("no score differs from a verified zero, and signed percentages survive the 0–100 cap", () => {
  for (const [price, score, pct] of [
    [0.3, 50, 50],
    [20, 0, 0],
    [10, 0, -50],
    [60, 100, 200],
  ]) {
    const s = original(price),
      p = shopOffer(price === 0.3 ? 0.2 : 20, 10, "exact");
    const val = v1(report([s], [checkFor(0, s, [p], p)]));
    assert.equal(val.score, score);
    assert.equal(val.premiumPct, pct);
  }
  for (const malformed of [
    null,
    undefined,
    {},
    { scope: "other", market: "US", commerce: [original()] },
    report([null, {}], [null, {}]),
    report([original()], [{ productIndex: 0, variantIndex: 3 }]),
  ]) {
    const v = v1(malformed);
    assert.equal(v.score, null);
    assert.equal(v.premiumPct, null);
  }
});

test("profile summary uses the median signed premium before the scale cap and counts distinct linked products", () => {
  const s = original(60, 1),
    t = original(10, 2),
    unmatched = original(10, 3);
  const exact = shopOffer(20, 10, "exact"),
    similar = shopOffer(20);
  const c = checkFor(0, s, [exact], exact);
  const val = v1(report([s, t, unmatched, s], [checkFor(3, s, [similar]), c, checkFor(1, t, [similar]), c]));
  assert.equal(val.basis, "mixed");
  assert.equal(val.premiumPct, 75);
  assert.equal(val.score, 75);
  assert.equal(val.scoredCount, 2);
  assert.equal(val.linkedCount, 3);
  assert.equal(val.items.filter((item) => item.basis === "exact").length, 1);
});

test("finishing an ordinary shopping report persists the same versioned score returned for saved snapshots", async () => {
  const s = original(),
    p = shopOffer(49.95);
  const completed = await completeShoppingCheck(
    { ...report([s], []), steps: [], products: [], listedProducts: [] },
    { market: "US" },
    { compare: async () => checkFor(0, s, [p]) },
  );
  assert.equal(completed.methodVersion, "tikhub-shop-v3.1");
  assert.equal(completed.shopOnion.version, "shop-onion-v3");
  assert.equal(completed.shopOnion.score, 65);
  assert.match(completed.shopOnion.decision.steps[2].detail, /within 5%.*50.*65\/100/);
  assert.deepEqual(completed.shopOnion, shopOnionVerdict(completed));
  assert.equal(completed.checks[0].comparison, null);
});

function current(source, offers, exact, extras = {}) {
  return shopOnionVerdict({ ...report([source], [checkFor(0, source, offers, exact)]), ...extras });
}

test("v2 preserves the recorded Spider-Man price gap and explains the decision on its priced edition", () => {
  const source = original(),
    peer = shopOffer(49.95);
  const snapshot = report([source], [checkFor(0, source, [peer])]);
  const v = shopOnionVerdict(snapshot);
  assert.equal(v.version, "shop-onion-v2");
  assert.equal(v.score, 9);
  assert.equal(v.items[0].decision.context.category, "general");
  assert.equal(v.decision.confidence, "low");
  assert.equal(v.decision.context.allowancePct, 15);
  assert.ok(Math.abs(v.decision.context.upperPrice - 57.4425) < 1e-7);
  assert.ok(Math.abs(v.decision.context.excessPct - 4.43487) < 1e-5);
  assert.ok(Math.abs(v.premiumPct - 20.1001) < 1e-4);
  assert.equal(v.decision.action, "Wait for a closer match");
  assert.deepEqual(
    v.decision.steps.map((s) => s.label),
    ["Match", "Context", "Grade", "Action"],
  );
  assert.equal(
    shopOnionVersionForReport({ ...snapshot, methodVersion: "tikhub-shop-v1.1" }),
    "shop-onion-v1",
  );
  assert.equal(shopOnionVersionForReport({ ...snapshot, methodVersion: "tikhub-shop-v2" }), "shop-onion-v2");
  assert.equal(shopOnionVersionForReport({}), "shop-onion-v2");
  assert.equal(
    shopOnionVersionForReport({ methodVersion: "tikhub-shop-v2", shopOnion: { version: "shop-onion-v1" } }),
    "shop-onion-v1",
  );
  const frozen = v1(snapshot);
  assert.equal(frozen.score, 20);
  assert.equal(frozen.decision, undefined);
  assert.deepEqual(v1({ ...snapshot, shopOnion: v }), frozen);
});

test("v2 uses a 5% same-SKU band and interpolates the excess curve at its anchors and between them", () => {
  const peer = shopOffer(100, 10, "exact");
  for (const [excess, score] of [...SHOP_ONION_SCALE, [5, 10], [20, 33], [200, 89], [900, 100]]) {
    const v = current(original(105 * (1 + excess / 100)), [peer], peer);
    assert.equal(v.score, score, "excess " + excess);
  }
  for (const [price, state] of [
    [85, "below"],
    [100, "equal"],
    [105, "within"],
    [105.01, "above"],
  ]) {
    const v = current(original(price), [peer], peer);
    assert.equal(v.decision.state, state);
    assert.equal(v.decision.confidence, "medium");
    assert.equal(v.decision.context.baseAllowancePct, 5);
    assert.equal(v.score, 0);
    assert.equal(v.decision.context.upperPrice, 105);
  }
});

test("only one quote per distinct store can widen the upper edge, at most ten points above baseline", () => {
  const p = shopOffer(100, 10, "exact"),
    other = shopOffer(140, 20, "exact");
  const duplicate = { ...shopOffer(200, 30, "exact"), sellerId: p.sellerId };
  const a = current(original(130), [p, duplicate], p);
  assert.equal(a.decision.context.allowancePct, 5);
  assert.equal(a.decision.context.highPeerPrice, 100);
  assert.equal(a.decision.context.peerCount, 1);
  const b = current(original(130), [p, duplicate, other], p);
  assert.equal(b.decision.context.allowancePct, 15);
  assert.equal(b.decision.context.lowPeerPrice, 100);
  assert.equal(b.decision.context.highPeerPrice, 140);
  assert.equal(b.decision.confidence, "high");
  assert.equal(b.items[0].peers.length, 2);
  assert.equal(b.decision.context.spreadAllowancePct, 10);
});

test("editorial contexts require specific matching measurements or material/edition evidence", () => {
  const source = original(120);
  const p = shopOffer(100);
  const build = (name, variant, material) => {
    const a = { ...source, name, material, variants: [{ ...source.variants[0], variant }] };
    const b = { ...p, name, variant, material };
    return current(a, [b]);
  };
  const measured = build("USB Battery Charger", "65 watts");
  assert.equal(measured.decision.context.category, "measured");
  assert.equal(measured.decision.context.baseAllowancePct, 10);
  const wood = build("Walnut Wood Rocking Chair", "Ocean Breeze", "solid walnut");
  assert.equal(wood.decision.context.category, "variable");
  assert.equal(wood.decision.context.baseAllowancePct, 25);
  const limited = build("Numbered Edition Marvel Playset", "Spidey and His Amazing Friends");
  assert.equal(limited.decision.context.category, "variable");
  const marketing = build("Premium Luxury Marvel Playset", "Spidey and His Amazing Friends");
  assert.equal(marketing.decision.context.category, "general");
  assert.equal(marketing.decision.context.baseAllowancePct, 15);
});

test("contradictory warranties, materials, and buy-get terms remove an exact or similar peer with an explicit reason", () => {
  for (const [left, right, pattern] of [
    [{ material: "solid wood" }, { material: "MDF" }, /solid wood.*MDF/i],
    [{ warranty: "2 years" }, { warranty: "12 months" }, /24 months.*12/],
    [{ name: title + " (buy one get one free)" }, {}, /buy 1 get 1/],
    [{ packQuantity: 2 }, { packQuantity: 3 }, /2 versus 3/],
  ])
    for (const match of ["exact", "candidate"]) {
      const s = { ...original(), ...left };
      const peer = { ...shopOffer(30, 10, match), ...right };
      const obj = current(s, [peer], match === "exact" ? peer : null);
      assert.equal(obj.score, null);
      assert.equal(obj.decision.confidence, "insufficient");
      assert.match(obj.decision.reason, pattern);
      assert.match(obj.productDecisions[0].decision.steps[0].detail, pattern);
      assert.equal(obj.decision.context, null);
    }
});

test("v2 profile aggregates item scores separately from observed premiums and reports only its sampled coverage", () => {
  const s = original(210),
    t = original(90, 2),
    noPeer = original(50, 3),
    p = shopOffer(100, 10, "exact");
  const snapshot = {
    ...report([s, t, noPeer], [checkFor(0, s, [p], p), checkFor(1, t, [p], p)]),
    kind: "profile",
  };
  const v = shopOnionVerdict(snapshot);
  assert.equal(v.items[0].score, 75);
  assert.equal(v.items[1].score, 0);
  assert.equal(v.score, 38);
  assert.equal(v.premiumPct, 50);
  assert.equal(v.decision.state, "sample");
  assert.equal(v.decision.confidence, "low");
  assert.equal(v.decision.context, null);
  assert.equal(v.productDecisions.length, 3);
  assert.equal(v.productDecisions[2].decision.state, "unrated");
  assert.match(v.decision.reason, /2 products scored out of 3/);
});
