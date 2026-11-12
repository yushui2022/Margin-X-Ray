import test from "node:test";
import assert from "node:assert/strict";
import {
  applySupply,
  buildSupplyReport,
  mergeOfferDetail,
  parseAlibabaImageSearch,
  parseOneBoundItem,
  parseOneBoundSearch,
} from "../src/shared/supply";
import type { ScanResult, SupplyOffer } from "../src/shared/types";

test("OneBound image search keeps priced rows and reads tier prices from item_get", () => {
  const searched = parseOneBoundSearch({
    error_code: "0000",
    items: {
      real_total_results: 40,
      item: [
        { num_iid: "11", title: "无价配件", price: "0" },
        {
          num_iid: "22",
          title: "挂脖风扇",
          price: "15.00",
          promotion_price: "12.50",
          sales: 80,
          detail_url: "https://detail.1688.com/offer/22.html",
        },
      ],
    },
  });
  assert.equal(searched.scanned, 40);
  assert.equal(searched.offers.length, 1);
  assert.equal(searched.offers[0]?.tiers[0]?.unitCny, 12.5);

  const detail = parseOneBoundItem({
    error_code: "0000",
    item: {
      title: "挂脖风扇",
      min_num: 2,
      location: "浙江省 金华市",
      nick: "_sopid@hidden",
      priceRange: [
        [2, "12.50"],
        [100, "9.80"],
      ],
    },
  });
  const merged = mergeOfferDetail(searched.offers[0] as SupplyOffer, detail);
  assert.deepEqual(merged.tiers, [
    { moq: 2, unitCny: 12.5 },
    { moq: 100, unitCny: 9.8 },
  ]);
  assert.equal(merged.location, "浙江省 金华市");
  assert.equal(merged.shopName, undefined);
});

test("OneBound auth and empty-result codes stay distinct", () => {
  assert.equal(parseOneBoundSearch({ error_code: "2000", items: { item: [] } }).offers.length, 0);
  assert.throws(() => parseOneBoundSearch({ error_code: "4005", reason: "授权失败" }), /授权失败/);
});

test("official 1688 image search reads price, MOQ and company", () => {
  const parsed = parseAlibabaImageSearch({
    errorCode: "0",
    result: {
      success: true,
      totalResults: 12,
      result: [
        {
          offerId: "99",
          subject: "硅胶辅食碗",
          price: "8.60",
          quantityBegin: 50,
          city: "东莞",
          companyName: "东莞市示例硅胶制品有限公司",
        },
      ],
    },
  });
  assert.equal(parsed.scanned, 12);
  assert.equal(parsed.offers[0]?.shopName, "东莞市示例硅胶制品有限公司");
  assert.equal(parsed.offers[0]?.tiers[0]?.moq, 50);
  assert.equal(parsed.offers[0]?.tiers[0]?.unitCny, 8.6);
});

test("applySupply shows CNY until a rate is saved, then converts without inventing tiers", () => {
  const offer: SupplyOffer = {
    id: "onebound:22",
    title: "挂脖风扇",
    provider: "onebound",
    tiers: [{ moq: 2, unitCny: 10 }],
    location: "金华",
  };
  const report = buildSupplyReport("onebound", 10, [offer]);
  const base = emptyResult();
  const cny = applySupply(base, report);
  assert.equal(cny.factories[0]?.currency, "CNY");
  assert.equal(cny.factories[0]?.fobMinUsd, 10);
  assert.equal(cny.priceRange, null);

  const usd = applySupply(base, buildSupplyReport("onebound", 10, [offer], 7.2), 7.2);
  assert.equal(usd.factories[0]?.currency, "USD");
  assert.equal(usd.factories[0]?.tiers[0]?.unitUsd, 1.39);
  assert.equal(usd.priceRange?.fobMinUsd, 1.39);
  assert.match(usd.priceRange?.basis ?? "", /7.2 CNY per USD/);
  assert.equal(usd.factories[0]?.tiers.length, 1);
});

function emptyResult(): ScanResult {
  return {
    scanId: "s",
    dataSource: "demo",
    generatedAt: "2026-11-12T00:00:00.000Z",
    product: {
      title: "Fan",
      sourceUrl: "https://example.com",
      platform: "tiktok",
      retailUsd: 20,
      retailSource: "page",
    },
    priceRange: {
      fobMinUsd: 2,
      fobMaxUsd: 4,
      basis: "demo",
      confidence: "demo",
    },
    waterfall: null,
    assumptions: null,
    factories: [],
    funnel: { scanned: 0, excludedByReason: [], verified: 0, note: "" },
    sources: [],
    disclaimers: [],
  };
}
