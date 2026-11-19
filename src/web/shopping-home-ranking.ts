import archivePosts from "../../research/shop-archive-creators.json";
import { onionScore } from "../shared/onion-index";
import { shoppingRankingHref } from "../shared/shopping-links";
import { el, link, money } from "./shop-dom";
import { shopRankingRows, type ShopRankingRow } from "./shopping-ranking-data";
import { sourceName } from "./shopping-verdict";

const ranked = shopRankingRows.filter(row => row.rank !== null && row.verdict.items.length > 0);
const postsByProduct = new Map(archivePosts.map(post => [post.sourceUrl + "/" + post.productId, post]));
type Item = ShopRankingRow["verdict"]["items"][number];

function representative(row: ShopRankingRow) {
  const score = row.verdict.score!;
  return row.verdict.items.reduce((best, candidate) =>
    Math.abs(candidate.score - score) < Math.abs(best.score - score) ? candidate : best);
}

function itemName(row: ShopRankingRow, item: Item) {
  const product = row.observations[item.productIndex].product;
  const title = sourceName(product);
  const first = title.split(/:\s+|\s+(?:[–—]|l)\s+|[|;]/)[0].trim();
  return first.length >= 18 ? first : title;
}

function gap(item: Item) {
  const cents = Math.round(item.sourcePrice * 100) - Math.round(item.peerPrice * 100);
  return cents === 0 ? "Same item price" : money(Math.abs(cents) / 100, item.currency) + (cents > 0 ? " more" : " less");
}

function rankLabel(row: ShopRankingRow) {
  const tied = ranked.filter(other => other.rank === row.rank).length;
  return tied > 1 ? "Tied #" + row.rank + " · " + tied + " creators" : "Rank #" + row.rank;
}

function archivePicks() {
  const picks = [];
  for (const row of ranked) {
    for (const item of row.verdict.items) {
      const { product, sourceUrl } = row.observations[item.productIndex];
      const post = postsByProduct.get(sourceUrl + "/" + product.productId);
      if (!post || post.handle !== row.handle) continue;
      picks.push({ row, item, post });
      break;
    }
  }
  return picks;
}

