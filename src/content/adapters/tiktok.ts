import type { PageContext, Platform } from "../../shared/types";
import { truncate } from "../../shared/format";
import {
  absoluteUrl,
  extractPrice,
  extractTitle,
  findProductJsonLd,
  getAttr,
  getMeta,
  getText,
  jsonLdBrand,
  jsonLdImage,
  pickVideo,
} from "./dom";
import type { PageAdapter } from "./types";

const PRICE_SELECTORS = [
  '[data-e2e="product-price"]',
  '[data-e2e="browse-product-price"]',
  '[data-e2e="price"]',
  '[data-e2e="sale-price"]',
  '[data-e2e="product-price-current"]',
  '[data-e2e="product-price"] span',
];

const IMAGE_SELECTORS = [
  '[data-e2e="product-image"] img',
  '[data-e2e="browse-product-image"] img',
  'img[data-e2e="product-image"]',
];

const CAPTION_SELECTORS = [
  '[data-e2e="browse-video-desc"]',
  '[data-e2e="video-desc"]',
  '[data-e2e="browse-video-desc"] span',
  '[data-e2e="video-desc"] span',
  "h1",
];

function videoIdFromPath(pathname: string): string | undefined {
  return pathname.match(/\/video\/(\d+)/)?.[1];
}

function productIdFromPath(pathname: string): string | undefined {
  return (
    pathname.match(/\/shop\/p\/(\d+)/)?.[1] ??
    pathname.match(/\/product\/(\d+)/)?.[1]
  );
}

export const tiktokAdapter: PageAdapter = {
  id: "tiktok" as Platform,
  label: "TikTok",
  matches(url) {
    return /(^|\.)tiktok\.com$/i.test(url.hostname);
  },
  detect(doc, url) {
    if (/\/video\/\d+/.test(url.pathname)) return "video";
    if (/\/shop\/p\/|\/product\//.test(url.pathname)) return "product";
    if (
      doc.querySelector('[data-e2e="product-title"], [data-e2e="product-price"]')
    ) {
      return "product";
    }
    if (doc.querySelector("video")) return "video";
    return "unknown";
  },
  extract(doc, url): PageContext {
    const product = findProductJsonLd(doc);
    const pageType = this.detect(doc, url);
    const caption =
      getText(doc, CAPTION_SELECTORS) ?? getMeta(doc, "og:description");
    const video = pickVideo(doc);
    const productImage =
      (product ? jsonLdImage(product) : undefined) ??
      getMeta(doc, "og:image") ??
      getAttr(doc, IMAGE_SELECTORS, "src") ??
      video?.poster;

    const title =
      pageType === "product"
        ? extractTitle(doc, product)
        : truncate(caption ?? extractTitle(doc, product), 180);

    const price = extractPrice(doc, product, PRICE_SELECTORS);
    const imageUrl = absoluteUrl(productImage, url.toString());

    const warnings: string[] = [];
    if (!price) {
      warnings.push(
        "No price was found in the page DOM. Live mode should try TikTok Shop search or ask the user to confirm the price.",
      );
    }
    if (!imageUrl) {
      warnings.push(
        "No product image was found. Visual search accuracy will be lower.",
      );
    }
    if (video?.currentSrc?.startsWith("blob:")) {
      warnings.push(
        "The video is a blob/MSE stream. Use the poster image or a server-side frame capture.",
      );
    }

    return {
      platform: "tiktok",
      pageType,
      url: url.toString(),
      canonicalUrl:
        getMeta(doc, "og:url") ??
        (videoIdFromPath(url.pathname)
          ? `https://www.tiktok.com/@/video/${videoIdFromPath(url.pathname)}`
          : undefined),
      title: title || "TikTok product",
      caption,
      brand: product ? jsonLdBrand(product) : undefined,
      price,
      imageUrl,
      video,
      identifiers: {
        ...(videoIdFromPath(url.pathname)
          ? { videoId: videoIdFromPath(url.pathname) }
          : {}),
        ...(productIdFromPath(url.pathname)
          ? { productId: productIdFromPath(url.pathname) }
          : {}),
      },
      extractedBy: "tiktok-adapter",
      extractedAt: new Date().toISOString(),
      warnings: warnings.length ? warnings : undefined,
    };
  },
};
