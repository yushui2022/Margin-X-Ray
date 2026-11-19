import { createHash } from "node:crypto";
import { renderShoppingShareCard } from "./shopping-share-card.mjs";
import { shopOnionVerdict, shopOnionVersionForReport } from "../src/shared/shop-onion.mjs";
import { parseVideoAddress, parseShopListing, parseProfileAddress } from "./video-lookup.mjs";
import { ShoppingError } from "./shopping-http.mjs";

const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const redirectScript = 'location.replace(document.getElementById("report-link").href)';
const scriptHash = createHash("sha256").update(redirectScript).digest("base64");

function publicUrl(raw) {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  const url = URL.parse(raw);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^[a-z\d.-]+\.[a-z]{2,}$/i.test(url.hostname) || /\.(?:localhost|local|internal)$/.test(url.hostname)) return null;
  // Keep SKU and market identity. Referral, user and tracking parameters on
  // TikTok share links do not belong in a permanent public snapshot.
  for (const key of [...url.searchParams.keys()]) {
    const value = url.searchParams.get(key);
    const search = key === "search_key" && ["www.tiktok.com","shop.tiktok.com","tiktok.com"].includes(url.hostname)
      && url.pathname === "/shop/s" && /^[\p{L}\p{M}\p{N} '.(),&+-]{1,160}$/u.test(value);
    const identity = ["sku_id","skuId","variant","product_id"].includes(key) && /^[\w-]{1,80}$/.test(value);
    if (url.searchParams.getAll(key).length !== 1 || !(search || identity || (key === "region" && /^[A-Z]{2}$/i.test(value))))
      url.searchParams.delete(key);
  }
  url.hash = "";
  return url.href;
}

