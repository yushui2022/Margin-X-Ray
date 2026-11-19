import assert from "node:assert/strict";
import test from "node:test";
import { creatorHref, shoppingRankingHref } from "../src/shared/shopping-links";
import { exactCreator, searchCreators } from "../src/web/shopping-creator-search";

test("a verified display name and flexible handle spellings reach the same current shop report", () => {
  const handle = "all_the_jazzy_things";
  for (const query of ["  ＠ALL_THE_JAZZY_THINGS  ", "all the jazzy things", "Jazzy.liveseller", "jazzy liveseller"]) {
    const result = exactCreator(query);
    assert.equal(result?.handle, handle);
    assert.equal(result.href, shoppingRankingHref(handle));
    assert.equal(result.score, 63);
    assert.equal(result.hasCheck, true);
    assert.ok(result.avatar);
    assert.equal(searchCreators(query)[0]?.handle, handle);
  }
  assert.equal(exactCreator(" @MR.MOJO.BLACK ")?.handle, "mr.mojo.black");
  assert.equal(exactCreator("j a n e t")?.handle, "janet.r.p");
});

test("directory-only profiles and unscored checks use their own routes and have no price score", () => {
  const profile = exactCreator("Rose");
  assert.equal(profile?.href, creatorHref("roses_are_rosie"));
  assert.equal(profile.name, "Rosé");
  assert.equal(profile.hasCheck, false);
  assert.equal(profile.score, null);
  const overlapping = searchCreators("@kallmekris").filter(row => row.handle === "kallmekris");
  assert.equal(overlapping.length, 1);
  assert.equal(overlapping[0].href, shoppingRankingHref("kallmekris"));
  assert.equal(overlapping[0].hasCheck, true);
  assert.equal(overlapping[0].score, null);
});

test("partial names and ambiguous exact names offer choices without auto-selecting a person", () => {
  const names = searchCreators("Mariana").map(row => row.handle);
  assert.ok(names.includes("marianamiamorch"));
  assert.ok(names.includes("marianapalaciios"));
  assert.equal(exactCreator("Mariana"), undefined);
  assert.ok(searchCreators("jazz").some(row => row.handle === "all_the_jazzy_things"));
  assert.equal(exactCreator("jazz"), undefined);
  for (const value of ["", " @ ",".","https://www.tiktok.com/@kallmekris","@mr.mojo.black?region=gb","not-a-real-archived-name-777"]) {
    assert.deepEqual(searchCreators(value), []);
    assert.equal(exactCreator(value), undefined);
  }
});

test("a single letter opens results while the full literal display name can select its profile", () => {
  assert.ok(searchCreators("a").length > 1);
  assert.equal(exactCreator("a"), undefined);
  assert.equal(exactCreator(" ＋ａ ")?.handle, "maisa");
  assert.equal(searchCreators("+A")[0]?.handle, "maisa");
});
