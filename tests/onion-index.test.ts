import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onionIndex, ONION_BANDS, UNRATED_ONION } from "../src/shared/onion-index";

test("rotten index is inverse evidence confidence with exact visual boundaries", () => {
  for (const [value, expected] of [[0, "fresh"], [19.9, "fresh"], [20, "spotted"], [39.9, "spotted"], [40, "bruised"], [59.9, "bruised"], [60, "spoiled"], [79.9, "spoiled"], [80, "rotten"], [100, "rotten"]] as const) {
    const result = onionIndex(100 - value)!;
    assert.equal(result.band.id, expected);
    assert.equal(result.value, value);
  }
  assert.equal(onionIndex(62.9)!.value, 37.1);
  assert.equal(onionIndex(80.04)!.band.id, "spotted", "Band follows the displayed rounded value of 20.0");
});

test("pending and invalid confidence stay neutral; eligible zero remains a real score", () => {
  for (const confidence of [null, undefined, -1, 100.1, NaN, Infinity]) assert.equal(onionIndex(confidence), null);
  assert.equal(onionIndex(0)!.value, 100);
  assert.equal(onionIndex(100)!.value, 0);
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
