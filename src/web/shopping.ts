import archive from "../../research/creator-products.json";
import { PUBLIC_CREATORS } from "../shared/creator-directory";
import { markupRecord } from "../shared/markup-records";
import { creatorPremium, retailComparison, retailComparisons } from "../shared/retail-premium";
import { creatorHref, markShoppingSubmission, profileCheckHref, productHref, publicUrl, shoppingDestination, shoppingRankingHref, videoHref } from "../shared/shopping-links";
import { details, el, link, money } from "./shop-dom";
import { listingCheck } from "./shopping-listing";
import { liveShoppingPage } from "./shopping-live";
import { lastShoppingJob, tikTokCheckRoute } from "./shopping-job";
import { screenshotPage, screenshotPicker } from "./shopping-screenshot";
import { rankedCreatorPage, rankingAroundCreator, rankingPage } from "./shopping-ranking";
import { homeRanking, scoredArchiveList } from "./shopping-home-ranking";
import { savedShoppingMatches } from "./shopping-saved";
import { creatorSearchDestination, liveCreatorHref, username } from "./shopping-creator-search";
import { creatorLookupOrigin, creatorResults, searchResultButton, suggestCreators } from "./shopping-creator-lookup";
import { liveCreatorPage } from "./shopping-creator-live";
import { archiveHosting } from "./hosting-mode";

const catalogue = archive.products;
const profiles = new Map(PUBLIC_CREATORS.map(profile => [profile.handle, profile]));
type Comparison = NonNullable<ReturnType<typeof retailComparison>>;
let currentView: AbortController | undefined;

function submitShopping(destination: string) {
  markShoppingSubmission(destination);
  if (location.hash === destination) renderShopping(document.querySelector("#shopView")!);
  else location.hash = destination;
}

function searchForm(initial = "", context: "live" | "home" | "archive" = "live", submit = submitShopping) {
  const box = el("div", "", "shop-entry-form");
  const form = el("form", "", "shop-search");
  form.setAttribute("role", "search");
  const input = el("input");
  input.type = "search"; input.value = initial; input.required = true; input.maxLength = 2048;
  const button = el("button", "", "btn primary");
  button.type = "submit";
  const creatorLookup = context === "home" || (context === "live" && archiveHosting);
  input.placeholder = creatorLookup ? "Username, name or TikTok link" : context === "archive" ? "Product, creator or brand" : "TikTok link or @creator";
  input.setAttribute("aria-label", creatorLookup ? "Search by username, display name or TikTok link" : context === "archive" ? "Search archived product checks" : "TikTok video link, Shop product link or creator handle");
  button.textContent = creatorLookup || context === "archive" ? "Search" : "Check price";
  form.append(input, button); box.append(form);
  const dismiss = creatorLookup ? suggestCreators(box, input, submit) : undefined;
  input.addEventListener("input", () => input.setCustomValidity(""));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const raw = input.value.trim();
    let dest = creatorLookup ? creatorSearchDestination(raw, archiveHosting) : null;
    if (!dest) dest = tikTokCheckRoute(raw);
    if (!dest && context === "archive") {
      const archived = shoppingDestination(input.value);
      if (archived?.startsWith("#shop/search?") || archived?.startsWith("#shop/product/")) dest = archived;
    }
    if (!dest) {
      input.setCustomValidity(creatorLookup ? "Enter a username, display name or TikTok link." : "Enter a TikTok video, creator handle or TikTok Shop product link.");
      input.reportValidity(); return;
    }
    dismiss?.();
    submit(dest);
  });
  return box;
}

function creatorPortrait(handle: string) {
  const profile = profiles.get(handle);
  if (!profile) return el("span");
  const img = el("img", "", "shop-avatar");
  img.src = profile.image;
  img.alt = "";
  img.width = img.height = 40;
  img.loading = "lazy";
  return img;
}

function difference(compare: Comparison) {
  const value = compare.delta;
  if (value == null) return compare.status === "stale" ? "Older price check" : "Prices on record";
  if (value === 0) return compare.status === "delivered" ? "Same delivered price" : "Same item price";
  return money(Math.abs(value), compare.currency) + (compare.status === "delivered" ? " delivered difference" : " item-price difference");
}

