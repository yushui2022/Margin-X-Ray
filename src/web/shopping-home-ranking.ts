import { onionScore } from "../shared/onion-index";
import { shoppingRankingHref } from "../shared/shopping-links";
import { el, link, money } from "./shop-dom";
import { featuredRankingSample, shopRankingRows, tiedShopRanks, type ShopRankingRow } from "./shopping-ranking-data";
import { sourceName } from "./shopping-verdict";

const ranked = shopRankingRows.filter(row => row.rank !== null && row.verdict.items.length > 0);
type Item = ShopRankingRow["verdict"]["items"][number];

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

export function scoredArchiveList(select: (handle: string, source: HTMLButtonElement) => void) {
  const picks = ranked.flatMap(row => {
    const sample = featuredRankingSample(row);
    return sample ? [{ row, ...sample }] : [];
  });
  if (!picks.length) return el("p", "No featured posts with a scored price check in this edition.");
  const list = el("div", "", "shop-list shop-archive-list");
  const head = el("div", "", "shop-archive-head");
  head.setAttribute("aria-hidden", "true");
  head.append(el("span", "Rank"), el("span", "Creator / post"), el("span", "Item price gap"), el("span", "Onion score"));
  const entries = el("ol", "", "shop-archive-entries");
  list.append(head, entries);
  for (const { row, item, post } of picks) {
    const entry = el("li");
    const button = el("button", "", "shop-archive-row");
    button.type = "button";
    button.dataset.handle = row.handle;
    const rank = el("span", "#" + row.rank, "shop-archive-rank");
    const tied = row.rank !== null && tiedShopRanks.has(row.rank);
    if (tied) rank.append(el("small", "Tie"));
    const portrait = el("img", "", "shop-archive-portrait");
    portrait.src = post.avatar; portrait.alt = ""; portrait.width = portrait.height = 48;
    const identity = el("span", "", "shop-archive-identity");
    const handle = "@" + row.handle;
    const sameName = post.displayName.toLowerCase() === row.handle.toLowerCase();
    identity.append(el("strong", sameName ? handle : post.displayName));
    if (!sameName) identity.append(el("small", handle));
    const excerpt = post.caption.replace(/(?:\s+#[^\s#]+)+\s*$/u, "").trim() || post.caption;
    const caption = el("span", excerpt, "shop-archive-post");
    const title = el("small", itemName(row, item), "shop-archive-product");
    title.title = row.observations[item.productIndex].product.name;
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
    button.setAttribute("aria-label", handle + " · " + (tied ? "Tied rank " : "Rank ") + row.rank
      + " · Onion score " + value + " out of 100 · " + title.textContent);
    button.append(rank, portrait, identity, caption, title, comparison, badge);
    button.addEventListener("click", () => select(row.handle, button));
    entry.append(button);
    entries.append(entry);
  }
  return list;
}

export function homeRanking(lookup: HTMLElement, savedOnly = false) {
  const section = el("section", "", "shop-home-ranking");
  const header = el("header", "", "shop-home-mast");
  const intro = el("div");
  intro.append(el("h1", "Is it cheaper at another TikTok shop?"),
    el("p", "Look up a creator to compare their picks across US TikTok shops.", "shop-home-purpose"));
  const actions = el("div", "", "shop-home-links");
  const board = link("Full ranking →", shoppingRankingHref(), "shop-home-board");
  const check = el("button", savedOnly ? "Search" : "Check a link", "shop-home-jump");
  check.type = "button";
  check.addEventListener("click", () => lookup.querySelector<HTMLInputElement>("input[type=search]")?.focus());
  actions.append(board, check); header.append(intro, actions);
  section.append(header, lookup);
  return section;
}
