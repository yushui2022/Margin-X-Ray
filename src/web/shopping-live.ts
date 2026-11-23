import archive from "../../research/creator-products.json";
import { consumeShoppingSubmission, creatorHref, markShoppingSubmission, productHref, publicUrl, shoppingRankingHref, tiktokListing } from "../shared/shopping-links";
import { backLink, details, el, link, money } from "./shop-dom";
import { followJob, JobRequestError, rememberJob, tikTokCheckRoute, validJobId, withJob } from "./shopping-job";
import { SHOP_ONION_VERSION, shopOnionVerdict, shopOnionVersionForReport } from "../shared/shop-onion.mjs";
import { buyingDecision, followUpRecord, productReceipt, verdictHero, verdictMethod } from "./shopping-verdict";
import { reportShareControl } from "./shopping-share";
import type { JobSelection } from "./shopping-job";

interface Variant {
  skuId: string | null; variant: string; gtin?: string | null;
  price: number | null; currency: string | null; available: boolean | null;
}
export interface Product {
  productId: string; name: string; listingUrl: string; sourceUrl?: string; market?: string;
  seller?: string | null; sellerId?: string | null; brand?: string | null; model?: string | null; status?: string; detailStatus?: string; observedAt?: string;
  defaultSkuId?: string | null; selectedSkuId?: string | null; requestedSkuId?: string | null; captionSkuId?: string | null; variants: Variant[];
}
interface Offer {
  name: string; url: string; price: number | null; currency: string | null;
  variant?: string | null; seller?: string | null; match?: string; available?: boolean | null;
  sellerId?: string | null; skuId?: string | null; verifiedShop?: boolean; observedAt?: string;
  weightConflict?: string;
}
export interface Check {
  followUp?: {reason:string; status:"checked"|"unavailable"|"no_more_shops"|"time_limit"};
  productIndex: number; variantIndex: number; status: string; message: string;
  offers: Offer[]; sources?: { url: string; label: string }[];
  comparison: { difference: number; basis: string; currency: string; sourcePrice: number; alternativePrice: number; alternativeUrl: string } | null;
}
export interface ShopReport {
  market?: string;
  shopOnion?: ReturnType<typeof shopOnionVerdict>;
  reassessment?: {sourceJobId?:string; sourceVersion:string; reviewedAt:string};
  kind: string; status: string; message: string;
  video?: { handle: string; url: string; caption: string; provider: string; publishedAt?: string | null; observedAt: string; sourceUrl?: string };
  sample?: { checked: number; limit: number };
  commerce: Product[]; checks: Check[]; steps: { stage: string; status: string; message: string }[];
  sources?: { url: string; label: string }[];
  sampledPosts?: { url: string; caption?: string; publishedAt?: string | null }[];
  listedProducts?: { url: string; label: string }[];
}
type Selection = JobSelection;
type Route = "video" | "profile" | "site" | "find";

function price(value: number | null, currency?: string | null) {
  return typeof value === "number" && Number.isFinite(value) && currency && /^[A-Z]{3}$/.test(currency) ? money(value, currency) : null;
}
function sourceLink(label: string, raw?: string) {
  const url = raw && publicUrl(raw);
  return url ? link(label + " ↗", url.href, "shop-source-link") : null;
}
function offerComparison(check: Check) {
  const part = el("section", "", "shop-live-prices");
  if (check.message) part.append(el("p", check.message, "shop-small"));
  const evidence: HTMLElement[] = [];
  const followUp = followUpRecord(check.followUp);
  if (followUp) evidence.push(el("p",followUp,"shop-small"));
  for (const offer of check.offers ?? []) {
    const address = publicUrl(offer.url);
    if (!address) continue;
    const row = el("div", "", "shop-live-source");
    row.append(el("strong", offer.match === "exact" ? "Verified same variant" : "Possible match", "shop-offer-match"),
      link(offer.name || address.hostname, address.href, "shop-source-link"));
    if (offer.variant) row.append(el("span", "Variant · " + offer.variant, "shop-small"));
    const stock = offer.available === true ? "In stock" : offer.available === false ? "Unavailable" : "Stock unconfirmed";
    const host = address.hostname.replace(/^www\./, "");
    const seller = offer.seller && offer.seller.toLowerCase() !== host.toLowerCase() ? offer.seller + " · " + host : host;
    row.append(el("span", seller, "shop-small"), el("span", [price(offer.price, offer.currency) || "Price unavailable", stock].join(" · "), "shop-small"));
    evidence.push(row);
  }
  for (const source of check.sources ?? []) {
    const item = sourceLink(source.label || "Retail source", source.url);
    if (item) evidence.push(item);
  }
  if (evidence.length) part.append(details("Other TikTok Shop seller evidence", ...evidence));
  return part;
}