function productRow(id: string) {
  const p = catalogue.find(item => item.id === id);
  const comparison = retailComparison(id);
  const handle = p?.handle ?? comparison?.handle;
  const r = markupRecord(id);
  const a = link("", productHref(id), "shop-product-row");
  if (handle) a.append(creatorPortrait(handle));
  const label = el("div", "", "shop-row-name");
  label.append(el("strong", p?.name ?? r?.listing.name ?? comparison?.name ?? "Product check"),
    el("small", handle ? "@" + handle + " · " + (p?.postUrl ? "Product in a post" : p?.kind === "founder-brand" || comparison?.relation === "founder-store" ? "Founder-linked brand" : "Product record") : "Independent product record"));
  const state = el("div", "", "shop-row-state");
  state.append(el("strong", comparison ? difference(comparison) : r ? money(r.listing.amount, r.listing.currency) : "Open record"),
    el("small", comparison?.status === "delivered" ? comparison.market : comparison?.status === "item-only" ? "Delivery pending" : "Observed listing"));
  a.append(label, state, el("span", "→", "shop-arrow"));
  return a;
}

function revealRankingMatch(ranking: HTMLElement, signal: AbortSignal) {
  const selected = ranking.querySelector<HTMLElement>('li[aria-current="true"] > details > summary');
  if (!selected) return;
  requestAnimationFrame(() => {
    if (signal.aborted || !selected.isConnected) return;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? innerHeight);
    const nav = document.querySelector(".topnav")?.getBoundingClientRect();
    const bottom = nav && nav.top > innerHeight / 2 ? Math.min(viewportBottom, nav.top) : viewportBottom;
    const top = Math.max(viewportTop, document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0);
    const row = selected.getBoundingClientRect();
    if (row.bottom > bottom) window.scrollBy({top: row.bottom - bottom + 36, behavior: "instant"});
    else if (row.top < top) window.scrollBy({top: row.top - top - 8, behavior: "instant"});
  });
}

