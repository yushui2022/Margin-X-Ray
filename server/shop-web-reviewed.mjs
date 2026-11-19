import edition from "../research/shop-price-benchmark-checks.json" with { type: "json" };
import { SHOP_ONION_VERSION, shopOnionVerdict } from "../src/shared/shop-onion.mjs";
import { parseShopListing } from "./video-lookup.mjs";

const leads = new Map();
const key = (market, product, variant) => [market, product.sellerId, product.productId, variant?.skuId].join("/");

// Keep only the address and identities of a cross-shop SKU that passed the
// edition's matching checks. All displayed details must come from a new read.
const observations = edition.formatVersion === 1 && edition.method === "shop-ranking-benchmark-v1" ? edition.observations : [];
for (const { product, checks } of observations) {
  const market = product.market;
  const receipt = shopOnionVerdict({ market, scope:"tiktok-shop", commerce:[product],
    checks:checks.map(check => ({...check,productIndex:0})) }, {version:SHOP_ONION_VERSION});
  for (const item of receipt.items) {
    const variant = product.variants[item.variantIndex];
    const offers = checks.filter(check => check.variantIndex === item.variantIndex).flatMap(check => check.offers);
    for (const peer of item.peers) {
      const target = parseShopListing(peer.url);
      const offer = offers.find(o => o.url === peer.url && o.skuId === target?.skuId);
      if (!offer?.sellerId || !target?.skuId || target.market !== market) continue;
      const slot = key(market, product, variant);
      if (!leads.has(slot)) leads.set(slot, { id:target.productId, skuId:target.skuId, sellerId:offer.sellerId,
        url:target.url, basis:item.basis });
    }
  }
}

export function reviewedShopLead(market, product, variant) {
  return leads.get(key(market, product, variant));
}
