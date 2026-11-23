import {publicUrl, tiktokListing} from "../shared/shopping-links";
import {rankingScoreAnchors} from "../shared/shop-ranking-scale.mjs";
import {details, el, link, money} from "./shop-dom";
import type {ShopRankingRow} from "./shopping-ranking-data";
import {buyingAdviceTitle, decisionSteps, sourceName, sourceSkuUrl} from "./shopping-verdict";

type Benchmark = ShopRankingRow["baselines"][number];
type Observation = ShopRankingRow["observations"][number];
type Item = ShopRankingRow["verdict"]["items"][number];
type Candidate = {url:string; label:string; reason?:string};
const dateFormat = new Intl.DateTimeFormat("en-US", {month:"short", day:"numeric", year:"numeric", timeZone:"UTC"});
const percentage = new Intl.NumberFormat("en-US", {maximumFractionDigits:1});

function productLink(raw: string) {
  const url = publicUrl(raw);
  if (!url || !tiktokListing(url)) return null;
  return {url:url.href, id:url.pathname.split("/").filter(Boolean).at(-1)!};
}

function shopCountLabel(baseline: Benchmark) {
  const count = baseline.shops.length;
  if (count === 1) return "Single-shop reference";
  return (baseline.basis === "exact" ? "Lowest of " : "Median of ") + count + " shops";
}

function compactTitle(title: string) {
  const parts = title.split(/\s+(?:[–—]|l)\s+|[|;]/);
  const first = parts[0].trim();
  if (first.length >= 18) return first;
  return parts.slice(0,2).map(part => part.trim()).join(" · ");
}

function rankedItemTitle(title: string, product: Observation["product"]) {
  const colon = title.indexOf(": ");
  if (colon < 18) return title;
  const options = title.slice(colon + 2).toLowerCase().split(/,\s*/);
  const variants = product.variants.map(v => v.variant.trim().toLowerCase());
  const listsVariants = options.length >= 2 && options.every(option =>
    option && variants.some(variant => variant === option || variant.endsWith(" " + option)));
  return listsVariants ? title.slice(0,colon) : title;
}

function shopItemDescription(title: string, variant?: string | null) {
  const display = compactTitle(title).split(/,\s+(?=[A-Z])/)[0];
  const namedVariant = variant && !/^(?:default|single variant)$/i.test(variant);
  return namedVariant && !display.toLowerCase().includes(variant.toLowerCase()) ? display + " · " + variant : display;
}

function matchingShade(product: Observation["product"], variant: Observation["product"]["variants"][number] | undefined, baseline: Benchmark) {
  return variant && /\b\d{1,2}[cnw]\d?\b/i.test(variant.variant) && /\b(?:cushion|foundation|concealer)\b/i.test(product.name)
    && baseline.shops.every(shop => shop.variant?.trim().toLowerCase() === variant.variant.trim().toLowerCase());
}

function quoteDifference(min: number, max: number, baseline: Benchmark) {
  const low = min - baseline.peerPrice;
  const high = max - baseline.peerPrice;
  const amount = (difference: number) => money(Math.abs(difference),baseline.currency);
  const percent = (difference: number) => Number((Math.abs(difference) / baseline.peerPrice * 100).toFixed(1)) + "%";
  const side = (difference: number) => difference > 0 ? "higher" : "lower";
  const signed = (difference: number) => difference ? amount(difference) + " " + side(difference) : "the same price";
  const finding = el("div","","ranking-quote-difference");
  if (low !== high) {
    finding.append(el("strong","Original offers ranged from " + signed(low) + " to " + signed(high) + "."),
      el("span",percent(low) + (low < 0 ? " below" : " above") + " to " + percent(high) +
        (high < 0 ? " below" : " above") + " the benchmark"));
  } else if (low === 0) {
    finding.append(el("strong","Original matches the benchmark."),el("span","0% price difference"));
  } else {
    const title = low > 0 && baseline.basis === "exact" ? "Switch shops and save " + amount(low) + " on the item." : "Original is " + signed(low) + ".";
    finding.append(el("strong",title),el("span",percent(low) + (low > 0 ? " above" : " below") + " the benchmark"));
  }
  return finding;
}

