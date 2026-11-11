import type { PageContext } from "../../shared/types";
import { truncate } from "../../shared/format";
import {
  absoluteUrl,
  extractPrice,
  extractTitle,
  findProductJsonLd,
  getMeta,
  getText,
  jsonLdImage,
  pickVideo,
} from "./dom";
import type { PageAdapter } from "./types";

const PRICE_SELECTORS = [
  '[data-e2e="product-price"]',
  '[data-e2e="price"]',
  ".price",
  "[data-price]",
];

function isVideoPath(url: URL): boolean {
  return (
    /^\/(shorts|watch|live)\b/.test(url.pathname) ||
    /^\/(reel|reels|p)\//.test(url.pathname)
  );
}

export const videoAdapter: PageAdapter = {
  id: "instagram",
  label: "Short video",
  matches(url) {
    return /(^|\.)instagram\.com$|(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(
      url.hostname,
    );
  },
  detect(doc, url) {
    if (isVideoPath(url)) return "video";
    if (doc.querySelector("video") && getMeta(doc, "og:type")?.toLowerCase() === "video") {
      return "video";
    }
    return "unknown";
  },
  extract(doc, url): PageContext {
    const product = findProductJsonLd(doc);
    const video = pickVideo(doc);
    const platform = /youtu/.test(url.hostname) ? "youtube" : "instagram";
    const caption =
      getMeta(doc, "og:description") ??
      getMeta(doc, "description") ??
      getText(doc, ["h1", "article"]);
    const title = truncate(
      getMeta(doc, "og:title") ??
        getText(doc, ["h1"]) ??
        extractTitle(doc, product) ??
        "Short video",
      180,
    );
    const imageRaw =
      getMeta(doc, "og:image") ??
      video?.poster ??
      (product ? jsonLdImage(product) : undefined);

    const warnings: string[] = [
      "Instagram/YouTube do not expose a product price. Live mode should identify the product and search TikTok Shop or ask for a price.",
    ];
    if (video?.currentSrc?.startsWith("blob:")) {
      warnings.push(
        "The video is a blob/MSE stream. Use the poster image or a server-side frame capture.",
      );
    }

    return {
      platform,
      pageType: "video",
      url: url.toString(),
      canonicalUrl: getMeta(doc, "og:url"),
      title,
      caption,
      price: extractPrice(doc, product, PRICE_SELECTORS),
      imageUrl: absoluteUrl(imageRaw, url.toString()),
      video,
      identifiers: {
        ...(url.pathname.match(/\/(?:shorts|reel|reels|watch)\/([\w-]+)/)?.[1]
          ? {
              videoId: url.pathname.match(
                /\/(?:shorts|reel|reels|watch)\/([\w-]+)/,
              )?.[1] as string,
            }
          : {}),
      },
      extractedBy: "video-adapter",
      extractedAt: new Date().toISOString(),
      warnings,
    };
  },
};
