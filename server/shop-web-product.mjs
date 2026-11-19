import { createHash } from "node:crypto";
import { validGtin } from "./creator-source-checks.mjs";
import { publicShopUrl } from "./public-shop-url.mjs";

import { plain } from "../src/shared/shop-product-form.mjs";
export { plain } from "../src/shared/shop-product-form.mjs";

export function pageLinks(page) {
  return [...page.text.matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,600}?)<\/a>/gi)]
    .slice(0, 2000)
    .map((match) => ({
      url: publicShopUrl(plain(match[1], 2048), page.url)?.href,
      label: plain(match[2].replace(/<[^>]*>/g, " ")),
    }))
    .filter((row) => row.url);
}

const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const type = (obj, value) =>
  list(obj?.["@type"]).some((t) => typeof t === "string" && t.split("/").at(-1) === value);
const gtinFields = ["gtin14", "gtin13", "gtin12", "gtin8", "gtin"];
function ownGtin(obj) {
  for (const field of gtinFields) {
    const code = obj?.[field];
    if (typeof code === "string" && validGtin(code.trim())) return code.trim();
  }
  return null;
}

function priceValue(raw) {
  if ((typeof raw !== "number" && typeof raw !== "string") || !/^\d+(?:\.\d{1,2})?$/.test(String(raw)))
    return null;
  const cents = Math.round(Number(raw) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents / 100 : null;
}

function structs(html) {
  const entries = [];
  for (const m of html.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1]);
      for (const top of list(parsed)) entries.push(...list(top?.["@graph"] ?? top));
    } catch {
      /* Other machine-readable scripts can still contain a product. */
    }
  }
  return entries.filter((value) => value && typeof value === "object").slice(0, 500);
}

function samePage(raw, page) {
  if (!raw) return true;
  const a = publicShopUrl(raw, page.url),
    b = new URL(page.url);
  return a && a.hostname === b.hostname && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
}

function variantOptions(row) {
  return ["color", "size", "material", "pattern"]
    .map((k) => plain(row[k]?.name ?? row[k], 60))
    .filter(Boolean)
    .join(" · ");
}

function currentOffer(row, offer, page, observedAt, mayInherit) {
  if (
    !type(offer, "Offer") ||
    offer.eligibleQuantity ||
    offer.validForMemberTier ||
    offer.priceSpecification?.validForMemberTier ||
    (offer.priceValidUntil && String(offer.priceValidUntil).slice(0, 10) < observedAt.slice(0, 10)) ||
    (offer.validFrom && String(offer.validFrom).slice(0, 10) > observedAt.slice(0, 10))
  )
    return null;
  const url = publicShopUrl(offer.url ?? row.url ?? page.url, page.url);
  if (!url || url.hostname !== new URL(page.url).hostname) return null;
  // A bookmarked variant is evidence only for that explicit variant.
  const selected = new URL(page.url).searchParams;
  for (const key of ["variant", "sku", "size", "color", "pid"]) {
    if (selected.has(key) && ((!offer.url && !row.url) || url.searchParams.get(key) !== selected.get(key)))
      return null;
  }
  const currency = plain(offer.priceCurrency).toUpperCase();
  const price = priceValue(offer.price);
  if (price === null || !/^[A-Z]{3}$/.test(currency)) return null;
  const availability = plain(offer.availability).split("/").at(-1);
  const condition = plain(offer.itemCondition ?? row.itemCondition)
    .split("/")
    .at(-1);
  return {
    url: url.href,
    skuId: plain(offer.sku ?? row.sku) || null,
    gtin: ownGtin(offer) ?? (mayInherit ? ownGtin(row) : null),
    variant: plain(offer.name) || variantOptions(row) || plain(row.name),
    price,
    currency,
    available: availability ? availability === "InStock" : null,
    condition: condition || null,
    mpn: plain(offer.mpn ?? (mayInherit ? row.mpn : null)) || null,
    seller: plain(offer.seller?.name ?? offer.seller) || null,
  };
}

