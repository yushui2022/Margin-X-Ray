import archive from "../research/creator-products.json" with { type: "json" };
import assessments from "../research/creator-confidence-assessments.json" with { type: "json" };
import samples from "../research/creator-screening.json" with { type: "json" };
import { ShoppingError as LookupError, sendJson as reply, readShoppingRequest } from "./shopping-http.mjs";
import { captionUrls, findProductCandidates, listingKey, conflictsWithComparedVariant } from "./creator-product-traces.mjs";

import { collectCreator } from "./creator-providers.mjs";
import { parseTikTokJson, shoppingAnchors, shopProducts, PRODUCT_LIMIT, PROFILE_LIMIT } from "./tiktok-shopping.mjs";

const tiktok = "https://www.tiktok.com";
const shortHosts = new Set(["vm.tiktok.com", "vt.tiktok.com"]);
const postHosts = new Set(["www.tiktok.com", "m.tiktok.com", "tiktok.com"]);
const listings = new Map(archive.products.map(product => [product.id, product]));
const evidence = new Map(assessments.products.map(item => [item.productId, item]));
const sources = new Map(archive.sources.map(source => [source.id, source]));
const archivedPosts = new Map();
for (const row of samples.creators) {
  if (row.status !== "sampled" || row.handle !== row.platformHandle?.toLowerCase()) continue;
  for (const post of row.posts) {
    if (post.url === `${tiktok}/@${row.handle}/video/${post.id}`) {
      archivedPosts.set(post.url, { caption: post.caption, publishedAt: post.publishedAt,
        observedAt: row.observedAt, provider: "Archived TikTok caption", sourceUrl: post.url });
    }
  }
}

const invalidLink = () => new LookupError(400, "Enter a public TikTok video, share link, or creator profile.");
const sourceUnavailable = () => new LookupError(503, "The public video source is temporarily unavailable. Try again or enter the product listing.");
const inaccessible = () => new LookupError(404, "This video could not be verified at the supplied public address. Check the video URL or enter the product listing.");
const privateProfile = () => Object.assign(inaccessible(), { privateProfile: true });

export function parseVideoAddress(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  const value = raw.trim();
  const url = URL.parse(value.includes("://") ? value : "https://" + value);
  if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
  // Reconstruct from fixed TikTok hosts and permitted paths, dropping share and tracking parameters.
  if (postHosts.has(url.hostname)) {
    const post = /^\/@([a-z\d_][a-z\d_.]{0,23})\/video\/(\d{6,22})\/?$/i.exec(url.pathname);
    if (post && !post[1].endsWith(".")) {
      const handle = post[1].toLowerCase();
      return { url: `${tiktok}/@${handle}/video/${post[2]}`, handle, id: post[2] };
    }
    const share = /^\/t\/([a-z\d_-]{4,64})\/?$/i.exec(url.pathname);
    if (share) return { url: `${tiktok}/t/${share[1]}/` };
  }
  if (shortHosts.has(url.hostname) && /^\/[a-z\d_-]{4,64}\/?$/i.test(url.pathname)) {
    return { url: "https://" + url.hostname + url.pathname.replace(/\/?$/, "/") };
  }
  return null;
}

async function resolveShare(address, fetchImpl, signal) {
  const visited = new Set();
  for (let step = 0; step < 4; step++) {
    if (address.id) return address;
    if (visited.has(address.url)) break;
    visited.add(address.url);
    const res = await fetchImpl(address.url, { redirect: "manual", signal, headers: { "User-Agent": "Mozilla/5.0" } });
    await res.body?.cancel();
    if ([404, 410].includes(res.status)) throw inaccessible();
    if (![301, 302, 303, 307, 308].includes(res.status)) throw sourceUnavailable();
    const location = res.headers.get("location");
    const next = location && URL.parse(location, address.url);
    address = next && parseVideoAddress(next.href);
    if (!address) throw inaccessible();
  }
  if (address?.id) return address;
  throw inaccessible();
}

async function readBody(response, maxBytes) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    const problem = [404, 410].includes(response.status) ? inaccessible() : sourceUnavailable();
    problem.upstreamStatus = response.status;
    const retry = response.headers.get("retry-after");
    if (retry) {
      const ms = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      if (Number.isFinite(ms)) problem.retryAfterMs = Math.max(0, ms);
    }
    throw problem;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw sourceUnavailable(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks).text();
}