function rankingIndexScale(item: Item) {
  const scale = el("section","","ranking-receipt-scale");
  const heading = el("div","","ranking-scale-heading");
  heading.append(el("strong",item.basis === "similar" ? "Estimated Onion Index" : "Onion Index"),el("span",item.score + "/100"));
  const track = el("div","","ranking-receipt-track");
  track.setAttribute("role","meter");
  track.setAttribute("aria-label","Item price index");
  track.setAttribute("aria-valuemin","0");
  track.setAttribute("aria-valuemax","100");
  track.setAttribute("aria-valuenow",String(item.score));
  const marker = el("i","","ranking-receipt-marker");
  marker.style.left = item.score + "%";
  track.append(marker);
  const labels = el("div","","ranking-scale-labels");
  labels.append(el("span","0 · Lower"),el("span","50 · Near benchmark"),el("span","100 · Higher"));
  scale.append(heading,track,labels);
  return scale;
}

function benchmarkShops(baseline: Benchmark) {
  const shops = el("ul","","price-benchmark-shops");
  for (const other of baseline.shops) {
    const dest = productLink(other.url);
    if (!dest) continue;
    const li = el("li");
    const shop = link("",dest.url,"price-benchmark-shop");
    const name = el("span",other.seller || "TikTok Shop listing","price-benchmark-shop-name");
    name.append(el("span"," ↗","price-benchmark-external"));
    const at = new Date(other.observedAt);
    const time = el("time","Quote checked " + dateFormat.format(at) + " · " + at.toISOString().slice(11,16) + " UTC");
    time.dateTime = other.observedAt;
    shop.append(name,el("b",money(other.price,baseline.currency)));
    if (other.title) {
      const description = el("small",shopItemDescription(other.title,other.variant),"price-benchmark-shop-item");
      description.title = other.title;
      shop.append(description);
    }
    shop.append(time);
    li.append(shop); shops.append(li);
  }
  return shops;
}

function rankingBuyingAdvice(baseline: Benchmark, item: Item, quotes: HTMLDetailsElement, originalUrl?: string) {
  const advice = el("aside","","scored-receipt-advice");
  const seal = el("img","","scored-receipt-mascot");
  seal.src = "assets/mascot/onion-boy-side-eye.webp";
  seal.width = 68; seal.height = 84; seal.alt = "";
  const decision = item.decision;
  const title = decision?.action === "Wait for a closer match" ? "Check the exact version" :
    decision ? buyingAdviceTitle(decision) : "Check the shop quotes";
  advice.append(seal,el("p","Buying advice","scored-receipt-label"),el("h3",title));
  const nextStep = decision?.steps.find(step => step.label === "Action");
  if (nextStep) advice.append(el("p",nextStep.detail,"scored-receipt-action"));

  const cheaper = baseline.peerPrice < baseline.sourcePrice;
  const cheapest = baseline.shops.find(shop => shop.price === baseline.peerPrice);
  const offerUrl = baseline.basis === "exact" && (cheaper ? cheapest && productLink(cheapest.url)?.url : originalUrl);
  if (offerUrl) {
    advice.append(link(cheaper ? "See the lower price ↗" : "View the creator’s offer ↗",offerUrl,"scored-receipt-cta"));
  } else {
    const inspect = el("button","Compare listing details →","scored-receipt-cta");
    inspect.type = "button";
    inspect.setAttribute("aria-controls",quotes.id);
    inspect.addEventListener("click",() => {
      quotes.open = true;
      const summary = quotes.querySelector("summary");
      summary?.focus({preventScroll:true});
      summary?.scrollIntoView({block:"center"});
    });
    advice.append(inspect);
  }
  return advice;
}

