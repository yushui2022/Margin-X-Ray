import test from "node:test";
import assert from "node:assert/strict";
import {
  justOneAPIErrorMessage,
  parseJustOneAPIResponse,
} from "../src/shared/justoneapi";

test("JustOneAPI image search maps listings to supply offers", () => {
  const result = parseJustOneAPIResponse({
    code: 0,
    message: "",
    data: {
      total: 42,
      result: [
        {
          offerId: "623456789012",
          title: "挂脖风扇 半导体制冷 跨境专供",
          companyName: "慈溪市某某电器有限公司",
          location: "浙江 宁波",
          priceRange: [
            [2, "15.00"],
            [100, "12.50"],
            [1000, "10.80"],
          ],
          isFactory: true,
          verifiedSupplier: "true",
          sales: "3200",
          detailUrl: "https://detail.1688.com/offer/623456789012.html",
        },
        {
          offerId: "623456789013",
          title: "无价商品",
          companyName: "义乌市某某贸易有限公司",
        },
      ],
    },
  });

  assert.equal(result.scanned, 42);
  assert.equal(result.offers.length, 1);
  const offer = result.offers[0]!;
  assert.equal(offer.provider, "justoneapi");
  assert.equal(offer.id, "justoneapi:623456789012");
  assert.equal(offer.companyName, "慈溪市某某电器有限公司");
  assert.equal(offer.location, "浙江 宁波");
  assert.deepEqual(offer.tiers, [
    { moq: 2, unitCny: 15 },
    { moq: 100, unitCny: 12.5 },
    { moq: 1000, unitCny: 10.8 },
  ]);
  assert.equal(offer.factoryFlag, true);
  assert.equal(offer.verifiedFlag, true);
  assert.equal(offer.sales, 3200);
  assert.equal(offer.detailUrl, "https://detail.1688.com/offer/623456789012.html");
});

test("JustOneAPI rows with a flat price and MOQ still produce one tier", () => {
  const result = parseJustOneAPIResponse({
    code: 0,
    data: {
      items: [
        {
          productId: 123,
          subject: "硅胶辅食碗",
          supplierName: "东莞市某某硅胶制品厂",
          city: "东莞",
          priceInfo: { price: "8.8" },
          moq: "50",
        },
      ],
    },
  });

  assert.equal(result.scanned, 1);
  assert.deepEqual(result.offers[0]?.tiers, [{ moq: 50, unitCny: 8.8 }]);
  assert.equal(result.offers[0]?.id, "justoneapi:123");
});

test("JustOneAPI business errors surface the reason", () => {
  assert.throws(
    () => parseJustOneAPIResponse({ code: 100, message: "TOKEN INVALID/UNACTIVATE", data: null }),
    /rejected the token or the token is inactive/i,
  );
  assert.throws(
    () => parseJustOneAPIResponse({ code: 601, data: null }),
    /balance is insufficient/i,
  );
  assert.match(justOneAPIErrorMessage(303), /daily quota/i);
  assert.match(justOneAPIErrorMessage(999), /code 999/);
});

test("JustOneAPI ignores unreadable rows instead of inventing a price", () => {
  const result = parseJustOneAPIResponse({
    code: 0,
    data: { list: [null, "junk", { title: "no price" }, { price: "0" }] },
  });
  // Four raw rows were returned, none had a usable price.
  assert.equal(result.scanned, 4);
  assert.deepEqual(result.offers, []);
});