function textCaption(value) {
  return typeof value === "string"
    ? value.slice(0, 5000).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact email omitted]").trim() : "";
}

function postedDate(raw) {
  const seconds = Number(raw);
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= Date.now() / 1000 ? new Date(seconds * 1000).toISOString() : null;
}

async function publicPost(address, { fetchImpl, signal, secUid }) {
  const res = await fetchImpl(address.url, { signal, redirect: "manual", headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } });
  const html = await readBody(res, 3 * 1024 * 1024);
  const state = html.match(/<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!state) throw sourceUnavailable();
  const detail = parseTikTokJson(state[1])?.__DEFAULT_SCOPE__?.["webapp.video-detail"];
  if ([10204, 10216, 10222].includes(detail?.statusCode)) throw inaccessible();
  const item = detail?.itemInfo?.itemStruct;
  if (!item || detail.statusCode !== 0) throw sourceUnavailable();
  if (item.id !== address.id || item.author?.uniqueId?.toLowerCase() !== address.handle ||
    (secUid && item.author?.secUid && item.author.secUid !== secUid)) throw inaccessible();
  if (item.author.privateAccount === true) throw privateProfile();
  if (item.privateItem || item.forFriend || item.isPrivate || item.isProhibited ||
    item.isCloseFriendsOnly || item.takeDown === 1 || item.shareEnabled === false) throw inaccessible();
  return { caption: textCaption(item.desc), publishedAt: postedDate(item.createTime), provider: "TikTok public post", sourceUrl: address.url,
    websiteUrls: siteLinks(item.author), brandClue: brandFromBio(item.author?.signature), anchors: shoppingAnchors(item) };
}

async function oembed(address, { fetchImpl, signal }) {
  const url = new URL("/oembed", tiktok); url.searchParams.set("url", address.url);
  const res = await fetchImpl(url, { signal, redirect: "error", headers: { Accept: "application/json" } });
  const data = JSON.parse(await readBody(res, 64 * 1024));
  // TikTok sometimes returns only a player ID. That response cannot verify its author.
  const id = data.embed_product_id ?? /\bdata-video-id=["'](\d+)["']/.exec(data.html ?? "")?.[1];
  const author = URL.parse(data.author_url);
  if (data.type !== "video" || id !== address.id || !author || author.protocol !== "https:" || !postHosts.has(author.hostname)
    || author.pathname.toLowerCase().replace(/\/$/, "") !== "/@" + address.handle) throw inaccessible();
  return { caption: textCaption(data.title), publishedAt: null, provider: "TikTok oEmbed", sourceUrl: address.url };
}

export function parseShopListing(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  const value = raw.trim();
  const url = URL.parse(value.includes("://") ? value : "https://" + value);
  if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port ||
    !(postHosts.has(url.hostname) || url.hostname === "shop.tiktok.com")) return null;
  const page = url.pathname.match(/^\/(?:(?:shop\/)?([a-z]{2})\/|shop\/)?pdp\/(?:[^/]+\/)?(\d{8,24})\/?$/i);
  const view = url.pathname.match(/^\/view\/product\/(\d{8,24})\/?$/);
  const productId = page?.[2] ?? view?.[1];
  if (!productId) return null;
  const region = (page?.[1] ?? url.searchParams.get("region") ?? "").toUpperCase();
  const market = region === "UK" ? "GB" : region || null;
  const sku = url.searchParams.get("sku_id") ?? url.searchParams.get("skuId");
  const skuId = sku && /^\d{8,24}$/.test(sku) ? sku : null;
  const canonical = market && /^[A-Z]{2}$/.test(market) ? "https://shop.tiktok.com/" + market.toLowerCase() + "/pdp/" + productId
    : tiktok + "/shop/pdp/" + productId;
  return { productId, market, skuId, url: canonical + (skuId ? "?sku_id=" + skuId : "") };
}

export function parseProfileAddress(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  const value = raw.trim();
  const url = value.startsWith("@") ? URL.parse(tiktok + "/" + value) : URL.parse(value.includes("://") ? value : "https://" + value);
  if (!url || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || !postHosts.has(url.hostname)) return null;
  const match = url.pathname.toLowerCase().match(/^\/@([a-z\d_][a-z\d_.]{0,23})\/?$/);
  return match && !match[1].endsWith(".") ? { handle: match[1], url: tiktok + "/@" + match[1] } : null;
}

