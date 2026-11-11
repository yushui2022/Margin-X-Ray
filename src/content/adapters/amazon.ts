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
  "#corePrice_feature_div .a-offscreen",
  "#corePriceDisplay_desktop_feature_div .a-offscreen",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  "#priceblock_saleprice",
  "#tp_price_block_total_price_ww .a-offscreen",
  ".a-price .a-offscreen",
];

const IMAGE_SELECTORS = ["#landingImage", "#imgTagWrapperId img", "#main-image"];

function asinFromUrl(pathname: string): string | undefined {
  return (
    pathname.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] ??
    pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i)?.[1] ??
    pathname.match(/\/gp\/aw\/d\/([A-Z0-9]{10})/i)?.[1]
  );
}

function cleanBrand(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/^Brand:\s*/i, "")
    .replace(/^Visit the\s+/i, "")
    .replace(/\s+Store$/i, "")
    .trim();
}

export const amazonAdapter: PageAdapter = {
  id: "amazon",
  label: "Amazon",
  matches(url) {
    return /(^|\.)amazon\.(com|co\.uk|ca|com\.au)$/i.test(url.hostname);
  },
  detect(doc, url) {
    if (/\/dp\/|\/gp\/product\/|\/gp\/aw\/d\//.test(url.pathname)) {
      return "product";
    }
    if (doc.querySelector("#productTitle")) return "product";
    return "unknown";
  },
  extract(doc, url): PageContext {
    const product = findProductJsonLd(doc);
    const video = pickVideo(doc);
    const imageRaw =
      getAttr(doc, ["#landingImage"], "data-old-hires") ??
      getAttr(doc, IMAGE_SELECTORS, "src") ??
      (product ? jsonLdImage(product) : undefined) ??
      getMeta(doc, "og:image") ??
      video?.poster;

    const warnings: string[] = [
      "Amazon prices vary by account, region, seller and coupon. Confirm the final price at checkout.",
    ];
    const price = extractPrice(doc, product, PRICE_SELECTORS);
    if (!price) {
      warnings.push("No Amazon price was found in the page DOM.");
    }

    return {
      platform: "amazon",
      pageType: "product",
      url: url.toString(),
      canonicalUrl: getMeta(doc, "og:url"),
      title: extractTitle(doc, product) || "Amazon product",
      brand: cleanBrand(getText(doc, ["#bylineInfo"])) ?? (product ? jsonLdBrand(product) : undefined),
      price,
      imageUrl: absoluteUrl(imageRaw, url.toString()),
      video,
      identifiers: {
        ...(asinFromUrl(url.pathname)
          ? { asin: asinFromUrl(url.pathname) as string }
          : {}),
      },
      extractedBy: "amazon-adapter",
      extractedAt: new Date().toISOString(),
      warnings,
    };
  },
};
