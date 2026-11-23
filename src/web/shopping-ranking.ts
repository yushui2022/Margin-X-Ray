import { SHOP_ONION_ALLOWANCES } from "../shared/shop-onion.mjs";
import { RANKING_SCORE_VERSION, rankingScoreAnchors } from "../shared/shop-ranking-scale.mjs";
import { shoppingRankingHref } from "../shared/shopping-links";
import { onionScore, UNRATED_ONION } from "../shared/onion-index";
import { backLink, details, el, link, money } from "./shop-dom";
import { creatorByHandle } from "./shopping-creator-search";
import { featuredRankingSample, shopRankingRows as rows, tiedShopRanks, type ShopRankingRow } from "./shopping-ranking-data";
import { productReceipt, sourceName } from "./shopping-verdict";
import { benchmarkCard, benchmarkDirectory, missingBenchmarkCard, otherListings } from "./shopping-benchmarks";

const ranked = rows.filter(row => row.rank !== null);
const unranked = rows.filter(row => row.rank === null);
const scoredListings = new Set(ranked.flatMap(row => row.verdict.items.map(item => row.observations[item.productIndex].product.productId)));
const dateFormat = new Intl.DateTimeFormat("en-US", {month:"short", day:"numeric", year:"numeric", timeZone:"UTC"});

function listingCoverage() {
  const listings = new Map<string, {count:number; url:string}>();
  for (const row of ranked) {
    for (const item of row.verdict.items) {
      const product = row.observations[item.productIndex].product;
      const group = listings.get(product.productId) ?? {count:0, url:product.listingUrl};
      group.count++;
      listings.set(product.productId, group);
    }
  }
  const common = [...listings.values()].sort((a,b) => b.count - a.count)[0];
  if (!common || common.count < 3 || common.count * 2 < ranked.length) return null;
  const note = el("p", common.count + " of the " + ranked.length + " ranked creators linked to the same shop listing. ", "price-ranking-sampling");
  note.append(link("View that listing ↗", common.url));
  return note;
}

function coverage(row: ShopRankingRow) {
  const {scoredCount, linkedCount} = row.verdict;
  if (!linkedCount) return "No linked products";
  return scoredCount + " of " + linkedCount + (linkedCount === 1 ? " product scored" : " products scored");
}

function representativeItem(row: ShopRankingRow) {
  const {score, items} = row.verdict;
  if (score === null || !items.length) return;
  return items.reduce((best, next) => Math.abs(next.score - score) < Math.abs(best.score - score) ? next : best);
}

function displayedItem(row: ShopRankingRow) {
  return featuredRankingSample(row)?.item ?? representativeItem(row);
}

function pricePair(row: ShopRankingRow) {
  const item = displayedItem(row);
  if (!item) return null;
  const observation = row.observations[item.productIndex];
  const pair = el("span", "", "price-ranking-pair");
  const name = el("strong", sourceName(observation.product), "shop-inline-item");
  name.title = observation.product.name;
  pair.append(name);
  const variant = observation.product.variants[item.variantIndex]?.variant;
  if (variant && !/^(?:default|single variant)$/i.test(variant))
    pair.append(el("small", variant, "shop-rank-variant"));
  const max = Math.max(item.sourcePrice, item.peerPrice);
  const peerLabel = item.basis === "exact" ? "Same item elsewhere" : "Similar item elsewhere";
  for (const [label, value] of [["Creator’s link",item.sourcePrice],[peerLabel,item.peerPrice]] as const) {
    const quote = el("span", "", "price-ranking-quote");
    const track = el("i", "", "price-ranking-track");
    track.setAttribute("aria-hidden","true");
    track.style.setProperty("--quote-width", (value / max * 100) + "%");
    quote.append(el("small",label),track,el("b",money(value,item.currency)));
    pair.append(quote);
  }
  const cents = Math.round(item.sourcePrice * 100) - Math.round(item.peerPrice * 100);
  const difference = cents === 0 ? "Same item price" : "Original " + money(Math.abs(cents) / 100,item.currency) + (cents > 0 ? " more" : " less");
  const example = row.verdict.items.length > 1 ? "Example · " : "";
  pair.append(el("small",example + difference + " · " + item.peerCount + (item.peerCount === 1 ? " reference shop" : " reference shops"),"price-ranking-difference"));
  const sources = el("span", "", "shop-rank-sources");
  sources.append(link("Original post ↗", observation.sourceUrl), link("Price sources →",
    shoppingRankingHref(row.handle) + "?" + new URLSearchParams({product: observation.product.productId})));
  const mascot = el("img", "", "shop-rank-mascot");
  mascot.src = "assets/mascot/onion-boy-side-eye.webp";
  mascot.alt = ""; mascot.width = mascot.height = 40;
  sources.append(mascot);
  pair.append(sources);
  return pair;
}

