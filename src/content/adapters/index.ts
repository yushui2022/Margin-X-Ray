import type { PageAdapter } from "./types";
import { tiktokAdapter } from "./tiktok";
import { amazonAdapter } from "./amazon";
import { isShopifyPage, shopifyAdapter } from "./shopify";
import { videoAdapter } from "./video";
import { genericAdapter } from "./generic";

export type DetectedPage = {
  adapter: PageAdapter;
  pageType: "video" | "product";
};

const KNOWN_ADAPTERS = [tiktokAdapter, amazonAdapter, videoAdapter];

export function detectPage(doc: Document, url: URL): DetectedPage | null {
  for (const adapter of KNOWN_ADAPTERS) {
    if (!adapter.matches(url)) continue;
    const pageType = adapter.detect(doc, url);
    if (pageType !== "unknown") return { adapter, pageType };
  }

  if (isShopifyPage(doc)) {
    const pageType = shopifyAdapter.detect(doc, url);
    if (pageType !== "unknown") return { adapter: shopifyAdapter, pageType };
  }

  const pageType = genericAdapter.detect(doc, url);
  if (pageType !== "unknown") return { adapter: genericAdapter, pageType };

  return null;
}

export function isAutoMountHost(url: URL): boolean {
  return KNOWN_ADAPTERS.some((adapter) => adapter.matches(url));
}

export type { PageAdapter };
