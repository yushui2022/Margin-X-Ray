import { validGtin } from "./creator-source-checks.mjs";
import { delay } from "./shopping-delay.mjs";

// TikTok sometimes serializes identifiers as JSON numbers, including inside JSON
// strings in shopping anchors. Preserve their decimal digits across both layers.
export function parseTikTokJson(text) {
  return JSON.parse(text, (_key, value, context) =>
    typeof value === "number" && !Number.isSafeInteger(value) && /^\d{16,}$/.test(context?.source)
      ? context.source : value);
}

function unpack(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw !== "string" || raw.length > 300_000) return null;
  try { return parseTikTokJson(raw); } catch { return null; }
}

const clean = (value, limit = 350) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const shopId = value => typeof value === "string" && /^\d{8,24}$/.test(value) ? value : null;
export const PROFILE_LIMIT = 5;
export const PRODUCT_LIMIT = 3;

export function shoppingAnchors(item) {
  const found = new Map();
  function add(id, title) {
    if (shopId(id) && (!found.has(id) || !found.get(id).name)) found.set(id, { productId: id, name: clean(title) });
  }
  function extract(anchor, depth = 0) {
    if (!anchor || depth > 2 || found.size >= PRODUCT_LIMIT) return;
    if (!['anchor_shop','anchor_complex_shop'].includes(anchor.component_key) && ![33,35].includes(anchor.type)) return;
    const extra = unpack(anchor.extra);
    if (Array.isArray(extra)) {
      for (const child of extra.slice(0,12)) extract(child, depth + 1);
    } else {
      add(extra?.product_id ?? anchor.product_id ?? (anchor.type === 33 || anchor.component_key === "anchor_shop" ? anchor.id : null), extra?.title ?? anchor.keyword);
    }
  }
  for (const entry of (Array.isArray(item.anchors) ? item.anchors : []).slice(0,12)) extract(entry);
  const share = URL.parse(item.share_info?.share_url ?? "");
  if (share?.hostname === "www.tiktok.com" && share.pathname.endsWith("/video/" + item.aweme_id)) {
    add(share.searchParams.get("placeholder_product_id"));
    add(unpack(share.searchParams.get("ec_shared_reflux_dynamic_params"))?.placeholder_product_id);
  }
  return [...found.values()].slice(0, PRODUCT_LIMIT);
}

function spec(info, names) {
  const specs = Array.isArray(info.specifications) ? info.specifications : [];
  return clean(specs.find(entry => names.includes(clean(entry?.name).toLowerCase()))?.value, 120) || null;
}

function skuOffer(sku, product, oneVariant, market) {
  const skuId = shopId(sku.sku_id ?? sku.skuId);
  if (!skuId) return null;
  const options = Array.isArray(sku.sku_sale_props) ? sku.sku_sale_props : [];
  const label = options.map(option => clean(option?.prop_value,100)).filter(Boolean).join(" / ");
  const amount = sku.price?.sale_price_decimal ?? sku.price?.sale_price_format;
  const currency = sku.price?.currency_name ?? sku.price?.currency ?? product.price?.currency;
  const price = currency === (market === "US" ? "USD" : "GBP") && /^\d+(\.\d{1,4})?$/.test(String(amount))
    && Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : null;
  const code = sku.gtin ?? sku.barcode ?? sku.upc ?? sku.ean ?? (oneVariant ? spec(product,["upc","gtin","ean","barcode"]) : null);
  const gtin = validGtin(code) ? code : null;
  const available = typeof sku.is_available === "boolean" ? sku.is_available
    : sku.stock === 0 ? false : Number.isInteger(sku.stock) && sku.stock > 0 && sku.status === 0 ? true : null;
  const mpn = clean(sku.mpn ?? sku.manufacturer_part_number, 120)
    || (oneVariant ? spec(product, ["manufacturer part number", "mpn"]) : null);
  return { skuId, variant: label || (oneVariant ? "Single variant" : "SKU " + skuId), gtin, price,
    ...(mpn ? { mpn } : {}), currency: price === null ? null : currency, available };
}

