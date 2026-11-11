import type { PageContext } from "../../shared/types";
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
  "[data-product-price]",
  "[data-price]",
  ".price__current",
  ".price-item--sale",
  ".price-item--regular",
  ".product__price",
  ".product-single__price",
  ".product-price",
  ".price",
];

const IMAGE_SELECTORS = [
  ".product__media img",
  ".product-single__photo img",
  ".product-featured-img",
  "[data-product-image] img",
  "main img",
  "article img",
];

function detectGeneric(doc: Document, url: URL): "video" | "product" | "unknown" {
  if (findProductJsonLd(doc)) return "product";
  if (getMeta(doc, "og:type")?.toLowerCase() === "product") return "product";
  if (getMeta(doc, "product:price:amount") || getMeta(doc, "og:price:amount")) {
    return "product";
  }
  if (doc.querySelector("[data-product-id], .product__title, .product-single__title")) {
    return "product";
  }
  if (/\/products\//.test(url.pathname)) return "product";
  if (doc.querySelector("video") && getMeta(doc, "og:type")?.toLowerCase() === "video") {
    return "video";
  }
  return "unknown";
}

export const genericAdapter: PageAdapter = {
  id: "generic",
  label: "Product page",
  matches() {
    return true;
  },
  detect(doc, url) {
    return detectGeneric(doc, url);
  },
  extract(doc, url): PageContext {
    const product = findProductJsonLd(doc);
    const video = pickVideo(doc);
    const pageType = detectGeneric(doc, url);
    const price = extractPrice(doc, product, PRICE_SELECTORS);
    const imageRaw =
      (product ? jsonLdImage(product) : undefined) ??
      getMeta(doc, "og:image") ??
      getAttr(doc, IMAGE_SELECTORS, "src") ??
      getAttr(doc, IMAGE_SELECTORS, "data-src") ??
      video?.poster;

    const warnings: string[] = [];
    if (!price) {
      warnings.push(
        "No price was found in the page DOM. Live mode should ask the user to confirm the price.",
      );
    }
    if (!imageRaw) {
      warnings.push("No product image was found on the page.");
    }

    return {
      platform: "generic",
      pageType,
      url: url.toString(),
      canonicalUrl: getMeta(doc, "og:url"),
      title:
        extractTitle(doc, product) ||
        (pageType === "video" ? "Video product" : "Product page"),
      brand:
        (product ? jsonLdBrand(product) : undefined) ??
        getText(doc, ['[itemprop="brand"]', ".product__vendor", ".vendor"]),
      price,
      imageUrl: absoluteUrl(imageRaw, url.toString()),
      video,
      identifiers: {
        ...(getAttr(doc, ["[data-product-id]"], "data-product-id")
          ? {
              productId: getAttr(
                doc,
                ["[data-product-id]"],
                "data-product-id",
              ) as string,
            }
          : {}),
      },
      extractedBy: "generic-adapter",
      extractedAt: new Date().toISOString(),
      warnings: warnings.length ? warnings : undefined,
    };
  },
};