function productCard(product: Product, checks: Check[], selection: Selection | undefined, checkSelected: (selection: Selection) => Promise<void>) {
  const card = el("article", "", "shop-receipt shop-live-product");
  const title = product.name || "Linked product";
  let shortTitle = title;
  if (title.length > 115) {
    const firstClause = title.split(/\s+[–—|\-]\s+|,\s+/)[0]!;
    const words = title.slice(0, 90).replace(/\s+\S*$/, "").trim();
    shortTitle = firstClause.length >= 24 && firstClause.length <= 105 ? firstClause : (words || title.slice(0, 85)) + "…";
  }

  const sources = el("div", "", "shop-live-links");
  const source = sourceLink("Open original listing", product.listingUrl);
  if (source) sources.append(source);
  if (product.sourceUrl && product.sourceUrl !== product.listingUrl) {
    const origin = sourceLink("Where this item was found", product.sourceUrl);
    if (origin) sources.append(origin);
  }
  const context = [product.seller ? "Seller · " + product.seller : "", product.brand, product.model, product.market].filter(Boolean).join(" · ");
  if (context) sources.append(el("p", context, "shop-small"));
  const variants = product.variants ?? [];
  if (!variants.length) {
    const reason = product.detailStatus === "unsupported_market" ? "TikHub cannot retrieve a Shop price for this market."
      : product.detailStatus === "unavailable" ? "TikHub found the attached listing, but its product details are temporarily unavailable. You can retry this check."
      : "This linked Shop listing has no readable variant price.";
    card.append(el("p", reason));
    if (shortTitle !== title) card.append(details("Full listing title", el("p", title)));
    card.append(sources); return card;
  }
  const priceLine = el("div", "", "shop-live-price");
  card.append(priceLine);
  const choose = el("select");
  const selected = selection?.productId === product.productId ? variants.findIndex(v => v.skuId === selection.skuId) : -1;
  const defaultIndex = product.defaultSkuId ? variants.findIndex(v => v.skuId === product.defaultSkuId) : -1;
  const linkedSku = product.requestedSkuId || product.selectedSkuId || product.captionSkuId;
  const linkedIndex = linkedSku ? variants.findIndex(v => v.skuId === linkedSku) : -1;
  const missingLinkedSku = !!linkedSku && linkedIndex < 0;
  const ambiguousShade = product.captionSkuId === null;
  const needsChoice = variants.length > 1 || missingLinkedSku || ambiguousShade;
  const active = selected >= 0 ? selected : linkedIndex >= 0 ? linkedIndex : missingLinkedSku || ambiguousShade ? -1 : variants.length === 1 ? 0 : defaultIndex;
  if (ambiguousShade) card.append(el("p", "Choose the shade and size from the post to compare prices.", "shop-small"));
  if (missingLinkedSku) card.append(el("p", "The variant in your link is no longer listed. Choose an available variant to compare.", "shop-small"));
  if (needsChoice) {
    const label = el("label", "Store variant", "shop-variant-choice"); label.append(choose); card.append(label);
    choose.add(new Option("Choose the exact variant", ""));
    variants.forEach((v, i) => choose.add(new Option(v.variant || (v.skuId ? "SKU " + v.skuId : "Variant " + (i + 1)), String(i))));
    choose.value = active >= 0 ? String(active) : "";
  }
  const result = el("div");
  card.append(result, sources);
  const update = () => {
    result.replaceChildren(); priceLine.replaceChildren();
    const i = !needsChoice ? 0 : choose.value === "" ? -1 : Number(choose.value);
    const v = variants[i];
    if (!v) {
      result.append(el("p", "Choose the version you want to check its price against other TikTok Shop sellers.", "shop-small"));
      if (shortTitle !== title) result.append(details("Full listing title", el("p", title)));
      return;
    }
    if (i === linkedIndex) result.append(el("p", "Variant selected in the original link.", "shop-small"));
    else if (i === defaultIndex && variants.length > 1) result.append(el("p", /\/video\/\d+/.test(product.sourceUrl || "") ? "Store’s default selection. Check which variant appears in the post." : "Store’s default selection. Choose the version you want to compare.", "shop-small"));
    const priceFigure = el("div", "", "shop-live-price-figure");
    const stock = v.available === true ? "In stock" : v.available === false ? "Unavailable" : "Stock unconfirmed";
    priceFigure.append(el("strong", price(v.price, v.currency) ?? "Price unavailable"), el("span", stock));
    priceLine.append(el("span", "Original item price"), priceFigure);
    const detail = [variants.length === 1 ? v.variant : "", product.observedAt ? "Checked " + product.observedAt.slice(0, 10) : ""].filter(Boolean).join(" · ");
    if (detail) result.append(el("p", detail, "shop-small"));
    const identifiers: HTMLElement[] = [];
    if (shortTitle !== title || title.length > 82) identifiers.push(el("p", title));
    if (v.skuId) identifiers.push(el("p", "Store SKU · " + v.skuId));
    if (v.gtin) identifiers.push(el("p", "Product barcode · " + v.gtin));
    const check = checks.find(row => row.variantIndex === i);
    if (check) result.append(offerComparison(check));
    else if (v.skuId && v.available !== false && price(v.price, v.currency)) {
      const button = el("button", "Check other sellers for this variant", "btn secondary");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true; button.textContent = "Checking other sellers…"; choose.disabled = true;
        try { await checkSelected({ productId: product.productId, skuId: v.skuId! }); }
        finally { button.disabled = false; button.textContent = "Check other sellers for this variant"; choose.disabled = false; }
      });
      result.append(button);
    } else {
      result.append(el("p", "A matching, available offer is needed before there’s a price difference to show.", "shop-small"));
    }
    if (identifiers.length) result.append(details(shortTitle === title ? "Item identifiers" : "Full title & item identifiers", ...identifiers));
  };
  choose.addEventListener("change", update); update();
  return card;
}

