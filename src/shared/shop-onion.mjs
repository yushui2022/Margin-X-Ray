import { comparableCondition, hasComparableShopOption } from "./shop-product-form.mjs";

import { shopTermDifference } from "./shop-price-terms.mjs";
import { decideItem, packageDifference, sampleDecision, unscoredDecision } from "./shop-onion-decision.mjs";
import { RANKING_SCORE_VERSION, rankingMedianScore } from "./shop-ranking-scale.mjs";

export { SHOP_ONION_SCALE, SHOP_ONION_ALLOWANCES } from "./shop-onion-decision.mjs";

export const SHOP_ONION_VERSION = RANKING_SCORE_VERSION;
export const SHOP_ONION_V2 = "shop-onion-v2";
const legacy = "shop-onion-v1";

export function shopOnionVersionForReport(report) {
  const recorded = report?.shopOnion?.version;
  if ([legacy, SHOP_ONION_V2, SHOP_ONION_VERSION].includes(recorded)) return recorded;
  if (/^tikhub-shop-v3(?:\.|$)/.test(report?.methodVersion ?? "")) return SHOP_ONION_VERSION;
  return /^tikhub-shop-v1(?:\.|$)/.test(report?.methodVersion ?? "") ? legacy : SHOP_ONION_V2;
}

function onePricePerShop(quotes) {
  const stores = new Map();
  for (const offer of quotes) {
    const previous = stores.get(offer.sellerId);
    if (!previous || offer.price < previous.price) stores.set(offer.sellerId, offer);
  }
  return [...stores.values()];
}

function termsConflict(product, variant, offer) {
  return shopTermDifference(product, offer) || packageDifference(product, variant, offer);
}

const currencies = { US: "USD", GB: "GBP" };
const platformId = (value) => typeof value === "string" && /^\d{8,24}$/.test(value);
const scoreFor = (premium) => Math.min(100, Math.max(0, Math.round(premium)));

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
}

