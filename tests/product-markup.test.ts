import assert from "node:assert/strict";
import test from "node:test";
import { markupHref, markupRecord, supplierForBarcode } from "../src/shared/markup-records";
import { compareUnitPrices } from "../src/shared/product-markup";
import { storefrontOffers } from "../src/shared/storefront-offer";

test("price gaps normalize both packs and use an inclusive threshold before display rounding", () => {
  const bars = compareUnitPrices(29.99, 10, 154.2, 24);
  assert.ok(bars && !bars.high);
  assert.equal(bars.multiple.toFixed(3), "0.467");
  assert.equal(bars.spread.toFixed(3), "-3.426");
  assert.equal(compareUnitPrices(0.3, 1, 0.2, 2)?.high, true);
  assert.equal(compareUnitPrices(2.9999, 1, 1, 1)?.high, false);
  for (const bad of [0, NaN, Infinity, -1, 1.5]) assert.equal(compareUnitPrices(10, bad, 1, 1), null);
  assert.equal(compareUnitPrices(10, 1, 0, 80), null);
});

test("quote lookup preserves the retail variant, currency and missing wholesale amounts", () => {
  const winco = markupRecord("winco-msp-4p")!;
  assert.equal(markupHref(winco.listing.url + "?utm_source=shop"), "#markup/winco-msp-4p");
  assert.equal(markupHref(winco.listing.alias!), "#markup/winco-msp-4p");
  assert.match(markupHref(winco.listing.url + "?variant=other"), /^#markup\/item\?/);
  assert.equal(supplierForBarcode("00812944006815", "USD"), winco.quote);
  assert.equal(supplierForBarcode("812944006815", "EUR"), undefined);
  assert.equal(markupRecord("nikkie-biodance-mist")?.quote?.quoteAmount, null);
});

test("storefront matches price, currency and barcode on the requested in-stock variant", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.endsWith(".js") ? {
    variants: [{ id: 2, barcode: "812944006815" }, { id: 1, barcode: "8809891186570" }],
  } : { title: "Set", offers: [
    { offer_id: 1, title: "Small", price: 1, currency_code: "EUR", in_stock: true },
    { offer_id: 2, title: "Large", price: 5.82, currency_code: "USD", in_stock: true },
    { offer_id: 3, title: "Box", price: 8, currency_code: "USD", in_stock: false },
  ] }));
  const url = "https://store.example/products/utensils";
  assert.deepEqual(await storefrontOffers(url + "?variant=2"), [{ id: "2", title: "Set · Large", price: 5.82, currency: "USD", barcode: "812944006815" }]);
  assert.deepEqual(await storefrontOffers(url + "?variant=3"), []);
  assert.deepEqual(await storefrontOffers(url + "?selling_plan=20"), []);
});