function savedPriceReview(id: string, route: string, market: string, signal: AbortSignal) {
  const section = el("div","","decision-reassess");
  const button = el("button","Review these prices with the current rules","btn secondary");
  button.type = "button";
  const message = el("p","Uses the listing prices recorded in this report.","shop-small");
  message.setAttribute("role","status");
  section.append(button,message);
  button.addEventListener("click", async () => {
    button.disabled = true;
    message.textContent = "Reviewing the saved prices…";
    try {
      const response = await fetch("/api/shopping-jobs/" + encodeURIComponent(id) + "/reassess",{
        method:"POST",headers:{"Content-Type":"application/json"},body:"{}",
        signal:AbortSignal.any([signal,AbortSignal.timeout(15_000)])
      });
      const next = await response.json();
      if (!response.ok) throw new Error(typeof next.error === "string" ? next.error : "The review could not be created. Try again.");
      if (!validJobId(next.id) || next.id === id || next.status !== "ready") throw new Error("The new report could not be opened. Try again.");
      const canonical = typeof next.input?.url === "string" && tikTokCheckRoute(next.input.url);
      const hash = withJob(canonical || route,next.input?.market || market,next.id);
      if (signal.aborted) return;
      rememberJob(hash); location.hash = hash;
    } catch (error) {
      if (signal.aborted) return;
      message.textContent = error instanceof Error && error.name === "Error" ? error.message : "Couldn’t review the saved prices. Try again.";
      button.disabled = false;
    }
  });
  return section;
}

