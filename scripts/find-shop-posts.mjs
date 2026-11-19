// Find public shoppable TikTok posts for scripts/run-shop-ranking-batch.mjs.
// TIKHUB_TOKEN=... node scripts/find-shop-posts.mjs --pages 2 --product-id ID 'product name'
import { parseArgs } from "node:util";
import { parseVideoAddress } from "../server/video-lookup.mjs";
import { parseTikTokJson, shoppingAnchors } from "../server/tiktok-shopping.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pages: { type: "string", default: "1" },
    "product-id": { type: "string" },
    offset: { type: "string", default: "0" },
  },
});
const keyword = positionals.join(" ").trim();
const pages = Number(values.pages);
const productId = values["product-id"];
let offset = Number(values.offset);
if (!keyword || !Number.isSafeInteger(pages) || pages < 1 || pages > 20 ||
    !Number.isSafeInteger(offset) || offset < 0 || (productId && !/^\d{8,24}$/.test(productId))) {
  throw Error("Pass a product name, optionally --product-id ID, --pages 1–20 and --offset N.");
}
if (!process.env.TIKHUB_TOKEN) throw Error("Set TIKHUB_TOKEN in the environment.");

const seen = new Set();
for (let page = 0; page < pages; page++) {
  const url = new URL("https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_video_search_result");
  url.search = new URLSearchParams({ keyword, region: "US", count: "25", offset: String(offset) });
  const response = await fetch(url, {
    redirect: "error",
    headers: { Authorization: "Bearer " + process.env.TIKHUB_TOKEN },
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw Error("TikHub video search returned HTTP " + response.status);
  const body = parseTikTokJson(await response.text());
  const result = body?.data;
  const lists = [result?.search_item_list, result?.aweme_list].filter(Array.isArray);
  if (body?.code !== 200 || Number(result?.status_code ?? 0) !== 0 || !lists.length) {
    throw Error("TikHub did not return a video search page.");
  }
  for (const hit of lists.flat()) {
    const post = hit?.aweme_info ?? hit;
    const author = post?.author;
    if (typeof author?.unique_id !== "string" || Number(author.private_account) > 0 ||
        Number(author.secret) > 0 || post.is_close_friends_only || post.status?.private_status > 0 ||
        post.status?.is_delete || post.status?.is_prohibited || post.status?.allow_share === false) continue;
    const address = parseVideoAddress("https://www.tiktok.com/@" + author.unique_id + "/video/" + post.aweme_id);
    if (!address?.id || address.id !== post.aweme_id || address.handle !== author.unique_id.toLowerCase() || seen.has(address.id)) continue;
    const items = shoppingAnchors(post).filter(item => !productId || item.productId === productId);
    if (!items.length) continue;
    seen.add(address.id);
    console.log(JSON.stringify({ handle: address.handle, sourceUrl: address.url, items }));
  }
  const next = Number(result.cursor);
  if (!Number(result.has_more) || !Number.isSafeInteger(next) || next <= offset) break;
  offset = next;
}
