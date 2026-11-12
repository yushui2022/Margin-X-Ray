import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildImageContext,
  buildLinkContext,
  guessTitleFromUrl,
  inferPlatformFromUrl,
  isSupportedImageType,
  looksLikeVideoUrl,
} from "../src/shared/capture";

test("inferPlatformFromUrl detects supported hosts", () => {
  assert.equal(inferPlatformFromUrl("https://www.tiktok.com/@demo/video/123"), "tiktok");
  assert.equal(inferPlatformFromUrl("https://www.amazon.com/dp/B000TEST"), "amazon");
  assert.equal(inferPlatformFromUrl("https://www.instagram.com/reel/abc"), "instagram");
  assert.equal(inferPlatformFromUrl("https://youtu.be/abc"), "youtube");
  assert.equal(inferPlatformFromUrl("https://store.example.com/products/neck-fan"), "generic");
  assert.equal(inferPlatformFromUrl("not a url"), "generic");
});

test("looksLikeVideoUrl only accepts supported video paths", () => {
  assert.equal(looksLikeVideoUrl("https://www.tiktok.com/@demo/video/123"), true);
  assert.equal(looksLikeVideoUrl("https://www.tiktok.com/@demo"), false);
  assert.equal(looksLikeVideoUrl("https://www.youtube.com/shorts/abc"), true);
  assert.equal(looksLikeVideoUrl("https://www.amazon.com/dp/B000TEST"), false);
});

test("guessTitleFromUrl never invents a product name", () => {
  assert.match(
    guessTitleFromUrl("https://store.example.com/products/portable-neck-fan"),
    /portable neck fan/i,
  );
  assert.match(guessTitleFromUrl("https://www.amazon.com/dp/B000TEST"), /amazon/i);
});

test("buildLinkContext rejects non-http links", () => {
  assert.throws(() => buildLinkContext("javascript:alert(1)"), /http/i);
  assert.equal(
    buildLinkContext("https://www.tiktok.com/@demo/video/123").pageType,
    "video",
  );
});

test("buildImageContext keeps the uploaded image and a readable title", () => {
  const context = buildImageContext("data:image/png;base64,abc", "neck-fan.png");
  assert.equal(context.imageUrl, "data:image/png;base64,abc");
  assert.equal(context.title, "neck fan");
  assert.equal(context.extractedBy, "image-upload");
});

test("isSupportedImageType limits uploads to browser-safe images", () => {
  assert.equal(isSupportedImageType("image/png"), true);
  assert.equal(isSupportedImageType("image/webp"), true);
  assert.equal(isSupportedImageType("application/pdf"), false);
});