export function hubClient({ fetchImpl, token, signal }) {
  if (!token) return null;
  return async (path, params, requestSignal = signal) => {
    const url = new URL(path, "https://api.tikhub.io/api/v1/tiktok/");
    url.search = new URLSearchParams(params).toString();
    const res = await fetchImpl(url, { signal: AbortSignal.any([signal, requestSignal, AbortSignal.timeout(14_000)]), redirect: "error",
      headers: { Accept: "application/json", Authorization: "Bearer " + token } });
    const json = parseTikTokJson(await readBody(res, 5 * 1024 * 1024));
    if (json?.code !== 200 || !json.data) {
      const problem = sourceUnavailable();
      if (Number.isInteger(json?.code)) problem.upstreamStatus = json.code;
      throw problem;
    }
    const code = Number(json.data.status_code ?? json.data.statusCode ?? 0);
    if ([10204, 10216, 10222].includes(code)) throw inaccessible();
    if (code !== 0) throw sourceUnavailable();
    return json.data;
  };
}

function siteLinks(author) {
  const signature = typeof author?.signature === "string" ? author.signature.replace(/(?<![\w@/])www\.(?=[\w-]+\.)/gi, "https://www.") : "";
  const values = [author?.bioLink?.link, author?.bioLink?.url, author?.bio_url, author?.bio_link?.link, signature];
  return [...new Set(values.flatMap(value => typeof value === "string" ? captionUrls(value) : []))]
    .filter(url => !/(^|\.)(tiktok\.com|tiktokv\.com)$/.test(new URL(url).hostname)).slice(0,5);
}