export function scoredArchiveList() {
  const picks = archivePicks();
  if (!picks.length) return el("p", "No featured posts with a scored price check in this edition.");
  const list = el("div", "", "shop-list shop-archive-list");
  const head = el("div", "", "shop-archive-head");
  head.setAttribute("aria-hidden", "true");
  head.append(el("span", "No."), el("span", "Creator / post"), el("span", "Item price gap"), el("span", "Onion score"));
  const entries = el("ol", "", "shop-archive-entries");
  list.append(head, entries);
  for (const [index, { row, item, post }] of picks.entries()) {
    const product = row.observations[item.productIndex].product;
    const entry = el("li", "", "shop-archive-row");
    const rank = el("span", "#" + (index + 1), "shop-archive-rank");
    const portrait = el("img", "", "shop-archive-portrait");
    portrait.src = post.avatar; portrait.alt = ""; portrait.width = portrait.height = 48;
    const identity = el("span", "", "shop-archive-identity");
    const handle = "@" + row.handle;
    const sameName = post.displayName.toLowerCase() === row.handle.toLowerCase();
    const receipt = link(sameName ? handle : post.displayName, shoppingRankingHref(row.handle) + "?" + new URLSearchParams({ product: product.productId }), "shop-archive-receipt");
    receipt.setAttribute("aria-label", (sameName ? handle : post.displayName + " · " + handle) + " · Price receipt for " + itemName(row, item));
    identity.append(receipt);
    if (!sameName) identity.append(el("small", handle));
    const excerpt = post.caption.replace(/(?:\s+#[^\s#]+)+\s*$/u, "").trim() || post.caption;
    const video = link("", post.sourceUrl, "shop-archive-post");
    video.title = post.caption;
    video.setAttribute("aria-label", "Watch " + handle + " on TikTok · " + excerpt);
    video.append(el("span", excerpt || "Watch on TikTok"));
    const title = el("small", itemName(row, item), "shop-archive-product");
    title.title = product.name;
    const comparison = el("span", "", "shop-archive-gap");
    comparison.append(el("b", gap(item)), el("small", item.basis === "exact" ? "Verified match" : "Similar-item estimate"));
    const { value, band } = onionScore(row.verdict.score)!;
    const badge = el("span", "", "shop-archive-score");
    badge.setAttribute("role", "img");
    const count = row.verdict.scoredCount;
    badge.title = "Creator price score " + value + " out of 100 · " + count + (count === 1 ? " product" : " products") + " scored · " + band.label + " onion";
    badge.setAttribute("aria-label", badge.title);
    const skin = el("span", "", "shop-archive-onion");
    skin.style.setProperty("--rot", String(value / 100));
    const mascot = el("img");
    mascot.src = band.image; mascot.alt = ""; mascot.width = 40; mascot.height = 44;
    skin.append(mascot);
    const amount = el("span", "", "shop-archive-points");
    amount.append(el("b", String(value)), el("small", "/100"));
    badge.append(skin, amount);
    entry.append(rank, portrait, identity, video, title, comparison, badge);
    entries.append(entry);
  }
  return list;
}

function featuredCheck(row: ShopRankingRow, item: Item) {
  const article = el("article", "", "shop-home-feature");
  const panel = el("div", "", "shop-home-result");
  const label = el("p", rankLabel(row), "shop-home-stamp");
  const handle = el("h2", "@" + row.handle);
  const score = el("div", "", "shop-home-score");
  score.setAttribute("role", "img");
  score.setAttribute("aria-label", "Price score " + row.verdict.score + " out of 100. Prices within 5% of the benchmark score 50. Higher scores mean higher prices.");
  score.append(el("strong", String(row.verdict.score)), el("small", "/100"));
  const track = el("div", "", "shop-home-scale");
  track.setAttribute("aria-hidden", "true");
  track.style.setProperty("--score", row.verdict.score + "%");
  const mascot = el("img", "", "shop-home-mascot");
  mascot.src = "assets/mascot/onion-boy-side-eye.webp";
  mascot.alt = "";
  mascot.width = 140;
  mascot.height = 140;
  panel.append(label, handle, score, mascot, track);

  const evidence = el("div", "", "shop-home-evidence");
  const product = row.observations[item.productIndex].product;
  const selected = product.variants[item.variantIndex];
  const variant = selected?.variant;
  const title = el("h3", itemName(row, item)); title.title = product.name;
  const basis = item.basis === "exact" ? "Verified match" : "Similar-item estimate";
  evidence.append(el("p", basis, "shop-home-label"), title);
  if (variant && !/^(?:default|single variant)$/i.test(variant) && !title.textContent?.toLowerCase().includes(variant.toLowerCase()))
    evidence.append(el("p", variant, "shop-home-variant"));
  const prices = el("dl", "", "shop-home-prices");
  for (const [label, price] of [["Original shop", item.sourcePrice], ["Shop benchmark", item.peerPrice]] as const) {
    const quote = el("div");
    const amount = el("dd");
    const bar = el("span"); bar.setAttribute("aria-hidden", "true");
    bar.style.setProperty("--price", price / Math.max(item.sourcePrice, item.peerPrice) * 100 + "%");
    amount.append(bar, el("b", money(price, item.currency)));
    quote.append(el("dt", label), amount); prices.append(quote);
  }
  const note = el("p", "", "shop-home-gap");
  note.append(el("strong", gap(item)));
  if (item.premiumPct !== 0) {
    const percent = Math.abs(item.premiumPct).toFixed(1).replace(/\.0$/, "");
    note.append(el("span", percent + (item.premiumPct > 0 ? "% above benchmark" : "% below benchmark")));
  }
  const footer = el("div", "", "shop-home-receipt-footer");
  const coverage = el("span", item.peerCount + (item.peerCount === 1 ? " reference shop" : " reference shops"));
  if (row.verdict.items.length > 1) coverage.append(" · Example from " + row.verdict.items.length + " scored products");
  const benchmark = row.baselines.find(entry => entry.productId === product.productId && entry.skuId === selected?.skuId);
  if (benchmark) {
    const time = el("time", "Saved " + benchmark.observedAt.slice(11,16) + " UTC");
    time.dateTime = benchmark.observedAt;
    time.title = "Benchmark observation · " + benchmark.observedAt;
    coverage.append(" · ", time);
  }
  footer.append(coverage,
    link("View receipt →", shoppingRankingHref(row.handle) + "?" + new URLSearchParams({ product: product.productId }), "shop-home-receipt"));
  evidence.append(prices, note, footer);
  article.append(panel, evidence);
  return article;
}

export function homeRanking(lookup: HTMLElement, savedOnly = false) {
  const section = el("section", "", "shop-home-ranking");
  const header = el("header", "", "shop-home-mast");
  const intro = el("div");
  const scope = el("p", "US TikTok Shop", "shop-home-edition");
  const count = el("span", ranked.length + " ranked");
  count.append(el("span", ranked.length === 1 ? " creator" : " creators", "shop-home-count-unit"));
  scope.append(count);
  const latest = ranked.flatMap(row => row.baselines.map(entry => entry.observedAt)).sort().at(-1);
  if (latest) {
    const utcDay = latest.slice(0,10);
    const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(latest));
    const edition = el("time", date + " edition");
    edition.dateTime = utcDay;
    edition.title = "Ranking edition · " + utcDay + " UTC";
    scope.append(edition);
  }
  intro.append(scope, el("h1", "Rotten Onion Index"));
  const actions = el("div", "", "shop-home-links");
  const board = link("Full ranking →", shoppingRankingHref(), "shop-home-board");
  const check = el("button", savedOnly ? "Search" : "Check a link", "shop-home-jump");
  check.type = "button";
  check.addEventListener("click", () => lookup.querySelector<HTMLInputElement>("input[type=search]")?.focus());
  actions.append(board, check); header.append(intro, actions);
  section.append(header, lookup);
  if (ranked.length) section.append(featuredCheck(ranked[0], representative(ranked[0])));
  else section.append(el("p", "The first eligible price comparison will open the ranking."));
  return section;
}