function publicText(value) {
  return value.slice(0,6000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[contact omitted]")
    .replace(/https?:\/\/[^\s<>"']+/gi, raw => publicUrl(raw) ?? "[link omitted]");
}

function fields(row, names) {
  const out = {};
  for (const key of names.split(" ")) {
    const value = row?.[key];
    if (value === null || typeof value === "boolean" || Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = /url$/i.test(key) ? publicUrl(value) : publicText(value);
  }
  return out;
}

const rows = (value, transform) => Array.isArray(value) ? value.map(transform) : [];
const sources = list => rows(list, entry => fields(entry,"url label source observedAt")).filter(entry => entry.url);
const variant = row => fields(row,"skuId variant gtin price currency available condition model material warranty");
const offer = row => fields(row,"name url price currency variant seller sellerId skuId gtin model match available verifiedShop observedAt condition material warranty netWeight weightConflict");
const comparison = row => fields(row,"difference basis currency sourcePrice alternativePrice alternativeUrl alternativeSeller");

// Serialize the public evidence fields deliberately. Job internals, screenshots,
// OCR, request bodies, unrecognized provider payload fields and credentials are
// never copied into the published snapshot or the recovery API.
export function freezeShoppingSnapshot(job, publishedAt, {includeSourceId=false} = {}) {
  const input = fields(job.input, "kind market url");
  const parser = { video:parseVideoAddress, profile:parseProfileAddress, website:parseShopListing };
  const source = Object.hasOwn(parser,input.kind) && parser[input.kind](input.url);
  if (!source || !["US","GB"].includes(input.market)) {
    throw new ShoppingError(422,"This report has no shareable TikTok source.");
  }
  input.url = source.url;
  if (job.input.selection) input.selection = fields(job.input.selection,"productId skuId");
  const raw = job.report;
  const report = fields(raw,"kind market scope methodVersion status message brandClue sourceUrl productLimit");
  if (raw.reassessment && /^shop-onion-v[12]$/.test(raw.reassessment.sourceVersion) &&
      typeof raw.reassessment.reviewedAt === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(raw.reassessment.reviewedAt)) {
    report.reassessment = fields(raw.reassessment,"sourceVersion reviewedAt");
    if (includeSourceId && uuid.test(raw.reassessment.sourceJobId)) report.reassessment.sourceJobId = raw.reassessment.sourceJobId;
  }
  if (raw.video) {
    report.video = fields(raw.video,"handle id url caption provider sourceUrl observedAt publishedAt");
    report.video.mentionedUrls = rows(raw.video.mentionedUrls,publicUrl).filter(Boolean);
  }
  if (raw.sample) report.sample = fields(raw.sample,"checked limit");
  report.sampledPosts = rows(raw.sampledPosts,row => fields(row,"url caption publishedAt"));
  report.products = rows(raw.products,row => fields(row,"id name listingUrl sourceUrl variant match note"));
  report.listedProducts = sources(raw.listedProducts);
  report.websiteUrls = rows(raw.websiteUrls,publicUrl).filter(Boolean);
  report.sources = sources(raw.sources);
  report.steps = rows(raw.steps,row => fields(row,"stage status message"));
  report.commerce = rows(raw.commerce,row => ({
    ...fields(row,"productId name listingUrl sourceUrl market seller sellerId brand model material warranty netWeight weightConflict status detailStatus observedAt defaultSkuId selectedSkuId requestedSkuId captionSkuId"),
    variants: rows(row.variants,variant),
  }));
  report.checks = rows(raw.checks,row => ({
    ...fields(row,"productIndex variantIndex status message"),
    offers: rows(row.offers,offer),
    sources: sources(row.sources),
    comparison: row.comparison ? comparison(row.comparison) : null,
    ...(row.followUp ? { followUp:fields(row.followUp,"status reason") } : {}),
  }));
  // Only select the recorded rubric. The score, recommendation and cited
  // evidence are regenerated from the public report rather than copied.
  const version = shopOnionVersionForReport(raw);
  report.shopOnion = shopOnionVerdict(report, { version });
  return { id: job.id, status: "ready", stage: "ready", publishedAt, input, report };
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

function money(value, currency) {
  return Number.isFinite(value) && /^[A-Z]{3}$/.test(currency) ?
    new Intl.NumberFormat("en-US",{style:"currency",currency}).format(value) : null;
}

function priceCopy(snapshot) {
  const { report } = snapshot;
  const score = report.shopOnion;
  const item = report.commerce[0];
  const subject = snapshot.input.kind === "profile" && report.video?.handle ? "@" + report.video.handle : item?.name ?? (report.video?.handle ? "@" + report.video.handle : "TikTok Shop");
  const subjectTitle = subject.length > 95 ? subject.slice(0,92).trimEnd() + "…" : subject;
  const priced = report.commerce.flatMap(p => p.variants.filter(v => v.price > 0 && v.currency && v.available !== false));
  if (typeof score.score === "number" && Number.isFinite(score.score)) {
    const basis = score.basis === "similar" ? "comparable products" : score.basis === "mixed" ? "exact matches and comparable products" : "verified exact matches";
    const percent = new Intl.NumberFormat("en-US",{maximumFractionDigits:1}).format(Math.abs(score.premiumPct));
    const premium = score.premiumPct === 0 ? " The sampled prices are equal." :
      " Sampled prices are " + percent + "% " + (score.premiumPct > 0 ? "above" : "below") + " the other-shop benchmark.";
    const benchmark = score.basis === "similar" ? "comparable listings" : score.basis === "exact" ? "verified same-item prices" : "other-shop benchmarks";
    const heading = score.premiumPct === 0 ? "In line with " + benchmark : percent + "% " + (score.premiumPct > 0 ? "above " : "below ") + benchmark;
    const coverage = score.scoredCount + " of " + score.linkedCount + " linked " + (score.linkedCount === 1 ? "product" : "products");
    const summary = "Rotten Onion Score " + score.score + "/100 for " + coverage + ", using " + basis + " from other shops.";
    return { title: subjectTitle + " · Rotten Onion Score " + score.score + "/100", heading, summary, description: summary + premium };
  }
  let description = "This sample has no verified linked product with enough comparison evidence for a Rotten Onion Score.";
  if (priced.length) description = "The source lists " + (priced.length === 1 ? "one priced variant" : priced.length + " priced variants") + ". More comparable seller evidence is needed to score the price.";
  else if (report.commerce.length) description = "This check found a linked product. The available price evidence is insufficient for a Rotten Onion Score.";
  return { title: subjectTitle + " · Unscored", heading:"Price evidence is incomplete", summary:description, description };
}

function shareCopy(snapshot) {
  const price = priceCopy(snapshot);
  const verdict = snapshot.report.shopOnion;
  if (verdict.version === "shop-onion-v1") {
    return { ...price, description:price.description + " Historical v1 price-premium rule." };
  }
  const decision = verdict.decision;
  if (!decision) return price;
  const recommendation = [decision.label,decision.action].filter(Boolean).filter((value,i,list) => list.indexOf(value) === i).join(" · ");
  const one = verdict.scoredCount === 1 ? verdict.items[0] : null;
  const quotes = one ? money(one.sourcePrice,one.currency) + " vs " + money(one.peerPrice,one.currency) + " benchmark. " : "";
  return { ...price, description:recommendation + ". " + price.heading + ". " + quotes + confidenceLabel(decision) + ". " + decision.reason };
}

function confidenceLabel(decision) {
  return decision.confidence === "insufficient" ? "Insufficient evidence" :
    String(decision.confidence).replace(/^./, ch => ch.toUpperCase()) + " confidence";
}

function purchasingDecision(decision, showSteps = true) {
  if (!decision) return "";
  const confidence = confidenceLabel(decision);
  const steps = showSteps && Array.isArray(decision.steps) && decision.steps.length ?
    "<details><summary>How the decision was reached</summary><ol>" + decision.steps.map(step =>
      "<li><strong>" + escape(step.label) + "</strong> " + escape(step.detail) + "</li>").join("") + "</ol></details>" : "";
  const details = decision.context?.detail ? "<p>" + escape(decision.context.detail) + "</p>" : "";
  const action = decision.action && decision.action !== decision.label ? "<p><strong>" + escape(decision.action) + "</strong></p>" : "";
  return "<section><h2>" + escape(decision.label) + "</h2>" + action + "<p>" + escape(decision.reason) + "</p><p>" +
    escape(confidence) + "</p>" + details + steps + "</section>";
}

function reassessmentNote(report) {
  const review = report.reassessment;
  if (!review) return "";
  const prior = review.sourceJobId && uuid.test(review.sourceJobId) ?
    '<a href="/r/' + escape(review.sourceJobId) + '">original report</a>' : "original report";
  return "<p>Reassessed on " + escape(review.reviewedAt.slice(0,10)) + " using prices already recorded in the " +
    prior + " under " + escape(review.sourceVersion) + ".</p>";
}

function methodNote(verdict) {
  if (verdict.version === "shop-onion-v1") return "<p>Historical scoring method · shop-onion-v1. This score records the sampled item-price premium, rounded to a whole point per percentage point above the benchmark, up to 100.</p>";
  if (verdict.version === "shop-onion-v3") return "<p>Scoring method · shop-onion-v3. An item within 5% of the peer price scores 50. Lower scores indicate cheaper prices, and higher scores indicate larger premiums. Categories with a wider allowance earn points more slowly for moderate premiums.</p>";
  return "<p>Scoring method · " + escape(verdict.version) + "</p>";
}

function reportHref(snapshot) {
  const kind = { website:"site", profile:"profile", video:"video" }[snapshot.input.kind];
  const query = new URLSearchParams({url:snapshot.input.url,job:snapshot.id});
  if (snapshot.input.market === "GB") query.set("market","GB");
  return "/?view=shopping#shop/" + kind + "?" + query;
}

function receipt(snapshot) {
  const {report} = snapshot;
  return report.commerce.map((product,index) => {
    const checks = report.checks.filter(check => check.productIndex === index);
    const seen = new Set();
    let prices = "";
    for (const check of checks) {
      const chosen = product.variants[check.variantIndex], price = money(chosen?.price,chosen?.currency);
      if (!chosen || !price || seen.has(check.variantIndex)) continue;
      seen.add(check.variantIndex);
      prices += "<p>" + escape(chosen.variant || "Selected variant") + " · Source item price " + escape(price) + "</p>";
      const evidence = report.shopOnion.items.find(row => row.productIndex === index && row.variantIndex === check.variantIndex);
      if (evidence) {
        const label = evidence.basis === "exact" ? "Verified same variant" : "Comparable product benchmark";
        prices += "<p>" + label + " · " + escape(money(evidence.peerPrice,evidence.currency)) + "</p>";
        if (evidence.peers.length) prices += "<ul>" + evidence.peers.map(peer => "<li><a href=\"" + escape(peer.url) + "\">" + escape(peer.seller) + "</a> · " + escape(money(peer.price,evidence.currency)) + "</li>").join("") + "</ul>";
      }
    }
    const first = product.variants.filter(v => v.available !== false && v.price > 0 && v.currency);
    if (!prices && first.length) {
      const currency = first[0].currency, amounts = first.filter(v => v.currency === currency).map(v => v.price);
      const low = money(Math.min(...amounts),currency), high = money(Math.max(...amounts),currency);
      prices = "<p>Listed item price " + escape(low === high ? low : low + " – " + high) + "</p>";
    }
    const label = escape(product.name || "Linked product");
    return "<section><h2>" + (product.listingUrl ? '<a href="' + escape(product.listingUrl) + '">' + label + "</a>" : label) + "</h2>" + prices +
      (report.kind === "profile" || report.commerce.length > 1 ?
        purchasingDecision(report.shopOnion.productDecisions?.find(row => row.productIndex === index)?.decision,false) : "") + "</section>";
  }).join("");
}

function publicOrigin(value) {
  const url = URL.parse(value ?? "");
  return url && ["http:","https:"].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
}

export function serveShoppingShare(req, res, readPublished, baseUrl, cards) {
  const path = (req.url ?? "").split("?")[0];
  if (!path.startsWith("/r/") && path !== "/r") return false;
  const head = req.method === "HEAD";
  const respond = (code, type, body, headers = {}) => {
    res.writeHead(code,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",...headers});
    res.end(head ? undefined : body);
  };
  if (!head && req.method !== "GET") {
    respond(405,"text/plain; charset=utf-8","Read this report with GET or HEAD.",{Allow:"GET, HEAD"}); return true;
  }
  const segments = path.slice(3).split("/");
  const id = segments[0].toLowerCase(), card = segments.length === 2 && segments[1] === "card.png";
  const snapshot = uuid.test(id) && (segments.length === 1 || card) && readPublished(id);
  if (!snapshot) { respond(404,"text/plain; charset=utf-8","This shared report was not found."); return true; }
  if (card) {
    const revision = snapshot.report.shopOnion?.version?.match(/^shop-onion-v([123])$/)?.[1] ?? "1";
    const headers = { ETag: '"card-' + id + '-' + revision + '"', "Cache-Control":"public, max-age=31536000, immutable" };
    if (req.headers["if-none-match"] === headers.ETag) {
      res.writeHead(304,headers).end(); return true;
    }
    let png = cards.get(id);
    if (!head && !png) {
      png = renderShoppingShareCard(snapshot.report);
      if (cards.size >= 16) cards.delete(cards.keys().next().value);
      cards.set(id,png);
    }
    respond(200,"image/png",png,headers);
    return true;
  }
  const {title,description,heading,summary} = shareCopy(snapshot), brandTitle = title + " | Onion Head price check";
  const origin = publicOrigin(baseUrl);
  const canonical = origin ? '<link rel="canonical" href="' + escape(origin + "/r/" + id) + '"><meta property="og:url" content="' + escape(origin + "/r/" + id) + '">' : "";
  const img = (origin ?? "") + "/r/" + id + "/card.png";
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + escape(brandTitle) + "</title>" + '<meta name="description" content="' + escape(description) + '">' +
    '<meta property="og:type" content="article"><meta property="og:site_name" content="Onion Head"><meta property="og:title" content="' + escape(brandTitle) + '">' +
    '<meta property="og:description" content="' + escape(description) + '"><meta property="og:image" content="' + escape(img) + '"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + escape(img) + '">' + canonical +
    '<link rel="stylesheet" href="/fonts.css"><style>body{box-sizing:border-box;max-width:46rem;margin:auto;padding:2rem 1.4rem 4rem;background:#fcf8f1;color:#211b17;font:1.05rem/1.55 system-ui,sans-serif}a{color:#663b56;overflow-wrap:anywhere}h1,h2{font-family:Fraunces,Georgia,serif;line-height:1.15}h1{font-size:clamp(2rem,6vw,3rem)}h2{font-size:1.35rem}header{display:flex;gap:.6rem;align-items:center}header img{width:2.2rem}section{margin:2rem 0;border-top:1px solid #d8cec2}</style>' +
    '</head><body><header><img src="/assets/mascot/onion-head.webp" alt=""><strong>Onion Head</strong></header><main><h1>'  + escape(heading) + '</h1><p>' + escape(summary) + '</p><p>Shared ' + escape(new Date(snapshot.publishedAt).toISOString().slice(0,10)) +
    ' · ' + escape(snapshot.input.market) + '</p>' + reassessmentNote(snapshot.report) + purchasingDecision(snapshot.report.shopOnion.decision) + receipt(snapshot) + methodNote(snapshot.report.shopOnion) + '<p><a id="report-link" href="' + escape(reportHref(snapshot)) + '">Open the full price report</a></p></main><script>' + redirectScript + "</script></body></html>";
  respond(200,"text/html; charset=utf-8",html,{"Content-Security-Policy":"default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'sha256-" + scriptHash + "'; base-uri 'none'; frame-ancestors 'none'"});
  return true;
}
