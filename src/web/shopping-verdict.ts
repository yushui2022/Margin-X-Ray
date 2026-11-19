import { SHOP_ONION_ALLOWANCES, SHOP_ONION_SCALE, shopOnionVerdict, type ShopOnionDecision, type ShopOnionVersion } from "../shared/shop-onion.mjs";
import { RANKING_SCORE_VERSION, rankingScoreAnchors } from "../shared/shop-ranking-scale.mjs";
import { details, el, link, money } from "./shop-dom";
import { publicUrl } from "../shared/shopping-links";
import type { ShopReport, Product, Check } from "./shopping-live";

type Verdict = ReturnType<typeof shopOnionVerdict>;
type ItemScore = Verdict["items"][number];
const fmt = new Intl.NumberFormat("en-US", {maximumFractionDigits: 1});

function premiumLabel(percent: number) {
  return percent === 0 ? "Same price" : fmt.format(Math.abs(percent)) + "% " + (percent > 0 ? "higher" : "lower");
}

function tier(score: number | null) {
  if (score === null) return "Unrated";
  if (score === 0) return "Fresh pick";
  if (score < 25) return "A little zing";
  if (score < 50) return "Getting pungent";
  if (score < 100) return "A sharp price";
  return "Eye-watering";
}

function moneyOrUnknown(value: number | null | undefined, currency?: string | null) {
  return typeof value === "number" && Number.isFinite(value) && currency && /^[A-Z]{3}$/.test(currency)
    ? money(value, currency) : "Unavailable";
}

export function followUpRecord(followUp: Check["followUp"]) {
  if (!followUp) return "";
  const status = {checked:"Checked one additional shop.", unavailable:"The additional shop could not be read.",
    no_more_shops:"No further qualifying shop was available in these search results.", time_limit:"The follow-up reached its time limit."}[followUp.status];
  return status ? [status,followUp.reason].filter(Boolean).join(" ") : "";
}

function confidenceLabel(confidence: ShopOnionDecision["confidence"]) {
  return {high:"High confidence", medium:"Medium confidence", low:"Low confidence", insufficient:"Evidence insufficient"}[confidence];
}

export function buyingAdviceTitle(decision: ShopOnionDecision) {
  return decision.action === "Wait for a closer match" ? "Check the exact version before buying" : decision.action;
}

export function decisionSteps(decision: ShopOnionDecision, showScaleInterval = false) {
  const list = el("ol", "", "decision-steps");
  const excess = decision.context?.excessPct ?? 0;
  for (const step of decision.steps) {
    const row = el("li");
    row.append(el("strong",step.label),el("p",step.detail));
    if (showScaleInterval && step.label === "Grade" && excess > 0) {
      const index = SHOP_ONION_SCALE.findIndex(([percent]) => percent >= excess);
      if (index > 0) {
        const [from, low] = SHOP_ONION_SCALE[index - 1];
        const [to, high] = SHOP_ONION_SCALE[index];
        row.append(el("p", `Between ${from}% and ${to}% above the threshold, the score rises from ${low} to ${high} points and rounds to the nearest whole point.`));
      }
    }
    list.append(row);
  }
  return list;
}

function basisLabel(basis: Verdict["basis"]) {
  return {exact:"Verified same variant", similar:"Similar listings · estimate", mixed:"Exact and similar listings", none:"Evidence incomplete"}[basis];
}

function addShopUrl(parent: HTMLElement, label: string, raw?: string | null) {
  const url = raw && publicUrl(raw);
  if (url) parent.append(link(label + "\u00a0↗", url.href, "verdict-shop-link"));
  else parent.append(el("span", label, "verdict-shop-name"));
}

