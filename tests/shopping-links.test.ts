import test from "node:test";
import assert from "node:assert/strict";
import { pastedShoppingDestination, productForListing, shoppingDestination } from "../src/shared/shopping-links";
import { retailComparison } from "../src/shared/retail-premium";

test("shopping search distinguishes a video, a creator and a product name", () => {
  assert.equal(shoppingDestination("https://m.tiktok.com/@nasa?lang=en"), "#shop/profile?url=https%3A%2F%2Fwww.tiktok.com%2F%40nasa");
  assert.match(shoppingDestination("https://www.tiktok.com/@nasa/video/7665075736742530317")!, /^#shop\/video\?url=/);
  assert.match(shoppingDestination("https://vm.tiktok.com/ZExample/")!, /^#shop\/video\?url=/);
  assert.equal(shoppingDestination("Feastables"), "#shop/search?q=Feastables");
  assert.equal(shoppingDestination("@off_directory"), "#shop/profile?url=https%3A%2F%2Fwww.tiktok.com%2F%40off_directory");
  assert.equal(shoppingDestination("https://www.tiktok.com/explore"), null);
  for (const url of ["https://www.tiktok.com/view/product/1234567890?sku_id=110011",
    "https://www.tiktok.com/shop/pdp/1234567890", "https://shop.tiktok.com/uk/pdp/example/1234567890"]) {
    assert.equal(shoppingDestination(url), "#shop/site?" + new URLSearchParams({ url }));
  }
  assert.equal(shoppingDestination("example.store"), "#shop/site?url=https%3A%2F%2Fexample.store%2F");
  assert.equal(shoppingDestination("https://example.com/products/unknown?variant=1"),
    "#shop/site?url=https%3A%2F%2Fexample.com%2Fproducts%2Funknown%3Fvariant%3D1");
});

test("same-product tracking parameters work without collapsing variants or markets", () => {
  const sony = retailComparison("arun-sony")!;
  assert.equal(pastedShoppingDestination(sony.alternative.url), "#shop/site?" + new URLSearchParams({ url: sony.alternative.url }));
  assert.match(pastedShoppingDestination("Sony WF-1000XM6")!, /^#shop\//);
  assert.equal(shoppingDestination(sony.alternative.url + "?utm_source=example"), "#shop/product/arun-sony");
  assert.equal(shoppingDestination("https://electronics.sony.com/audio/headphones/truly-wireless-earbuds/p/wf1000xm6-s"), "#shop/product/arun-sony?from=archive");
  assert.equal(productForListing("https://www.amazon.com/title/dp/B001VZEPBS/ref=share?tag=sale&ref_=share"), "winco-msp-4p");
  assert.equal(productForListing("https://www.amazon.co.uk/dp/B001VZEPBS"), undefined);
  assert.equal(productForListing("https://www.amazon.com/dp/B001VZEPBS?th=2"), undefined);
  assert.equal(productForListing("https://kyliecosmetics.com/products/matte-lip-kit?variant=43927621632242"), undefined);
  assert.equal(productForListing("https://kyliecosmetics.com/products/velvet-lip-kit?variant=44109989216498"), undefined);
  assert.equal(productForListing("https://kyliecosmetics.com/products/matte-lip-kit?variant=48399747481842"), "kylie-matte");
  assert.equal(shoppingDestination("javascript:alert(1)"), null);
  assert.equal(shoppingDestination("https://user:pass@a.example/products/foo"), null);
});