function rankingPosition(row: ShopRankingRow) {
  const position = el("span", row.rank === null ? "—" : "#" + row.rank, "price-ranking-position");
  if (row.rank !== null && tiedShopRanks.has(row.rank)) position.append(el("small","Tie"));
  return position;
}

function editionRow(row: ShopRankingRow) {
  const item = displayedItem(row);
  const observation = item ? row.observations[item.productIndex] : row.observations[0];
  const person = creatorByHandle(row.handle);
  const name = person?.name || row.handle;
  const handle = "@" + row.handle;
  const url = shoppingRankingHref(row.handle) + (observation ? "?" + new URLSearchParams({product:observation.product.productId}) : "");
  const entry = link("", url, "price-ranking-row edition-row");

  const author = el("span", "", "edition-author");
  const portrait = rankingPortrait(name, person?.avatar, 44, true);
  const identity = el("span", "", "edition-name");
  identity.append(el("strong", name.toLowerCase() === row.handle ? handle : name));
  if (name.toLowerCase() !== row.handle) identity.append(el("small", handle));
  author.append(portrait, identity);

  const sample = el("span", "", "edition-product");
  if (observation) {
    const title = sourceName(observation.product);
    const compact = title.split(/:\s+|\s+[–—]\s+/)[0];
    const product = el("strong", compact.length >= 18 ? compact : title);
    product.title = observation.product.name;
    sample.append(product);
  }
  if (item) {
    const cents = Math.round(item.sourcePrice * 100) - Math.round(item.peerPrice * 100);
    const difference = cents ? money(Math.abs(cents) / 100, item.currency) + (cents > 0 ? " more" : " less") : "Same price";
    const evidence = el("small", "", "edition-gap");
    const label = el("b", difference);
    label.dataset.direction = cents > 0 ? "higher" : cents < 0 ? "lower" : "equal";
    const prices = el("span", " · " + money(item.sourcePrice,item.currency) + " vs " + money(item.peerPrice,item.currency), "edition-price-pair");
    evidence.append(label, prices, " · " + (item.basis === "exact" ? "Verified match" : "Similar item"));
    sample.append(evidence);
  } else {
    sample.append(el("small", observation ? "No qualifying shop comparison" : "No linked product"));
  }
  const value = row.verdict.score;
  const score = el("span", "", "edition-score");
  const onion = el("img");
  onion.src = (onionScore(value)?.band ?? UNRATED_ONION).image;
  onion.width = 28; onion.height = 32; onion.alt = "";
  score.append(onion, el(value === null ? "small" : "b", value === null ? "Unrated" : String(value)));
  if (value !== null) score.append(el("small", "/100"));
  const arrow = el("span", "→", "edition-arrow");
  arrow.setAttribute("aria-hidden", "true");
  entry.append(rankingPosition(row), author, sample, score, arrow);
  const li = el("li");
  li.append(entry);
  return li;
}

function rankingPortrait(name: string, url: string | undefined, size: number, lazy = false) {
  const initial = el("span", Array.from(name)[0]?.toUpperCase(), "shop-rank-initial");
  initial.setAttribute("aria-hidden", "true");
  if (!url) return initial;
  const image = el("img");
  image.width = image.height = size;
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  if (lazy) image.loading = "lazy";
  image.addEventListener("error", () => image.replaceWith(initial), {once:true});
  image.src = url;
  return image;
}