export function verdictHero(report: ShopReport, verdict: Verdict) {
  const decision = verdict.decision;
  const hero = el("header", "", decision ? "verdict-hero verdict-decision-hero" : "verdict-hero");
  const meta = el("div", "", "verdict-meta");
  const market = report.market || report.commerce?.[0]?.market;
  meta.append(el("span", ["TikTok Shop", market === "GB" ? "UK" : market].filter(Boolean).join(" · "), "verdict-location"));
  const timestamp = report.commerce?.find(p => p.observedAt)?.observedAt || report.video?.observedAt;
  if (timestamp && /^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
    const date = new Date(timestamp.slice(0, 10) + "T12:00:00Z");
    if (Number.isFinite(date.valueOf())) {
      const t = el("time", new Intl.DateTimeFormat("en-US", {month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(date));
      t.dateTime = timestamp.slice(0,10); meta.append(t);
    }
  }
  const body = el("div", "", "verdict-hero-body"), copy = el("div", "", "verdict-copy");
  const handle = report.video?.handle;
  copy.append(el("p", handle ? "The price check for @" + handle : "The listing price check", "verdict-subject"));
  const hasScore = verdict.score !== null && verdict.premiumPct !== null;
  const observed = hasScore ? premiumLabel(verdict.premiumPct!) : "";
  const headline = decision ? buyingAdviceTitle(decision) : observed || "Still a mystery.";
  copy.append(el("h1", headline));
  let explanation: string;
  if (decision) {
    explanation = decision.label;
    if (hasScore && report.kind === "profile") explanation += " · " + verdict.scoredCount + " of " + verdict.linkedCount + " linked products scored";
  } else if (hasScore && report.kind === "profile") {
    explanation = "Median price difference across " + verdict.scoredCount + " of " + verdict.linkedCount + " linked products in this sample.";
  } else if (hasScore && verdict.basis === "exact") {
    explanation = "Compared with the lowest verified price for the same variant at another shop.";
  } else if (hasScore) {
    const many = (verdict.items[0]?.peerCount ?? 0) > 1;
    explanation = many ? "Compared with the median price for similar listings at other shops." : "The reference price comes from a similar listing at one other shop.";
  } else if (verdict.linkedCount) {
    explanation = "The evidence is too thin to put a Rotten Onion Score on this price.";
  } else {
    explanation = "No TikTok Shop product could be confirmed for this check.";
  }
  copy.append(el("p", explanation, "verdict-explanation"));
  if (decision && hasScore) {
    const delta = el("p", "", "decision-delta");
    delta.append(el("span", report.kind === "profile" ? "Median price gap" : "Observed price gap"),el("strong",observed));
    copy.append(delta);
  }
  const scoreBox = el("div", "", "verdict-score");
  const mascot = el("img", "", "verdict-mascot");
  mascot.src = "assets/mascot/onion-head.webp"; mascot.alt = ""; mascot.width = 118; mascot.height = 118;
  const number = el("div", "", "onion-score-number");
  if (verdict.score === null) number.append(el("strong","—"));
  else number.append(el("strong",String(verdict.score)),el("span","/100"));
  scoreBox.append(mascot, el("span","Rotten Onion Score","verdict-score-name"), number);
  if (decision && hasScore) {
    const meter = el("span","","decision-meter");
    meter.setAttribute("role","meter");
    meter.setAttribute("aria-label","Rotten Onion price score");
    meter.setAttribute("aria-valuemin","0"); meter.setAttribute("aria-valuemax","100");
    meter.setAttribute("aria-valuenow",String(verdict.score));
    meter.style.setProperty("--onion-level", verdict.score + "%");
    scoreBox.append(meter);
  }
  if (decision) scoreBox.append(el("span", !hasScore ? "Unrated" : verdict.version === RANKING_SCORE_VERSION
    ? "50 = near the peer price" : "Higher means harder to justify", "decision-score-caption"));
  else scoreBox.append(el("em",tier(verdict.score)));
  body.append(copy, scoreBox); hero.append(meta, body);
  const foot = el("div", "", "verdict-hero-foot");
  if (decision) foot.append(el("span",confidenceLabel(decision.confidence),"decision-confidence"));
  if (!decision || verdict.basis !== "none") foot.append(el("span", basisLabel(verdict.basis), "verdict-basis"));
  if (report.kind === "profile" && report.sample) {
    const posts = report.sample.checked;
    foot.append(el("span", posts + (posts === 1 ? " post" : " posts") + " checked"));
  } else if (decision?.context) {
    const count = decision.context.peerCount;
    foot.append(el("span",count + (count === 1 ? " eligible shop" : " eligible shops")));
  } else if (verdict.linkedCount) foot.append(el("span", verdict.linkedCount + (verdict.linkedCount === 1 ? " linked product" : " linked products")));
  hero.append(foot);
  return {hero, shareTitle: (handle ? "@" + handle + " · " : "") + "Rotten Onion price check",
    shareText: decision ? [headline, observed, confidenceLabel(decision.confidence), hasScore ? "Rotten Onion Score " + verdict.score + "/100" : "Unrated"].filter(Boolean).join(" · ") : hasScore ? headline + " · " + basisLabel(verdict.basis) + " · Rotten Onion Score " + verdict.score + "/100."
      : "Rotten Onion price check · Unrated. " + explanation};
}

export function sourceName(product: Product) {
  const title = product.name?.trim() || "Linked product";
  if (title.length <= 115) return title;
  const first = title.split(/\s+[–—]\s+|[|;]/)[0].trim();
  return first.length >= 20 ? first : title;
}

function priceTile(kind: "source" | "peer", tag: string, price: string, seller: string, url?: string | null) {
  const tile = el("div", "", "verdict-price-tile receipt-" + kind);
  const label = el("span",tag,"verdict-label receipt-price-label");
  tile.append(label, el("strong",price));
  addShopUrl(tile,seller,url); return tile;
}

export function sourceSkuUrl(product: Product, skuId?: string | null) {
  const url = publicUrl(product.listingUrl);
  if (!url) return undefined;
  if (skuId) url.searchParams.set("sku_id",skuId);
  return url.href;
}

function priceChart(item: ItemScore, seller: string, sourceUrl: string | undefined, version: ShopOnionVersion) {
  const threshold = item.decision?.context;
  const highest = Math.max(item.sourcePrice, item.peerPrice, threshold?.upperPrice ?? 0);
  const magnitude = 10 ** Math.floor(Math.log10(highest));
  const step = Math.max(0.01, magnitude / (highest / magnitude < 3 ? 5 : 2));
  const maximum = Math.ceil(highest / step) * step;
  const plot = el("figure", "", "receipt-chart");
  plot.setAttribute("aria-label", "Shop item prices on the same scale, starting at zero");
  if (threshold) plot.style.setProperty("--threshold-at", (100 * threshold.upperPrice / maximum) + "%");

  const peerLabel = item.basis === "exact" ? "Verified match" : item.peerCount > 1 ? "Similar shops · median" : "Similar listing";
  const rows = [
    {role:"Original shop", price:item.sourcePrice, seller, url:sourceUrl, kind:"source"},
    {role:peerLabel, price:item.peerPrice, seller:item.peerSeller || item.peerCount + " shops", url:item.peerUrl, kind:"peer"},
  ];
  for (const row of rows) {
    const line = el("div", "", "receipt-chart-row receipt-chart-" + row.kind);
    const heading = el("div", "", "receipt-chart-heading");
    const url = row.url && publicUrl(row.url);
    const attribution = url ? link("",url.href,"receipt-chart-store verdict-shop-link") : el("div","","receipt-chart-store");
    attribution.append(el("strong",row.role),el("span",row.seller + (url ? "\u00a0↗" : "")));
    heading.append(attribution,el("strong",money(row.price,item.currency),"receipt-chart-price"));
    const track = el("div","","receipt-chart-track");
    track.setAttribute("aria-hidden","true");
    const bar = el("span","","receipt-chart-fill");
    bar.style.width = (100 * row.price / maximum) + "%";
    track.append(bar);
    if (row.kind === "source" && threshold && item.decision?.state === "above") {
      const above = el("span","","receipt-chart-excess");
      above.style.width = (100 * (row.price - threshold.upperPrice) / maximum) + "%";
      track.append(above);
    }
    if (threshold) track.append(el("span","","receipt-chart-limit"));
    line.append(heading,track);
    plot.append(line);
  }
  const axis = el("div","","receipt-chart-axis");
  axis.setAttribute("aria-hidden","true");
  for (const value of [0, maximum]) axis.append(el("span",money(value,item.currency).replace(/\.00$/, "")));
  plot.append(axis);
  if (threshold) {
    const caption = el("figcaption","","receipt-chart-caption");
    const limit = el("span","","receipt-chart-caption-limit");
    const current = version === RANKING_SCORE_VERSION;
    limit.append(el("strong",current ? "Category price guide" : "Scoring threshold"),document.createTextNode(" " + money(threshold.upperPrice,item.currency)));
    caption.append(limit,el("span",fmt.format(threshold.allowancePct) + "% allowance"));
    const excessCents = Math.round(item.sourcePrice * 100) - Math.round(threshold.upperPrice * 100);
    const position = item.decision?.state === "above" ? (excessCents > 0 ? money(excessCents / 100,item.currency) + " · " : "") + fmt.format(threshold.excessPct) + "% above the threshold."
      : "Within the scoring allowance.";
    const note = el("p","","receipt-band-note");
    if (current) {
      note.append(el("strong",item.score + "/100"), document.createTextNode(" · " + premiumLabel(item.premiumPct) +
        ". Prices within 5% of the peer price score 50."));
    } else note.append(el("strong",position),document.createTextNode(" Only the portion above the threshold adds points."));
    caption.append(note);
    plot.append(caption);
  }
  return plot;
}

export function productReceipt(product: Product, check: Check | undefined, score: ItemScore | undefined, multiProduct: boolean, userSelected: boolean, itemDecision?: ShopOnionDecision, version: ShopOnionVersion = "shop-onion-v2") {
  const article = el("article", "", "verdict-receipt");
  const header = el("div", "", "verdict-item-head");
  const variants = product.variants ?? [];
  const matched = score ? variants[score.variantIndex] : check && variants[check.variantIndex];
  const sourceSku = product.requestedSkuId || product.selectedSkuId ||
    (product.captionSkuId === undefined ? product.defaultSkuId : product.captionSkuId);
  const variant = matched || variants.find(v => v.skuId === sourceSku)
    || (!product.requestedSkuId && product.captionSkuId !== null && variants.length === 1 ? variants[0] : undefined);
  const title = el("h2",sourceName(product));
  title.title = product.name; header.append(title);
  if (multiProduct) header.append(el("span", score ? score.score + "/100 · " + (score.basis === "similar" ? "Estimate" : "Verified") : "Unrated", "verdict-item-rating"));
  article.append(header);
  if (variant?.variant) {
    const linked = product.requestedSkuId || product.selectedSkuId;
    const source = userSelected ? "Selected variant" : product.captionSkuId === variant.skuId ? "Shade named in the post" : linked === variant.skuId ? "Linked variant"
      : variants.length > 1 && product.defaultSkuId === variant.skuId ? "Shop default" : "Store variant";
    article.append(el("p",source + " · " + variant.variant, "verdict-variant"));
  }
  const originalSeller = product.seller || "Original listing";
  const originalUrl = sourceSkuUrl(product,variant?.skuId);
  if (score) {
    article.append(priceChart(score,originalSeller,originalUrl,version));
    const difference = Math.round(score.sourcePrice * 100) - Math.round(score.peerPrice * 100);
    const amount = money(Math.abs(difference) / 100,score.currency);
    const summary = difference === 0 ? "Both prices are the same."
      : score.basis === "exact" && difference > 0 ? "Save " + amount + " at the other shop."
      : "Original costs " + amount + (difference > 0 ? " more." : " less.");
    const finding = el("div","","verdict-finding receipt-finding");
    const gapLine = el("p","","receipt-gap");
    gapLine.append(el("strong",summary));
    if (difference !== 0) gapLine.append(el("span",premiumLabel(score.premiumPct)));
    finding.append(gapLine);
    if (score.basis === "similar") finding.append(el("p","The exact variant still needs confirmation.","receipt-match-note"));
    article.append(finding);
    if (multiProduct && score.decision) {
      const why = el("section","","decision-item");
      why.append(el("h3",buyingAdviceTitle(score.decision)),el("p",confidenceLabel(score.decision.confidence),"decision-item-confidence"));
      if (score.decision.steps.length) why.append(details("Why this item got its score",decisionSteps(score.decision)));
      article.append(why);
    }
    if (score.peerCount > 1) {
      const list = el("ul", "", "verdict-peer-list");
      for (const peer of score.peers) {
        const row = el("li");
        addShopUrl(row, (peer.seller || "Other shop") + " · " + money(peer.price,score.currency), peer.url);
        list.append(row);
      }
      article.append(details("Other shop prices (" + score.peers.length + ")",list));
    }
  } else {
    const tiles = el("div","","verdict-prices");
    tiles.append(priceTile("source","Original shop",moneyOrUnknown(variant?.price,variant?.currency),originalSeller,originalUrl));
    const possible = check?.offers?.find(o => typeof o.price === "number" && o.price > 0 && o.currency === variant?.currency && publicUrl(o.url));
    if (possible) {
      tiles.append(priceTile("peer","Possible match",moneyOrUnknown(possible.price,possible.currency),possible.seller || "Other listing",possible.url));
      article.append(tiles,el("p", "The available evidence does not establish a comparable offer for this variant.", "verdict-finding"));
    } else {
      const missing = el("div", "", "verdict-price-tile verdict-price-missing");
      missing.append(el("span","Other shops","verdict-label"),el("strong","No comparable price"));
      tiles.append(missing); article.append(tiles);
    }
  }
  if (!score && itemDecision) {
    const why = el("section","","decision-item");
    if (multiProduct) why.append(el("h3",buyingAdviceTitle(itemDecision)));
    why.append(el("p",itemDecision.reason,"decision-context-note"));
    if (multiProduct && itemDecision.steps.length) why.append(details("Why this item is unrated",decisionSteps(itemDecision)));
    article.append(why);
  }
  return article;
}

export function buyingDecision(report: ShopReport, verdict: Verdict, variantDetails?: HTMLDetailsElement) {
  const decision = verdict.decision;
  if (!decision) return null;
  const close = el("section", "", "decision-close");
  const byline = el("div", "", "decision-byline");
  const seal = el("img", "", "decision-seal");
  seal.src = "assets/mascot/onion-head.webp";
  seal.width = 44; seal.height = 44; seal.alt = "";
  byline.append(seal, el("span", "Buying advice", "verdict-label"));
  const reason = verdict.basis === "similar" && decision.context?.peerCount === 1
    ? "Only one other shop matched the selected options."
    : decision.reason;
  close.append(byline, el("h2", buyingAdviceTitle(decision)), el("p", reason, "decision-reason"));
  const next = decision.steps?.find(step => step.label.toLowerCase() === "action")?.detail;
  if (next && next !== decision.reason && next !== decision.action) close.append(el("p",next,"decision-next"));

  const item = verdict.items.length === 1 && verdict.linkedCount === 1 ? verdict.items[0] : undefined;
  if (variantDetails && item?.basis !== "exact") {
    const inspect = el("button","Inspect listing details","decision-inspect");
    inspect.type = "button";
    inspect.setAttribute("aria-controls",variantDetails.id);
    inspect.addEventListener("click", () => {
      variantDetails.open = true;
      const summary = variantDetails.querySelector("summary");
      summary?.focus({preventScroll:true});
      summary?.scrollIntoView({block:"center"});
    });
    close.append(inspect);
  } else if (item?.basis === "exact") {
    const product = report.commerce[item.productIndex];
    const original = product && sourceSkuUrl(product, product.variants?.[item.variantIndex]?.skuId);
    const lowerPeer = item.peerPrice < item.sourcePrice;
    const url = lowerPeer && item.peerUrl ? publicUrl(item.peerUrl) : original && publicUrl(original);
    if (url) close.append(link(lowerPeer && item.peerUrl ? "View the lower-priced offer ↗" : "View the original offer ↗", url.href, "decision-inspect"));
  }
  if (decision.steps?.length) {
    const proof = details(verdict.score === null ? "Why this is unrated" : "Why this scored " + verdict.score + "/100",decisionSteps(decision,verdict.version === "shop-onion-v2"));
    const relevant = report.checks?.filter(check => check.followUp) || [];
    for (const check of relevant) {
      const record = followUpRecord(check.followUp);
      if (!record) continue;
      const label = relevant.length > 1 && report.commerce[check.productIndex] ? sourceName(report.commerce[check.productIndex]) + " · " : "";
      proof.append(el("p","Seller search follow-up · " + label + record,"decision-context-note"));
    }
    close.append(proof);
  }
  return close;
}

export function verdictMethod(verdict: Verdict) {
  const content = el("div");
  if (verdict.decision) {
    content.append(el("p","The observed gap compares the original item price with prices for eligible variants in other shops. A similar listing supplies a reference price. A verified identical variant can establish an item saving."));
    const current = verdict.version === RANKING_SCORE_VERSION;
    content.append(el("p",current
      ? "50 is the baseline. An item within 5% of the peer price in either direction scores 50. Cheaper items score lower and pricier items score higher outside that band."
      : "The Rotten Onion Score measures how far the original price exceeds the allowance for this type of product. The score explanation shows which offers qualified and how the rule was applied."));
    const allowances = el("dl","","decision-allowances");
    for (const [basis,allowance] of [
      ["Verified same variant",SHOP_ONION_ALLOWANCES["same-sku"]],
      ["Standardized item with a matched measurement", SHOP_ONION_ALLOWANCES.measured],
      ["Similar item with matching options",SHOP_ONION_ALLOWANCES.general],
      ["Matching stated material, craft or collectible edition",SHOP_ONION_ALLOWANCES.variable]
    ] as const) {
      const row = el("div"); row.append(el("dt",basis),el("dd",allowance + "%")); allowances.append(row);
    }
    content.append(el("h3","Starting allowances"),allowances,
      el("p","With multiple eligible shops, the observed price spread can raise an allowance by up to 10 percentage points. " +
        (current ? "The allowance moves the 65- and 75-point anchors. The 50-point band stays within 5% of the peer price."
          : "The price band ceiling is the reference price plus the resulting allowance.")));
    const scale = el("dl","","decision-scale");
    const context = verdict.items.length === 1 ? verdict.items[0].decision?.context : null;
    const allowancePct = context?.allowancePct ?? SHOP_ONION_ALLOWANCES.general;
    scale.setAttribute("aria-label",current ? "Difference from the peer price and score" : "Price excess above the ceiling and score");
    for (const [pct,points] of current ? rankingScoreAnchors(allowancePct) : SHOP_ONION_SCALE) {
      const label = current ? (pct > 0 ? "+" : "") + fmt.format(pct) + "%" : pct + "% over";
      const row = el("div"); row.append(el("dt",label), el("dd",points + "/100")); scale.append(row);
    }
    if (current) {
      content.append(el("h3",context ? "Score anchors for this item" : "Example score anchors"),
        el("p","At a " + fmt.format(allowancePct) + "% allowance, the scale below maps the price gap to points. A wider category allowance softens the rise for moderate premiums. Half price or less scores 0. Triple price or more scores 100."),scale,
        el("p","Intermediate gaps are interpolated and rounded to whole points. A creator receives the rounded median across distinct scored products. Without an eligible other-shop price the result is Unrated."));
    } else content.append(el("h3","Points above the ceiling"),
      el("p","A price at or below the ceiling scores zero. Higher prices earn points along this scale, with linear interpolation between adjacent thresholds."),scale);
    content.append(el("p","The score covers observed item prices. Delivery, tax, checkout discounts, creator earnings and product quality are outside its scope.", "shop-small"),
      el("p","Scoring method · " + verdict.version,"shop-small"));
    return details("How the Rotten Onion Score works",content);
  }
  content.append(el("p","The score measures how far the original item price sits above other US TikTok Shop prices. Both sides must be in stock and priced in the same currency."));
  content.append(el("p","A verified same variant uses the lowest eligible offer. Similar listings must agree on product type and identifying options. Their benchmark is the median using one price per shop. The percentage is the difference divided by the peer price."));
  content.append(el("p","Each percentage point above the peer price adds one point, rounded to a whole number, up to 100. Equal or lower prices score zero. A creator sample uses the median of its scored product percentages."));
  content.append(el("p","Item prices exclude delivery, tax and checkout discounts. Creator earnings and product quality are outside this score.", "shop-small"),el("p","Scoring method · " + verdict.version,"shop-small"));
  return details("How the Rotten Onion Score works",content);
}