export function productItems(page, market, observedAt = new Date().toISOString()) {
  const entries = structs(page.text);
  const byId = new Map(entries.filter((row) => row["@id"]).map((row) => [row["@id"], row]));
  const resolve = (obj) => (obj?.["@id"] ? { ...byId.get(obj["@id"]), ...obj } : obj);
  const groups = entries.filter((row) => type(row, "ProductGroup") && samePage(row.url, page));
  // Ignore recommendation/carousel ItemLists, and products linked to other PDPs.
  const candidates = groups.length
    ? groups
    : entries.filter((row) => type(row, "Product") && samePage(row.url, page));
  if (candidates.length > 1 && candidates.every((row) => !row.url && !row.mainEntityOfPage)) return [];
  const items = [];
  for (const product of candidates.slice(0, 6)) {
    const name = plain(product.name);
    if (!name) continue;
    const variants = [];
    const children = type(product, "ProductGroup") ? list(product.hasVariant).map(resolve) : [product];
    for (const child of children) {
      if (!type(child, "Product")) continue;
      for (const raw of list(child.offers)) {
        const offer = currentOffer(child, resolve(raw), page, observedAt, list(child.offers).length === 1);
        if (offer && !variants.some((v) => JSON.stringify(v) === JSON.stringify(offer))) variants.push(offer);
      }
    }
    if (variants.length) {
      const site = new URL(page.url).hostname;
      items.push({
        productId: plain(product.productID ?? product.productGroupID ?? product.sku) || null,
        name,
        listingUrl: page.url,
        sourceUrl: page.url,
        market: market ?? null,
        brand: plain(product.brand?.name ?? product.brand) || null,
        model: plain(product.mpn ?? product.model?.name ?? product.model) || null,
        status: "priced",
        observedAt,
        variants: variants.slice(0, 50),
        seller: site,
      });
    }
  }
  return items.map(stableItem);
}

const digest = (data) => createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 24);
export function stableItem(item) {
  const ids = item.variants.map((v) => v.skuId);
  return {
    ...item,
    productId: "web-" + digest([item.listingUrl, item.productId, item.name]),
    variants: item.variants.map((v, i) => {
      const fallback = !v.skuId || ids.indexOf(v.skuId) !== ids.lastIndexOf(v.skuId);
      return {
        ...v,
        merchantSku: v.merchantSku ?? v.skuId ?? null,
        skuId: fallback ? "offer-" + digest([v.url, v.skuId, v.variant, v.gtin, i]) : v.skuId,
      };
    }),
  };
}

/** Some Shopify storefronts render variant inventory and barcodes with Remix.
 * Only read the product route for the handle in this page's URL. No script is evaluated. */