function contextRow(row: ShopRankingRow, selected: boolean) {
  const li = el("li");
  li.dataset.handle = row.handle;
  if (selected) li.setAttribute("aria-current", "true");
  const disclosure = el("details");
  const summary = el("summary", "", "shop-rank-summary");
  const entry = creatorByHandle(row.handle);
  const name = entry?.name || row.handle;
  const portrait = rankingPortrait(name, entry?.avatar, 32);
  const identity = el("span", "", "shop-rank-identity");
  const handle = "@" + row.handle;
  if (name.toLowerCase() !== row.handle) identity.append(el("strong", name), el("small", handle));
  else identity.append(el("strong", handle));
  const value = row.verdict.score;
  const score = el("span", "", "shop-rank-score");
  const mascot = el("img");
  mascot.src = (onionScore(value)?.band ?? UNRATED_ONION).image;
  mascot.width = 22; mascot.height = 25; mascot.alt = "";
  score.append(mascot, value === null ? el("small","Unrated") : el("b",String(value)));
  if (value !== null) score.append(el("small", "/100"));
  summary.append(rankingPosition(row), portrait, identity, score);
  const receipt = el("div", "", "shop-rank-evidence");
  const prices = pricePair(row);
  if (prices) receipt.append(prices);
  else receipt.append(el("p", row.verdict.decision?.reason || "No eligible cross-shop comparison was recorded."),
    link("View checked posts →", shoppingRankingHref(row.handle)));
  disclosure.append(summary, receipt);
  disclosure.open = selected;
  li.append(disclosure);
  return li;
}

export function rankingAroundCreator(handle: string): HTMLElement | null {
  const match = rows.find(row => row.handle === handle.toLowerCase());
  if (!match) return null;
  const entries = match.rank === null ? unranked : ranked;
  const pageSize = 5;
  let offset = Math.max(0, Math.min(entries.indexOf(match) - 1, entries.length - pageSize));
  const section = el("div", "", "shop-rank-context");
  section.dataset.group = match.rank === null ? "unrated" : "ranked";
  const label = match.rank === null ? "Checked but unrated" : "Ranked creators";
  const bar = el("div", "", "shop-rank-bar");
  const range = el("span");
  range.setAttribute("role", "status");
  const previous = el("button", "‹");
  const next = el("button", "›");
  previous.type = next.type = "button";
  previous.setAttribute("aria-label", "Previous creators");
  next.setAttribute("aria-label", "Next creators");
  bar.append(range, previous, next);
  const list = el("ol", "", "price-ranking-list");
  list.setAttribute("aria-label", label);
  section.append(list, bar);
  function render() {
    const start = Math.max(0, offset);
    const end = Math.min(entries.length, offset + pageSize);
    range.textContent = "Rows " + (start + 1) + "–" + end + " of " + entries.length;
    previous.disabled = start === 0;
    next.disabled = end === entries.length;
    list.start = start + 1;
    list.replaceChildren(...entries.slice(start,end).map(row => contextRow(row, row === match)));
  }
  previous.addEventListener("click", () => { offset -= pageSize; render(); });
  next.addEventListener("click", () => { offset += pageSize; render(); });
  render();
  return section;
}

