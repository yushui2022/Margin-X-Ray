import type { PageContext, Platform } from "./types";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function inferPlatformFromUrl(raw: string): Platform {
  const url = toUrl(raw);
  if (!url) return "generic";
  const host = url.hostname.toLowerCase();
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)amazon\./.test(host)) return "amazon";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)shopify\.com$/.test(host)) return "shopify";
  return "generic";
}

export function looksLikeVideoUrl(raw: string): boolean {
  const url = toUrl(raw);
  if (!url) return false;
  if (/(^|\.)tiktok\.com$/.test(url.hostname) && /\/video\/\d+/.test(url.pathname)) {
    return true;
  }
  if (/(^|\.)instagram\.com$/.test(url.hostname) && /\/(reel|reels|p)\//.test(url.pathname)) {
    return true;
  }
  return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)
    ? /\/(shorts|watch|live)\b/.test(url.pathname) || url.hostname.endsWith("youtu.be")
    : false;
}

export function guessTitleFromUrl(raw: string): string {
  const url = toUrl(raw);
  if (!url) return "Pasted product link";
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const readable = last
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (readable && !/^\d+$/.test(readable) && readable.length <= 80) {
    return `${readable.slice(0, 80)} · ${host}`;
  }
  return `Product link · ${host}`;
}

export function buildLinkContext(raw: string): PageContext {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links are supported.");
  }
  const platform = inferPlatformFromUrl(url.toString());
  return {
    platform,
    pageType: looksLikeVideoUrl(url.toString()) ? "video" : "product",
    url: url.toString(),
    title: guessTitleFromUrl(url.toString()),
    extractedBy: "url-input",
    extractedAt: new Date().toISOString(),
    warnings: [
      "Pasted link: the backend must resolve the page title, product image and current retail price. Demo mode uses sample metadata.",
    ],
  };
}

export function buildImageContext(dataUrl: string, fileName: string): PageContext {
  const cleanName = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  return {
    platform: "generic",
    pageType: "product",
    url: "https://local.margin-xray/upload",
    title: cleanName || "Uploaded product image",
    imageUrl: dataUrl,
    extractedBy: "image-upload",
    extractedAt: new Date().toISOString(),
    warnings: [
      "Uploaded image: the backend must identify the product, category and retail price. Demo mode uses sample metadata.",
    ],
  };
}

export function isSupportedImageType(type: string): boolean {
  return IMAGE_TYPES.has(type.toLowerCase());
}

function toUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
