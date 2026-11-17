import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onionIndex, ONION_BANDS, UNRATED_ONION } from "../src/shared/onion-index";

test("rotten index is the rounded down-vote share with exact visual boundaries", () => {
  for (const [down, expected] of [[0, "fresh"], [199, "fresh"], [200, "spotted"], [399, "spotted"], [400, "bruised"], [599, "bruised"], [600, "spoiled"], [799, "spoiled"], [800, "rotten"], [1000, "rotten"]] as const) {
    const result = onionIndex(1000 - down, down)!;
    assert.equal(result.band.id, expected);
    assert.equal(result.value, down / 10);
  }
  assert.equal(onionIndex(2, 1)!.value, 33.3);
  assert.equal(onionIndex(1, 2)!.value, 66.7);
  assert.equal(onionIndex(1, 0)!.value, 0);
  assert.equal(onionIndex(0, 1)!.value, 100);
  assert.equal(onionIndex(8005, 1995)!.band.id, "spotted", "Band follows the displayed rounded value of 20.0");
});

test("unknown and invalid votes never become a fresh or rotten judgment", () => {
  for (const [up, down] of [[0, 0], [-1, 2], [2.5, 1], [NaN, 1], [Infinity, 0], [Number.MAX_SAFE_INTEGER, 1]]) assert.equal(onionIndex(up!, down!), null);
  assert.equal(onionIndex(3, 1)!.early, true);
  assert.equal(onionIndex(4, 1)!.early, false);
  assert.equal(onionIndex(3, 2)!.total, 5);
});

test("every onion state uses a distinct local scalable illustration", () => {
  const files = [...ONION_BANDS, UNRATED_ONION].map(band => band.image);
  assert.equal(new Set(files).size, 6);
  const illustrations = files.map(file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  assert.equal(new Set(illustrations).size, 6);
  for (const svg of illustrations) {
    assert.match(svg, /viewBox="0 0 96 104"/);
    assert.doesNotMatch(svg, /<script|https?:\/\/(?!www.w3.org)/);
  }
});