function editionBrowser(params: URLSearchParams) {
  const section = el("section", "", "edition-browser");
  const controls = el("div", "", "edition-controls");
  const groups = el("div", "", "edition-groups");
  groups.setAttribute("role", "group");
  groups.setAttribute("aria-label", "Ranking status");
  const rankedButton = el("button", "Ranked"), unratedButton = el("button", "Unrated");
  for (const button of [rankedButton,unratedButton]) button.type = "button";
  groups.append(rankedButton,unratedButton);
  const filter = el("label", "", "edition-filter");
  const input = el("input");
  input.type = "search";
  input.placeholder = "Filter creators";
  input.value = params.get("q") ?? "";
  input.setAttribute("aria-label", "Filter this ranking by name or @username");
  filter.append(input);
  controls.append(groups,filter);
  const list = el("ol", "", "edition-list");
  const status = el("p", "", "edition-result");
  status.setAttribute("role", "status");
  const heading = el("div", "", "edition-columns");
  heading.setAttribute("aria-hidden", "true");
  heading.append(el("span","Rank"),el("span","Creator"),el("span","Sampled product"),el("span","Onion score"));
  section.append(controls,status,heading,list);
  let group = params.get("status") === "unrated" ? unranked : ranked;
  function render() {
    const query = input.value.trim().replace(/^@/, "").toLowerCase();
    const visible = query ? group.filter(row =>
      row.handle.includes(query) || creatorByHandle(row.handle)?.name.toLowerCase().includes(query)) : group;
    rankedButton.setAttribute("aria-pressed", String(group === ranked));
    unratedButton.setAttribute("aria-pressed", String(group === unranked));
    list.setAttribute("aria-label", group === ranked ? "Ranked creators" : "Checked but unrated creators");
    list.replaceChildren(...visible.map(editionRow));
    status.textContent = !visible.length ? "No matching creators in this list." : query
      ? visible.length + (visible.length === 1 ? " creator" : " creators") + " found" : "";
    heading.hidden = list.hidden = !visible.length;
  }
  function update() {
    const query = new URLSearchParams();
    if (group === unranked) query.set("status", "unrated");
    if (input.value.trim()) query.set("q", input.value.trim());
    history.replaceState(history.state, "", shoppingRankingHref() + (query.size ? "?" + query : ""));
    render();
  }
  rankedButton.addEventListener("click", () => { group = ranked; update(); });
  unratedButton.addEventListener("click", () => { group = unranked; update(); });
  input.addEventListener("input", update);
  render();
  return section;
}

export function rankingPage(params = new URLSearchParams()) {
  const main = el("div", "", "shop-page price-ranking-page edition-ranking");
  const latest = rows.reduce((date,row) => row.observedAt > date ? row.observedAt : date, "");
  main.append(reportNav({label:"Shopping check",href:"#shop"}, "Latest check", latest));
  const header = el("header", "", "price-ranking-mast edition-mast");
  const copy = el("div", "", "edition-copy");
  const title = el("h1");
  title.append(el("span","Rotten Onion"), " Index");
  copy.append(el("p", "US TikTok Shop", "shop-kicker"), title,
    el("p", "Higher scores mean pricier creator links. Prices within 5% of other shops score 50.", "edition-deck"));
  const art = el("div", "", "edition-art");
  const mascot = el("img");
  mascot.src = "assets/mascot/onion-boy-side-eye.webp"; mascot.alt = ""; mascot.width = mascot.height = 124;
  art.append(mascot);
  header.append(copy,art);
  const stats = el("dl", "", "edition-stats");
  for (const [label,value] of [["Creators ranked",ranked.length],["Creators checked",rows.length],["Listings scored",scoredListings.size]] as const) {
    const stat = el("div");
    stat.append(el("dt",label),el("dd",String(value)));
    stats.append(stat);
  }
  const notes = details("Scoring & sources");
  notes.classList.add("edition-notes");
  const sample = listingCoverage();
  if (sample) notes.append(sample);
  notes.append(indexScale(),rankingMethod());
  const directory = benchmarkDirectory(ranked);
  if (directory) notes.append(directory);
  const meta = el("div", "", "edition-meta");
  meta.append(stats,notes);
  main.append(header,meta,editionBrowser(params));
  return main;
}

function indexScale() {
  const scale = el("div","","ranking-score-scale");
  const track = el("div","","ranking-score-track");
  track.setAttribute("aria-hidden","true");
  scale.append(track);
  for (const [points,caption] of [["0","Half price or less"],["50","Within 5%"],["100","Triple price or more"]]) {
    const mark = el("span");
    mark.append(el("b",points),el("small",caption));
    scale.append(mark);
  }
  return scale;
}

