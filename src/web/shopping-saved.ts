import { publicUrl, shoppingRankingHref, tiktokListing } from "../shared/shopping-links";
import { shopRankingRows } from "./shopping-ranking-data";
import { exactCreator } from "./shopping-creator-search";

export function savedShoppingMatches(path: string, query: URLSearchParams) {
  const matches: { href: string; label: string }[] = [];
  const url = publicUrl(query.get("url") ?? "");
  if (!url || query.has("job") || [...query.getAll("market"), ...url.searchParams.getAll("region"),
      ...url.searchParams.getAll("market")].some(market => market.toUpperCase() !== "US")) return matches;
  const authorHost = /^(?:(?:www|m)\.)?tiktok\.com$/.test(url.hostname);
  if (authorHost && path === "/profile") {
    const handle = /^\/@([\w.]+)\/?$/.exec(url.pathname)?.[1]?.toLowerCase();
    const creator = handle && exactCreator(handle);
    if (creator && creator.handle === handle)
      matches.push({ href: creator.href, label: "@" + handle });
    return matches;
  }
  const post = authorHost && path === "/video" && /^\/@([\w.]+)\/video\/(\d+)\/?$/.exec(url.pathname);
  const listing = path === "/site" && tiktokListing(url);
  if (!post && (!listing || (listing.market && listing.market !== "US"))) return matches;
  const postUrl = post ? "https://www.tiktok.com/@" + post[1]!.toLowerCase() + "/video/" + post[2] : null;
  const productId = listing ? /\/(\d+)\/?$/.exec(url.pathname)?.[1] : null;
  const explicitIds = [...url.searchParams.getAll("product_id"), ...url.searchParams.getAll("productId")];
  const skus = ["sku_id", "skuId", "sku", "variant"].flatMap(key => url.searchParams.getAll(key));
  if (skus.some(value => !/^\d{8,24}$/.test(value) || value !== skus[0])) return matches;
  for (const row of shopRankingRows) {
    for (const [index, observation] of row.observations.entries()) {
      const { product, sourceUrl } = observation;
      if (postUrl ? sourceUrl !== postUrl : product.productId !== productId) continue;
      if (explicitIds.some(id => id !== product.productId)) continue;
      if (skus.length) {
        const item = row.verdict.items.find(item => item.productIndex === index);
        const selected = item && product.variants[item.variantIndex]?.skuId;
        if (selected !== skus[0] || !row.baselines.some(b => b.productId === product.productId && b.skuId === selected)) continue;
      }
      matches.push({ href: shoppingRankingHref(row.handle) + "?" + new URLSearchParams({product:product.productId}),
        label: "@" + row.handle + " · " + product.name });
    }
  }
  return matches;
}
