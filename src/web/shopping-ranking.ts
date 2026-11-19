import { SHOP_ONION_ALLOWANCES } from "../shared/shop-onion.mjs";
import { RANKING_SCORE_VERSION, rankingScoreAnchors } from "../shared/shop-ranking-scale.mjs";
import { shoppingRankingHref } from "../shared/shopping-links";
import { details, el, link, money } from "./shop-dom";
import { shopRankingRows as rows, type ShopRankingRow } from "./shopping-ranking-data";
import { productReceipt } from "./shopping-verdict";
import { benchmarkCard, benchmarkDirectory, missingBenchmarkCard, otherListings } from "./shopping-benchmarks";

const ranked = rows.filter(row => row.rank !== null);
const unranked = rows.filter(row => row.rank === null);
const tiedRanks = new Set(ranked.filter((row,i) => i > 0 && row.rank === ranked[i - 1].rank).map(row => row.rank));
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

function matchLabel(row: ShopRankingRow) {
  return {exact:"Verified matches", similar:"Similar-item estimate", mixed:"Exact and similar matches", none:"No eligible comparison"}[row.verdict.basis];
}

function pricePair(row: ShopRankingRow) {
  const {items, score} = row.verdict;
  if (score === null || !items.length) return null;
  const item = items.reduce((best, next) =>
    Math.abs(next.score - score) < Math.abs(best.score - score) ? next : best);
  const pair = el("span", "", "price-ranking-pair");
  if (items.length > 1) pair.append(el("small","Example from this sample","price-ranking-example"));
  const max = Math.max(item.sourcePrice, item.peerPrice);
  for (const [label, value] of [["Original",item.sourcePrice],["Benchmark",item.peerPrice]] as const) {
    const quote = el("span", "", "price-ranking-quote");
    const track = el("i", "", "price-ranking-track");
    track.setAttribute("aria-hidden","true");
    track.style.setProperty("--quote-width", (value / max * 100) + "%");
    quote.append(el("small",label),track,el("b",money(value,item.currency)));
    pair.append(quote);
  }
  const cents = Math.round(item.sourcePrice * 100) - Math.round(item.peerPrice * 100);
  const difference = cents === 0 ? "Same item price" : "Original " + money(Math.abs(cents) / 100,item.currency) + (cents > 0 ? " more" : " less");
  pair.append(el("small",difference + " · " + item.peerCount + (item.peerCount === 1 ? " reference shop" : " reference shops"),"price-ranking-difference"));
  return pair;
}

function rankingList(entries: ShopRankingRow[]) {
  const list = el("ol", "", "price-ranking-list");
  for (const row of entries) {
    const li = el("li");
    const entry = link("", shoppingRankingHref(row.handle), "price-ranking-row");
    const position = el("span", row.rank === null ? "—" : "#" + row.rank, "price-ranking-position");
    if (row.rank !== null && tiedRanks.has(row.rank)) position.append(el("small","Tie"));
    const identity = el("span", "", "price-ranking-identity");
    identity.append(el("strong","@" + row.handle), el("small", coverage(row) + " · " + matchLabel(row)));
    const result = el("span", "", "price-ranking-value");
    if (row.verdict.score === null) result.append(el("small","Unrated"));
    else result.append(el("strong", String(row.verdict.score)), el("small","/100"));
    const arrow = el("span","→","price-ranking-arrow");
    arrow.setAttribute("aria-hidden","true");
    entry.append(position, identity, result, arrow);
    const pair = pricePair(row);
    if (pair) entry.append(pair);
    li.append(entry); list.append(li);
  }
  return list;
}