function home(lifetime: AbortSignal, initialQuery = "") {
  const main = el("div", "", "shop-page shop-home");
  const lookup = el("section", "", "shop-home-lookup");
  const form = searchForm(initialQuery, "home", open);
  const input = form.querySelector("input")!;
  const lookupHeading = el("div", "", "shop-home-lookup-heading");
  lookupHeading.append(el("h2", "Search creators"), link("Full ranking →", shoppingRankingHref(), "shop-home-mobile-ranking"));
  lookup.append(lookupHeading, form);
  if (!archiveHosting) {
    const actions = el("div", "", "shop-entry-actions");
    actions.append(screenshotPicker(submitShopping, "Upload a screenshot", lookup));
    const previous = lastShoppingJob();
    if (previous) actions.append(link("Open your last check →", previous, "shop-inline-example"));
    lookup.append(actions);
  }
  const section = el("section", "", "shop-browse");
  const archiveHeading = el("div", "", "shop-section-head");
  archiveHeading.append(el("h2", "Creator product archive"), link("Browse all →", shoppingRankingHref()));
  const archiveList = scoredArchiveList((handle, button) => open(shoppingRankingHref(handle), button));
  section.append(archiveHeading, archiveList);
  const panel = el("section", "", "shop-inline-search");
  panel.hidden = true;
  panel.setAttribute("aria-label", "Creator search results");
  const toolbar = el("div", "", "shop-inline-toolbar");
  const title = el("h2");
  title.tabIndex = -1;
  const back = el("button", "← Back to matches", "shop-inline-control");
  const close = el("button", "Close", "shop-inline-control");
  close.setAttribute("aria-label", "Close search results");
  back.type = close.type = "button";
  toolbar.append(title, back, close);
  const body = el("div", "", "shop-inline-body");
  panel.append(toolbar, body);
  let request: AbortController | undefined;
  let matchesFor = "";
  let activeDestination = "";
  let archiveReturn: {button: HTMLButtonElement; top: number} | undefined;
  lifetime.addEventListener("abort", () => request?.abort(), { once: true });

  function restoreArchive() {
    if (toolbar.parentElement !== section) return;
    panel.prepend(toolbar);
    section.replaceChildren(archiveHeading, archiveList);
  }

  function clear() {
    request?.abort();
    archiveReturn = undefined;
    activeDestination = matchesFor = "";
    panel.hidden = true;
    body.replaceChildren();
    restoreArchive();
  }
  close.addEventListener("click", () => {
    const origin = archiveReturn;
    clear();
    input.value = "";
    if (origin) {
      origin.button.focus({ preventScroll: true });
      window.scrollBy({top: origin.button.getBoundingClientRect().top - origin.top, behavior: "instant"});
    } else input.focus({ preventScroll: true });
  });
  input.addEventListener("input", clear);
  back.addEventListener("click", () => open("#shop/creators?" + new URLSearchParams({ q: matchesFor })));

  function open(destination: string, source?: HTMLButtonElement) {
    if (!source && destination === activeDestination && toolbar.parentElement !== section) return;
    archiveReturn = source ? {button: source, top: source.getBoundingClientRect().top} : undefined;
    const focused = document.activeElement;
    const restoreFocus = focused?.matches(":focus-visible") && (
      form.querySelector(".shop-creator-suggestions")?.contains(focused) || body.contains(focused) || focused === back
    );
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    const [path, params] = destination.slice(5).split("?");
    const query = new URLSearchParams(params);
    const accountSearch = path === "/creators";
    if (source) {
      matchesFor = "";
      input.value = "@" + source.dataset.handle;
    } else if (accountSearch) matchesFor = query.get("q") ?? "";
    else if (!activeDestination && !matchesFor && creatorSearchDestination(input.value, archiveHosting)?.startsWith("#shop/creators?")) {
      matchesFor = input.value.trim();
    }
    title.textContent = accountSearch ? "Matches for “" + matchesFor + "”" : "Price check";
    let ranking: HTMLElement | null = null;
    let result: HTMLElement;
    if (accountSearch) result = creatorResults(matchesFor, signal, open);
    else if (path.startsWith("/rankings/")) {
      const handle = path.slice("/rankings/".length);
      if (!query.has("product")) ranking = rankingAroundCreator(handle);
      result = ranking ?? rankedCreatorPage(handle, { productId: query.get("product") });
    } else if (path === "/tiktok") {
      result = liveCreatorPage(query.get("user")!, creatorLookupOrigin, signal, true);
    } else if (!archiveHosting && (path === "/video" || path === "/site" || path === "/profile")) {
      result = liveShoppingPage(path.slice(1) as "video" | "site" | "profile", query.get("url")!, signal, searchForm, () => screenshotPicker(submitShopping), query);
    } else {
      const saved = savedShoppingMatches(path, query);
      if (saved.length === 1 && saved[0].href.startsWith("#shop/rankings/")) {
        open(saved[0].href);
        return;
      }
      result = el("div", "", "shop-inline-link-results");
      if (saved.length) {
        title.textContent = "Matching price checks";
        for (const match of saved) result.append(searchResultButton(match.label, match.href, "shop-saved-match shop-action-link", open));
      } else {
        title.textContent = "No saved price check for this link";
        result.append(el("p", "Try the creator’s @username to check their recent TikTok posts.", "shop-small"));
      }
    }
    activeDestination = destination;
    back.hidden = !matchesFor || accountSearch;
    if (ranking) {
      title.textContent = ranking.dataset.group === "unrated" ? "Checked but unrated" : "Creator ranking";
      body.replaceChildren();
      section.replaceChildren(toolbar, ranking);
      panel.hidden = true;
      if (source) ranking.querySelector<HTMLElement>('li[aria-current="true"] summary')?.focus({preventScroll:true});
      revealRankingMatch(ranking, signal);
    } else {
      restoreArchive();
      body.replaceChildren(result);
      panel.hidden = false;
    }
    if (restoreFocus && title.isConnected) title.focus({ preventScroll: true });
  }
  const mast = homeRanking(lookup, archiveHosting);
  mast.append(panel);
  main.append(mast, section);
  if (initialQuery) open("#shop/creators?" + new URLSearchParams({ q: initialQuery }));
  return main;
}

