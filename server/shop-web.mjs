import { packageDifference } from "../src/shared/shop-onion-decision.mjs";
import { shopTermDifference } from "../src/shared/shop-price-terms.mjs";
import { hasComparableShopOption } from "../src/shared/shop-product-form.mjs";
import { comparableCondition, knownBrand, normalized, variantConflicts } from "../src/shared/shop-product-form.mjs";
import { hubClient } from "./video-lookup.mjs";
import { findShopSellers, sameShopProductForm, shopProductQuery } from "./shop-web-market.mjs";
import { validGtin } from "./creator-source-checks.mjs";
import { publicShopUrl } from "./public-shop-url.mjs";
import { pageLinks, plain, merchantItems } from "./shop-web-product.mjs";

// Public-retailer checks need Node's pinned HTTPS reader. TikHub checks use fetch only.
async function readPublicShopPage(...args) {
  const reader = await import("./shop-web-read.mjs");
  return reader.readPublicShopPage(...args);
}

const social = /(?:^|\.)(?:tiktok|instagram|facebook|youtube|pinterest|reddit|twitter|x)\.com$/;
const pdp = /\/(?:products?|dp|itm|pdp|shop\/p|gp\/product|p)\/[^/?#]+/i;
const host = (url) => publicShopUrl(url)?.hostname ?? "";
const source = (url, label) => ({ url, label });
const distinct = (rows) => [
  ...new Map(rows.filter((r) => r && publicShopUrl(r.url)).map((r) => [r.url, r])).values(),
];
const commonWords = new Set([
  "shop",
  "official",
  "the",
  "for",
  "and",
  "with",
  "this",
  "from",
  "that",
  "new",
  "store",
  "online",
]);
const terms = (s) => [
  ...new Set(
    normalized(s)
      .split(" ")
      .filter((w) => w.length > 2 && !commonWords.has(w)),
  ),
];
const phrase = (text) => plain(text).replace(/["<>]/g, " ").slice(0, 140);
const domain = (h) =>
  h
    .split(".")
    .slice(/\.(?:co\.uk|com\.au|co\.nz|co\.jp|com\.mx)$/.test(h) ? -3 : -2)
    .join(".");

function cappedSignal(parent, ms = 13500) {
  const deadline = AbortSignal.timeout(ms);
  return parent ? AbortSignal.any([parent, deadline]) : deadline;
}

async function attemptRead(url, options) {
  try {
    const page = await options.readPage(url, { signal: options.signal });
    const title = page?.text?.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1] ?? "";
    if (
      /captcha|robot check|access denied|verify (?:that )?you|just a moment|are you (?:a )?(?:robot|human)/i.test(
        title,
      )
    )
      return null;
    return page;
  } catch {
    return null;
  }
}

async function searchWeb(query, market, options, alternate = false) {
  if (alternate) {
    const url = new URL("https://search.yahoo.co.jp/search");
    url.searchParams.set("p", query);
    const page = await attemptRead(url.href, options);
    if (!page || !/(?:id="web"|sw-Card__title)/.test(page.text))
      return { searched: false, links: [], source: source(url.href, "Web search unavailable") };
    const links = pageLinks(page).filter(
      (r) =>
        !/(?:^|\.)(?:yahoo\.co\.jp|lycorp\.co\.jp|lycbiz\.com|yahoo-net\.jp)$/.test(host(r.url)) &&
        !social.test(host(r.url)),
    );
    return { searched: true, links: distinct(links).slice(0, 10), source: source(url.href, "Yahoo! web search") };
  }
  const url = new URL("https://www.bing.com/search");
  url.search = new URLSearchParams({
    q: query,
    format: "rss",
    setmkt: market === "GB" ? "en-GB" : "en-US",
  }).toString();
  const page = await attemptRead(url.href, options);
  if (!page || !/<rss\b/i.test(page.text))
    return { searched: false, links: [], source: source(url.href, "Web search unavailable") };
  const links = [...page.text.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(([, xml]) => {
    const link = plain(xml.match(/<link>([\s\S]*?)<\/link>/i)?.[1], 2048);
    return source(link, plain(xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1]) || host(link));
  });
  return {
    searched: true,
    links: distinct(links)
      .filter((r) => !social.test(host(r.url)))
      .slice(0, 8),
    source: source(url.href, "Public web search"),
  };
}

function pointsToCreator(page, handle) {
  if (!handle || !/^[\w.]{2,30}$/.test(handle)) return false;
  return pageLinks(page).some((link) => {
    const u = new URL(link.url);
    return (
      /^(?:www\.)?tiktok\.com$/.test(u.hostname) &&
      u.pathname.replace(/\/$/, "").toLowerCase() === "/@" + handle.toLowerCase()
    );
  });
}

function usefulTitle(query, title) {
  const a = terms(query),
    b = new Set(terms(title));
  return (
    a.length > 0 && a.filter((word) => b.has(word)).length >= Math.min(3, Math.max(1, Math.ceil(a.length / 2)))
  );
}

async function catalogFrom(page, input, options, followHub = true) {
  const existing = await merchantItems(page, input.market, options);
  if (existing.length) return existing;
  const site = new URL(page.url).hostname;
  const linkHub = /^(?:(?:www\.)?(?:linktr\.ee|beacons\.ai|bio\.site|linkin\.bio|stan\.store))$/.test(site);
  const links = distinct(pageLinks(page))
    .filter((row) => {
      const target = host(row.url);
      if (target === site) return pdp.test(new URL(row.url).pathname);
      return (
        followHub &&
        linkHub &&
        !social.test(target) &&
        (pdp.test(new URL(row.url).pathname) || /\b(?:shop|store|collection)\b/i.test(row.label))
      );
    })
    .sort((a, b) => Number(usefulTitle(input.name, b.label)) - Number(usefulTitle(input.name, a.label)))
    .slice(0, 2);
  const pages = await Promise.all(links.map((link) => attemptRead(link.url, options)));
  for (const p of pages.filter(Boolean)) {
    if (host(p.url) !== site) options.sources?.push(source(p.url, "Shop linked from " + site));
  }
  return (
    await Promise.all(
      pages
        .filter(Boolean)
        .map((p) =>
          followHub && linkHub && host(p.url) !== site
            ? catalogFrom(p, input, options, false)
            : merchantItems(p, input.market, options),
        ),
    )
  ).flat();
}

/** Read creator-linked shops before using web search to look for independent brands. */
export async function discoverStorefront(input = {}, { signal, readPage = readPublicShopPage } = {}) {
  const sources = [],
    items = [];
  const options = { signal: cappedSignal(signal), readPage, sources };
  const name = phrase(input.name),
    handle = plain(input.handle).replace(/^@/, ""),
    brand = phrase(input.brand);
  const direct = distinct(
    (Array.isArray(input.urls) ? input.urls : []).slice(0, 10).map((u) => source(u, "Creator-linked website")),
  )
    .filter((r) => !social.test(host(r.url)))
    .slice(0, 2);
  const pages = await Promise.all(direct.map((link) => attemptRead(link.url, options)));
  const linked = await Promise.all(
    pages.map(async (page, i) => {
      if (!page) {
        const url = direct[i].url;
        const fallback = await merchantItems({ url, text: "" }, input.market, options);
        sources.push(
          source(
            url,
            fallback.length
              ? "Public storefront product feed"
              : handle
                ? "Creator-linked page unavailable"
                : "Submitted page unavailable",
          ),
        );
        return fallback;
      }
      sources.push(source(page.url, handle ? "Creator-linked website" : "Submitted website"));
      return catalogFrom(page, input, options);
    }),
  );
  items.push(...linked.flat());
  if (!items.length && (handle || name || brand)) {
    const q = [handle && '"' + phrase(handle) + '"', brand, name, "official shop"]
      .filter(Boolean)
      .join(" ")
      .slice(0, 260);
    let result = await searchWeb(q, input.market, options);
    sources.push(result.source);
    const relevant = (row) => usefulTitle(brand || name || handle, row.label + " " + host(row.url));
    let leads = result.links.filter(relevant).slice(0, 3);
    if (!leads.length && !options.signal.aborted) {
      result = await searchWeb(q, input.market, options, true);
      sources.push(result.source);
      leads = result.links.filter(relevant).slice(0, 3);
    }
    sources.push(...leads.map((row) => source(row.url, "Possible store · " + row.label)));
    const discovered = await Promise.all(
      leads.map(async (row) => {
        const page = await attemptRead(row.url, options);
        // A name match alone never ties an unrelated merchant or founder to the creator.
        if (!page || !pointsToCreator(page, handle)) return [];
        sources.push(source(page.url, "Store links back to @" + handle));
        return catalogFrom(page, input, options);
      }),
    );
    items.push(...discovered.flat());
  }
  const unique = [...new Map(items.map((i) => [i.listingUrl + "#" + i.name, i])).values()].slice(0, 8);
  const status = unique.length
    ? "priced"
    : sources.some((r) => r.label.startsWith("Possible store"))
      ? "leads"
      : sources.length && sources.every((r) => r.label.includes("unavailable"))
        ? "unavailable"
        : "insufficient";
  return {
    status,
    items: unique,
    sources: distinct(sources).slice(0, 8),
    message: unique.length
      ? "These item prices were read from a linked store. Check which product and variant the creator featured."
      : status === "leads"
        ? "Possible websites turned up. The available pages did not verify both the creator relationship and a product price."
        : "No creator-linked store with a readable product price was confirmed. A direct shop or product link can narrow the search.",
  };
}

async function barcodeLinks(gtin, options) {
  if (!validGtin(gtin)) return { links: [], sources: [] };
  const url = "https://api.upcitemdb.com/prod/trial/lookup?upc=" + encodeURIComponent(gtin);
  const page = await attemptRead(url, options);
  let items;
  try {
    items = JSON.parse(page?.text).items;
  } catch {
    /* Public trial can be rate limited. */
  }
  const item =
    Array.isArray(items) &&
    items.find((row) =>
      [row.ean, row.upc, row.gtin].some(
        (code) => validGtin(code) && code.padStart(14, "0") === gtin.padStart(14, "0"),
      ),
    );
  const links = Array.isArray(item?.offers)
    ? item.offers
        .slice()
        .sort((a, b) => (b.updated_t ?? 0) - (a.updated_t ?? 0))
        .map((r) => source(r.link, plain(r.merchant) || "Retailer"))
    : [];
  return {
    links: distinct(links).slice(0, 3),
    sources: [source(url, items ? "Public barcode directory" : "Barcode directory unavailable")],
  };
}

function variantSimilarity(a, b) {
  const key = normalized(a),
    other = normalized(b);
  if (!key || !other) return 0;
  if (key === other) return 100;
  const words = new Set(key.split(" ")),
    alternatives = new Set(other.split(" "));
  const overlap = [...words].filter((w) => alternatives.has(w)).length;
  return overlap / Math.max(words.size, alternatives.size);
}

function matchesProduct(original, v, alternative, other) {
  if (variantConflicts(original, v, alternative, other)) return false;
  if (validGtin(v.gtin) && validGtin(other.gtin)) return v.gtin.padStart(14, "0") === other.gtin.padStart(14, "0");
  // Merchant SKU values are seller-local. Match manufacturer-declared numbers
  // only when the two brands and the complete variant options also agree.
  const brand = knownBrand(original.brand),
    variant = normalized(v.variant);
  if (
    !brand ||
    brand !== knownBrand(alternative.brand) ||
    !variant ||
    variant !== normalized(other.variant) ||
    variant === normalized(original.name) ||
    variant === normalized(alternative.name) ||
    /^(?:single variant|one size|default(?: title)?|sku \d+|standard)$/.test(variant)
  )
    return false;
  const usable = (value) => {
    const id = plain(value).trim();
    return id.length >= 5 &&
      id.length <= 60 &&
      /\d/.test(id) &&
      /[a-z]/i.test(id) &&
      /^[a-z\d][a-z\d ._/-]+$/i.test(id) &&
      !/^(?:sku|item)[ #:_-]+\d+$/i.test(id)
      ? id.toLowerCase()
      : null;
  };
  const left = usable(v.mpn) ?? usable(original.model);
  const right = usable(other.mpn) ?? usable(alternative.model);
  return !!left && left === right;
}

function retailQueries(item, variant, gtin) {
  const brand = phrase(item.brand),
    model = phrase(variant.mpn || item.model);
  const stop = new Set(terms(brand));
  // Marketplace titles often concatenate features and several use cases.
  // Keep the noun phrase before the first marketing clause and issue a shorter second query.
  const main = phrase(item.name).split(/\s+[–—-]\s+|[,|;]/)[0];
  const words = terms(main).filter((w) => !stop.has(w));
  const focus = words.slice(-2).join(" ") || main;
  const variantName = phrase(variant.variant);
  const detail =
    variantName &&
    !/^(?:single variant|default title|sku \d+)$/i.test(variantName) &&
    variantName !== item.name &&
    variantName.length <= 42
      ? variantName
      : "";
  const brandQuery = brand ? '"' + brand + '"' : "";
  const nameQuery = [brandQuery, model && '"' + model + '"', focus].filter(Boolean).join(" ");
  const short = [brand, words.slice(-4).join(" ") || focus, detail].filter(Boolean).join(" ");
  return [
    ...new Set(gtin ? ['"' + gtin + '"', nameQuery + " " + (model || detail || "retailer")] : [nameQuery, short]),
  ];
}

function relevantLead(link, item, gtin) {
  if (gtin && (link.label + " " + link.url).includes(gtin)) return true;
  const name = normalized(link.label + " " + link.url);
  return (!!normalized(item.brand) && name.includes(normalized(item.brand))) || usefulTitle(item.name, link.label);
}

/** Every eligible price comes from the merchant's SKU-level offer. Search snippets and directory prices are never compared. */
export async function compareWebOffers(
  item,
  {
    variantIndex = 0,
    market = item?.market,
    signal,
    readPage = readPublicShopPage,
    token = process.env.TIKHUB_TOKEN,
    fetchImpl = fetch,
    hub,
  } = {},
) {
  const options = { signal: cappedSignal(signal, 22000), readPage };
  const v = item?.variants?.[variantIndex],
    sources = [],
    offers = [];
  const empty = (message) => ({ status: "insufficient", offers: [], comparison: null, sources: [], message });
  if (!v || !plain(item.name)) return empty("Choose the exact source product and variant first.");
  const gtin = validGtin(v.gtin) ? v.gtin : null;
  const queries = retailQueries(item, v, gtin);
  const marketSearch = findShopSellers(item, queries[0], {
    market,
    hub: hub ?? hubClient({ token, fetchImpl, signal: options.signal }),
  });
  const [index, firstSearch] = await Promise.all([
    barcodeLinks(gtin, options),
    searchWeb(queries[0], market, options),
  ]);
  sources.push(...index.sources);
  const originalUrl = v.url ?? item.listingUrl;
  const sameRetailer = (url) => !!host(originalUrl) && domain(host(url)) === domain(host(originalUrl));
  const visited = new Set();
  let searched = false,
    checked = 0,
    readable = 0;
  for (let attempt = 0; attempt < queries.length; attempt++) {
    const search = attempt === 0 ? firstSearch : await searchWeb(queries[attempt], market, options, true);
    searched ||= search.searched;
    sources.push(search.source);
    const retailLinks = search.links
      .filter((r) => !sameRetailer(r.url) && relevantLead(r, item, gtin))
      .sort((a, b) => Number(/\/products\//.test(b.url)) - Number(/\/products\//.test(a.url)));
    const links = distinct([...(attempt === 0 ? index.links : []), ...retailLinks])
      .filter((r) => !sameRetailer(r.url) && !social.test(host(r.url)) && !visited.has(r.url))
      .slice(0, attempt === 0 ? 4 : 3);
    for (const r of links) visited.add(r.url);
    const results = await Promise.all(
      links.map(async (link) => {
        const page = await attemptRead(link.url, options);
        if (!page) return { link, page, products: [] };
        if (sameRetailer(page.url) || social.test(host(page.url))) return { link, page, products: [] };
        return { link, page, products: await merchantItems(page, market, options) };
      }),
    );
    for (const { link, page, products } of results) {
      checked++;
      if (page) readable++;
      const label = link.label.slice(0, 90);
      sources.push(
        source(
          page?.url || link.url,
          page
            ? (products.length ? "Retailer product page · " : "Page checked · ") + label
            : "Page unavailable · " + label,
        ),
      );
      for (const product of products) {
        for (const other of product.variants) {
          if (variantConflicts(item, v, product, other)) continue;
          const exact = matchesProduct(item, v, product, other);
          if (!exact && !usefulTitle(item.name, product.name)) continue;
          if (!comparableCondition(product.name, other)) continue;
          if (item.seller && normalized(item.seller) === normalized(other.seller)) continue;
          const url = other.url ?? product.listingUrl;
          if (offers.some((r) => r.url === url && r.variant === other.variant && r.price === other.price))
            continue;
          offers.push({
            name: product.name,
            variant: other.variant,
            url,
            price: other.price,
            currency: other.currency,
            match: exact ? "exact" : "candidate",
            available: other.available,
            gtin: other.gtin,
            observedAt: product.observedAt,
          });
        }
      }
    }
    if (
      offers.some((o) => o.match === "exact" && o.available && o.currency === v.currency) ||
      options.signal.aborted
    )
      break;
  }
  const marketplace = await marketSearch;
  addShopOffers(item, v, marketplace, offers, sources);
  return priceResult(item, v, market, offers, sources, { searched, checked, readable });
}

// The live shopping workflow uses this entry point. Its only network client
// reads the TikHub search results and SKU details for other TikTok Shop sellers.
export async function compareTikTokShopOffers(item, {
  variantIndex = 0, market = item?.market, token = process.env.TIKHUB_TOKEN, fetchImpl = fetch, hub, signal
} = {}) {
  const variant = item?.variants?.[variantIndex];
  if (!variant || !plain(item.name)) return {
    status: "insufficient", offers: [], sources: [], comparison: null, message: "Choose the exact source product and variant first."
  };
  const budget = cappedSignal(signal, 25_000);
  const query = shopProductQuery(item, variant);
  const shop = await findShopSellers(item, query, {
    market, variant, signal: budget, hub: hub ?? hubClient({ token, fetchImpl, signal: budget }),
    considerAnotherShop(products) {
      if (variant.available !== true || !item.sellerId || !(variant.price > 0)) return null;
      const reviewed = [];
      addShopOffers(item, variant, { products, sources: [] }, reviewed, []);
      const eligible = reviewed.filter(o => o.available === true && o.verifiedShop && !shopTermDifference(item, o) && !packageDifference(item, variant, o));
      const exactShops = new Set(eligible.filter(o => o.match === "exact").map(o => o.sellerId));
      if (exactShops.size >= 2) return null;
      if (exactShops.size === 1) return "Only one other shop had a verified in-stock offer for this SKU.";
      const peers = eligible.filter(o => hasComparableShopOption(item, variant, o, {namedShades:true}));
      if (new Set(peers.map(o => o.sellerId)).size < 2) return "Fewer than two other shops had comparable in-stock offers.";
      const prices = peers.map(o => o.price);
      if (Math.max(...prices) > Math.min(...prices) * 1.2) return "The first comparable shop prices differed by more than 20%.";
      return null;
    }
  });
  return tikTokShopPriceCheck(item, variant, shop, market);
}

// Price the verified seller-detail evidence returned by findShopSellers. A
// published benchmark can combine those results from several discovery terms.
export function tikTokShopPriceCheck(item, variant, shop, market = item.market) {
  const listings = new Map();
  for (const listing of shop.products) {
    if (listing.market !== market || listing.productId === item.productId ||
        (item.sellerId && listing.sellerId === item.sellerId)) continue;
    const previous = listings.get(listing.productId);
    if (!previous || listing.observedAt > previous.observedAt) listings.set(listing.productId, listing);
  }
  const offers = [], sources = [];
  addShopOffers(item, variant, {...shop,products:[...listings.values()]}, offers, sources);
  const result = priceResult(item, variant, market, offers, sources, { searched: shop.status !== "unavailable", checked: 0, readable: 0, shop });
  if (shop.followUp) result.followUp = shop.followUp;
  return result;
}

function addShopOffers(item, v, marketplace, offers, sources) {
  sources.push(...marketplace.sources);
  for (const product of marketplace.products) {
    const priced = product.variants.filter(
      (other) =>
        other.price > 0 &&
        other.currency === v.currency &&
        other.available !== false &&
        comparableCondition(product.name, other) &&
        !variantConflicts(item, v, product, other) &&
        (matchesProduct(item, v, product, other) ||
          (sameShopProductForm(item, v, product, other) && usefulTitle(item.name, product.name) &&
            !(validGtin(v.gtin) && validGtin(other.gtin) && v.gtin.padStart(14,"0")!==other.gtin.padStart(14,"0")))),
    );
    // Prefer the requested variant in the candidate list. Missing IDs or a
    // different option can never turn a similarly named seller listing into savings.
    priced.sort((a, b) => variantSimilarity(v.variant, b.variant) - variantSimilarity(v.variant, a.variant) ||
      Number(b.available === true) - Number(a.available === true));
    const same = priced.filter(
      (other) => product.confirmedDistinctShop && matchesProduct(item, v, product, other) && !shopTermDifference(item, product) &&
        !packageDifference(item, v, {name: product.name, variant: other.variant}),
    );
    // When the seller lists several editions, keep the closest compatible option.
    // For verified duplicates prefer an in-stock offer, then the lowest price.
    same.sort((a, b) => Number(b.available === true) - Number(a.available === true) || a.price - b.price);
    const choices = same.length ? same : priced.slice(0, 1);
    for (const other of choices.slice(0, 2)) {
      const url = new URL(product.listingUrl);
      url.searchParams.set("sku_id", other.skuId);
      offers.push({
        name: product.name,
        variant: other.variant,
        url: url.href,
        price: other.price,
        currency: other.currency,
        match: same.length ? "exact" : "candidate",
        available: other.available,
        gtin: other.gtin,
        observedAt: product.observedAt,
        seller: product.seller,
        sellerId: product.sellerId,
        skuId: other.skuId,
        verifiedShop: product.confirmedDistinctShop,
        ...(product.netWeight ? {netWeight: product.netWeight} : {}),
        ...(product.weightConflict ? {weightConflict: product.weightConflict} : {}),
        ...(product.material ? {material: product.material} : {}),
        ...(product.warranty ? {warranty: product.warranty} : {}),
      });
    }
  }
}

function priceResult(item, v, market, offers, sources, { searched, checked, readable, shop }) {
  const eligible = offers
    .filter((o) => o.match === "exact" && o.currency === v.currency && o.available === true)
    .sort((a, b) => a.price - b.price);
  const best = eligible[0];
  const sourcePrice = v.price;
  const comparison =
    best &&
    typeof sourcePrice === "number" &&
    Number.isFinite(sourcePrice) &&
    sourcePrice > 0 &&
    v.available === true &&
    { US: "USD", GB: "GBP" }[market] === v.currency &&
    comparableCondition(item.name, v)
      ? {
          basis: "item",
          sourcePrice,
          alternativePrice: best.price,
          currency: best.currency,
          difference: (Math.round(100 * sourcePrice) - Math.round(100 * best.price)) / 100,
          alternativeUrl: best.url,
          alternativeSeller: best.seller,
        }
      : null;
  const status = comparison
    ? "compared"
    : offers.length
      ? "candidates"
      : (!searched || (checked > 0 && readable === 0)) && !readable
        ? "unavailable"
        : "insufficient";
  const exact = offers.filter((o) => o.match === "exact");
  let missing =
    "The similar listings lack a verified matching barcode or manufacturer model and variant. Check the code on the original label or supply the exact retailer listing.";
  if (shop && offers.length && offers.every(o => !o.verifiedShop))
    missing = "The seller names differ, but a distinct shop ID could not be verified for both listings.";
  if (exact.length) {
    if (!exact.some((o) => o.currency === v.currency) || { US: "USD", GB: "GBP" }[market] !== v.currency)
      missing =
        "A matching product was found in a different currency or market. A price in the selected market is needed.";
    else if (!exact.some((o) => o.currency === v.currency && o.available === true))
      missing = "A matching product was found, but its availability is unknown or it is out of stock.";
    else if (v.available !== true)
      missing = "The other retailer has this variant. Stock on the original listing could not be confirmed.";
    else missing = "A comparable price and new-condition offer for the original variant is needed.";
  }
  return {
    status,
    offers: offers
      .sort(
        (a, b) =>
          Number(b.match === "exact") - Number(a.match === "exact") ||
          variantSimilarity(v.variant, b.variant) - variantSimilarity(v.variant, a.variant),
      )
      .slice(0, 15),
    comparison,
    sources: distinct(sources),
    message: comparison
      ? "Item-price difference for the same variant. Delivery, taxes and checkout discounts are excluded."
      : offers.length
        ? missing
        : shop
          ? ({ unavailable: "TikHub could not complete the other-shop lookup. Try again.",
              unsupported_market: "Other-shop price checks currently support US TikTok Shop listings.",
              seller_unknown: "TikHub did not identify the original seller. Another shop cannot be verified."
            }[shop.status] || "No comparable SKU was found among the TikTok Shop listings checked.")
        : status === "unavailable"
          ? "Public retailer discovery was unavailable. Try again or supply a retailer's product link."
          : checked === 0
            ? "The searches returned no relevant independent store listing. A same-variant price and savings are unknown."
            : "Checked " +
              checked +
              " linked page" +
              (checked === 1 ? "" : "s") +
              ". No independently verified in-stock price for the same variant was found. Savings are unknown.",
  };
}