export function parseShopDetail(payload, productId, market) {
  const data = payload?.product_data;
  const components = data?.page_config?.components_map;
  const component = Object.values(components ?? {}).find(row => row?.component_name === "product_info")?.component_data;
  if (component?.error_code != null && Number(component.error_code) !== 0) return null;
  const initial = data?.initialData?.productInfo;
  const product = component?.product_info ?? initial?.product_info ?? initial;
  if (!product || (product.product_id ?? product.productId) !== productId || !clean(product.title)) return null;
  const skus = Array.isArray(product.skus) ? product.skus : [];
  const variants = skus.slice(0,150).map(sku => skuOffer(sku, product, skus.length === 1, market)).filter(Boolean);
  const sellerIds = new Set([component?.shop_info?.seller_id, product.seller_id, product.seller?.seller_id].filter(shopId));
  const sellerId = sellerIds.size === 1 ? [...sellerIds][0] : null;
  const material = spec(product, ["primary material", "main material", "material"]);
  const warranty = spec(product, ["warranty duration", "warranty period", "manufacturer warranty", "warranty"]);
  const volume = spec(product, ["volume"]), weight = spec(product, ["net weight", "net content", "net contents"]);
  const netWeight = weight || volume;
  const grams = (v) => /^\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*$/i.exec(v || "")?.[1];
  let weightConflict;
  if (grams(volume) && grams(weight) && Number(grams(volume)) !== Number(grams(weight))) {
    weightConflict = "The listing gives " + volume + " for volume and " + weight + " for net weight.";
    const description = (Array.isArray(product.desc_blocks) ? product.desc_blocks : [])
      .map(block => typeof block?.text === "string" ? block.text : "").join(" ");
    const fill = /contains approximately (\d+(?:\.\d+)?\s*g) of product/i.exec(description);
    if (fill) weightConflict += " Its description gives a fill of about " + fill[1] + ".";
  }
  return { name: clean(product.title), sellerId, ...(netWeight ? {netWeight} : {}), ...(weightConflict ? {weightConflict} : {}), ...(material ? {material} : {}), ...(warranty ? {warranty} : {}), brand: spec(product, ["brand","brand name"]) ?? (clean(product.brand_name,120) || null),
    model: spec(product, ["model","model number","manufacturer part number","mpn"]), seller: clean(component?.shop_info?.shop_name ?? product.seller?.name,120) || null,
    variants, defaultSkuId: shopId(product.default_sku_id), status: variants.some(sku => sku.price !== null) ? "priced" : "identified",
    detailStatus: Array.isArray(product.skus) ? "read" : "unavailable" };
}

export async function shopProducts(anchors, { market, hub, signal }) {
  const selected = new Map();
  for (const anchor of anchors) {
    if (!selected.has(anchor.productId)) selected.set(anchor.productId, anchor);
    if (selected.size === PRODUCT_LIMIT) break;
  }
  const items = [...selected.values()].map(anchor => ({
    productId: anchor.productId, name: anchor.name || "TikTok Shop item " + anchor.productId,
    listingUrl: anchor.listingUrl ?? "https://shop.tiktok.com/" + market.toLowerCase() + "/pdp/" + anchor.productId, sourceUrl: anchor.sourceUrl, market,
    brand: null, model: null, sellerId: null, variants: [], defaultSkuId: null,
    status: anchor.name ? "identified" : "linked", observedAt: new Date().toISOString(),
    detailStatus: market === "US" ? "unavailable" : "unsupported_market",
  }));
  if (!hub || market !== "US" || !items.length) return items;

  const budget = AbortSignal.timeout(32_000);
  const deadline = signal ? AbortSignal.any([budget, signal]) : budget;
  const queue = items.map(item => ({ item, retryAt: 0 }));
  let rateLimitedUntil = 0;
  async function readDetails() {
    while (queue.length && !deadline.aborted) {
      const { item, retryAt } = queue.shift();
      // Another in-flight request can extend Retry-After while a worker waits.
      while (Math.max(rateLimitedUntil, retryAt) > Date.now()) {
        const wait = Math.max(rateLimitedUntil, retryAt) - Date.now();
        if (wait > 1500 || deadline.aborted) return;
        try { await delay(wait, deadline); } catch { return; }
      }
      if (deadline.aborted) return;
      let backoff = 300;
      const requestSignal = AbortSignal.any([deadline, AbortSignal.timeout(14_000)]);
      try {
        const payload = await hub("shop/web/fetch_product_detail_v3", { product_id: item.productId, region: market }, requestSignal);
        const detail = parseShopDetail(payload, item.productId, market);
        if (detail) {
          Object.assign(item, detail);
          const requested = selected.get(item.productId).selectedSkuId;
          if (requested && item.variants.some(sku => sku.skuId === requested)) item.selectedSkuId = requested;
          if (item.detailStatus === "read") continue;
        }
      } catch (error) {
        const status = Number(error?.upstreamStatus ?? error?.status);
        if (deadline.aborted || (error?.name === "AbortError" && !requestSignal.aborted)) continue;
        if (status >= 400 && ![408, 425, 429, 500, 502, 503, 504].includes(status)) continue;
        if (Number.isFinite(error?.retryAfterMs)) backoff = Math.max(backoff, error.retryAfterMs);
        if (status === 429) rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + backoff);
      }
      // Original requests enter the queue first. Only unread details get a second attempt.
      if (!retryAt && !deadline.aborted && backoff <= 1500) queue.push({ item, retryAt: Date.now() + backoff });
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, readDetails));
  return items;
}