export function liveShoppingPage(route: Route, raw: string, signal: AbortSignal, searchForm: () => HTMLElement, screenshot: () => HTMLElement, inlineParams?: URLSearchParams) {
  const main = el("div", "", "shop-page shop-narrow");
  const names: Record<Route,string> = { video: "Check a video", profile: "Check a creator", site: "Check a Shop listing", find: "Check a product" };
  const nav = el("div", "", "verdict-nav");
  const share = el("div", "", "shop-report-actions");
  if (!inlineParams) nav.append(backLink("Shopping check", "#shop"));
  nav.append(share);
  const routeHeading = el(inlineParams ? "h2" : "h1",names[route]);
  main.append(nav,routeHeading);
  const url = route === "find" ? null : publicUrl(raw);
  const destination = tikTokCheckRoute(raw);
  if (!url || !destination) {
    main.append(el("p", "A TikTok source is needed. Paste a video, @handle or TikTok Shop listing so we can find the original price.", "shop-lede"), searchForm(), screenshot());
    return main;
  }
  const handle = url.pathname.match(/^\/@([\w.]+)\/?$/)?.[1];
  const source = link(route === "video" ? "Open original video ↗" : route === "profile" && handle ? "@" + handle + " on TikTok ↗" : "Open original Shop listing ↗", url.href, "shop-source-link");
  const button = el("button", route === "profile" ? "Check recent posts" : route === "site" ? "Check this listing" : "Identify products", "btn primary");
  button.type = "button";
  const linkedMarket = tiktokListing(url)?.market;
  const fixedMarket = linkedMarket === "US" || linkedMarket === "GB" ? linkedMarket : null;
  const marketLabel = el("label", fixedMarket ? "Market in this link" : "Retail market", "shop-market");
  const market = el("select");
  market.add(new Option("United States", "US")); market.add(new Option("United Kingdom", "GB"));
  const params = inlineParams ?? new URLSearchParams(location.hash.split("?")[1] || "");
  market.value = fixedMarket || (params.get("market") === "GB" ? "GB" : "US");
  market.disabled = !!fixedMarket;
  const marketHelp = el("p", "Seller price comparison is available for US listings.", "shop-small");
  marketHelp.hidden = market.value === "US";
  marketLabel.append(market);
  const setup = details("Market and original source", source, marketLabel, marketHelp);
  setup.classList.add("verdict-setup"); setup.open = true; main.append(setup);
  const status = el("p", "", "shop-progress"); status.setAttribute("role", "status");
  const jobNote = el("p", "", "shop-small"); jobNote.hidden = true;
  const output = el("div", "", "shop-video-output");
  main.append(status, jobNote, button, output);
  if (route === "profile" && handle) main.append(link("View @" + handle + "’s creator evidence →", creatorHref(handle), "shop-action-link"));
  if (route === "video") {
    const known = archive.products.find(p => p.postUrl && new URL(p.postUrl).pathname.toLowerCase() === url.pathname.replace(/\/$/, "").toLowerCase());
    if (known) main.append(link("View the archived product record →", productHref(known.id), "shop-action-link"));
  }
  if (!inlineParams) {
    const continuation = el("section", "", "shop-continuation");
    continuation.append(el("h2", "Check another TikTok source"), searchForm(), screenshot());
    main.append(continuation);
  }
  let running = false;
  let started = false;
  let jobId = params.get("job") || undefined;
  let reconnect = false;
  let selected: Selection | undefined;
  let cooldown: ReturnType<typeof setTimeout> | undefined;
  signal.addEventListener("abort", () => clearTimeout(cooldown), {once:true});

  function showReport(report: ShopReport, selection?: Selection, retryable = false) {
    const commerce = report.commerce ?? [];
    const checks = report.checks ?? [];
    output.replaceChildren();
    const meta: string[] = [];
    if (report.video) meta.push("@" + report.video.handle, report.video.provider);
    const limited = retryable || report.steps?.some(s => s.status === "unavailable") || checks.some(c => c.status === "unavailable") || commerce.some(product => product.detailStatus === "unavailable");
    status.textContent = "Report ready" + (meta.length ? " · " + meta.join(" · ") : "");
    main.classList.add("verdict-ready");
    routeHeading.hidden = true;
    status.classList.add("verdict-sr");
    setup.open = false;
    button.hidden = !limited;
    if (limited) button.textContent = "Retry source lookup";
    const stored = report.shopOnion;
    const verdict = stored && typeof stored.version === "string" && Array.isArray(stored.items)
      && ["none","exact","similar","mixed"].includes(stored.basis)
      && (stored.score === null ? stored.premiumPct === null : Number.isFinite(stored.score) && Number.isFinite(stored.premiumPct))
      && (stored.version === "shop-onion-v1" || (stored.decision && typeof stored.decision.action === "string"
        && typeof stored.decision.reason === "string" && Array.isArray(stored.decision.steps)))
      && Number.isInteger(stored.scoredCount) && Number.isInteger(stored.linkedCount)
      && stored.items.every(item => item && Number.isInteger(item.productIndex) && Number.isInteger(item.variantIndex)
        && ["exact","similar"].includes(item.basis) && Number.isFinite(item.score) && Number.isFinite(item.peerPrice)
        && Number.isFinite(item.sourcePrice) && Array.isArray(item.peers))
      ? stored : shopOnionVerdict(report, {version: shopOnionVersionForReport(report)});
    const {hero, shareTitle, shareText} = verdictHero(report, verdict);
    if (jobId) share.replaceChildren(reportShareControl(jobId,shareTitle,shareText));
    output.append(hero);
    if (report.reassessment?.sourceVersion && report.reassessment.reviewedAt) {
      const note = el("div","","decision-snapshot-note");
      note.append(el("span","Reviewed with updated rules using the saved listing prices."));
      if (validJobId(report.reassessment.sourceJobId)) {
        note.append(link("View the original report",withJob(destination!,report.market || market.value,report.reassessment.sourceJobId)));
      }
      output.append(note);
    }
    const receipts = el("section", "", "verdict-receipts");
    const layout = el("div", "", "verdict-review");
    const appendix = el("div", "", "verdict-notes");
    appendix.setAttribute("role", "group");
    appendix.setAttribute("aria-label", "Report details");
    let singleVariantDetails: HTMLDetailsElement | undefined;
    if (commerce.length) {
      const sectionHead = el("div", "", "verdict-section-head");
      sectionHead.append(el("h2", "Price comparison"), el("span", "Item prices only", "verdict-label"));
      receipts.append(sectionHead);
      const products = el("div", "", "verdict-products");
      for (const [index, product] of commerce.entries()) {
        const productChecks = checks.filter(row => row.productIndex === index);
        const score = verdict.items.find(item => item.productIndex === index);
        const check = score ? productChecks.find(c => c.variantIndex === score.variantIndex) : productChecks[0];
        const decision = verdict.productDecisions?.find(row => row.productIndex === index)?.decision;
        const receipt = productReceipt(product,check,score,commerce.length > 1,selection?.productId === product.productId,decision,verdict.version);
        const options = details("Variants and listing evidence", productCard(product, productChecks, selection, next => lookup(next)));
        options.open = selection?.productId === product.productId;
        options.id = "shop-report-variants-" + index;
        if (commerce.length === 1) singleVariantDetails = options;
        receipt.append(options);
        products.append(receipt);
      }
      layout.append(products);
    }
    receipts.append(layout);
    output.append(receipts);
    const closing = buyingDecision(report, verdict, singleVariantDetails);
    const reading = el("div", "", "verdict-reading");
    if (closing) reading.append(closing);
    layout.classList.toggle("verdict-review-split", commerce.length === 1 && !!closing);
    layout.append(reading);
    appendix.append(verdictMethod(verdict));
    const standaloneNote = report.message && !checks.some(row => row.message === report.message) ? report.message : "";
    if (!verdict.decision && standaloneNote) output.append(el("p", standaloneNote));
    for (const candidate of report.listedProducts ?? []) {
      const dest = tikTokCheckRoute(candidate.url);
      if (dest) {
        const next = link("Check Shop listing · " + candidate.label + " →", withJob(dest, market.value), "shop-action-link");
        next.addEventListener("click", () => markShoppingSubmission(next.hash)); output.append(next);
      }
    }
    const evidence: HTMLElement[] = [];
    if (verdict.decision && standaloneNote && !report.steps?.some(step => step.message === standaloneNote)) {
      evidence.push(el("p",standaloneNote));
    }
    if (report.video) {
      const original = sourceLink(route === "profile" ? "Creator profile" : "Original post", report.video.url); if (original) evidence.push(original);
      if (report.video.caption) evidence.push(el("blockquote", report.video.caption));
      if (report.video.publishedAt) evidence.push(el("p", "Published " + report.video.publishedAt.slice(0, 10), "shop-small"));
    }
    if (report.sampledPosts?.length) {
      const list = el("ol", "", "shop-sampled-posts");
      for (const post of report.sampledPosts) {
        const postUrl = publicUrl(post.url);
        if (!postUrl || !tikTokCheckRoute(post.url)?.startsWith("#shop/video?")) continue;
        const row = el("li");
        row.append(link(post.publishedAt ? "Post · " + post.publishedAt.slice(0, 10) + " ↗" : "Open post ↗", postUrl.href, "shop-source-link"));
        if (post.caption) row.append(el("p", post.caption)); list.append(row);
      }
      if (list.childElementCount) appendix.append(details("Posts checked (" + list.childElementCount + ")", list));
    }
    for (const stage of report.steps ?? []) if (stage.message) evidence.push(el("p", stage.message));
    if (evidence.length) appendix.append(details("Sources and checks", ...evidence));
    appendix.append(setup);
    reading.append(appendix, link("View the Rotten Onion Index →", shoppingRankingHref(), "shop-action-link"));
    if (verdict.version !== SHOP_ONION_VERSION && jobId) reading.append(savedPriceReview(jobId,destination!,report.market || market.value,signal));
    if (selection && main.isConnected) {
      const index = commerce.findIndex(product => product.productId === selection.productId);
      output.querySelectorAll<HTMLElement>(".shop-live-product")[index]?.querySelector("select")?.focus({preventScroll:true});
    }
  }

  async function lookup(selection?: Selection, restore = false) {
    if (running) return;
    clearTimeout(cooldown); cooldown = undefined;
    main.classList.remove("verdict-ready");
    share.replaceChildren(); routeHeading.hidden = false;
    routeHeading.after(setup); setup.open = true;
    status.classList.remove("verdict-sr");
    if (!restore) {
      jobId = undefined;
      if (!inlineParams) history.replaceState(history.state, "", withJob(destination!, market.value));
    }
    running = true; started = true; reconnect = false; selected = selection;
    output.replaceChildren(); jobNote.hidden = true;
    button.disabled = true; button.hidden = true; market.disabled = true;
    status.classList.add("is-working");
    status.textContent = restore ? "Opening your saved check…" : "Submitting your shopping check…";
    let movedToCanonicalSource = false;
    try {
      const job = await followJob<ShopReport>({url:url!.href, market:market.value, ...(selection ? {selection} : {})}, jobId, signal, current => {
        const canonical = current.input?.url && tikTokCheckRoute(current.input.url);
        const correctMarket = current.input?.market || market.value;
        const routeWithJob = withJob(canonical || destination!, correctMarket, current.id);
        rememberJob(routeWithJob);
        if (!inlineParams && ((canonical && canonical !== destination) || correctMarket !== market.value)) {
          movedToCanonicalSource = true; location.replace(routeWithJob); return;
        }
        jobId = current.id;
        if (!inlineParams && location.hash !== routeWithJob) history.replaceState(history.state, "", routeWithJob);
        selected = current.input?.selection ?? selection;
        if (current.status !== "queued" && current.status !== "running") return;
        jobNote.textContent = "You can reopen this page to see the result."; jobNote.hidden = Boolean(inlineParams);
        status.textContent = current.status === "queued" ? "Queued for a shopping check…" : current.stage === "decision"
          ? "Step 3 of 3 · Preparing the report from the available evidence…" : current.stage === "comparison"
          ? "Step 2 of 3 · Checking linked products for comparable prices…" : route === "profile"
            ? "Step 1 of 3 · Reading the creator’s recent posts…" : "Step 1 of 3 · Reading the linked TikTok source…";
      }, () => { status.textContent = "Reconnecting to your saved check…"; });
      if (signal.aborted || movedToCanonicalSource) return;
      jobNote.hidden = true;
      if (job.status === "failed") {
        status.textContent = job.error || "The shopping check could not finish.";
        button.hidden = job.retryable === false; button.textContent = "Retry shopping check";
      } else if (job.report) {
        showReport(job.report, selected, job.retryAfterMs !== undefined);
      } else {
        throw new Error("The saved report could not be read.");
      }
      if (job.retryAfterMs && !button.hidden) {
        jobNote.textContent = "A fresh check will be available shortly."; jobNote.hidden = false;
        cooldown = setTimeout(() => { cooldown = undefined; button.disabled = false; jobNote.hidden = true; }, job.retryAfterMs);
      }
    } catch (error) {
      if (signal.aborted) return;
      const missing = error instanceof JobRequestError && [400,403,404,410].includes(error.status);
      reconnect = !!jobId && !missing;
      button.hidden = false; button.textContent = reconnect ? "Reconnect to saved check" : "Start a new check";
      status.textContent = missing && jobId ? "This saved check is unavailable. Submit the TikTok source again to start a new one." : error instanceof Error && error.name === "Error" ? error.message : "The shopping service could not be reached.";
    } finally {
      button.disabled = !!cooldown; market.disabled = !!fixedMarket; status.classList.remove("is-working"); running = false;
    }
  }
  market.addEventListener("change", () => {
    marketHelp.hidden = market.value === "US";
    if (!inlineParams) history.replaceState(history.state, "", withJob(destination, market.value));
    if (started) void lookup();
  });
  button.addEventListener("click", () => void lookup(selected, reconnect));
  const submitted = inlineParams || consumeShoppingSubmission(location.hash);
  if (jobId) void lookup(undefined, true);
  else if (submitted) void lookup();
  return main;
}
