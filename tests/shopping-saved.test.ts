import assert from "node:assert/strict";
import test from "node:test";
import { tikTokCheckRoute } from "../src/web/shopping-job";
import { savedShoppingMatches } from "../src/web/shopping-saved";

function lookup(input: string) {
  const [path, query] = tikTokCheckRoute(input)!.slice(5).split("?");
  return savedShoppingMatches(path!, new URLSearchParams(query));
}

test("static lookup binds a saved post to its creator and exact product receipt", () => {
  const handle = "all_the_jazzy_things";
  const profile = "https://www.tiktok.com/@" + handle;
  const post = profile + "/video/7690794903432924447";
  const creatorPage = "#shop/rankings/" + handle;
  assert.equal(lookup("@" + handle)[0]?.href, creatorPage);
  assert.equal(lookup(post)[0]?.href, creatorPage + "?product=1731739658644197489");
  assert.deepEqual(lookup(post.replace(handle, "bethannyyyy")), []);
  assert.deepEqual(lookup("https://vm.tiktok.com/ZExample/"), []);
});

test("a directory-only profile URL opens its archived profile and never substitutes a similar handle", () => {
  assert.equal(lookup("https://www.tiktok.com/@mrbeast")[0]?.href, "#creator/%40mrbeast");
  assert.deepEqual(lookup("https://www.tiktok.com/@all.the.jazzy.things"), []);
});

test("static listing lookup respects the receipt SKU, market and explicit product ID", () => {
  const url = "https://shop.tiktok.com/us/pdp/1731739658644197489?sku_id=1731739783067308145";
  const rows = lookup(url);
  assert.ok(rows.length > 1);
  assert.ok(rows.every(row => row.href.endsWith("?product=1731739658644197489")));
  for (const other of [url.replace("/us/", "/gb/"), url + "&region=GB", url + "&skuId=10000000000",
    url.replace("1731739783067308145", "10000000000"), url + "&product_id=10000000000"]) {
    assert.deepEqual(lookup(other), []);
  }
});