function priceChartRow(label: string, store: string, url: string | undefined,
  price: number, currency: string, largest: number) {
  const row = el("div","","scored-receipt-quote");
  const shop = el("div","","scored-receipt-shop");
  shop.append(el("strong",label));
  if (url) shop.append(link(store + " ↗",url));
  else shop.append(el("span",store));
  const value = el("div","","scored-receipt-value");
  const bar = el("span","","scored-receipt-bar");
  bar.setAttribute("aria-hidden","true");
  bar.style.setProperty("--quote-width",price / largest * 100 + "%");
  value.append(el("strong",money(price,currency)),bar);
  row.append(shop,value);
  return row;
}

function scoredReceipt(baseline: Benchmark, observation: Observation, item: Item) {
  const {product} = observation;
  const {sourcePrice,peerPrice,currency} = baseline;
  const exact = baseline.basis === "exact";
  const count = baseline.shops.length;
  const difference = (Math.round(sourcePrice * 100) - Math.round(peerPrice * 100)) / 100;
  const delta = money(Math.abs(difference),currency);
  const variant = product.variants.find(v => v.skuId === baseline.skuId);
  const sourceUrl = productLink(sourceSkuUrl(product,baseline.skuId) ?? "")?.url;
  const single = count === 1 ? baseline.shops[0] : undefined;
  const peerUrl = single && productLink(single.url)?.url;

  const article = el("article","","ranking-product-spread ranking-receipt scored-receipt");
  article.dataset.priceDirection = difference > 0 ? "higher" : difference < 0 ? "lower" : "equal";
  const main = el("section","","scored-receipt-main");
  main.append(el("p","Shop price check","scored-receipt-label"));
  const gap = el("h2","","scored-receipt-gap price-benchmark-heading");
  if (!difference) gap.textContent = "Same price";
  else if (exact && difference > 0) gap.append("Switch shops and save ",el("strong",delta));
  else gap.append(el("strong",delta),difference > 0 ? " higher" : " lower");
  const reference = count === 1 ? "one other shop’s price for " + (exact ? "the same item" : "a similar item") :
    (exact ? "the lowest price for the same item" : "the median for similar listings") + " at " + count + " other shops";
  const percent = percentage.format(Math.abs(item.premiumPct)) + "%";
  const summary = difference === 0 ? "The creator’s price matches " + reference + "." :
    "The creator’s price is " + percent + (difference > 0 ? " above " : " below ") + reference + ".";
  main.append(gap,el("p",summary,"scored-receipt-deck"));

  const productInfo = el("div","","scored-receipt-product");
  const title = el("h3",rankedItemTitle(compactTitle(sourceName(product)),product));
  title.title = product.name;
  productInfo.append(title);
  if (variant?.variant && !/^(?:default|single variant)$/i.test(variant.variant)) {
    const label = product.captionSkuId === baseline.skuId ? "Named in the post" :
      product.requestedSkuId === baseline.skuId || product.selectedSkuId === baseline.skuId ? "Linked variant" :
      product.defaultSkuId === baseline.skuId && product.variants.length > 1 ? "Shop default" : "Variant";
    productInfo.append(el("p",label + " · " + variant.variant));
  }
  const chart = el("div","","scored-receipt-chart");
  const largest = Math.max(sourcePrice,peerPrice);
  const peerLabel = count === 1 ? exact ? "Same item elsewhere" : "Similar item elsewhere" :
    exact ? "Lowest verified price" : "Similar shops’ median";
  chart.append(priceChartRow("Creator’s link",product.seller || "Original listing",sourceUrl,sourcePrice,currency,largest),
    priceChartRow(peerLabel,single?.seller || (count === 1 ? "TikTok Shop listing" : count + " other shops"),peerUrl,peerPrice,currency,largest));
  const matchedShade = matchingShade(product,variant,baseline);
  const match = exact ? "Same variant verified" : matchedShade ? "Shade matches · formula unverified" : "Exact variant unconfirmed";
  main.append(productInfo,chart,el("p",match + " · Item prices only","scored-receipt-scope"));

  const original = el("p","","ranking-original-listing");
  original.append(el("strong","Creator’s listing")," · ",sourceUrl ? link(product.name + " ↗",sourceUrl) : product.name);
  const quotes = details("Shop quotes and variants",original,benchmarkShops(baseline));
  quotes.id = "ranking-quotes-" + baseline.productId + "-" + baseline.skuId;
  quotes.classList.add("ranking-receipt-quotes");
  const proof = details("How this item scored " + item.score + "/100",rankingIndexScale(item));
  const decision = item.decision;
  if (decision) {
    proof.append(decisionSteps(decision));
    const anchor = rankingScoreAnchors(decision.context?.allowancePct).find(([,points]) => points === 65);
    if (anchor) proof.append(el("p","For this item, a " + percentage.format(anchor[0]) + "% premium scores 65.","decision-context-note"));
  }
  const evidence = el("div","","scored-receipt-evidence");
  evidence.append(quotes,proof,el("div","","ranking-receipt-notes verdict-notes"));
  article.append(main,rankingBuyingAdvice(baseline,item,quotes,sourceUrl),evidence);
  return article;
}