function brandFromBio(bio) {
  if (typeof bio !== "string") return null;
  const clue = bio.match(/(?:^|[\n|.!?])\s*(?:founder|co-founder|owner|creator)\s+(?:of\s+)?(@[\w.]{2,30}|[\p{L}\d][\p{L}\d '&-]{1,45})(?=[\n|.!?]|$)/iu)?.[1]?.trim();
  return clue || null;
}

function privateAuthor(author) {
  return Number(author?.private_account) > 0 || Number(author?.secret) > 0;
}

function hubMetadata(item, address, secUid) {
  if (!item || item.author?.unique_id?.toLowerCase() !== address.handle || item.aweme_id !== address.id ||
    (secUid && item.author.sec_uid && item.author.sec_uid !== secUid)) throw inaccessible();
  if (privateAuthor(item.author)) throw privateProfile();
  if (item.is_close_friends_only || item.status?.private_status > 0 || item.status?.is_delete ||
    item.status?.is_prohibited || item.status?.allow_share === false) throw inaccessible();
  return { caption: textCaption(item.desc), publishedAt: postedDate(item.create_time), provider: "TikHub", sourceUrl: address.url,
    websiteUrls: siteLinks(item.author), brandClue: brandFromBio(item.author?.signature), anchors: shoppingAnchors(item) };
}

async function tikhub(address, { hub, market, secUid, signal }) {
  const payload = await hub("app/v3/fetch_one_video_v3", { aweme_id: address.id, region: market }, signal);
  const items = payload.aweme_details ?? payload.aweme_list ?? [payload.aweme_detail ?? payload];
  return hubMetadata(Array.isArray(items) && items.find(row => row?.aweme_id === address.id && row.author?.unique_id?.toLowerCase() === address.handle), address, secUid);
}

async function getProfileUser(hub, handle) {
  const data = await hub("web/fetch_user_profile", { uniqueId: handle });
  const user = data.userInfo?.user ?? data.user;
  if (!user || user.uniqueId?.toLowerCase() !== handle) throw sourceUnavailable();
  if (user.privateAccount === true) throw privateProfile();
  return user;
}

function archivedVideo(address) {
  const sample = archivedPosts.get(address.url);
  if (sample) return sample;
  for (const product of archive.products.filter(item => item.handle === address.handle && item.postUrl === address.url)) {
    const origin = sources.get(evidence.get(product.id)?.relationshipSource);
    if (origin) return { caption: origin.excerpt, publishedAt: origin.publishedAt, observedAt: archive.observedAt,
      sourceUrl: origin.url, provider: "Archived source · " + origin.label };
  }
}

// Only recognize literal product-detail URLs from the observed caption. Preserve
// variant/market parameters. Reading the caption never contacts these stores.
function captionProductPages(urls, products, candidates) {
  const seen = new Set(products.map(product => listingKey(product.listingUrl)));
  const otherVariants = new Set(candidates.flatMap(group => group.listings.filter(listing => !listing.id).map(listing => listing.url)));
  const pages = [];
  for (const raw of urls) {
    const url = new URL(raw);
    const key = listingKey(raw);
    if (seen.has(key)) continue;
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname;
    let label;
    if (otherVariants.has(raw)) {
      label = "Linked variant on " + host;
    } else if (/^amazon\.(?:com|co\.uk|com\.au|ca|de|es|fr|it|co\.jp|nl|se|pl|com\.mx|in)$/.test(host)) {
      const match = path.match(/^\/(?:[^/]+\/)?(?:dp|gp\/product)\/([a-z0-9]{10})(?:\/ref=[^/]*)?\/?$/i);
      if (match) label = "Amazon item " + match[1].toUpperCase();
    } else if (host === "shop.tiktok.com" || host === "tiktok.com") {
      const listing = parseShopListing(raw);
      if (listing) label = "TikTok Shop item " + listing.productId;
    } else if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:collections\/[\w%-]+\/)?products\/[\w%-]+\/?$/i.test(path)
      && !/\/(?:all|search|collections|catalog)\/?$/i.test(path)) {
      label = "Product listing on " + host;
    }
    if (label) {
      pages.push({ url: raw, label });
      seen.add(key);
    }
    if (pages.length === 5) break;
  }
  return pages;
}

function matchedProducts(video, candidates) {
  const matches = new Map();
  function add(id, match, note) {
    const product = listings.get(id);
    const listing = sources.get(evidence.get(id)?.listingSource);
    if (!matches.has(id) && product && listing) matches.set(id, { id, name: product.name,
      variant: product.variant, listingUrl: listing.url, match, note });
  }
  for (const p of archive.products.filter(item => item.handle === video.handle && item.postUrl === video.url)) {
    if (!video.mentionedUrls.some(url => conflictsWithComparedVariant(p.id, url))) {
      add(p.id, "documented", "This post is linked to the product line in the archive. Check the variant and offer against the original post.");
    }
  }
  for (const candidate of candidates) {
    for (const listing of candidate.listings) {
      if (!listing.id || matches.has(listing.id)) continue;
      matches.set(listing.id, { id: listing.id, name: listing.label, listingUrl: listing.url, variant: listing.variant,
        match: "candidate", note: listing.basis === "listing" ? "The caption links this retail page. Confirm the selected variant and current offer."
          : "The caption mentions the product line. Check the exact variant and purchase link." });
    }
  }
  return [...matches.values()];
}

function postAttachments(anchors, report, market) {
  const result = (anchors ?? []).map(anchor => ({ ...anchor, sourceUrl: report.video.url }));
  for (const entry of report.listedProducts) {
    const listing = parseShopListing(entry.url);
    if (!listing || (listing.market && listing.market !== market)) continue;
    const attached = result.find(row => row.productId === listing.productId);
    if (attached) {
      attached.listingUrl = listing.url;
      attached.selectedSkuId = listing.skuId;
    } else result.push({ productId: listing.productId, sourceUrl: report.video.url, listingUrl: listing.url, selectedSkuId: listing.skuId });
  }
  if (result.length === 1) result[0].caption = report.video.caption;
  return result;
}

// A named foundation shade can differ from the shop's preselected SKU. A
// swatch of several shades, or a code shared by two sizes, needs a selection.
function captionShadeSku(item, caption) {
  if (!caption || !/\b(?:foundation|concealer|cushion)\b/i.test(item.name)) return undefined;
  const codePattern = /\b\d{1,2}[cnw]\d?\b/gi;
  const codes = new Set((caption.toUpperCase().match(codePattern) ?? []));
  if (!codes.size) return undefined;
  const namedShade = /\b(?:shades?|tones?|tonos?)\s*(?:is\s+)?[\s:#“”"'‘’-]*\d{1,2}[cnw]\d?\b/i.test(caption);
  const words = value => " " + String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  const text = words(caption);
  if (!namedShade && !item.variants.some(v => v.variant?.match(codePattern) && text.includes(words(v.variant)))) return undefined;
  if (codes.size !== 1) return null;
  const [code] = codes;
  const choices = item.variants.filter(v => (v.variant?.toUpperCase().match(codePattern) ?? []).includes(code));
  return choices.length === 1 ? choices[0].skuId : null;
}

async function readShopProducts(attachments, options) {
  const items = await shopProducts(attachments, options);
  for (const item of items) {
    // shopProducts keeps the first attachment and its source for each product.
    const attachment = attachments.find(row => row.productId === item.productId);
    if (attachment?.selectedSkuId) item.requestedSkuId = attachment.selectedSkuId;
    else {
      const captionSku = captionShadeSku(item, attachment?.caption);
      if (captionSku !== undefined) item.captionSkuId = captionSku;
    }
  }
  return items;
}

export async function lookupVideo(raw, { fetchImpl = fetch, token = process.env.TIKHUB_TOKEN, signal, market = "US", tikhubOnly = false, profileFallback } = {}) {
  if (!["US","GB"].includes(market)) throw new LookupError(400, "Choose a supported shopping market.");
  const listing = parseShopListing(raw), profile = parseProfileAddress(raw), start = parseVideoAddress(raw);
  if (!listing && !profile && !start) throw invalidLink();
  signal?.throwIfAborted();
  const budget = signal ? AbortSignal.any([signal, AbortSignal.timeout(44_000)]) : AbortSignal.timeout(44_000);
  const hub = hubClient({ fetchImpl, token, signal: budget });
  if (tikhubOnly && !hub) throw sourceUnavailable();
  if (listing) {
    const region = listing.market ?? market;
    if (!["US","GB"].includes(region)) throw new LookupError(400, "This product link is for a market outside the current shopping check.");
    const commerce = await readShopProducts([{ productId: listing.productId, sourceUrl: listing.url, listingUrl: listing.url, selectedSkuId: listing.skuId }], { market: region, hub, signal: budget });
    return { kind: "website", sourceUrl: listing.url, market: region, products: [], listedProducts: [], brandClue: commerce[0].brand,
      websiteUrls: [], commerce, sample: { checked: 0, limit: 0 }, status: commerce[0].status === "linked" ? "partial" : commerce[0].status,
      message: commerce[0].status === "priced" ? "Read the listed TikTok Shop variants and prices." : "Found the TikTok Shop product link. A price for this market could not be verified." };
  }
  if (profile) {
    const result = await lookupProfile(profile, { fetchImpl, hub, market, signal: budget, tikhubOnly, profileFallback });
    signal?.throwIfAborted();
    return result;
  }
  let address = start, metadata, error;
  if (!address.id && tikhubOnly) {
    const payload = await hub("app/v3/fetch_one_video_by_share_url", { share_url: address.url });
    const rows = payload.aweme_details ?? payload.aweme_list ?? [payload.aweme_detail ?? payload];
    const item = Array.isArray(rows) && rows.length === 1 && rows[0];
    address = item && parseVideoAddress(tiktok + "/@" + item.author?.unique_id + "/video/" + item.aweme_id);
    if (!address?.id) throw inaccessible();
    metadata = hubMetadata(item, address);
  } else {
    address = await resolveShare(start, fetchImpl, AbortSignal.any([budget, AbortSignal.timeout(4500)]));
  }
  const providers = tikhubOnly ? [tikhub] : hub ? [tikhub, publicPost, oembed] : [publicPost, oembed];
  for (const provider of providers) {
    if (metadata) break;
    try {
      metadata = await provider(address, { fetchImpl, hub, market, signal: provider === tikhub ? budget : AbortSignal.any([budget, AbortSignal.timeout(4500)]) });
      break;
    } catch (failure) {
      signal?.throwIfAborted();
      if (failure.status === 404) throw failure;
      if (!error || failure.status === 503) error = failure;
      if (budget.aborted) break;
    }
  }
  // A temporary failure on the individual-video endpoint can still leave the
  // exact post and its native attachment in the creator's recent public feed.
  if (!metadata && tikhubOnly && !budget.aborted && ![400, 401, 403, 429].includes(error?.upstreamStatus)) {
    try {
      const feed = await hub("app/v3/fetch_user_post_videos", {
        unique_id: address.handle, count: String(PROFILE_LIMIT), max_cursor: "0", region: market
      });
      const post = Array.isArray(feed.aweme_list) && feed.aweme_list.slice(0, PROFILE_LIMIT)
        .find(row => row?.aweme_id === address.id && row.author?.unique_id?.toLowerCase() === address.handle);
      if (post) metadata = hubMetadata(post, address);
    } catch (failure) {
      if (failure.status === 404) throw failure;
      signal?.throwIfAborted();
    }
  }
  if (!metadata && !tikhubOnly) metadata = archivedVideo(address);
  if (!metadata) throw error instanceof LookupError ? error : sourceUnavailable();
  const result = videoResult(address, metadata, tikhubOnly);
  result.commerce = await readShopProducts(postAttachments(metadata.anchors, result, market), { hub, market, signal: budget });
  if (hub && !result.commerce.length && !result.products.length && !result.listedProducts.length && !result.websiteUrls.length && !budget.aborted) {
    try {
      const author = await getProfileUser(hub, address.handle);
      result.websiteUrls = siteLinks(author);
      result.brandClue ??= brandFromBio(author.signature);
    } catch (error) {
      if (error.privateProfile) throw error;
    }
  }
  result.brandClue ??= brandFromBio(result.video.caption);
  result.status = result.commerce.some(item => item.status === "priced") ? "priced" : result.commerce.length ? "identified"
    : result.products.length || result.listedProducts.length ? "identified" : !hub || metadata.provider !== "TikHub" ? "partial" : "no_evidence";
  if (result.commerce.length) result.message = "TikTok Shop attached these items to the video. Check the specific variant before comparing prices.";
  return result;
}

function videoResult(address, metadata, tikhubOnly = false) {
  const { anchors, websiteUrls = [], brandClue = null, ...visible } = metadata;
  const video = { ...address, ...visible, observedAt: metadata.observedAt ?? new Date().toISOString().slice(0, 10) };
  video.mentionedUrls = captionUrls(video.caption);
  const candidates = tikhubOnly ? [] : findProductCandidates(video.handle, { posts: [video], observedAt: video.observedAt });
  const products = tikhubOnly ? [] : matchedProducts(video, candidates);
  const listedProducts = captionProductPages(video.mentionedUrls, products, candidates);
  return { kind: "video", video, products, listedProducts, websiteUrls, brandClue, commerce: [], status: "partial",
    sample: { checked: 1, limit: 1 }, message: products.length || listedProducts.length
    ? "Select a product or caption listing to inspect its available retail prices."
    : tikhubOnly ? "TikHub returned no product link for this post." : "No product in the comparison archive could be identified from this post. Paste the product listing to continue." };
}

function postProductIds(post, market) {
  const attached = (post.anchors ?? []).map(anchor => anchor.productId);
  for (const url of captionUrls(post.caption)) {
    const listing = parseShopListing(url);
    if (listing && (!listing.market || listing.market === market)) attached.push(listing.productId);
  }
  return attached;
}

async function hydrateProfilePosts(posts, { fetchImpl, hub, market, signal, secUid, tikhubOnly }, unresolved) {
  let useHub = Boolean(hub) && posts[0]?.provider === "TikHub";
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(9000)]);
  const removed = new Set(), known = new Set(), needsDetail = [];
  for (const post of posts) {
    const attached = postProductIds(post, market);
    if (attached.length) {
      attached.forEach(id => known.add(id));
      unresolved.delete(post.id);
    } else needsDetail.push(post);
  }
  for (const post of needsDetail) {
    if (known.size >= PRODUCT_LIMIT || deadline.aborted) break;
    const options = { fetchImpl, hub, market, secUid, signal: AbortSignal.any([deadline, AbortSignal.timeout(3500)]) };
    let detail;
    try {
      if (useHub) {
        try { detail = await tikhub(post, options); }
        catch (error) {
          if (error.status === 404) throw error;
          // A failing detail endpoint gets one attempt across the entire sample.
          useHub = false;
        }
      }
      if (!detail) {
        if (tikhubOnly || deadline.aborted) break;
        detail = await publicPost(post, { ...options, signal: AbortSignal.any([deadline, AbortSignal.timeout(3500)]) });
      }
      Object.assign(post, detail);
      unresolved.delete(post.id);
      for (const id of postProductIds(detail, market)) known.add(id);
    } catch (error) {
      if (error.privateProfile) throw error;
      if (error.status === 404) {
        removed.add(post.id);
        unresolved.add(post.id);
      }
    }
  }
  return posts.filter(post => !removed.has(post.id));
}

