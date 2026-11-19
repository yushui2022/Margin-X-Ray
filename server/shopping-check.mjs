import { SHOP_ONION_VERSION, shopOnionVerdict } from "../src/shared/shop-onion.mjs";
import { lookupVideo, parseProfileAddress, parseShopListing, parseVideoAddress } from "./video-lookup.mjs";
import { compareTikTokShopOffers } from "./shop-web.mjs";
import { PRODUCT_LIMIT } from "./tiktok-shopping.mjs";
import { readShoppingRequest, sendJson, ShoppingError } from "./shopping-http.mjs";

export const shoppingMethodVersion = "tikhub-shop-v3.1";
const step = (stage, status, message) => ({ stage, status, message });
const value = (s, limit) => typeof s === "string" && s.trim().length <= limit ? s.trim() : "";

export function shoppingInput(body) {
  const raw = value(body?.url, 2048);
  const listing = parseShopListing(raw), profile = parseProfileAddress(raw), video = parseVideoAddress(raw);
  const source = listing ?? profile ?? video;
  if (!source || body?.query) throw new ShoppingError(400, "Paste a TikTok creator profile, video, or TikTok Shop product link to identify the original seller.");
  const market = listing?.market ?? body?.market ?? "US";
  if (!["US", "GB"].includes(market)) throw new ShoppingError(400, "This market is outside the current shopping check.");
  let selection;
  if (body?.selection != null) {
    const productId = value(body.selection.productId, 64), skuId = value(body.selection.skuId, 64);
    if (!productId || !skuId) throw new ShoppingError(400, "Choose a product and variant from the current report.");
    selection = { productId, skuId };
  }
  return { kind: listing ? "website" : profile ? "profile" : "video", url: source.url, market, selection };
}

async function collect(input, lookup, signal) {
  const source = await lookup(input.url, { market: input.market, signal, tikhubOnly: true });
  const commerce = source.commerce ?? [];
  const listedProducts = (source.listedProducts ?? []).filter(row => parseShopListing(row.url));
  const sampled = input.kind === "profile" && source.sample
    ? "Checked " + source.sample.checked + " recent public posts (limit " + source.sample.limit + "). " : "";
  const message = commerce.length
    ? sampled + "Found " + commerce.length + " linked TikTok Shop product" + (commerce.length === 1 ? "." : "s.")
    : sampled + (source.status === "partial" ? "TikHub could not verify all product attachments. " : "") +
      "No linked TikTok Shop product was verified. Paste a specific video or TikTok Shop listing to check it.";
  const steps = [step("source", commerce.length ? "found" : source.status === "partial" ? "unavailable" : source.status, message)];
  const missingDetails = commerce.filter(p => p.detailStatus === "unavailable").length;
  if (missingDetails) steps.push(step("details", "unavailable",
    "TikHub could not read listing details for " + missingDetails + (missingDetails === 1 ? " product. " : " products. ") + "Retry to check the missing prices."));
  return { ...source, kind: input.kind, market: input.market, scope: "tiktok-shop", products: [], commerce,
    listedProducts, sources: [], steps };
}

function selectedVariants(items, selection) {
  const tasks = [];
  for (const [productIndex, item] of items.entries()) {
    if (selection && selection.productId !== item.productId) continue;
    const initialSku = item.requestedSkuId || item.selectedSkuId ||
      (item.captionSkuId === undefined ? item.defaultSkuId : item.captionSkuId);
    const idx = selection ? item.variants.findIndex(v => v.skuId === selection.skuId)
      : initialSku ? item.variants.findIndex(v => v.skuId === initialSku) : item.captionSkuId !== null && item.variants.length === 1 ? 0 : -1;
    if (idx >= 0) tasks.push({ productIndex, variantIndex: idx });
    if (selection && idx >= 0) break;
  }
  if (selection && !tasks.length) throw new ShoppingError(409, "That variant is no longer listed. Run the original check again.");
  return tasks.slice(0, PRODUCT_LIMIT);
}

