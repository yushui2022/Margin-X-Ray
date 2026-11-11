import type { Platform, PriceInfo, VideoContext } from "../../shared/types";
import { parsePriceText } from "../../shared/format";

export interface PageAdapter {
  id: Platform;
  label: string;
  matches(url: URL): boolean;
  detect(doc: Document, url: URL): "video" | "product" | "unknown";
  extract(doc: Document, url: URL): import("../../shared/types").PageContext;
}

export function getMeta(doc: Document, key: string): string | undefined {
  const el = doc.querySelector(
    `meta[property="${key}"], meta[name="${key}"], meta[itemprop="${key}"]`,
  );
  const content = el?.getAttribute("content")?.trim();
  return content || undefined;
}

export function getText(doc: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const text = el?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return undefined;
}

export function getAttr(
  doc: Document,
  selectors: string[],
  attr: string,
): string | undefined {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const value = el?.getAttribute(attr)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function absoluteUrl(
  value: string | undefined,
  base: string,
): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, base).toString();
  } catch {
    return undefined;
  }
}

export function cleanupTitle(title: string | undefined): string {
  if (!title) return "";
  return title
    .replace(/\s*[|·-]\s*TikTok( Shop)?\s*$/i, "")
    .replace(/\s*[|·-]\s*Amazon(\.[a-z.]+)?\s*$/i, "")
    .replace(/\s*[|·-]\s*Shopify\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenJsonLd(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const entry of value) flattenJsonLd(entry, out);
    return out;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    out.push(obj);
    if (obj["@graph"]) flattenJsonLd(obj["@graph"], out);
  }
  return out;
}

export function extractJsonLd(doc: Document): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;
    try {
      flattenJsonLd(JSON.parse(text), out);
    } catch {
      // Ignore malformed JSON-LD blocks; many stores ship one.
    }
  }
  return out;
}

export function isProductJsonLd(value: Record<string, unknown>): boolean {
  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (entry) =>
      typeof entry === "string" &&
      (entry === "Product" || entry === "ProductGroup"),
  );
}

export function findProductJsonLd(
  doc: Document,
): Record<string, unknown> | undefined {
  return extractJsonLd(doc).find(isProductJsonLd);
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return firstString(obj.url) ?? firstString(obj.contentUrl) ?? firstString(obj["@id"]);
  }
  return undefined;
}

export function jsonLdImage(product: Record<string, unknown>): string | undefined {
  return firstString(product.image);
}

export function jsonLdBrand(product: Record<string, unknown>): string | undefined {
  const brand = product.brand;
  if (typeof brand === "string") return brand;
  if (brand && typeof brand === "object") {
    const name = (brand as Record<string, unknown>).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

export function jsonLdOffer(
  product: Record<string, unknown>,
): PriceInfo | undefined {
  const offers = product.offers;
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];

  for (const offer of list) {
    if (!offer || typeof offer !== "object") continue;
    const obj = offer as Record<string, unknown>;
    const currency =
      typeof obj.priceCurrency === "string" ? obj.priceCurrency : "USD";
    const priceRaw = obj.price ?? obj.lowPrice;
    const parsed =
      typeof priceRaw === "number"
        ? { amount: priceRaw, currency, raw: String(priceRaw) }
        : parsePriceText(
            typeof priceRaw === "string" ? priceRaw : undefined,
            currency,
          );
    if (parsed && parsed.amount > 0) {
      return {
        amount: parsed.amount,
        currency: currency.toUpperCase(),
        source: "json-ld",
        raw: String(priceRaw),
      };
    }
  }
  return undefined;
}

export function extractPriceFromSelectors(
  doc: Document,
  selectors: string[],
  defaultCurrency = "USD",
): PriceInfo | undefined {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (!el) continue;
    for (const attr of ["content", "data-price", "data-product-price", "value"]) {
      const attrValue = el.getAttribute(attr);
      const parsed = parsePriceText(attrValue, defaultCurrency);
      if (parsed) {
        return {
          amount: parsed.amount,
          currency: parsed.currency,
          source: `dom:${selector}`,
          raw: parsed.raw,
        };
      }
    }
    const parsed = parsePriceText(el.textContent, defaultCurrency);
    if (parsed) {
      return {
        amount: parsed.amount,
        currency: parsed.currency,
        source: `dom:${selector}`,
        raw: parsed.raw,
      };
    }
  }
  return undefined;
}

export function extractPrice(
  doc: Document,
  product?: Record<string, unknown>,
  selectors: string[] = [],
): PriceInfo | undefined {
  if (product) {
    const offer = jsonLdOffer(product);
    if (offer) return offer;
  }

  const metaAmount =
    getMeta(doc, "product:price:amount") ?? getMeta(doc, "og:price:amount");
  const metaCurrency =
    getMeta(doc, "product:price:currency") ??
    getMeta(doc, "og:price:currency") ??
    "USD";
  if (metaAmount) {
    const parsed = parsePriceText(metaAmount, metaCurrency);
    if (parsed) {
      return {
        amount: parsed.amount,
        currency: parsed.currency,
        source: "meta",
        raw: metaAmount,
      };
    }
  }

  const itemprop = doc.querySelector('meta[itemprop="price"]')?.getAttribute("content");
  const itempropCurrency =
    doc.querySelector('meta[itemprop="priceCurrency"]')?.getAttribute("content") ??
    "USD";
  if (itemprop) {
    const parsed = parsePriceText(itemprop, itempropCurrency);
    if (parsed) {
      return {
        amount: parsed.amount,
        currency: parsed.currency,
        source: "microdata",
        raw: itemprop,
      };
    }
  }

  return extractPriceFromSelectors(doc, selectors, metaCurrency);
}

export function pickVideo(doc: Document): VideoContext | undefined {
  const videos = Array.from(doc.querySelectorAll("video"));
  if (!videos.length) return undefined;

  const scored = videos.map((video) => {
    const rect = video.getBoundingClientRect();
    const area =
      rect.width > 0 && rect.height > 0
        ? rect.width * rect.height
        : (video.videoWidth || 0) * (video.videoHeight || 0);
    const playing = !video.paused && !video.ended && video.readyState >= 2;
    return { video, area, playing };
  });

  scored.sort((a, b) => {
    if (a.playing !== b.playing) return a.playing ? -1 : 1;
    return b.area - a.area;
  });

  const video = scored[0]?.video;
  if (!video) return undefined;

  const sourceEl = video.querySelector("source");
  const currentSrc =
    video.currentSrc || video.src || sourceEl?.getAttribute("src") || undefined;

  return {
    currentSrc: currentSrc || undefined,
    poster: video.poster || undefined,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : undefined,
    width: video.videoWidth || undefined,
    height: video.videoHeight || undefined,
    isPlaying: !video.paused && !video.ended,
  };
}

export function extractTitle(
  doc: Document,
  product?: Record<string, unknown>,
): string {
  const name = product?.name;
  if (typeof name === "string" && name.trim()) return cleanupTitle(name);
  return cleanupTitle(
    getMeta(doc, "og:title") ??
      getText(doc, ["h1", "[data-e2e='product-title']"]) ??
      doc.title,
  );
}
