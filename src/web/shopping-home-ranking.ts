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

function priceGap(item: Item) {
  const cents = Math.round(item.sourcePrice * 100) - Math.round(item.peerPrice * 100);
  const label = cents === 0 ? "Same item price" : money(Math.abs(cents) / 100, item.currency) + (cents > 0 ? " more" : " less");
  return { cents, label };
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
    comparison.append(el("b", priceGap(item).label), el("small", item.basis === "exact" ? "Verified match" : "Similar-item estimate"));
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
  const { product, sourceUrl } = row.observations[item.productIndex];
  const selected = product.variants[item.variantIndex];
  const evidence = el("div", "", "shop-home-evidence");
  const heading = el("div", "", "shop-home-checkline");
  heading.append(el("span", "TikTok Shop price check"));
  const benchmark = row.baselines.find(entry => entry.productId === product.productId && entry.skuId === selected?.skuId);
  if (benchmark) {
    const date = new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", timeZone:"UTC" }).format(new Date(benchmark.observedAt));
    const time = el("time", "Checked " + date);
    time.dateTime = benchmark.observedAt;
    time.title = "Price observed · " + benchmark.observedAt;
    heading.append(time);
  }

  const difference = priceGap(item);
  const headline = el("h2", "", "shop-home-gap");
  if (difference.cents === 0) {
    headline.textContent = "No difference in listed price";
  } else {
    headline.append(el("strong", difference.label), " on the creator’s link");
  }
  const title = el("h3", itemName(row, item));
  title.title = product.name;
  const byline = el("p", "", "shop-home-byline");
  const post = postsByProduct.get(sourceUrl + "/" + product.productId);
  if (post?.handle === row.handle && post.avatar) {
    const avatar = el("img");
    avatar.src = post.avatar; avatar.alt = ""; avatar.width = avatar.height = 24;
    byline.append(avatar);
  }
  byline.append(el("span", "@" + row.handle));
  const variant = selected?.variant;
  if (variant && !/^(?:default|single variant)$/i.test(variant) && !title.textContent?.toLowerCase().includes(variant.toLowerCase()))
    byline.append(el("span", variant, "shop-home-variant"));

  const exact = item.basis === "exact";
  const peerLabel = item.peerCount === 1
    ? (exact ? "Same item elsewhere" : "Similar item elsewhere")
    : (exact ? "Lowest same-item price" : "Similar items · median");
  const prices = el("dl", "", "shop-home-prices");
  for (const [label, price] of [["Creator’s link", item.sourcePrice], [peerLabel, item.peerPrice]] as const) {
    const quote = el("div");
    quote.append(el("dt", label), el("dd", money(price, item.currency)));
    prices.append(quote);
  }
  const footer = el("div", "", "shop-home-receipt-footer");
  const count = item.peerCount + (item.peerCount === 1 ? " other shop" : " other shops");
  const percent = Math.abs(item.premiumPct).toFixed(1).replace(/\.0$/, "");
  const comparison = item.premiumPct === 0 ? count : percent + (item.premiumPct > 0 ? "% higher" : "% lower") + " · " + count;
  footer.append(el("span", comparison), link("See price sources →",
    shoppingRankingHref(row.handle) + "?" + new URLSearchParams({ product: product.productId }), "shop-home-receipt"));
  evidence.append(heading, headline, title, byline, prices, footer);

  const panel = el("div", "", "shop-home-result");
  const label = el("h3", "Creator’s Onion Score", "shop-home-score-title");
  const points = String(row.verdict.score);
  const score = el("div", "", "shop-home-score");
  score.setAttribute("aria-hidden", "true");
  score.append(el("strong", points), el("small", "/100"));
  const mascot = el("img", "", "shop-home-mascot");
  mascot.src = "assets/mascot/onion-boy-side-eye.webp";
  mascot.alt = ""; mascot.width = mascot.height = 140;
  const scale = el("div", "", "shop-home-scale");
  scale.setAttribute("role", "meter");
  scale.setAttribute("aria-label", "Creator’s price score");
  scale.setAttribute("aria-valuemin", "0");
  scale.setAttribute("aria-valuemax", "100");
  scale.setAttribute("aria-valuenow", points);
  scale.setAttribute("aria-valuetext", points + " out of 100. For a product, prices within 5% of the other shops’ benchmark score 50. Higher scores mean higher relative prices.");
  scale.style.setProperty("--score", points + "%");
  const rail = el("div", "", "shop-home-scale-rail");
  rail.setAttribute("aria-hidden", "true");
  rail.append(el("span", "", "shop-home-scale-range"), el("span", points, "shop-home-scale-pin"));
  const legend = el("div", "", "shop-home-scale-legend");
  legend.setAttribute("aria-hidden", "true");
  for (const [value, meaning] of [["0", "Cheaper"], ["50", "Similar prices"], ["100", "Pricier"]]) {
    const anchor = el("span");
    anchor.append(el("b", value), meaning);
    legend.append(anchor);
  }
  scale.append(rail, legend);
  const scored = row.verdict.scoredCount;
  const scope = el("p", rankLabel(row) + " · " + scored + (scored === 1 ? " product scored" : " products scored"), "shop-home-stamp");
  panel.append(label, score, mascot, scale, scope);
  article.append(evidence, panel);
  return article;
}

export function homeRanking(lookup: HTMLElement, savedOnly = false) {
  const section = el("section", "", "shop-home-ranking");
  const header = el("header", "", "shop-home-mast");
  const intro = el("div");
  const scope = el("p", "Rotten Onion Index", "shop-home-edition");
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
  intro.append(scope, el("h1", "Is it cheaper at another TikTok shop?"),
    el("p", "Look up a creator to compare their picks across US TikTok shops.", "shop-home-purpose"));
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