function hydratedProduct(page, market) {
  const url = new URL(page.url);
  const handle = url.pathname.match(/\/products\/([^/]+)\/?$/)?.[1];
  if (!handle) return [];
  const marker = "window.__remixContext = ";
  const begin = page.text.indexOf(marker);
  if (begin < 0) return [];
  const end = page.text.indexOf("};", begin + marker.length);
  if (end < 0) return [];
  let routes;
  try {
    routes = JSON.parse(page.text.slice(begin + marker.length, end + 1))?.state?.loaderData;
  } catch {
    return [];
  }
  for (const [route, data] of Object.entries(routes ?? {})) {
    if (!route.includes("products") || !data || typeof data !== "object") continue;
    const product = data.rootProduct ?? data.product;
    if (product?.handle !== handle || !plain(product.title)) continue;
    const rows = data.allVariants ?? product.variants?.nodes;
    if (!Array.isArray(rows)) continue;
    const variants = [];
    for (const row of rows.slice(0, 100)) {
      const id = typeof row?.id === "string" && row.id.match(/^gid:\/\/shopify\/ProductVariant\/(\d+)$/)?.[1];
      const amount = priceValue(row?.price?.amount),
        currency = row?.price?.currencyCode;
      if (
        !id ||
        amount === null ||
        !/^[A-Z]{3}$/.test(currency ?? "") ||
        typeof row.availableForSale !== "boolean"
      )
        continue;
      if (url.searchParams.has("variant") && url.searchParams.get("variant") !== id) continue;
      const options = Array.isArray(row.selectedOptions) ? row.selectedOptions : [];
      if (
        [...url.searchParams].some(([k, v]) => {
          const option = options.find(
            (o) => typeof o.name === "string" && o.name.toLowerCase() === k.toLowerCase(),
          );
          return option && String(option.value).toLowerCase() !== v.toLowerCase();
        })
      )
        continue;
      const variantUrl = new URL(page.url);
      variantUrl.search = "";
      variantUrl.searchParams.set("variant", id);
      variants.push({
        skuId: id,
        variant:
          plain(row.title) ||
          options
            .map((o) => plain(o.value))
            .filter(Boolean)
            .join(" / "),
        gtin: validGtin(row.barcode) ? row.barcode : null,
        available: row.availableForSale,
        price: amount,
        currency,
        url: variantUrl.href,
        condition: null,
        mpn: null,
        merchantSku: plain(row.sku) || null,
      });
    }
    if (variants.length)
      return [
        stableItem({
          productId: product.id,
          name: plain(product.title),
          brand: plain(product.vendor) || null,
          listingUrl: page.url,
          sourceUrl: page.url,
          seller: url.hostname,
          market,
          model: null,
          observedAt: new Date().toISOString(),
          status: "priced",
          variants,
        }),
      ];
  }
  return [];
}

// Shopify's public oEmbed prices carry an explicit currency. Its paired product
// JSON supplies the barcode for the same variant ID; never join variants by title.
export async function merchantItems(page, market, options) {
  const current = hydratedProduct(page, market);
  if (current.length) return current;
  const htmlItems = productItems(page, market);
  const url = new URL(page.url);
  if (
    !/\/products\/[\w%-]+\/?$/.test(url.pathname) ||
    (htmlItems.length && htmlItems.every((i) => i.variants.every((v) => v.gtin)))
  )
    return htmlItems;
  const root = url.origin + url.pathname.replace(/\/$/, "");
  async function json(suffix) {
    try {
      const result = await options.readPage(root + suffix, { signal: options.signal });
      if (new URL(result.url).origin !== url.origin) return null;
      return JSON.parse(result.text);
    } catch {
      return null;
    }
  }
  const [prices, metadata] = await Promise.all([json(".oembed"), json(".js")]);
  if (!Array.isArray(prices?.offers) || !plain(prices.title)) return htmlItems;
  const selected = url.searchParams.get("variant");
  const variants = [];
  for (const offer of prices.offers.slice(0, 100)) {
    const id = String(offer?.offer_id ?? "");
    if (!/^\d+$/.test(id) || (selected && id !== selected) || !/^[A-Z]{3}$/.test(offer.currency_code)) continue;
    const price = priceValue(offer.price);
    if (price === null || typeof offer.in_stock !== "boolean") continue;
    const variant = Array.isArray(metadata?.variants) ? metadata.variants.find((v) => String(v?.id) === id) : null;
    const gtin = variant?.barcode;
    variants.push({
      skuId: id,
      variant: plain(offer.title) || plain(prices.title),
      gtin: validGtin(gtin) ? gtin : null,
      price,
      currency: offer.currency_code,
      available: offer.in_stock,
      condition: null,
      mpn: null,
      url: root + "?variant=" + id,
    });
  }
  if (!variants.length) return htmlItems;
  return [
    stableItem({
      productId: plain(String(metadata?.id ?? "")),
      name: plain(prices.title),
      brand: plain(metadata?.vendor) || null,
      model: null,
      sourceUrl: page.url,
      listingUrl: page.url,
      market,
      observedAt: new Date().toISOString(),
      status: "priced",
      seller: url.hostname,
      variants,
    }),
  ];
}