function rankingMethod() {
  const rule = details("How creators are ranked",
    el("p","We check in-stock offers from other US TikTok Shop sellers for the same date, variant and currency. A verified match uses the lowest qualifying price. A similar-item estimate uses the median, with one quote per shop."),
    el("p","One distinct product earns one score per creator, using its latest observed price. The creator’s score is the rounded median of their scored products. Equal scores share a rank. Without a qualifying comparison, a creator stays unrated."));
  rule.classList.add("ranking-reading-method");
  const anchorTable = el("table","","ranking-anchor-table");
  anchorTable.append(el("caption","Example for a similar item with a " + SHOP_ONION_ALLOWANCES.general + "% allowance"));
  const header = anchorTable.createTHead().insertRow();
  for (const label of ["Original vs. benchmark","Product score"]) {
    const cell = el("th",label);
    cell.scope = "col";
    header.append(cell);
  }
  const tbody = anchorTable.createTBody();
  for (const [pct,points] of rankingScoreAnchors(SHOP_ONION_ALLOWANCES.general)) {
    if (pct === -5) continue;
    const amount = Math.abs(pct) + "% " + (pct < 0 ? "lower" : "higher");
    const label = points === 50 ? "Within 5% either way" : points === 0 || points === 100 ? amount + " or more" : amount;
    const row = tbody.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = String(points);
  }
  rule.append(el("h3","How a product earns its score"),
    el("p","The midpoint is 50. Above the 5% band, a wider allowance makes the score rise more slowly. Starting allowances are " +
      SHOP_ONION_ALLOWANCES["same-sku"] + "% for a verified variant, " + SHOP_ONION_ALLOWANCES.measured + "% for matching measurements, " +
      SHOP_ONION_ALLOWANCES.general + "% for similar options, and " + SHOP_ONION_ALLOWANCES.variable +
      "% for matching craft, material or collectible editions. A wider spread across shops can add up to 10 percentage points."),
    anchorTable,el("p","Scores change gradually between the listed prices. The index covers item prices before tax, shipping and checkout discounts. Creator earnings and product quality fall outside this measure."),
    el("p","Scoring version · " + RANKING_SCORE_VERSION,"shop-small"));
  return rule;
}

function creatorReportHeader(row: ShopRankingRow, inline: boolean) {
  const header = el("header", "", "creator-report-header");
  const person = creatorByHandle(row.handle);
  const name = person?.name || row.handle;
  const identity = el("div", "", "creator-report-name");
  const handle = "@" + row.handle;
  const showName = name.toLowerCase() !== row.handle;
  identity.append(el(inline ? "h2" : "h1", showName ? name : handle));
  if (showName) identity.append(el("span", handle));
  const stats = el("div", "", "creator-report-stats");
  if (row.rank !== null) {
    stats.append(el("strong", (tiedShopRanks.has(row.rank) ? "Tied #" : "#") + row.rank + " of " + ranked.length));
  }
  stats.append(el("span", coverage(row)));
  const total = row.verdict.score;
  const badge = el("div", "", "creator-report-score");
  const value = el("div");
  const onion = el("img");
  onion.src = (onionScore(total)?.band ?? UNRATED_ONION).image;
  onion.alt = "";
  onion.width = 26; onion.height = 30;
  value.append(onion, el("strong", total === null ? "Unrated" : String(total)));
  if (total !== null) value.append(el("small", "/100"));
  badge.append(el("span", "Creator Onion Score"), value);
  header.append(rankingPortrait(name, person?.avatar, 56), identity, stats, badge);
  return header;
}

function creatorProductReport(row: ShopRankingRow, index: number) {
  const observation = row.observations[index];
  const item = row.verdict.items.find(entry => entry.productIndex === index);
  const original = row.rawReceipts[index];
  const raw = original.items[0];
  const check = raw ? observation.checks.find(check => check.variantIndex === raw.variantIndex) : observation.checks[0];
  const decision = original.productDecisions?.[0]?.decision;
  const receipt = productReceipt(observation.product,check,raw,true,false,decision,original.version);
  const baseline = item && row.baselines.find(b => b.productId === observation.product.productId &&
    b.skuId === observation.product.variants[item.variantIndex]?.skuId);
  const selectedSku = baseline?.skuId ?? observation.product.variants[check?.variantIndex ?? -1]?.skuId;
  const extra = row.candidateLinks.find(group => group.productId === observation.product.productId && group.skuId === selectedSku);
  const primary = baseline ? benchmarkCard(baseline,observation,item) : raw ? missingBenchmarkCard(observation,raw,extra?.links) : receipt;
  const sources = el("div","","price-ranking-source");
  sources.append(link("Original TikTok post ↗",observation.sourceUrl,"shop-source-link"),el("span","Checked " + dateFormat.format(new Date(observation.observedAt))));
  primary.id = "ranking-product-" + observation.product.productId;
  const notes = primary.querySelector<HTMLElement>(".ranking-receipt-notes") ?? primary;
  notes.append(sources);
  const candidates = otherListings([observation],baseline,extra?.links);
  if (candidates) notes.append(candidates);
  if (primary !== receipt) {
    const historic = original.version !== row.verdict.version;
    const label = historic ? "Original post price check · earlier scale" : "Original post price check";
    const explanation = historic && original.version === "shop-onion-v2"
      ? "At the time of this check, prices at or below the allowance scored 0. The current index gives prices near the benchmark 50."
      : "This receipt uses the prices and scoring method recorded for the original post.";
    notes.append(details(label,el("p",explanation + " Method · " + original.version),receipt));
  }
  return primary;
}