async function lookupProfile(address, { fetchImpl, hub, market, signal, tikhubOnly, profileFallback }) {
  let bio = "", brandClue = null, provider = "TikHub", urls = [], posts = [], sampleComplete = false;
  let profileUser, secUid;
  const excluded = new Set(), unresolved = new Set();
  if (hub) {
    try { profileUser = await getProfileUser(hub, address.handle); }
    catch (err) {
      if (err.privateProfile) throw err;
      if (profileFallback) {
        try { profileUser = await profileFallback.findUser(hub, address.handle); }
        catch (fallbackError) { if (fallbackError.privateProfile) throw fallbackError; }
      }
      if (!profileUser && err.status === 404) throw err;
    }
    if (profileUser) {
      bio = textCaption(profileUser.signature); urls = siteLinks(profileUser); brandClue = brandFromBio(bio);
      if (typeof profileUser.secUid === "string" && profileUser.secUid.length <= 256) secUid = profileUser.secUid;
    }
    try {
      // The app feed also accepts a handle when the separate web profile service is down.
      const params = { unique_id: address.handle, max_cursor: "0", count: String(PROFILE_LIMIT), region: market };
      if (secUid) params.sec_user_id = secUid;
      let data;
      try { data = await hub("app/v3/fetch_user_post_videos", params); }
      catch (err) { if (!profileFallback || !secUid || err.privateProfile) throw err; }
      if (!Array.isArray(data?.aweme_list) && profileFallback && secUid)
        data = await profileFallback.readFeed(hub, secUid, market);

      if (!Array.isArray(data.aweme_list)) throw sourceUnavailable();
      const ids = new Set();
      for (const item of data.aweme_list.slice(0, PROFILE_LIMIT)) {
        const id = item?.aweme_id;
        if (typeof id !== "string" || !/^\d{6,22}$/.test(id) || ids.has(id) || item.author?.unique_id?.toLowerCase() !== address.handle) continue;
        ids.add(id);
        const post = { ...address, id, url: address.url + "/video/" + id };
        try {
          posts.push({ ...post, ...hubMetadata(item, post, secUid) });
          secUid ||= item.author.sec_uid;
          if (tikhubOnly || !Array.isArray(item.anchors)) unresolved.add(id);
          if (!profileUser && posts.length === 1) {
            bio = textCaption(item.author.signature); urls = siteLinks(item.author); brandClue = brandFromBio(bio);
          }
        } catch (error) {
          if (error.privateProfile) throw error;
          excluded.add(id);
        }
      }
      sampleComplete = posts.length > 0 || (Boolean(profileUser) && data.aweme_list.length === 0 && !(profileUser.awemeCount > 0));
    } catch (error) {
      if (error.status === 404) throw error;
    }
  }
  if (!sampleComplete && !tikhubOnly) {
    try {
      const sample = await collectCreator(address.handle, { fetchImpl, token: "", signal });
      bio ||= sample.profile.bio; brandClue ??= brandFromBio(bio); urls = [...new Set([...urls,...siteLinks({ signature: bio })])];
      provider = profileUser ? "TikHub + TikTok public embed" : sample.provider;
      posts = sample.posts.slice(0, PROFILE_LIMIT).filter(post => !excluded.has(post.id) && parseVideoAddress(post.url))
        .map(post => ({ ...post, handle: address.handle, provider: sample.provider, sourceUrl: post.url }));
      sampleComplete = !sample.postsUnavailable;
      for (const post of posts) unresolved.add(post.id);
    } catch (error) {
      if (error.code === "PROFILE_INACCESSIBLE") throw inaccessible();
      if (!profileUser) throw sourceUnavailable();
    }
  }
  if (!sampleComplete && !profileUser && tikhubOnly) throw sourceUnavailable();
  posts = await hydrateProfilePosts(posts, { fetchImpl, hub, market, secUid, signal, tikhubOnly }, unresolved);
  sampleComplete &&= !unresolved.size;
  const observedAt = new Date().toISOString().slice(0,10);
  const reports = posts.map(post => videoResult({ id: post.id, handle: address.handle, url: post.url }, post, tikhubOnly));
  const products = [...new Map(reports.flatMap(row => row.products.map(product => [product.id, { ...product, sourceUrl: row.video.url }]))).values()];
  const listedProducts = [...new Map(reports.flatMap(row => row.listedProducts.map(product => [product.url, { ...product, sourceUrl: row.video.url }]))).values()];
  const anchors = posts.flatMap((post, index) => postAttachments(post.anchors, reports[index], market));
  const commerce = await readShopProducts(anchors, { hub, market, signal });
  const status = commerce.some(item => item.status === "priced") ? "priced" : commerce.length || products.length || listedProducts.length ? "identified" : sampleComplete ? "no_evidence" : "partial";
  return { kind: "profile", video: { ...address, provider, caption: bio, sourceUrl: address.url, publishedAt: null, observedAt,
    mentionedUrls: captionUrls(bio) }, sample: { checked: posts.length, limit: PROFILE_LIMIT }, productLimit: PRODUCT_LIMIT,
    sampledPosts: reports.map(row => ({ url: row.video.url, caption: row.video.caption, publishedAt: row.video.publishedAt, provider: row.video.provider })),
    ...(profileUser?.nickname ? { displayName: profileUser.nickname, profileAvatar: profileUser.avatarMedium || profileUser.avatarThumb } : {}),
    websiteUrls: urls, brandClue, products, listedProducts, commerce, status, message: "Checked " + posts.length + " public posts for shopping evidence." };
}

