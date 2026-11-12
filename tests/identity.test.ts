import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEnrichment,
  attachIdentity,
  awemeIdFromUrl,
  frameTimestamps,
  isWeakTitle,
  parseBaiduProduct,
  parseTikHubVideo,
  shouldFetchTikHub,
} from "../src/shared/identity";
import type { PageContext, ScanResult } from "../src/shared/types";

const context = (patch: Partial<PageContext> = {}): PageContext => ({
  platform: "tiktok",
  pageType: "video",
  url: "https://www.tiktok.com/@shop/video/7350810998023949599",
  title: "7350810998023949599 · tiktok.com",
  extractedBy: "url-input",
  extractedAt: "2026-11-12T00:00:00.000Z",
  ...patch,
});

test("aweme id and TikHub eligibility come from the video URL", () => {
  assert.equal(awemeIdFromUrl("https://www.tiktok.com/@a/video/7350810998023949599"), "7350810998023949599");
  assert.equal(awemeIdFromUrl("https://www.tiktok.com/t/ZTFNEj8Hk/"), undefined);
  assert.equal(shouldFetchTikHub(context()), true);
  assert.equal(
    shouldFetchTikHub(
      context({
        platform: "amazon",
        pageType: "product",
        url: "https://www.amazon.com/dp/B000000",
        title: "Neck fan",
      }),
    ),
    false,
  );
  assert.equal(
    shouldFetchTikHub(
      context({
        platform: "generic",
        url: "https://v.douyin.com/e3x2fjE/",
        title: "Product link · v.douyin.com",
      }),
    ),
    true,
  );
});

test("weak titles are the placeholders, not a real caption", () => {
  assert.equal(isWeakTitle("7350810998023949599 · tiktok.com"), true);
  assert.equal(isWeakTitle("Product link · v.douyin.com"), true);
  assert.equal(isWeakTitle("Uploaded product image"), true);
  assert.equal(isWeakTitle("Portable neck fan"), false);
});

test("frame timestamps stay inside the video", () => {
  assert.deepEqual(frameTimestamps(10), [2, 5, 8]);
  assert.deepEqual(frameTimestamps(0.2, 0.1), [0.1]);
  assert.deepEqual(frameTimestamps(undefined, 3), [3]);
});

test("parseTikHubVideo reads the aweme detail, cover, and anchored price", () => {
  const video = parseTikHubVideo({
    code: 200,
    data: {
      aweme_detail: {
        aweme_id: "7350810998023949599",
        desc: "Neck fan demo clip",
        author: { nickname: "Shop" },
        video: {
          duration: 15000,
          cover: { url_list: ["https://cdn.example/cover.jpg"] },
          play_addr: { url_list: ["https://cdn.example/play.mp4"] },
        },
        anchors: [
          {
            extra: JSON.stringify({
              product_id: "99",
              title: "Portable neck fan",
              price_info: { format_price: "$19.99" },
            }),
          },
        ],
      },
    },
  });

  assert.equal(video?.awemeId, "7350810998023949599");
  assert.equal(video?.author, "Shop");
  assert.equal(video?.description, "Neck fan demo clip");
  assert.equal(video?.coverUrl, "https://cdn.example/cover.jpg");
  assert.equal(video?.durationSec, 15);
  assert.equal(video?.productTitle, "Portable neck fan");
  assert.deepEqual(video?.price, {
    amount: 19.99,
    currency: "USD",
    source: "TikHub",
    raw: "$19.99",
  });
});

test("parseTikHubVideo ignores a price that has no currency", () => {
  const video = parseTikHubVideo({
    data: {
      desc: "Just a clip",
      aweme_id: "1234567",
      anchors: [{ extra: JSON.stringify({ product_id: "1", title: "Fan", price: 1999 }) }],
    },
  });
  assert.equal(video?.productTitle, "Fan");
  assert.equal(video?.price, undefined);
});

test("parseBaiduProduct keeps the highest score and surfaces API errors", () => {
  assert.deepEqual(
    parseBaiduProduct({
      result: [
        { name: "玩具", score: 0.2 },
        { name: "挂脖风扇", score: 0.81 },
      ],
    }),
    { name: "挂脖风扇", score: 0.81 },
  );
  assert.deepEqual(parseBaiduProduct({ error_code: 110, error_msg: "Access token invalid" }), {
    error: "Access token invalid",
  });
  assert.equal("error" in parseBaiduProduct({ result: [] }), true);
});

test("applyEnrichment prefers the shop title and does not invent a weak-title replacement below the score", () => {
  const strong = applyEnrichment(context({ title: "On-page title" }), {
    tikhub: {
      productTitle: "Portable neck fan",
      price: { amount: 88, currency: "CNY", source: "TikHub" },
    },
    recognition: {
      provider: "baidu-product",
      name: "风扇",
      score: 0.2,
      imageSource: "cover",
    },
    frameCount: 3,
    notes: ["low"],
  });
  assert.equal(strong.title, "Portable neck fan");
  assert.equal(strong.price?.currency, "CNY");
  assert.equal(strong.enrichment?.frameCount, 3);

  const weak = applyEnrichment(context(), {
    recognition: {
      provider: "baidu-product",
      name: "风扇",
      score: 0.2,
      imageSource: "video-frame",
    },
    frameCount: 1,
    notes: [],
  });
  assert.equal(weak.title, "7350810998023949599 · tiktok.com");

  const named = applyEnrichment(context(), {
    recognition: {
      provider: "baidu-product",
      name: "挂脖风扇",
      score: 0.8,
      imageSource: "video-frame",
    },
    frameCount: 1,
    notes: [],
  });
  assert.equal(named.title, "挂脖风扇");
});

test("attachIdentity records the live sources and does not convert a non-USD price", () => {
  const enriched = applyEnrichment(context(), {
    tikhub: {
      awemeId: "7350810998023949599",
      productTitle: "Portable neck fan",
      price: { amount: 88, currency: "CNY", source: "TikHub" },
    },
    recognition: {
      provider: "baidu-product",
      name: "挂脖风扇",
      score: 0.8,
      imageSource: "video-frame",
    },
    frameCount: 2,
    notes: [],
  });
  const result: ScanResult = {
    scanId: "s1",
    dataSource: "demo",
    generatedAt: "2026-11-12T00:00:00.000Z",
    product: {
      title: "Demo product",
      sourceUrl: enriched.url,
      platform: "tiktok",
      retailUsd: 59.9,
      retailSource: "Demo retail price — no USD price was found on the page",
    },
    priceRange: null,
    waterfall: null,
    assumptions: null,
    factories: [],
    funnel: { scanned: 0, excludedByReason: [], verified: 0, note: "" },
    sources: [],
    disclaimers: [],
  };
  const attached = attachIdentity(result, enriched);
  assert.equal(attached.product.title, "Portable neck fan");
  assert.equal(attached.product.retailUsd, 59.9);
  assert.match(attached.product.retailSource, /88 CNY/);
  assert.equal(attached.sources.some((source) => source.label.includes("TikHub video")), true);
  assert.equal(attached.sources.some((source) => source.label.includes("Baidu")), true);
});
