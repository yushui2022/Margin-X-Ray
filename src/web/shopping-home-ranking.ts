import { el, money } from "./shop-dom";
import { creatorByHandle } from "./shopping-creator-search";
import { shopRankingRows, type ShopRankingRow } from "./shopping-ranking-data";
import { sourceName } from "./shopping-verdict";

type Item = ShopRankingRow["verdict"]["items"][number];
type Sample = { row: ShopRankingRow; item: Item };
// These listings open with a long list of licensed characters. Their quoted
// product names and the selected variant are clearer together on a small card.
const shortProductNames = new Map([
  ["1731176397038522481", "Pit Stop Tool Bench Playset"],
  ["1731603800884088945", "Wooden Electronic Air Hockey Table"],
]);

function itemName(row: ShopRankingRow, item: Item) {
  const product = row.observations[item.productIndex].product;
  const shortName = shortProductNames.get(product.productId);
  if (shortName && product.name.includes(shortName)) return shortName;
  const title = sourceName(product);
  const first = title.split(/:\s+|\s+(?:[–—]|l)\s+|[|;]/)[0].trim();
  return first.length >= 18 ? first : title;
}

function featuredProducts() {
  const samples = shopRankingRows.flatMap(row => row.verdict.items.map(item => ({row, item})));
  // Pick one complete recorded comparison per listing. Never combine quotes
  // from different variants, creators or observation dates.
  samples.sort((a, b) =>
    Number(b.item.basis === "exact") - Number(a.item.basis === "exact")
    || b.item.peerCount - a.item.peerCount
    || b.row.observations[b.item.productIndex].observedAt.localeCompare(a.row.observations[a.item.productIndex].observedAt)
    || a.row.handle.localeCompare(b.row.handle)
  );
  const products = new Map<string, {sample: Sample; handles: Set<string>}>();
  for (const sample of samples) {
    const id = sample.row.observations[sample.item.productIndex].product.productId;
    const group = products.get(id);
    if (group) group.handles.add(sample.row.handle);
    else products.set(id, {sample, handles: new Set([sample.row.handle])});
  }
  return Array.from(products.values())
    .sort((a, b) => b.handles.size - a.handles.size)
    .map(group => group.sample);
}

function quote(label: string, amount: number, currency: string) {
  const price = el("span");
  price.append(el("small", label), el("b", money(amount, currency)));
  return price;
}

export function featuredProductChecks(select: (row: ShopRankingRow, index: number, source: HTMLButtonElement) => void) {
  const products = featuredProducts();
  if (!products.length) return el("p", "No featured posts with a scored price check in this edition.");
  const list = el("ul", "", "shop-product-checks");
  for (const {row, item} of products) {
    const {product} = row.observations[item.productIndex];
    const button = el("button", "", "shop-product-check");
    button.type = "button";
    button.dataset.product = product.productId;
    button.dataset.handle = row.handle;
    const title = el("span", itemName(row, item), "product-check-title");
    title.title = product.name;
    title.translate = false;
    button.append(title);
    const variant = product.variants[item.variantIndex]?.variant;
    if (variant && !/^(?:default|single variant)$/i.test(variant)) {
      const label = el("small", variant, "product-check-variant");
      label.translate = false;
      button.append(label);
    }

    const cents = Math.round(item.sourcePrice * 100) - Math.round(item.peerPrice * 100);
    button.dataset.direction = cents > 0 ? "higher" : cents < 0 ? "lower" : "equal";
    const difference = cents === 0 ? "Same item price" : money(Math.abs(cents) / 100, item.currency) + (cents > 0 ? " higher" : " lower");
    const exact = item.basis === "exact";
    const basis = exact ? "Verified match" : "Similar-item estimate";
    const peerLabel = item.peerCount === 1
      ? (exact ? "Same item elsewhere" : "Similar item elsewhere")
      : (exact ? "Lowest verified price" : "Similar shops’ median");
    const prices = el("span", "", "product-check-prices");
    prices.append(quote("Creator’s link", item.sourcePrice, item.currency), quote(peerLabel, item.peerPrice, item.currency));
    button.append(el("strong", difference, "product-check-difference"), el("small", basis, "product-check-basis"), prices);

    const footer = el("span", "", "product-check-footer");
    const avatar = creatorByHandle(row.handle)?.avatar;
    if (avatar) {
      const portrait = el("img");
      portrait.src = avatar;
      portrait.alt = "";
      portrait.width = portrait.height = 24;
      portrait.loading = "lazy";
      footer.append(portrait);
    }
    const handle = el("span", "@" + row.handle, "product-check-creator");
    handle.translate = false;
    footer.append(handle, el("b", "View receipt →", "product-check-action"));
    button.append(footer);
    button.addEventListener("click", () => select(row, item.productIndex, button));
    const entry = el("li");
    entry.append(button);
    list.append(entry);
  }
  return list;
}

export function homeRanking(lookup: HTMLElement) {
  const section = el("section", "", "shop-home-ranking");
  const cover = el("header", "", "shop-home-mast");
  const intro = el("div", "", "shop-home-intro");
  const title = el("h1");
  title.append("Is it cheaper at ", el("em", "another TikTok shop?"));
  intro.append(title, el("p", "Look up a creator and compare their prices with other US TikTok shops.", "shop-home-purpose"));
  const art = el("img", "", "shop-home-inspector");
  art.fetchPriority = "high";
  art.src = "assets/mascot/onion-price-inspector.webp";
  art.alt = "";
  art.width = 540;
  art.height = 360;
  cover.append(intro, art, lookup);
  section.append(cover);
  return section;
}
