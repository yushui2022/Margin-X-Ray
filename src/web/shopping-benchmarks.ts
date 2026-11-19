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

function rankingBuyingAdvice(baseline: Benchmark, item: Item, quotes: HTMLDetailsElement, originalUrl?: string) {
  const advice = el("section","","decision-close ranking-receipt-advice");
  const byline = el("div","","decision-byline");
  const seal = el("img","","decision-seal");
  seal.src = "assets/mascot/onion-head.webp";
  seal.width = 44; seal.height = 44; seal.alt = "";
  byline.append(seal,el("span","Buying advice","verdict-label"));
  const same = baseline.basis === "exact", count = baseline.shops.length;
  const scope = count === 1 ? "one other shop" : count + " other shops";
  const decision = item.decision;
  const title = decision ? buyingAdviceTitle(decision) : "Check the shop quotes";
  const reason = same ? "The same variant was verified at " + scope + "." :
    count === 1 ? "Only one other shop matched the selected options." : "The reference is the median price across " + scope + " with similar listings.";
  advice.append(byline,el("h2",title),el("p",reason,"decision-reason"));
  const nextStep = decision?.steps.find(step => step.label === "Action");
  if (nextStep) advice.append(el("p",nextStep.detail,"decision-next"));
  const cheaper = baseline.peerPrice < baseline.sourcePrice;
  const cheapestShop = baseline.shops.find(shop => shop.price === baseline.peerPrice);
  const offerUrl = same && (cheaper ? cheapestShop && productLink(cheapestShop.url)?.url : originalUrl);
  if (offerUrl) {
    advice.append(link(cheaper ? "View the lower-priced offer ↗" : "View the original offer ↗",offerUrl,"decision-inspect"));
  } else {
    const inspect = el("button","Inspect listing details","decision-inspect");
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
  if (decision) {
    const proof = details("Why this scored " + item.score + "/100",decisionSteps(decision));
    const anchor = rankingScoreAnchors(decision.context?.allowancePct).find(([,points]) => points === 65);
    if (anchor) proof.append(el("p","For this item, a " + percentage.format(anchor[0]) + "% premium scores 65.","decision-context-note"));
    advice.append(proof);
  }
  return advice;
}

export function benchmarkCard(baseline: Benchmark, observation: Observation, item?: Item, originalPrices?: number[]) {
  const product = observation.product;
  const article = el("article","",item ? "ranking-product-spread ranking-receipt" : "price-benchmark");
  const main = item ? el("section","","ranking-receipt-main price-benchmark verdict-receipt") : article;
  const heading = el("div","","price-benchmark-heading");
  const listingTitle = compactTitle(sourceName(product));
  const title = el("h3",item ? rankedItemTitle(listingTitle,product) : listingTitle);
  title.title = product.name;
  heading.append(title);
  const variant = product.variants.find(v => v.skuId === baseline.skuId);
  const fromPost = product.captionSkuId === baseline.skuId;
  const linked = product.requestedSkuId === baseline.skuId || product.selectedSkuId === baseline.skuId;
  const fromShop = product.defaultSkuId === baseline.skuId && product.variants.length > 1;
  const variantLabel = !item ? "Variant" : fromPost ? "Shade named in the post" : linked ? "Linked variant" : fromShop ? "Shop default" : "Variant";
  const matchedShade = variant && /\b\d{1,2}[cnw]\d?\b/i.test(variant.variant) && /\b(?:cushion|foundation|concealer)\b/i.test(product.name)
    && baseline.shops.every(shop => shop.variant?.trim().toLowerCase() === variant.variant.trim().toLowerCase());
  const basis = baseline.basis === "exact" ? "Verified match" : matchedShade ? "Matching shade · Formula unverified" : "Similar-item estimate";
  main.append(heading);
  const meta = el("div","","ranking-benchmark-meta");
  if (variant?.variant) meta.append(el("p",variantLabel + " · " + variant.variant,"price-benchmark-variant"));
  if (meta.childElementCount) main.append(meta);
  const quotes = el("div","","price-benchmark-quotes");
  const source = el("div","","price-benchmark-source"), ref = el("div","","price-benchmark-ref");
  const observed = originalPrices ?? [baseline.sourcePrice];
  const min = Math.min(...observed), max = Math.max(...observed);
  const original = min === max ? money(min,baseline.currency) : money(min,baseline.currency) + " – " + money(max,baseline.currency);
  const labelClass = item ? "verdict-label receipt-price-label" : "";
  source.append(el("small",min === max ? "Original shop" : "Original shop range",labelClass),el("strong",original,min === max ? "" : "price-benchmark-range"));
  const sourceUrl = productLink(sourceSkuUrl(product,baseline.skuId) ?? "")?.url;
  if (sourceUrl) source.append(link((product.seller || "Original listing") + "\u00a0↗",sourceUrl,item ? "verdict-shop-link" : ""));
  else if (item && product.seller) source.append(el("span",product.seller,"verdict-shop-name"));
  const singleShop = baseline.shops.length === 1;
  const refLabel = !item ? "Ranking benchmark" : baseline.basis === "exact" ? "Verified same item" : singleShop ? "Similar listing" : "Similar listings";
  ref.append(el("small",refLabel,labelClass),el("strong",money(baseline.peerPrice,baseline.currency)));
  const single = singleShop && baseline.shops[0];
  const singleUrl = single && productLink(single.url)?.url;
  if (item && single && singleUrl) ref.append(link((single.seller || "TikTok Shop listing") + "\u00a0↗",singleUrl,"verdict-shop-link"));
  else ref.append(el("span",shopCountLabel(baseline),item ? "verdict-shop-name" : ""));
  quotes.append(source,ref);
  const difference = quoteDifference(min,max,baseline);
  if (item) {
    quotes.classList.add("verdict-prices");
    source.classList.add("verdict-price-tile","receipt-source");
    ref.classList.add("verdict-price-tile","receipt-peer");
    difference.classList.add("receipt-gap");
    const match = baseline.basis === "exact" ? "Same variant confirmed. Item prices only." :
      matchedShade ? "The shade matches. The formula still needs confirmation." : "The exact variant still needs confirmation.";
    main.append(quotes,difference,el("p",match,"price-benchmark-match"),rankingIndexScale(item));
  } else {
    quotes.append(difference);
    main.append(quotes,el("p",basis,"price-benchmark-match"));
  }
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
  if (item) {
    const listing = el("p","","ranking-original-listing");
    listing.append(el("strong","Original listing")," · ",sourceUrl ? link(product.name + " ↗",sourceUrl) : product.name);
    const evidence = details("Shop quotes and variants",listing,shops);
    evidence.classList.add("ranking-receipt-quotes");
    evidence.id = "ranking-quotes-" + baseline.productId + "-" + baseline.skuId;
    main.append(evidence);
    const aside = el("aside","","ranking-receipt-aside");
    aside.append(rankingBuyingAdvice(baseline,item,evidence,sourceUrl),el("div","","ranking-receipt-notes verdict-notes"));
    article.append(main,aside);
  } else article.append(el("h4",baseline.calibrated ? "Sources from the edition check" : "Sources from post checks"),shops);
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