function searchPage(query: string) {
  const main = el("div", "", "shop-page shop-narrow");
  main.append(link("← Shopping check", "#shop", "shop-back"), el("h1", query ? "Archive search results" : "Browse product checks"), searchForm(query, "archive"));
  const q = query.trim().toLowerCase().replace(/^@/, "");
  const ids = Array.from(new Set([...retailComparisons().map(row => row.productId), ...catalogue.map(row => row.id), "winco-msp-4p"]));
  const results = ids.filter(id => {
    const p = catalogue.find(item => item.id === id);
    const r = markupRecord(id);
    const comparison = retailComparison(id);
    return [p?.name, p?.variant, p?.handle, r?.listing.name, comparison?.name, comparison?.handle, comparison?.variant, id].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  const heading = el("h2", results.length + (results.length === 1 ? " product" : " products"));
  main.append(heading);
  const list = el("div", "", "shop-list");
  results.forEach(id => list.append(productRow(id)));
  main.append(list);
  if (!q) {
    const handles = [...new Set(retailComparisons().map(row => row.handle))];
    const rated = handles.map(handle => ({ handle, data: creatorPremium(handle) })).find(item => item.data.value !== null);
    if (rated) {
      const index = link("", creatorHref(rated.handle), "shop-index-link");
      index.append(creatorPortrait(rated.handle), el("span", "@" + rated.handle + " · Price premium index"),
        el("strong", rated.data.value!.toFixed(1) + " / 100"), el("small", rated.data.matched + " of " + rated.data.identified + " product families eligible →"));
      main.append(index);
    }
  }
  const creators = q ? PUBLIC_CREATORS.filter(p => p.handle.includes(q) || p.name.toLowerCase().includes(q)).slice(0, 10) : [];
  if (creators.length) {
    main.append(el("h2", "Matching creators"));
    for (const creator of creators) main.append(link(creator.name + " · @" + creator.handle + " →", creatorHref(creator.handle), "shop-action-link"));
  }
  if (q && /^[a-z0-9_][a-z0-9_.]{0,23}$/i.test(q) && !q.endsWith(".") && !creators.some(c => c.handle === q)) {
    const lookup = link((archiveHosting ? "Find saved checks for @" : "Check recent posts from @") + q + " →", profileCheckHref(q), "shop-action-link");
    lookup.addEventListener("click", () => markShoppingSubmission(lookup.hash));
    main.append(lookup);
  }
  if (!results.length) main.append(el("p", archiveHosting ? "Search the saved US edition using a TikTok handle or link." : "Use the original TikTok video or TikTok Shop link for a current price check."), link("Open shopping check →", "#shop", "shop-action-link"));
  return main;
}

function offerCard(offer: NonNullable<Comparison["reference"]>, currency: string, delivered: boolean) {
  const box = el("article", "", "shop-offer");
  const total = delivered && offer.shipping !== null ? offer.amount + offer.shipping : offer.amount;
  box.append(link(offer.seller + " ↗", offer.url), el("strong", money(total, currency)));
  if (delivered && typeof offer.shipping === "number") {
    box.append(el("span", offer.shipping === 0 ? "Free standard delivery" : money(offer.amount, currency) + " item + " + money(offer.shipping, currency) + " delivery"));
  }
  if (offer.taxIncluded) box.append(el("span", "Tax included"));
  box.append(el("small", "Observed " + offer.observedAt));
  return box;
}

function checkoutReceipt(row: Comparison) {
  const card = el("section", "", "shop-receipt");
  card.append(el("p", row.market + " · " + row.currency, "shop-kicker"));
  const complete = row.status === "delivered";
  if (row.delta !== null && row.reference && row.alternative) {
    const cheaper = row.delta > 0 ? row.alternative : row.reference;
    card.append(el("h2", row.delta === 0 ? difference(row)
      : complete ? money(Math.abs(row.delta), row.currency) + " less at " + cheaper.seller
      : money(Math.abs(row.delta), row.currency) + " apart before checkout"));
  } else {
    card.append(el("h2", row.status === "stale" ? "A fresh price check is needed" : "More price evidence needed"));
  }
  if (row.reason) card.append(el("p", row.reason, "shop-small"));
  const offers = el("div", "", "shop-offers");
  for (const offer of [row.reference, row.alternative]) if (offer) offers.append(offerCard(offer, row.currency, complete));
  card.append(offers);
  const notes: HTMLElement[] = [el("p", row.matchNote)];
  if (publicUrl(row.sourceUrl)) notes.push(link("Creator or brand relationship ↗", row.sourceUrl, "shop-source-link"));
  for (const offer of [row.reference, row.alternative]) {
    if (!offer) continue;
    notes.push(el("h3", offer.seller), el("p", offer.note));
    for (const source of offer.sources) notes.push(link(source.label + " ↗", source.url, "shop-source-link"));
  }
  card.append(details("Match, delivery & sources", ...notes));
  return card;
}

function productPage(id: string, fromArchive: boolean) {
  const main = el("div", "", "shop-page shop-narrow");
  main.append(link("← Shopping check", "#shop", "shop-back"));
  const p = catalogue.find(item => item.id === id);
  const check = retailComparison(id);
  const r = markupRecord(id);
  if (!p && !check && !r) {
    main.append(el("h1", "Product record unavailable"), searchForm());
    return main;
  }
  main.append(el("h1", p?.name ?? check?.name ?? r!.listing.name), el("p", check?.variant ?? p?.variant ?? r?.listing.conditions, "shop-lede"));
  const handle = p?.handle ?? check?.handle;
  if (handle) {
    const byline = el("div", "", "shop-byline");
    byline.append(creatorPortrait(handle), link("@" + handle, creatorHref(handle)));
    if (p?.postUrl) byline.append(link("Video evidence →", videoHref(p.postUrl)));
    main.append(byline);
  }
  if (check) {
    const context = check.relation === "retail-reference"
      ? "Retailer comparison for the selected variant. The creator’s selling price is unverified."
      : check.relation === "founder-store" ? "The reference is a creator-linked brand store." : "The creator-linked offer is the reference price.";
    if (fromArchive && r) {
      const original = el("section", "", "shop-video-product");
      original.append(el("h3", "Your linked listing"), link(r.listing.label + " ↗", r.listing.url),
        el("p", money(r.listing.amount, r.listing.currency) + " · " + r.listing.market + " · " + r.listing.observedAt),
        el("p", "The separate " + check.market + " comparison below uses two other retail observations. Delivery to your address may differ."));
      main.append(original);
    }
    main.append(el("p", context, "shop-product-context"), checkoutReceipt(check));
  } else {
    const card = el("section", "", "shop-receipt");
    card.append(el("p", "Retail comparison", "shop-kicker"), el("h2", "A second matched retail offer is needed"));
    if (r) card.append(el("p", r.listing.label + " · " + money(r.listing.amount, r.listing.currency) + " · " + r.listing.market + " · " + r.listing.observedAt),
      link("Open the recorded listing ↗", r.listing.url), el("p", r.listing.conditions, "shop-small"));
    if (p) card.append(el("p", p.relationship + ". " + p.shopStatus + ".", "shop-small"));
    main.append(card);
  }
  if (p) main.append(link("Product evidence, quality checks & original sources →",
    creatorHref(p.handle) + "/products/" + encodeURIComponent(id), "shop-action-link"));
  if (r?.quote) {
    main.append(details("Supplier prices & order sizes", el("p", "Wholesale offers have their own order sizes, delivery terms and source records."),
      link("Open the supplier comparison →", "#markup/" + encodeURIComponent(id))));
  }
  const firstUrl = fromArchive ? r?.listing.url : check?.reference.url ?? r?.listing.url;
  if (firstUrl) {
    const params = new URLSearchParams({ url: firstUrl });
    if (check && !fromArchive) params.set("other", check.alternative.url);
    main.append(link("Compare checkout totals for your address →", "#shop/listing?" + params, "shop-action-link"));
  }
  return main;
}

export function renderShopping(container: HTMLElement) {
  currentView?.abort();
  currentView = new AbortController();
  const lifetime = currentView;
  const path = location.hash.slice(5).split("?")[0] ?? "";
  const query = new URLSearchParams(location.hash.split("?").slice(1).join("?"));
  let page: HTMLElement;
  const liveUser = path === "/tiktok" ? username(query.get("user") ?? "") : null;
  if (liveUser) {
    page = liveCreatorPage(liveUser, creatorLookupOrigin, lifetime.signal);
  } else if (archiveHosting && ["/video","/profile","/site","/find","/screenshot"].includes(path)) {
    const matches = savedShoppingMatches(path, query);
    if (matches.length === 1) {
      if (!matches[0]!.href.startsWith("#shop/")) {
        location.replace(matches[0]!.href);
        return;
      }
      history.replaceState(history.state, "", matches[0]!.href);
      renderShopping(container);
      return;
    }
    const profile = path === "/profile" && publicUrl(query.get("url") ?? "");
    const handle = profile && /^(?:(?:www|m)\.)?tiktok\.com$/.test(profile.hostname) && /^\/@([\w.]+)\/?$/.exec(profile.pathname)?.[1];
    if (!matches.length && handle && username(handle) && !query.has("job") && !profile.search && (query.get("market") ?? "US").toUpperCase() === "US") {
      history.replaceState(history.state, "", liveCreatorHref(handle.toLowerCase()));
      renderShopping(container);
      return;
    }
    page = el("div", "", "shop-page shop-narrow");
    const title = path === "/screenshot" ? "Screenshot uploads are unavailable" : matches.length ? "Matching saved checks" : "No saved check";
    page.append(link("← Shopping check", "#shop", "shop-back"), el("h1", title));
    if (matches.length) {
      page.append(el("p", "Open a saved receipt from this US edition."));
      for (const match of matches) page.append(link(match.label, match.href, "shop-action-link"));
    } else {
      page.append(el("p", "Search the saved US edition with a creator handle, full TikTok video URL or TikTok Shop product link. Live checks are unavailable here."), searchForm());
    }
    page.append(link("Browse the ranking →", shoppingRankingHref(), "shop-action-link"));
  } else if (path === "/creators") page = home(lifetime.signal, query.get("q") ?? "");
  else if (path === "/rankings") page = rankingPage();
  else if (path.startsWith("/rankings/")) page = rankedCreatorPage(path.slice("/rankings/".length));
  else if (path.startsWith("/product/")) {
    page = productPage(path.slice(9), query.get("from") === "archive");
  } else if (path === "/video" || path === "/profile" || path === "/site" || path === "/find") {
    const route = path.slice(1) as "video" | "profile" | "site" | "find";
    page = liveShoppingPage(route, query.get(route === "find" ? "q" : "url") ?? "", lifetime.signal, searchForm, () => screenshotPicker(submitShopping));
  } else if (path === "/screenshot") page = screenshotPage(lifetime.signal, submitShopping);
  else if (path === "/listing") page = listingCheck(query.get("url") ?? "", lifetime.signal, query.get("other"));
  else if (path === "/search") page = searchPage(query.get("q") ?? "");
  else page = home(lifetime.signal);
  const leave = () => { lifetime.abort(); };
  window.addEventListener("hashchange", leave, { once: true, signal: lifetime.signal });
  container.replaceChildren(page);
  const heading = page.querySelector("h1");
  if (heading) {
    document.title = heading.textContent + " · Onion Head";
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  const receiptId = path.startsWith("/rankings/") ? query.get("product") : null;
  const receipt = receiptId ? document.getElementById("ranking-product-" + receiptId) : null;
  if (receipt) {
    const comparisonHeading = receipt.previousElementSibling;
    const start = comparisonHeading?.classList.contains("ranking-receipts-heading") ? comparisonHeading : receipt;
    start.scrollIntoView({ block: "start" });
    receipt.tabIndex = -1;
    receipt.focus({ preventScroll: true });
  } else window.scrollTo({ top: 0, behavior: "instant" });
}
