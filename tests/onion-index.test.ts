import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onionScore, ONION_BANDS, UNRATED_ONION } from "../src/shared/onion-index";

test("one problem score becomes more rotten at higher boundaries", () => {
  for (const [value, expected] of [[0, "fresh"], [19.9, "fresh"], [20, "spotted"], [39.9, "spotted"], [40, "bruised"], [59.9, "bruised"], [60, "spoiled"], [79.9, "spoiled"], [80, "rotten"], [100, "rotten"]] as const) {
    const result = onionScore(value)!;
    assert.equal(result.band.id, expected);
    assert.equal(result.value, value);
  }
  assert.equal(onionScore(62.9)!.value, 62.9);
  assert.equal(onionScore(79.96)!.band.id, "rotten", "Band follows the displayed rounded value of 80.0");
});

test("pending and invalid scores stay neutral; a reviewed zero remains a real score", () => {
  for (const confidence of [null, undefined, -1, 100.1, NaN, Infinity]) assert.equal(onionScore(confidence), null);
  assert.equal(onionScore(0)!.value, 0);
  assert.equal(onionScore(100)!.value, 100);
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