function itemCents(price) {
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  const cents = Math.round(price * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

// The shopping pipeline saves canonical listing URLs. Both sides need a Shop
// product in the sampled market, including snapshots saved before scoring.
function listing(raw, market) {
  if (typeof raw !== "string") return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["shop.tiktok.com", "www.tiktok.com", "m.tiktok.com", "tiktok.com"].includes(url.hostname)
  )
    return null;
  const match = /^\/(?:(?:shop\/)?([a-z]{2})\/pdp|shop\/pdp|view\/product)\/(?:[^/]+\/)?(\d{8,24})\/?$/i.exec(
    url.pathname,
  );
  if (!match) return null;
  const region = (match[1] || url.searchParams.get("region") || "").toUpperCase();
  if (region && (region === "UK" ? "GB" : region) !== market) return null;
  return { id: match[2], sku: url.searchParams.get("sku_id") };
}

function comparablePeer(offer, product, variant, market) {
  if (
    !offer ||
    !comparableCondition(offer.name, offer) ||
    offer.available !== true ||
    offer.currency !== variant.currency ||
    itemCents(offer.price) === null ||
    !platformId(offer.sellerId) ||
    offer.sellerId === product.sellerId ||
    offer.verifiedShop === false
  )
    return false;
  const peer = listing(offer.url, market);
  return peer && peer.id !== product.productId && platformId(offer.skuId) && peer.sku === offer.skuId;
}

function benchmark(check, product, variant, market, annotatedSource, version, namedShades) {
  if (!Array.isArray(check.offers)) return null;
  const offered = check.offers.filter(
    (offer) =>
      comparablePeer(offer, product, variant, market) &&
      (version === legacy || !termsConflict(product, variant, offer)),
  );
  const comparison = check.comparison;
  if (comparison) {
    if (
      check.status !== "compared" ||
      comparison.basis !== "item" ||
      comparison.currency !== variant.currency ||
      comparison.sourcePrice !== variant.price
    )
      return null;
    const exact = offered.filter((offer) => offer.match === "exact");
    const peer = exact.find(
      (offer) => offer.url === comparison.alternativeUrl && offer.price === comparison.alternativePrice,
    );
    if (!peer || exact.some((offer) => offer.price < peer.price)) return null;
    return {
      basis: "exact",
      quotes: version === legacy ? exact : onePricePerShop(exact),
      selected: peer,
      peerCents: itemCents(peer.price),
    };
  }
  if (!annotatedSource || check.status !== "candidates") return null;
  const perShop = new Map();
  for (const offer of offered) {
    if (
      offer.match !== "candidate" ||
      offer.verifiedShop !== true ||
      !hasComparableShopOption(product, variant, offer, {namedShades})
    )
      continue;
    const previous = perShop.get(offer.sellerId);
    if (!previous || offer.price < previous.price) perShop.set(offer.sellerId, offer);
  }
  const quotes = [...perShop.values()];
  if (!quotes.length) return null;
  return {
    basis: "similar",
    quotes,
    selected: quotes.length === 1 ? quotes[0] : null,
    peerCents: median(quotes.map((offer) => itemCents(offer.price))),
  };
}

function scoreItem(check, product, variant, market, annotatedSource, version, namedShades) {
  const sourceCents = itemCents(variant?.price);
  if (
    sourceCents === null ||
    !comparableCondition(product.name, variant) ||
    !platformId(product.sellerId) ||
    !platformId(variant.skuId) ||
    variant.available !== true ||
    variant.currency !== currencies[market]
  )
    return null;
  const result = benchmark(check, product, variant, market, annotatedSource, version, namedShades);
  if (!result) return null;
  const sellerName = (offer) => offer.seller || "Shop " + offer.sellerId;
  const peers = result.quotes.map((offer) => ({
    seller: sellerName(offer),
    url: offer.url,
    price: offer.price,
  }));
  const premiumPct = ((sourceCents - result.peerCents) * 100) / result.peerCents;
  return {
    productIndex: check.productIndex,
    variantIndex: check.variantIndex,
    basis: result.basis,
    sourcePrice: sourceCents / 100,
    peerPrice: result.peerCents / 100,
    currency: variant.currency,
    peerUrl: result.selected?.url || "",
    peerSeller: result.selected ? sellerName(result.selected) : "",
    peerCount: new Set(result.quotes.map((offer) => offer.sellerId)).size,
    peers,
    premiumPct,
    ...(version === legacy ? { score: scoreFor(premiumPct) } : decideItem(product, variant, result, version)),
  };
}

export function shopOnionVerdict(report, { version = shopOnionVersionForReport(report), namedShades = version === SHOP_ONION_VERSION } = {}) {
  const items = [];
  const linked = new Map();
  const commerce = Array.isArray(report?.commerce) ? report.commerce : [];
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  if (
    (report?.scope === undefined || report.scope === "tiktok-shop") &&
    Object.hasOwn(currencies, report?.market)
  ) {
    for (const [index, product] of commerce.entries()) {
      if (
        product &&
        (!product.market || product.market === report.market) &&
        platformId(product.productId) &&
        listing(product.listingUrl, report.market)?.id === product.productId
      ) {
        linked.set(index, product.productId);
      }
    }
    const scored = new Map();
    for (const check of checks) {
      const id = linked.get(check?.productIndex);
      if (!id || !Number.isSafeInteger(check.variantIndex) || check.variantIndex < 0) continue;
      const product = commerce[check.productIndex];
      const variant = Array.isArray(product.variants) && product.variants[check.variantIndex];
      const item = scoreItem(check, product, variant, report.market, report.scope === "tiktok-shop", version, namedShades);
      const previous = scored.get(id);
      if (item && (!previous || (item.basis === "exact" && previous.basis === "similar")))
        scored.set(id, item);
    }
    items.push(...scored.values());
  }
  const bases = new Set(items.map((item) => item.basis));
  const premiumPct = items.length ? median(items.map((item) => item.premiumPct)) : null;
  const linkedCount = new Set(linked.values()).size;
  const verdict = {
    version,
    basis: bases.size > 1 ? "mixed" : items[0]?.basis || "none",
    score: premiumPct === null ? null : scoreFor(premiumPct),
    premiumPct,
    scoredCount: items.length,
    linkedCount,
    items,
  };
  if (version === legacy) return verdict;
  const scores = items.map((item) => item.score);
  verdict.score = version === SHOP_ONION_VERSION ? rankingMedianScore(scores) : scores.length ? Math.round(median(scores)) : null;
  const productDecisions = [];
  let concreteMismatch;
  const seen = new Set();
  for (const [index, id] of linked) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = items.find((row) => linked.get(row.productIndex) === id);
    const check = checks.find((c) => c?.productIndex === index);
    const product = commerce[index],
      variant = product.variants?.[check?.variantIndex];
    const conflict =
      variant &&
      check?.offers?.find?.(
        (offer) =>
          comparablePeer(offer, product, variant, report.market) &&
          ["exact", "candidate"].includes(offer.match) &&
          termsConflict(product, variant, offer),
      );
    let reason = "No eligible in-stock other-shop price was verified for this variant.";
    if (!variant) reason = "A priced variant must be identified before comparing sellers.";
    else if (variant.available === false) reason = "The original SKU was out of stock.";
    else if (variant.available !== true) reason = "The original SKU's availability could not be confirmed.";
    else if (conflict) reason = termsConflict(product, variant, conflict);
    else if (check?.status === "unavailable") reason = "The other-shop price lookup was unavailable.";
    const decision = item?.decision || unscoredDecision(reason);
    if (conflict && !item && variant.available === true) concreteMismatch ??= decision;
    productDecisions.push({
      productIndex: item?.productIndex ?? index,
      variantIndex: item?.variantIndex ?? check?.variantIndex ?? null,
      decision,
    });
  }
  verdict.productDecisions = productDecisions;
  if (!items.length)
    verdict.decision =
      concreteMismatch ||
      productDecisions[0]?.decision ||
      unscoredDecision("No linked product with a comparable price was verified in this check.");
  else if (report.kind === "profile" || linkedCount > 1)
    verdict.decision = sampleDecision(items, linkedCount, verdict.score);
  else verdict.decision = items[0].decision;
  return verdict;
}
