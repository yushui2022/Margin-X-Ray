import archive from "../research/creator-products.json" with { type: "json" };
import ledger from "../research/issue-screening-records.json" with { type: "json" };
import retail from "../research/retail-comparisons.json" with { type: "json" };
import assessments from "../research/creator-confidence-assessments.json" with { type: "json" };

const products = new Map(archive.products.map(product => [product.id, product]));
const listingSource = new Map(assessments.products.map(item => [item.productId, item.listingSource]));
const sources = new Map(archive.sources.map(source => [source.id, source]));
const words = text => " " + text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() + " ";

export function captionUrls(caption) {
  const urls = new Set();
  for (const match of caption.matchAll(/https:\/\/[^\s<>"']+/gi)) {
    const parsed = URL.parse(match[0].replace(/[).,;!]+$/, ""));
    if (parsed && parsed.protocol === "https:" && !parsed.port && !parsed.username && !parsed.password
      && !/\.(?:localhost|local|internal)$/.test(parsed.hostname)
      && /^[a-z\d.-]+\.[a-z]{2,}$/i.test(parsed.hostname)) urls.add(parsed.href);
    if (urls.size === 15) break;
  }
  return [...urls];
}

export function listingKey(raw) {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_") || ["ref_", "fbclid", "gclid", "aff_source"].includes(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

const comparisons = new Map(retail.records.map(row => [row.productId, row]));
const termsById = new Map(ledger.products.map(row => [row.id, row]));
const productIds = new Set([...products.keys(), ...comparisons.keys()]);

function variantConflict(url, offer) {
  if (url.origin !== offer.origin || url.pathname.replace(/\/$/, "") !== offer.pathname.replace(/\/$/, "")) return false;
  return ["variant", "sku", "skuId"].some(field => url.searchParams.has(field) && offer.searchParams.has(field)
    && url.searchParams.get(field) !== offer.searchParams.get(field));
}

export function conflictsWithComparedVariant(id, raw) {
  const row = comparisons.get(id);
  if (!row) return false;
  const url = new URL(raw);
  return [row.reference, row.alternative].some(offer => offer && variantConflict(url, new URL(offer.url)));
}

// Prefer an explicit seller URL from the post. A known wrong shade remains a
// direct listing lead with no catalog ID, even if the post names the same line.
export function findProductCandidates(handle, collection) {
  const matches = [];
  for (const post of collection.posts) {
    if (post.url !== `https://www.tiktok.com/@${handle}/video/${post.id}` || !/^\d+$/.test(post.id)) continue;
    const urls = captionUrls(post.caption);
    const keys = urls.map(listingKey);
    const caption = words(post.caption.replace(/https?:\/\/[^\s<>"']+/gi, " "));
    const groups = new Map();
    function add(label, listing) {
      if (!groups.has(label)) groups.set(label, { label, postUrl: post.url, observedAt: collection.observedAt, listings: [] });
      const entries = groups.get(label).listings;
      if (!entries.some(entry => entry.url === listing.url)) entries.push(listing);
    }
    for (const id of productIds) {
      const archived = products.get(id);
      const oldUrl = sources.get(listingSource.get(id))?.url;
      const current = comparisons.get(id);
      const name = current?.name ?? archived?.name;
      const preferred = current?.reference?.url ?? oldUrl;
      if (!name || !preferred) continue;
      const currentUrls = [current?.reference?.url, current?.alternative?.url].filter(Boolean);
      const exactCurrent = currentUrls.find(url => keys.includes(listingKey(url)));
      const conflicts = urls.filter(url => conflictsWithComparedVariant(id, url));
      for (const conflict of conflicts) add(name + " · other variant", { label: "Check the linked variant", url: conflict });
      if (conflicts.length && !exactCurrent) continue;
      const exact = exactCurrent || (oldUrl && keys.includes(listingKey(oldUrl)) ? oldUrl : null);
      const terms = termsById.get(id);
      const aliasMatch = terms?.aliases.some(alias => caption.includes(words(alias)));
      const term = aliasMatch && terms.terms.find(term => caption.includes(words(term)));
      if (!exact && !term && !caption.includes(words(name))) continue;
      add(term || name, { id, label: name, url: exact ?? preferred,
        variant: current?.variant ?? archived?.variant, basis: exact ? "listing" : "caption" });
    }
    matches.push(...groups.values());
  }
  return matches;
}