export function rankingPage() {
  const main = el("div", "", "shop-page shop-narrow price-ranking-page");
  main.append(link("← Shopping check", "#shop","shop-back"));
  const header = el("header", "", "price-ranking-mast ranking-scale-mast");
  const copy = el("div");
  copy.append(el("p","US TikTok Shop", "shop-kicker"), el("h1","Rotten Onion Index"),
    el("p","Higher scores mean a higher price compared with other shops. Prices within 5% of the benchmark score 50."),
    el("p", ranked.length + " ranked · " + rows.length + " checked · " + scoredListings.size + (scoredListings.size === 1 ? " distinct listing scored" : " distinct listings scored"), "price-ranking-coverage"));
  const sample = listingCoverage();
  if (sample) copy.append(sample);
  const mascot = el("img");
  mascot.src = "assets/mascot/onion-head.webp"; mascot.alt = ""; mascot.width = 96; mascot.height = 96;
  header.append(copy,mascot,indexScale());
  const head = el("div", "", "shop-section-head");
  head.append(el("h2","Ranked creators"));
  const latest = rows.reduce((date,row) => row.observedAt > date ? row.observedAt : date, "");
  if (latest) head.append(el("span","Latest check · " + dateFormat.format(new Date(latest)),"price-ranking-date"));
  main.append(header);
  const tools = el("div","","ranking-reading-tools");
  tools.append(rankingMethod());
  const directory = benchmarkDirectory(ranked);
  if (directory) tools.append(directory);
  main.append(tools);
  main.append(head);
  if (ranked.length) main.append(rankingList(ranked));
  else main.append(el("p","No creator in this edition has a qualifying price comparison."));
  if (unranked.length) main.append(details("Checked but unrated (" + unranked.length + ")", rankingList(unranked)));
  return main;
}

function indexScale(score?: number) {
  const scale = el("div","","ranking-score-scale");
  const track = el("div","","ranking-score-track");
  track.setAttribute("aria-hidden","true");
  if (score !== undefined) {
    const pin = el("i");
    pin.style.left = score + "%";
    track.append(pin);
  }
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

export function rankedCreatorPage(handle: string) {
  const main = el("div","","shop-page shop-narrow price-ranking-detail");
  main.append(link("← Rotten Onion Index",shoppingRankingHref(),"shop-back"));
  const row = rows.find(entry => entry.handle === handle.toLowerCase());
  if (!row) {
    main.append(el("h1","Creator outside this edition"),el("p","This handle has no saved price check in the index."));
    return main;
  }
  const head = el("header","","price-ranking-mast ranking-scale-mast");
  const copy = el("div");
  copy.append(el("p", row.rank === null ? "Rotten Onion Index · Unrated" : "Rotten Onion Index · #" + row.rank, "shop-kicker"),
    el("h1","@" + row.handle),el("p",row.posts.length + (row.posts.length === 1 ? " post checked · " : " posts checked · ") + coverage(row) + " · " + matchLabel(row)));
  const score = el("div","","price-ranking-total");
  score.append(el("strong",row.verdict.score === null ? "—" : String(row.verdict.score)));
  if (row.verdict.score !== null) score.append(el("span","/100"));
  head.append(copy,score);
  if (row.verdict.score !== null) {
    head.append(indexScale(row.verdict.score));
    if (row.verdict.scoredCount > 1) head.append(el("p","Median of " + row.verdict.scoredCount + " product scores.","ranking-aggregate-note"));
  } else head.append(el("p","A score needs a comparable in-stock offer from another shop.","ranking-aggregate-note"));
  main.append(head,rankingMethod());
  const sorted = row.observations.map((observation,index) => ({
    observation, item:row.verdict.items.find(item => item.productIndex === index),
    original:row.rawReceipts[index], raw:row.rawReceipts[index].items[0],
  })).sort((a,b) => (b.item?.score ?? -1) - (a.item?.score ?? -1) || Number(!b.item && !!b.raw) - Number(!a.item && !!a.raw));
  if (sorted.length) {
    if (row.verdict.scoredCount > 0) {
      const heading = el("header","","verdict-section-head ranking-receipts-heading");
      heading.append(el("h2",sorted.length === 1 ? "Price comparison" : "Price comparisons"),
        el("span","Item prices only","verdict-label"));
      main.append(heading);
    } else main.append(el("h2","Sampled products"));
  }
  for (const {observation,item,raw,original} of sorted) {
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
    main.append(primary);
  }
  if (!sorted.length) main.append(el("p","The sampled posts had no linked product with a price comparison."));
  const posts = row.posts.map(post => link("TikTok post " + post.split("/").filter(Boolean).at(-1) + " ↗",post,"shop-source-link"));
  main.append(details("Sampled posts (" + posts.length + ")", ...posts));
  return main;
}
