import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_CREATORS, DIRECTORY_PAGE_SIZE, directoryPage } from "../src/shared/creator-directory";
import research from "../research/creator-products.json";

const defaults = { query: "", category: "All", sort: "followers" as const, page: 1 };

test("launch directory has 500 unique sourced accounts with valid local portraits", () => {
  assert.equal(PUBLIC_CREATORS.length, 500);
  assert.equal(new Set(PUBLIC_CREATORS.map((item) => item.handle)).size, 500);
  for (const item of PUBLIC_CREATORS) {
    assert.match(item.handle, /^[a-z0-9_][a-z0-9_.]{0,23}$/);
    assert.ok(!item.handle.endsWith("."));
    assert.ok(item.name && item.initials && item.note && item.retrievedAt);
    assert.equal(new URL(item.source).protocol, "https:");
    assert.equal(new URL(item.imageUrl).protocol, "https:");
    assert.equal(item.score, null);
    assert.equal(item.reviewStatus, "not-reviewed");
    const bytes = readFileSync(new URL(`../${item.image}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
    if (item.followers != null) {
      assert.ok(item.followers >= 1_000_000);
      assert.ok(item.followersLabel && item.followersObservedAt && item.followersNote);
      assert.equal(new URL(item.followersSource!).protocol, "https:");
    }
    if (item.collection === "launch-seed") assert.ok(item.sourceRank && item.profileSource && item.sourceCategory);
  }
});

test("pagination visits the complete directory exactly once", () => {
  const first = directoryPage(defaults);
  assert.equal(first.total, 500);
  assert.equal(first.items.length, DIRECTORY_PAGE_SIZE);
  const handles = [];
  for (let page = 1; page <= first.pageCount; page++) {
    const result = directoryPage({ ...defaults, page });
    handles.push(...result.items.map((item) => item.handle));
    assert.equal(result.start, (page - 1) * DIRECTORY_PAGE_SIZE);
  }
  assert.equal(new Set(handles).size, 500);
  assert.equal(handles.length, 500);
  assert.equal(directoryPage({ ...defaults, page: 999 }).page, first.pageCount);
  assert.equal(directoryPage({ ...defaults, page: -1 }).page, 1);
});

test("directory search is case-insensitive and combines category and coverage filters", () => {
  assert.ok(directoryPage({ ...defaults, query: " @MRBEAST " }).items.some((item) => item.handle === "mrbeast"));
  assert.ok(directoryPage({ ...defaults, query: "Mikayla" }).items.some((item) => item.handle === "mikaylanogueira"));
  const handles = new Set(research.products.map((item) => item.handle));
  assert.equal(directoryPage({ ...defaults, productHandles: handles }).total, handles.size);
  assert.ok(directoryPage({ ...defaults, query: "@mrbeast", productHandles: handles }).items.some((item) => item.handle === "mrbeast"));
  const result = directoryPage({ ...defaults, category: "Tech", productHandles: handles });
  assert.deepEqual(result.items.map((item) => item.handle), ["mrwhosetheboss"]);
  const empty = directoryPage({ ...defaults, query: "no-match-!@#$", page: 25 });
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.pageCount, 1);
  assert.deepEqual(empty.items, []);
});

test("follower order keeps unknown counts last and name order is stable", () => {
  const fixtures = PUBLIC_CREATORS.slice(0, 3).map((item, i) => ({ ...item, handle: `test${i}`, name: ["Zed", "Ann", "Ann"][i]!, followers: [null, 0, 10][i] }));
  assert.deepEqual(directoryPage(defaults, fixtures).items.map((item) => item.handle), ["test2", "test1", "test0"]);
  assert.deepEqual(directoryPage({ ...defaults, sort: "name" }, fixtures).items.map((item) => item.handle), ["test1", "test2", "test0"]);
});