const DAY = 24 * 60 * 60 * 1000;
const TTL = 30 * 60 * 1000;

export function createVideoLookup({ token = process.env.TIKHUB_TOKEN, fetchImpl = fetch, now = Date.now, dailyLimit = 120, tikhubOnly = false } = {}) {
  const cache = new Map(), inFlight = new Map();
  let requests = [];
  return { async handle(req, res) {
    if (req.url?.split("?")[0] !== "/api/video-lookup") return false;
    try {
      const body = await readShoppingRequest(req, res);
      const address = parseShopListing(body?.url) ?? parseProfileAddress(body?.url) ?? parseVideoAddress(body?.url);
      const market = body?.market ?? "US";
      if (!["US", "GB"].includes(market)) throw new LookupError(400, "Choose a supported shopping market.");
      if (!address) throw invalidLink();
      const time = now();
      const cacheKey = market + "/" + address.url;
      const cached = cache.get(cacheKey);
      if (cached && cached.expires > time) { reply(res, 200, cached.result); return true; }
      let job = inFlight.get(cacheKey);
      if (!job) {
        const client = req.socket.remoteAddress;
        requests = requests.filter(row => row.time > time - DAY);
        if (requests.length >= dailyLimit || requests.filter(row => row.client === client && row.time > time - 600_000).length >= 16 || inFlight.size >= 4) {
          const archived = !tikhubOnly && address.id && archivedVideo(address);
          if (archived) { reply(res, 200, videoResult(address, archived)); return true; }
          throw new LookupError(429, "Video lookup is busy or has reached its request limit. Try again later.");
        }
        requests.push({ client, time });
        job = lookupVideo(address.url, { fetchImpl, token, market, tikhubOnly }).then(result => {
          if (result.kind === "profile" && result.status === "partial") return result;
          // Keep canonical and share URLs tied to a single recent observation.
          for (const key of new Set([address.url, result.video?.url ?? result.sourceUrl])) {
            if (cache.size >= 400) cache.delete(cache.keys().next().value);
            cache.set(market + "/" + key, { expires: now() + TTL, result });
          }
          return result;
        }).finally(() => inFlight.delete(cacheKey));
        inFlight.set(cacheKey, job);
      }
      reply(res, 200, await job);
    } catch (error) {
      const known = error instanceof LookupError ? error : sourceUnavailable();
      reply(res, known.status, { error: known.message });
    }
    return true;
  } };
}