function reportNav(backTo?: {label:string; href:string}, dateLabel?: string, observedAt?: string) {
  const nav = el("div", "", "creator-report-nav");
  if (backTo) nav.append(backLink(backTo.label, backTo.href));
  if (observedAt && dateLabel) {
    const dateline = el("div", "", "creator-report-dateline");
    const stamp = el("img");
    stamp.src = "assets/mascot/onion-date-stamp.webp";
    stamp.alt = "";
    stamp.width = 38;
    stamp.height = 40;
    const time = el("time", dateFormat.format(new Date(observedAt)));
    time.dateTime = observedAt;
    dateline.append(stamp, el("span", dateLabel), time);
    nav.append(dateline);
  }
  return nav;
}

export function rankedCreatorPage(handle: string, productId: string | null, openInline?: (url: string) => void) {
  const main = el("div", "", "shop-page shop-narrow price-ranking-detail");
  const row = rows.find(entry => entry.handle === handle.toLowerCase());
  const back = openInline ? undefined : {label:"Creator ranking",href:shoppingRankingHref()};
  if (!row) {
    main.append(reportNav(back), el(openInline ? "h2" : "h1", "Creator outside this edition"), el("p", "This handle has no saved price check in the index."));
    return main;
  }
  const featured = displayedItem(row);
  const current = productId ? row.observations.findIndex(({product}) => product.productId === productId) : featured?.productIndex ?? 0;
  const selected = row.observations[current];
  main.append(reportNav(back, "Price checked", selected?.observedAt), creatorReportHeader(row, Boolean(openInline)));
  if (selected) main.append(creatorProductReport(row, current));
  else main.append(el("p", productId ? "This product isn’t in this creator’s saved checks." : "The checked posts contained no linked product.", "creator-report-empty"));

  const otherProducts = row.observations.filter(observation => observation !== selected);
  if (otherProducts.length) {
    const section = el("section", "", "creator-other-products");
    section.append(el("h2", selected ? "Also checked" : "Checked products"));
    const list = el("ul");
    for (const {product} of otherProducts) {
      const item = row.verdict.items.find(entry => row.observations[entry.productIndex].product.productId === product.productId);
      const url = shoppingRankingHref(handle) + "?" + new URLSearchParams({product:product.productId});
      const choice = openInline ? el("button") : link("", url);
      if (choice instanceof HTMLButtonElement && openInline) {
        choice.type = "button";
        choice.addEventListener("click", () => openInline(url));
      }
      choice.append(el("strong", sourceName(product)), el("small", item ? item.score + "/100" : "Unrated"));
      const arrow = el("span", "→");
      arrow.setAttribute("aria-hidden", "true");
      choice.append(arrow);
      const li = el("li");
      li.append(choice);
      list.append(li);
    }
    section.append(list);
    main.append(section);
  }
  const methods = el("div", "", "creator-report-method");
  const posts = row.posts.map(post => link("TikTok post " + post.split("/").filter(Boolean).at(-1) + " ↗", post, "shop-source-link"));
  const method = rankingMethod();
  if (row.verdict.scoredCount > 1) method.querySelector("summary")?.after(
    el("p", "This creator’s score is the median of " + row.verdict.scoredCount + " product scores."));
  methods.append(method, details("Sampled posts (" + posts.length + ")", ...posts));
  main.append(methods);
  return main;
}
