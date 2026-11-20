import archive from "../../research/creator-products.json";
import { PUBLIC_CREATORS } from "./creator-directory";
import { markupHref } from "./markup-records";
import { retailComparison, retailComparisons } from "./retail-premium";

export const productHref = (id: string) => "#shop/product/" + encodeURIComponent(id);
export const shoppingRankingHref = (handle?: string) => "#shop/rankings" + (handle ? "/" + encodeURIComponent(handle) : "");
export const creatorHref = (handle: string) => "#creator/" + encodeURIComponent("@" + handle);
export const videoHref = (url: string) => "#shop/video?" + new URLSearchParams({ url });
export const linkHref = (url: string) => "#shop/listing?" + new URLSearchParams({ url });

export const profileCheckHref = (handle: string) => "#shop/profile?" + new URLSearchParams({ url: "https://www.tiktok.com/@" + handle });
export const websiteCheckHref = (url: string) => "#shop/site?" + new URLSearchParams({ url });
export const productSearchHref = (q: string) => "#shop/find?" + new URLSearchParams({ q });

let submittedCheck = "";
export function markShoppingSubmission(destination: string) {
  submittedCheck = /^#shop\/(?:video|profile|site|find)\?/.test(destination) ? destination : "";
}
export function consumeShoppingSubmission(destination: string) {
  const submitted = submittedCheck === destination;
  submittedCheck = "";
  return submitted;
}

export function publicUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!["https:", "http:"].includes(u.protocol) || !u.hostname.includes(".") || u.username || u.password || u.port ||
        /^(?:\d+\.){3}\d+$/.test(u.hostname) || /\.(?:localhost|local|internal)$/.test(u.hostname)) return null;
    return u;
  } catch { return null; }
}

export function listingKey(raw: string) {
  const u = publicUrl(raw);
  if (!u) return "";
  for (const key of [...u.searchParams.keys()]) {
    if (/^(?:utm_|ref_$)|^(?:fbclid|gclid|aff_source)$/.test(key)) u.searchParams.delete(key);
  }
  if (/^(?:www\.)?amazon\.[a-z.]+$/.test(u.hostname)) {
    const id = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1];
    if (id) u.pathname = "/dp/" + id.toUpperCase();
    for (const key of ["ref", "tag", "linkCode", "camp", "creative"]) u.searchParams.delete(key);
  }
  u.hash = "";
  u.searchParams.sort();
  return u.href.replace(/\/$/, "");
}

export function productForListing(url: string): string | undefined {
  const key = listingKey(url);
  if (!key) return;
  for (const row of retailComparisons()) {
    if ([row.reference?.url, row.alternative?.url].some(source => source && listingKey(source) === key)) return row.productId;
  }
  const route = markupHref(key);
  if (!route.startsWith("#markup/item?") && route.startsWith("#markup/")) {
    const id = route.slice(8);
    const requested = new URL(key);
    const comparison = retailComparison(id);
    // A historical search result can identify a product line but point at a
    // different shade. Preserve the shopper's explicit variant selection.
    if (comparison) {
      for (const offer of [comparison.reference, comparison.alternative]) {
        const checked = new URL(offer.url);
        if (requested.origin !== checked.origin || requested.pathname !== checked.pathname) continue;
        for (const field of ["variant", "sku"]) {
          if (requested.searchParams.has(field) && checked.searchParams.has(field)
              && requested.searchParams.get(field) !== checked.searchParams.get(field)) return;
        }
      }
    }
    return id;
  }
}

export function tiktokListing(url: URL) {
  if (!/^(?:(?:www|m|shop)\.)?tiktok\.com$/.test(url.hostname)) return null;
  const pdp = url.pathname.match(/^\/(?:(?:shop\/)?([a-z]{2})\/|shop\/)?pdp\/(?:[^/]+\/)?(\d{8,24})\/?$/i);
  if (!pdp && !/^\/view\/product\/\d{8,24}\/?$/.test(url.pathname)) return null;
  const region = (pdp?.[1] || url.searchParams.get("region") || "").toUpperCase();
  return { market: region === "UK" ? "GB" : region };
}

export function tiktokProfileHandle(url: URL) {
  if (!/^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/.test(url.hostname)) return null;
  const handle = /^\/@([a-z0-9_][a-z0-9_.]{0,23})\/?$/i.exec(url.pathname)?.[1];
  return handle && !handle.endsWith(".") ? handle.toLowerCase() : null;
}

export function shoppingDestination(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const looksLink = /^(?:https?:\/\/|(?:[\w-]+\.)+(?:[a-z]{2,24})(?:\/|$))/i.test(raw);
  if (looksLink) {
    const url = publicUrl(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    if (!url) return null;
    if (tiktokListing(url)) return websiteCheckHref(url.href);
    if (/^(?:(?:www|m|vm|vt)\.)?tiktok\.com$/.test(url.hostname)) {
      const profile = tiktokProfileHandle(url);
      if (profile) return profileCheckHref(profile);
      if (/^(?:vm|vt)\./.test(url.hostname) || /^\/(?:t\/|@[\w.]+\/video\/\d+)/i.test(url.pathname)) return videoHref(url.href);
      if (!/^\/shop\//.test(url.pathname)) return null;
    }
    const id = productForListing(url.href);
    if (id) {
      const caseRecord = retailComparison(id);
      if (caseRecord && ![caseRecord.reference, caseRecord.alternative].some(offer => listingKey(offer.url) === listingKey(url.href))) {
        return productHref(id) + "?from=archive";
      }
    }
    return id ? productHref(id) : websiteCheckHref(url.href);
  }
  if (/^https?:|:\/\/|^[a-z]+:/i.test(raw)) return null;
  const q = raw.replace(/^@/, "").toLowerCase();
  const creator = PUBLIC_CREATORS.find(item => item.handle === q || item.name.toLowerCase() === q);
  if (creator) return profileCheckHref(creator.handle);
  if (raw.startsWith("@")) return /^[a-z0-9_][a-z0-9_.]{0,23}$/i.test(q) && !q.endsWith(".") ? profileCheckHref(q) : null;
  const exact = archive.products.find(product => product.name.toLowerCase() === q);
  return exact ? productHref(exact.id) : "#shop/search?" + new URLSearchParams({ q: raw });
}

/** A pasted storefront URL always starts a fresh check, including archived listings. */
export function pastedShoppingDestination(value: string): string | null {
  const known = shoppingDestination(value);
  if (!known?.startsWith("#shop/product/")) return known;
  const text = value.trim();
  const url = publicUrl(/^https?:\/\//i.test(text) ? text : "https://" + text);
  return url ? websiteCheckHref(url.href) : known;
}