export function benchmarkCard(baseline: Benchmark, observation: Observation, item?: Item, originalPrices?: number[]) {
  if (item) return scoredReceipt(baseline,observation,item);
  const product = observation.product;
  const article = el("article","","price-benchmark");
  const heading = el("div","","price-benchmark-heading");
  const title = el("h3",compactTitle(sourceName(product)));
  title.title = product.name;
  heading.append(title);
  article.append(heading);
  const variant = product.variants.find(v => v.skuId === baseline.skuId);
  if (variant?.variant) article.append(el("p","Variant · " + variant.variant,"price-benchmark-variant"));

  const observed = originalPrices ?? [baseline.sourcePrice];
  const min = Math.min(...observed), max = Math.max(...observed);
  const original = min === max ? money(min,baseline.currency) : money(min,baseline.currency) + " – " + money(max,baseline.currency);
  const quotes = el("div","","price-benchmark-quotes");
  const source = el("div","","price-benchmark-source"), ref = el("div","","price-benchmark-ref");
  source.append(el("small",min === max ? "Original shop" : "Original shop range"),el("strong",original,min === max ? "" : "price-benchmark-range"));
  const sourceUrl = productLink(sourceSkuUrl(product,baseline.skuId) ?? "")?.url;
  if (sourceUrl) source.append(link((product.seller || "Original listing") + " ↗",sourceUrl));
  ref.append(el("small","Ranking benchmark"),el("strong",money(baseline.peerPrice,baseline.currency)),el("span",shopCountLabel(baseline)));
  quotes.append(source,ref,quoteDifference(min,max,baseline));
  const matchedShade = matchingShade(product,variant,baseline);
  const basis = baseline.basis === "exact" ? "Verified match" : matchedShade ? "Matching shade · Formula unverified" : "Similar-item estimate";
  article.append(quotes,el("p",basis,"price-benchmark-match"),
    el("h4",baseline.calibrated ? "Sources from the edition check" : "Sources from post checks"),benchmarkShops(baseline));
  return article;
}

export function missingBenchmarkCard(observation: Observation, historicalItem: Item, candidates: Candidate[] = []) {
  const product = observation.product, variant = product.variants[historicalItem.variantIndex];
  const article = el("article","","price-benchmark");
  const heading = el("div","","price-benchmark-heading");
  const title = el("h3",compactTitle(sourceName(product)));
  title.title = product.name;
  heading.append(title,el("span","Unrated","price-benchmark-score"));
  article.append(heading);
  if (variant?.variant) article.append(el("p","Variant · " + variant.variant,"price-benchmark-variant"));
  const status = el("section","","price-benchmark-missing");
  status.append(el("h4","No qualifying benchmark"));
  const rejected = candidates.find(candidate => candidate.reason);
  if (rejected) {
    const label = rejected.label.replace(/^TikTok Shop(?: seller)? · /i,"");
    const listing = productLink(rejected.url);
    const explanation = el("p");
    explanation.append(listing ? link(label + " ↗",listing.url) : label," · " + rejected.reason);
    status.append(explanation);
  }
  else status.append(el("p","The index needs a comparable, in-stock variant from another shop."));
  const url = sourceSkuUrl(product,variant?.skuId);
  if (url) status.append(link((product.seller || "Original shop") + " · " + money(historicalItem.sourcePrice,historicalItem.currency) + " ↗",url));
  article.append(status);
  return article;
}

