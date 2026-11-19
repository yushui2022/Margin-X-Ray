import { validGtin } from "./creator-source-checks.mjs";
import { parseShopDetail } from "./tiktok-shopping.mjs";
import { parseShopListing } from "./video-lookup.mjs";
import { reviewedShopLead } from "./shop-web-reviewed.mjs";

import { words, ignored, sameShopProductForm, shopProductTitleQuery, hasComparableShopOption } from "../src/shared/shop-product-form.mjs";
import { shopTermDifference } from "../src/shared/shop-price-terms.mjs";
import { packageDifference } from "../src/shared/shop-onion-decision.mjs";
export { sameShopProductForm, shopProductQuery } from "../src/shared/shop-product-form.mjs";

const searchLimit = 20;
const detailLimit = 2;
const totalDetailLimit = 5;
function sellerKey(value) {
  return words(value)
    .filter((word) => !["us", "usa", "uk", "official", "shop", "store"].includes(word))
    .join("");
}

function platformId(value) {
  const text = Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === "string" && /^\d{8,24}$/.test(text) ? text : null;
}

function seller(name, id) {
  return { name: sellerKey(name), id: platformId(id) };
}

function sameSeller(left, right) {
  return Boolean((left.id && left.id === right.id) || (left.name && left.name === right.name));
}

function seenCandidate(candidate, previous) {
  return previous.some(other => other.id === candidate.id || sameSeller(other.merchant, candidate.merchant));
}

// Rank only the returned search window. A title/brand match selects a detail
// request; it is never proof that two SKUs have the same identity or price.
function rankResults(rows, item, query, originalSeller, originalId, variant, limit) {
  const original = words(item.name).join(" ");
  const brand = words(item.brand).join(" ");
  const meaningfulBrand = brand && !["unbranded", "generic", "no brand", "unknown"].includes(brand) ? brand : "";
  const brandWords = new Set(words(meaningfulBrand));
  const features = (value) => new Set(words(value).filter((w) => !ignored.has(w) && !brandWords.has(w)));
  const originalWords = features(item.name),
    queryWords = features(query);
  const model = words(variant?.mpn || item.model).join(" ");
  const modelSpecific = model.length >= 4 && /\d/.test(model);
  const ranked = [];
  for (const row of rows) {
    const id = platformId(row?.product_id);
    const merchant = seller(row?.seller_info?.shop_name, row?.seller_info?.seller_id);
    const title = words(row?.title).join(" ");
    if (!id || id === originalId || !title || sameSeller(originalSeller, merchant)) continue;
    if (!(originalSeller.name && merchant.name) && !(originalSeller.id && merchant.id)) continue;
    const field = " " + title + " ";
    const titleWords = features(title);
    const overlap = [...originalWords].filter((w) => titleWords.has(w)).length;
    const queryHits = [...queryWords].filter((w) => titleWords.has(w)).length;
    const brandHit = Boolean(
      meaningfulBrand &&
      (field.includes(" " + meaningfulBrand + " ") ||
        meaningfulBrand === words(row.brand_name ?? row.brand?.name).join(" ")),
    );
    const modelHit = modelSpecific && field.includes(" " + model + " ");
    const code = variant?.gtin;
    const barcodeHit =
      validGtin(code) &&
      [row.gtin, row.barcode, row.upc, row.ean, ...words(row.title)].some(
        (value) => validGtin(value) && value.padStart(14, "0") === code.padStart(14, "0"),
      );
    if (
      !overlap &&
      !queryHits &&
      !barcodeHit &&
      !modelHit &&
      title !== original &&
      !(brandHit && originalWords.size === 0)
    )
      continue;
    const formHit = sameShopProductForm(item, variant, { name: row.title });
    const relevance =
      (overlap * 2) / Math.max(1, originalWords.size + titleWords.size) + queryHits / Math.max(1, queryWords.size);
    ranked.push({
      id,
      merchant,
      relevantForm: formHit || barcodeHit || modelHit || title === original,
      rank: [
        Number(barcodeHit),
        Number(title === original),
        Number(formHit),
        Number(modelHit && brandHit),
        Number(brandHit && overlap > 0),
        Number(modelHit),
        relevance,
      ],
    });
  }
  ranked.sort((a, b) => {
    for (let n = 0; n < a.rank.length; n++) if (a.rank[n] !== b.rank[n]) return b.rank[n] - a.rank[n];
    return 0;
  });
  const selected = [];
  for (const candidate of ranked) {
    if (selected.length >= detailLimit && !candidate.relevantForm) continue;
    if (seenCandidate(candidate, selected)) continue;
    selected.push(candidate);
    if (selected.length === limit) break;
  }
  return selected;
}