export async function completeShoppingCheck(source, input, { compare = compareTikTokShopOffers, signal, onStage = () => {} } = {}) {
  const report = { ...source, methodVersion: shoppingMethodVersion, steps: [...source.steps], checks: [] };
  const tasks = selectedVariants(report.commerce, input.selection);
  async function checkVariant({ productIndex, variantIndex }) {
    const item = report.commerce[productIndex], variant = item.variants[variantIndex];
    let check;
    if (!(variant.price > 0) || !variant.currency || variant.available === false) check = { status: "missing_price", offers: [], sources: [], comparison: null,
      message: variant.available === false ? "The source variant is unavailable. Choose an available variant." : "This variant needs a verifiable store price and currency." };
    else {
      try { check = await compare(item, { variantIndex, market: input.market, signal }); }
      catch { check = { status: "unavailable", offers: [], sources: [], comparison: null, message: "The other-shop lookup was unavailable. Retry or open the original listing." }; }
    }
    return { productIndex, variantIndex, ...check };
  }
  for (let i = 0; i < tasks.length; i += 2) {
    report.checks.push(...await Promise.all(tasks.slice(i, i + 2).map(checkVariant)));
  }
  const matched = report.checks.filter(row => row.comparison);
  const priced = report.commerce.some(item => item.variants.some(v => v.price > 0 && v.currency));
  if (report.checks.length) {
    const checkedIndices = new Set(tasks.map(task => task.productIndex));
    const remaining = input.selection ? 0 : report.commerce.filter((p, i) => !checkedIndices.has(i) && p.variants.length).length;
    const summary = tasks.length === 1 ? report.checks[0].message
      : "Checked " + tasks.length + " products for other-shop prices. Confirmed a comparable price for " + matched.length + ".";
    report.steps.push(step("comparison", matched.length ? "compared" : "partial",
      summary + (remaining ? " Choose a variant for " + remaining + (remaining === 1 ? " additional product." : " additional products.") : "")));
  } else if (report.commerce.length) {
    const message = input.market !== "US" ? "TikHub SKU price checks currently cover US TikTok Shop listings."
      : priced ? "Choose a listed variant to compare the same SKU across TikTok Shop sellers."
      : "TikHub identified the product but did not return a priced SKU. Paste its TikTok Shop listing to check again.";
    report.steps.push(step("comparison", "needs_input", message));
  }
  report.status = matched.length ? "compared" : priced ? "priced" : report.commerce.length || report.listedProducts.length ? "identified"
    : source.status === "no_evidence" ? "no_evidence" : "partial";
  report.message = report.steps.at(-1).message;
  onStage("decision");
  report.shopOnion = shopOnionVerdict(report, {version:SHOP_ONION_VERSION});
  return report;
}

// Cache source records separately so selecting another variant reuses the same
// post, product and SKU evidence. Failed or partial retail lookups are retryable.
export function createShoppingCheck({ lookup = lookupVideo, compare = compareTikTokShopOffers, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map(), pendingOffers = new Map();
  let calls = [];
  let running = 0;
  function compareOnce(item, options) {
    const { variantIndex, market } = options;
    const variant = item.variants[variantIndex];
    const key = JSON.stringify([market, item.listingUrl, item.productId, variantIndex, variant.skuId, variant.price, item.observedAt]);
    if (!pendingOffers.has(key)) {
      const task = Promise.resolve().then(() => compare(item, options)).finally(() => pendingOffers.delete(key));
      pendingOffers.set(key, task);
    }
    return pendingOffers.get(key);
  }
  function source(input, signal) {
    const key = JSON.stringify([input.kind, input.url, input.market]);
    const saved = cache.get(key);
    if (saved && saved.until > now()) return Promise.resolve(saved.data);
    let task = pending.get(key);
    if (!task) {
      task = collect(input, lookup, signal).then(data => {
        if (!data.steps.some(s => s.status === "unavailable") && (data.commerce.length || data.listedProducts.length)) {
          if (cache.size >= 150) cache.delete(cache.keys().next().value);
          cache.set(key, { data, until: now() + 5 * 60_000 });
        }
        return data;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    return task;
  }
  async function run(input, { signal, onStage = () => {} } = {}) {
    const deadline = AbortSignal.timeout(96_000);
    const budget = signal ? AbortSignal.any([signal, deadline]) : deadline;
    onStage("source");
    const data = await source(input, budget);
    budget.throwIfAborted();
    onStage("comparison");
    return completeShoppingCheck(data, input, { compare: compareOnce, signal: budget, onStage });
  }
  return { run, async handle(req, res) {
    if (req.url?.split("?")[0] !== "/api/shopping-check") return false;
    let counted = false;
    try {
      const input = shoppingInput(await readShoppingRequest(req, res));
      const ip = req.socket.remoteAddress, at = now();
      calls = calls.filter(row => at - row.at < 86_400_000);
      if (running >= 4 || calls.length >= 180 || calls.filter(row => row.ip === ip && at - row.at < 600_000).length >= 24)
        throw new ShoppingError(429, "Shopping checks are busy. Try again in a few minutes.");
      running++; counted = true; calls.push({ ip, at });
      sendJson(res, 200, await run(input));
    } catch (err) {
      const status = [400,403,404,405,409,413,415,422,429,503].includes(err.status) ? err.status : 503;
      sendJson(res, status, { error: err.status === status ? err.message : "Could not read this source. Retry or paste a TikTok Shop product link." });
    } finally { if (counted) running--; }
    return true;
  } };
}
