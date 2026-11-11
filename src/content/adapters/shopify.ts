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
  ".price__current",
  ".price-item--sale",
  ".price-item--regular",
  ".product__price",
  ".product-single__price",
  ".product__price--sale",
];

const IMAGE_SELECTORS = [
  ".product__media img",
  ".product-single__photo img",
  ".product-featured-img",
  "[data-product-image] img",
  "main img",
];

export function isShopifyPage(doc: Document): boolean {
  return Boolean(
    doc.querySelector(
      'link[href*="cdn.shopify.com"], script[src*="cdn.shopify.com"], meta[name="shopify-checkout-api-token"], [data-shopify], shopify-section, [id^="shopify-section-"]',
    ),
  );
}

function productHandle(url: URL): string | undefined {
  const parts = url.pathname.split("/").filter(Boolean);
  const productsIndex = parts.indexOf("products");
  return productsIndex >= 0 ? parts[productsIndex + 1] : parts[parts.length - 1];
}

function detectShopifyProduct(doc: Document, url: URL): "product" | "unknown" {
  if (findProductJsonLd(doc)) return "product";
  if (getMeta(doc, "og:type")?.toLowerCase() === "product") return "product";
  if (doc.querySelector("[data-product-id], .product__title, .product-single__title")) {
    return "product";
  }
  if (/\/products\//.test(url.pathname)) return "product";
  return "unknown";
}

export const shopifyAdapter: PageAdapter = {
  id: "shopify",
  label: "Shopify",
  matches(url) {
    return !/tiktok\.com|amazon\.|instagram\.com|youtube\.com/i.test(url.hostname);
  },
  detect(doc, url) {
    return detectShopifyProduct(doc, url);
  },
  extract(doc, url): PageContext {
    const product = findProductJsonLd(doc);
    const video = pickVideo(doc);
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
        "No price was found in the Shopify DOM. The page may use a dynamic checkout widget.",
      );
    }

    return {
      platform: "shopify",
      pageType: "product",
      url: url.toString(),
      canonicalUrl: getMeta(doc, "og:url"),
      title: extractTitle(doc, product) || "Shopify product",
      brand:
        (product ? jsonLdBrand(product) : undefined) ??
        getText(doc, [".product__vendor", ".vendor", '[itemprop="brand"]']),
      price,
      imageUrl: absoluteUrl(imageRaw, url.toString()),
      video,
      identifiers: {
        ...(productHandle(url) ? { productHandle: productHandle(url) as string } : {}),
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
      extractedBy: "shopify-adapter",
      extractedAt: new Date().toISOString(),
      warnings: warnings.length ? warnings : undefined,
    };
  },
};