export function otherListings(observations: Observation[], baseline?: Benchmark, additional: Candidate[] = []) {
  const used = new Set(observations.map(o => o.product.productId));
  for (const shop of baseline?.shops ?? []) {
    const dest = productLink(shop.url);
    if (dest) used.add(dest.id);
  }
  const candidates = new Map<string, {url:string; label:string; note?:string}>();
  function add(raw: string, label: string, note?: string) {
    const dest = productLink(raw);
    if (!dest || used.has(dest.id)) return;
    const saved = candidates.get(dest.id);
    if (!saved) candidates.set(dest.id,{url:dest.url,label,note});
    else if (!saved.note && note) saved.note = note;
  }
  for (const source of [...additional,...(baseline?.candidates ?? [])] as Candidate[])
    add(source.url,source.label.replace(/^TikTok Shop(?: seller)? · /i,""),source.reason);
  for (const observation of observations) {
    for (const check of observation.checks) {
      for (const offer of check.offers) {
        const stock = observations.length > 1 || offer.available === true ? undefined :
          offer.available === false ? "Out of stock in the post check" : "Stock unconfirmed in the post check";
        add(offer.url,offer.seller || offer.name,stock);
      }
      for (const source of check.sources ?? []) {
        const title = source.label.replace(/^TikTok Shop(?: seller)? · /i,"");
        add(source.url,title);
      }
    }
  }
  if (!candidates.size) return null;
  const links = el("ul","","price-benchmark-candidates");
  for (const [id,candidate] of candidates) {
    const li = el("li");
    const label = !candidate.label || /unavailable|could not be verified/i.test(candidate.label)
      ? "Listing " + id + (candidate.label ? " · " + candidate.label : "") : candidate.label;
    li.append(link(label + " ↗",candidate.url));
    if (candidate.note) li.append(el("span",candidate.note));
    links.append(li);
  }
  return details("Other listings checked (" + candidates.size + ")",
    el("p",baseline ? "These listings were reviewed separately. The benchmark uses the sources shown above." :
      "The price check could not establish an eligible comparison from these listings."),links);
}

export function benchmarkDirectory(rows: ShopRankingRow[]) {
  const groups = new Map<string,{baseline:Benchmark; observations:Observation[]; originalPrices:Set<number>}>();
  for (const row of rows) {
    for (const baseline of row.baselines) {
      const observation = row.observations.find(o => o.product.productId === baseline.productId);
      if (!observation) continue;
      const key = JSON.stringify([observation.product.sellerId,baseline.productId,baseline.skuId,baseline.currency,baseline.observedAt.slice(0,10)]);
      const group = groups.get(key) ?? {baseline,observations:[],originalPrices:new Set<number>()};
      group.observations.push(observation);
      group.originalPrices.add(baseline.sourcePrice);
      groups.set(key,group);
    }
  }
  if (!groups.size) return null;
  const cards = Array.from(groups.values(),({baseline,observations,originalPrices}) => {
    const card = benchmarkCard(baseline,observations[0],undefined,[...originalPrices]);
    const candidates = otherListings(observations,baseline);
    if (candidates) card.append(candidates);
    return card;
  });
  const panel = details("Browse price benchmarks (" + cards.length + ")",...cards);
  panel.classList.add("price-benchmark-directory");
  return panel;
}
