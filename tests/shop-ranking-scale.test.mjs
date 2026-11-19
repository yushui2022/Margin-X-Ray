import assert from "node:assert/strict";
import test from "node:test";
import { RANKING_SCORE_VERSION, rankingMedianScore, rankingPriceScore, rankingScoreAnchors }
  from "../src/shared/shop-ranking-scale.mjs";

const score = (sourcePrice, peerPrice = 100, allowancePct = 15) =>
  rankingPriceScore({ sourcePrice, peerPrice, allowancePct });

test("parity belongs to both edges of the five-percent band, including fractional benchmark cents", () => {
  assert.equal(RANKING_SCORE_VERSION, "shop-onion-v3");
  for (const [price, reference] of [[95, 100], [100, 100], [105, 100], [19.95, 19], [23.465, 24.7], [1, 1.005]])
    assert.equal(score(price, reference), 50);
  assert.equal(score(94.99), 49);
  assert.equal(score(105.01), 51);
  // This two-shop reference must retain its half-cent when testing parity.
  assert.equal(score(3.16, 3.005), 51);
  assert.equal(score(3.16, 3.01), 50);
});

test("the curve passes through named anchors, interpolates and keeps endpoints attainable", () => {
  assert.deepEqual(rankingScoreAnchors(15),
    [[-50, 0], [-30, 15], [-15, 35], [-5, 50], [5, 50], [20, 65], [35, 75], [100, 90], [200, 100]]);
  for (const [premiumPct, points] of rankingScoreAnchors(15))
    assert.equal(score(100 + premiumPct), points);
  assert.equal(score(1), 0);
  assert.equal(score(50.01), 1);
  assert.equal(score(112.5), 58);
  assert.equal(score(299.99), 99);
  assert.equal(score(1000), 100);
});

test("category and measured spread change the upper curve and preserve the order of all 101 scores", () => {
  assert.deepEqual([5, 10, 15, 25, 35].map(allowance => score(120, 100, allowance)),
    [76, 70, 65, 59, 56]);
  for (const allowance of [5, 10, 15, 22.33, 25, 35]) {
    const anchors = rankingScoreAnchors(allowance);
    assert.ok(anchors.slice(1).every(([pct], i) => pct > anchors[i][0]));
    const covered = new Set();
    let previous = 0;
    for (let cents = 4990; cents <= 30010; cents += 10) {
      const value = score(cents / 100, 100, allowance);
      assert.ok(value >= previous && value <= 100);
      covered.add(value);
      previous = value;
    }
    assert.deepEqual([...covered], Array.from({length: 101}, (_, i) => i));
  }
});

test("missing comparisons and unsupported allowances do not create baseline scores", () => {
  for (const badPrice of [undefined, null, 0, -4, Infinity, NaN, "100"]) {
    assert.equal(rankingPriceScore({sourcePrice: badPrice, peerPrice: 100, allowancePct: 15}), null);
    assert.equal(rankingPriceScore({sourcePrice: 100, peerPrice: badPrice, allowancePct: 15}), null);
  }
  for (const invalid of [null, undefined, 0, 4.9, 36, NaN, Infinity, "15"]) {
    assert.deepEqual(rankingScoreAnchors(invalid), []);
    assert.equal(rankingPriceScore({sourcePrice: 100, peerPrice: 100, allowancePct: invalid}), null);
  }
  assert.equal(rankingPriceScore(null), null);
});

test("the creator median counts real zeroes, rounds halves up and leaves missing samples unrated", () => {
  assert.equal(rankingMedianScore([]), null);
  assert.equal(rankingMedianScore([null, undefined, Infinity, -1, 101]), null);
  assert.equal(rankingMedianScore([null, 0]), 0);
  assert.equal(rankingMedianScore([0, 100, null]), 50);
  const samples = Object.freeze([63, 53, null, 57]);
  assert.equal(rankingMedianScore(samples), 57);
  assert.equal(rankingMedianScore([53, 58]), 56);
});