export async function findShopSellers(item, query, { hub, market, variant, considerAnotherShop, signal }) {
  const products = [],
    sources = [];
  const counts = { checked: 0, detailsRequested: 0, detailsRead: 0 };
  let followUp;
  const result = (status, reason) => ({ status, reason, products, sources, counts, ...(followUp ? {followUp} : {}) });
  const term = typeof query === "string" ? query.replaceAll('"', "").trim().slice(0, 120) : "";
  const listing = parseShopListing(item?.listingUrl);
  if (!hub) {
    if (listing) sources.push({ url: listing.url, label: "TikTok Shop · seller search is not configured" });
    return result("unavailable", "not_configured");
  }
  if (market !== "US" || (listing?.market && listing.market !== market)) {
    if (listing)
      sources.push({ url: listing.url, label: "TikTok Shop · seller search is available for US listings only" });
    return result("unsupported_market", "unsupported_market");
  }
  if (!listing || (item.productId && String(item.productId) !== listing.productId))
    return result("unavailable", "source_unverified");
  if (!term) return result("unavailable", "query_missing");
  const originalSeller = seller(item.seller, item.sellerId);
  if (!originalSeller.name && !originalSeller.id) {
    sources.push({ url: listing.url, label: "TikTok Shop · original seller identity unavailable" });
    return result("seller_unknown", "source_seller_unknown");
  }
  const requested = [];
  async function search(searchTerm) {
    const url = "https://www.tiktok.com/shop/s?search_key=" + encodeURIComponent(searchTerm);
    try {
      const record = await hub("shop/web/fetch_search_products_list_v2", { search_word: searchTerm, region: market }, signal);
      const list = record?.data?.component_data?.products;
      if (record?.code !== 0 || !Array.isArray(list)) throw Error("Search unavailable");
      const rows = list.slice(0, searchLimit);
      counts.checked += rows.length;
      sources.push({url, label: "TikTok Shop · checked " + rows.length + " results for other sellers"});
      return rankResults(rows, item, searchTerm, originalSeller, listing.productId, variant, searchLimit)
        .map(candidate => ({...candidate, searchUrl:url}));
    } catch {
      sources.push({url, label:"TikTok Shop seller search unavailable"});
      return null;
    }
  }

  async function readDetails(batch) {
    requested.push(...batch);
    counts.detailsRequested += batch.length;
    const details = await Promise.all(
      batch.map(async (candidate) => {
        try {
          const payload = await hub("shop/web/fetch_product_detail_v3", {
            product_id: candidate.id,
            region: market,
          }, signal);
          return parseShopDetail(payload, candidate.id, market);
        } catch {
          return null;
        }
      }),
    );
    for (const [index, detail] of details.entries()) {
      const candidate = batch[index];
      const listingUrl = "https://shop.tiktok.com/us/pdp/" + candidate.id;
      if (!detail) {
        sources.push({ url: listingUrl, label: "TikTok Shop · seller listing details unavailable" });
        continue;
      }
      counts.detailsRead++;
      const merchant = seller(detail.seller, detail.sellerId);
      if (
        sameSeller(originalSeller, merchant) || products.some(p => sameSeller(seller(p.seller,p.sellerId),merchant)) ||
        !sameSeller(candidate.merchant, merchant) ||
        (merchant.id && candidate.merchant.id && merchant.id !== candidate.merchant.id) ||
        (!(originalSeller.id && merchant.id) && !(originalSeller.name && merchant.name))
      ) {
        sources.push({ url: listingUrl, label: "TikTok Shop · separate seller could not be verified" });
        continue;
      }
      if (candidate.skuId) {
        const pinned = detail.variants.find(v => v.skuId === candidate.skuId && v.available === true &&
          v.currency === variant.currency && v.price > 0);
        const offer = {...detail,variant:pinned?.variant,gtin:pinned?.gtin};
        if (!pinned || detail.weightConflict || item.weightConflict ||
            shopTermDifference(item,offer) || packageDifference(item,variant,offer) ||
            (candidate.basis === "similar" && !hasComparableShopOption(item,variant,offer,{namedShades:true}))) {
          sources.push({url:candidate.searchUrl, label:"TikTok Shop · reviewed SKU is no longer an eligible live offer"});
          continue;
        }
        detail.variants = [pinned];
      }
      products.push({
        ...detail,
        productId: candidate.id,
        listingUrl,
        sourceUrl: candidate.searchUrl,
        market,
        observedAt: new Date().toISOString(),
        confirmedDistinctShop: Boolean(originalSeller.id && merchant.id),
      });
      sources.push({
        url: listingUrl,
        label: "TikTok Shop seller · " + (detail.seller || "account " + merchant.id),
      });
    }
  }
  const lead = reviewedShopLead(market, item, variant);
  const directRead = lead && !signal?.aborted ? readDetails([{
    id:lead.id, skuId:lead.skuId, basis:lead.basis, merchant:seller(null,lead.sellerId), searchUrl:lead.url,
  }]) : null;
  const found = await search(term);
  if (!found) {
    await directRead;
    if (!products.length) return result("unavailable", "search_unavailable");
    const reason = considerAnotherShop?.(products);
    if (reason) followUp = {status:signal?.aborted ? "time_limit" : "unavailable", reason};
    return result("searched","seller_listings");
  }
  const first = found.filter(candidate => !seenCandidate(candidate, requested));
  const firstSlots = detailLimit - counts.detailsRequested;
  const alternate = !considerAnotherShop ? "" : validGtin(variant?.gtin) ? variant.gtin : shopProductTitleQuery(item,variant);
  const key = text => [...new Set(words(text))].sort().join(" ");
  const canSearchAgain = alternate && key(alternate) !== key(term);
  // One returned storefront cannot establish a second-shop benchmark. In that
  // case, use the SKU-detail wait to retrieve the alternate search window.
  const earlySearch = first.length < firstSlots && canSearchAgain && !signal?.aborted && considerAnotherShop([])
    ? search(alternate) : null;
  await Promise.all([directRead, readDetails(first.slice(0, firstSlots))]);
  const reason = considerAnotherShop?.(products);
  if (reason) {
    const before = counts.detailsRead;
    const attemptsBefore = counts.detailsRequested;
    let supplementalFailed = false;
    if (!signal?.aborted || earlySearch) {
      // While the next primary candidate is being checked, discover new shops
      // under a different name for this product. Keep the original deadline.
      const next = signal?.aborted ? [] : first.slice(firstSlots,firstSlots + 1);
      const extraSearch = earlySearch ?? (canSearchAgain ? search(alternate) : []);
      const [extra] = await Promise.all([extraSearch, readDetails(next)]);
      supplementalFailed = extra === null;
      const candidates = [];
      for (const candidate of [...(extra ?? []), ...first.slice(firstSlots + 1)]) {
        if (seenCandidate(candidate, requested) || seenCandidate(candidate, candidates)) continue;
        candidates.push(candidate);
        if (candidates.length >= totalDetailLimit - counts.detailsRequested) break;
      }
      for (let i = 0; i < candidates.length; i += detailLimit) {
        if (signal?.aborted || !considerAnotherShop(products)) break;
        await readDetails(candidates.slice(i,i + detailLimit));
      }
    }
    const complete = counts.detailsRead > before && !considerAnotherShop(products);
    const status = complete ? "checked" : signal?.aborted ? "time_limit" : supplementalFailed ? "unavailable" :
      counts.detailsRead > before ? "checked" : counts.detailsRequested > attemptsBefore ? "unavailable" : "no_more_shops";
    followUp = {status, reason};
  } else if (earlySearch) {
    await earlySearch;
  }
  if (!counts.detailsRequested) {
    if (followUp?.status === "unavailable" || followUp?.status === "time_limit") return result("unavailable","search_unavailable");
    return result("searched", counts.checked ? "no_eligible_sellers" : "no_results");
  }
  if (!counts.detailsRead) return result("unavailable", "details_unavailable");
  return result("searched", products.length ? "seller_listings" : "sellers_unverified");
}
