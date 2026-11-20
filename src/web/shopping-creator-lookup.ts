import { el, link } from "./shop-dom";
import { markShoppingSubmission } from "../shared/shopping-links";
import { archiveHosting } from "./hosting-mode";
import { creatorPriceReportHref, creatorResultsHref, exactCreator, isCreatorQuery, searchCreators, username, type CreatorSearchEntry } from "./shopping-creator-search";

export const creatorLookupOrigin = "https://onion-head-creator-lookup.purebeak64.chatgpt.site";
function reportLink(label: string, destination: string, className: string) {
  const row = link(label, destination, className);
  row.addEventListener("click", event => {
    if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) markShoppingSubmission(destination);
  });
  return row;
}

function creatorList(matches: CreatorSearchEntry[], dropdown = false) {
  const list = el("ul", "", "shop-creator-matches");
  for (const creator of matches) {
    const item = el("li");
    const row = reportLink("", creator.href, "shop-creator-match");
    row.dataset.handle = creator.handle;
    const initial = el("span", Array.from(creator.handle)[0]?.toUpperCase(), "shop-creator-initial");
    initial.setAttribute("aria-hidden", "true");
    if (creator.avatar) {
      const img = el("img");
      img.addEventListener("error", () => img.replaceWith(initial), { once: true });
      img.referrerPolicy = "no-referrer";
      img.src = creator.avatar;
      img.alt = "";
      img.loading = "lazy";
      img.width = img.height = 36;
      row.append(img);
    } else row.append(initial);
    const identity = el("span", "", "shop-creator-name");
    const handle = "@" + creator.handle;
    if (!dropdown && creator.name.toLowerCase() === creator.handle.toLowerCase()) identity.append(el("strong", handle));
    else identity.append(el("strong", creator.name), el("small", handle));
    const label = creator.score !== null ? creator.score + "/100" : creator.hasCheck ? "Unrated" : "Check prices →";
    row.append(identity);
    if (!dropdown || creator.hasCheck) row.append(el("span", label, "shop-creator-result-score"));
    item.append(row);
    list.append(item);
  }
  return list;
}

interface SuggestedAccount { handle: string; name: string; avatar: string | null }

function liveSearchTerm(query: string) {
  const term = query.normalize("NFKC").trim().replace(/^@/, "").trim().toLowerCase();
  const length = Array.from(term).length;
  return isCreatorQuery(term) && length >= 2 && length <= 48 && !/[\r\n\t]/.test(term) ? term : null;
}

const pendingSearches = new Map<string, Promise<SuggestedAccount[]>>();
let lastSearch: { term: string; accounts: SuggestedAccount[]; expires: number } | undefined;

function searchTikTok(term: string): Promise<SuggestedAccount[]> {
  if (lastSearch?.term === term && lastSearch.expires > Date.now()) return Promise.resolve(lastSearch.accounts);
  const pending = pendingSearches.get(term);
  if (pending) return pending;
  // Submitting while autocomplete is loading should reuse the same provider request.
  const request = fetch(creatorLookupOrigin + "/api/creator-suggestions?" + new URLSearchParams({ q: term }), {
    signal: AbortSignal.timeout(25_000), credentials: "omit",
  }).then(async response => {
    if (!response.ok) throw new Error("TikTok search unavailable");
    const data = await response.json();
    if (!Array.isArray(data?.creators)) throw new Error("Incomplete TikTok search results");
    const accounts: SuggestedAccount[] = data.creators.slice(0, 6);
    lastSearch = { term, accounts, expires: Date.now() + 60_000 };
    return accounts;
  }).finally(() => pendingSearches.delete(term));
  pendingSearches.set(term, request);
  return request;
}

function mergeSuggestions(query: string, local: CreatorSearchEntry[], accounts: SuggestedAccount[]) {
  const rows = new Map<string, CreatorSearchEntry>();
  for (const account of accounts) {
    if (typeof account?.handle !== "string") continue;
    const handle = username(account.handle);
    if (!handle || rows.has(handle)) continue;
    const known = exactCreator(handle);
    const checked = known?.handle === handle && known.hasCheck ? known : undefined;
    const avatar = typeof account.avatar === "string" && account.avatar.startsWith("https://") ? account.avatar : undefined;
    rows.set(handle, {
      handle, name: typeof account.name === "string" && account.name.trim() ? account.name : handle,
      avatar: known?.handle === handle && known.avatar ? known.avatar : avatar, hasCheck: Boolean(checked), score: checked?.score ?? null,
      href: creatorPriceReportHref(handle, archiveHosting),
    });
  }
  for (const row of local) if (!rows.has(row.handle)) rows.set(row.handle, { ...row, href: creatorPriceReportHref(row.handle, archiveHosting) });
  const text = query.normalize("NFKC").replace(/^@/, "").toLowerCase();
  const exact = exactCreator(query);
  function priority(row: CreatorSearchEntry) {
    if (row.handle === text) return 0;
    if (row.name.normalize("NFKC").toLowerCase() === text || row.handle === exact?.handle) return 1;
    return row.hasCheck ? 2 : 3;
  }
  return [...rows.values()].sort((a, b) => priority(a) - priority(b));
}

export function suggestCreators(box: HTMLElement, input: HTMLInputElement) {
  const panel = el("div", "", "shop-creator-suggestions");
  const status = el("span", "", "shop-creator-announcement");
  status.setAttribute("role", "status");
  panel.hidden = true;
  box.classList.add("shop-creator-picker");
  box.append(status, panel);
  input.autocomplete = "off";
  let pending: AbortController | undefined;
  let timer: number | undefined;
  let pointingAtPanel = false;
  function dismiss() {
    window.clearTimeout(timer);
    pending?.abort();
    pending = undefined;
    pointingAtPanel = false;
    panel.hidden = true;
    status.textContent = "";
  }
  function show() {
    dismiss();
    const query = input.value.normalize("NFKC").trim();
    if (!isCreatorQuery(query)) return;
    const controller = new AbortController();
    pending = controller;
    const { signal } = controller;
    const local = searchCreators(query);
    const handle = username(query);
    const term = liveSearchTerm(query);
    panel.hidden = false;
    function render(accounts: SuggestedAccount[], waiting = false, unavailable = false) {
      const active = panel.contains(document.activeElement) ? document.activeElement as HTMLAnchorElement : null;
      const matches = mergeSuggestions(query, local, accounts);
      const visible = matches.slice(0, accounts.length ? 8 : 5);
      const body = document.createDocumentFragment();
      if (visible.length) body.append(creatorList(visible, true));
      else if (waiting || !handle) {
        const message = waiting ? "Searching TikTok…" : unavailable ? "TikTok suggestions are unavailable." : "No matching creators found.";
        body.append(el("p", message));
      }
      if (visible.length < matches.length) {
        body.append(link("See all " + matches.length + " matches →", creatorResultsHref(query), "shop-creator-see-all"));
      }
      if (handle && !visible.some(row => row.handle === handle)) {
        body.append(reportLink("Check @" + handle + " directly →", creatorPriceReportHref(handle, archiveHosting), "shop-creator-see-all"));
      }
      panel.replaceChildren(body);
      status.textContent = visible.length ? visible.length + (visible.length === 1 ? " matching creator." : " matching creators.") : panel.textContent;
      if (active) {
        const next = Array.from(panel.querySelectorAll("a")).find(a => a.href === active.href || (active.dataset.handle && a.dataset.handle === active.dataset.handle));
        (next ?? input).focus({ preventScroll: true });
      }
    }
    render([], Boolean(term));
    document.addEventListener("pointerdown", e => {
      pointingAtPanel = panel.contains(e.target as Node);
      if (!box.contains(e.target as Node)) dismiss();
    }, { capture: true, signal });
    const release = () => { pointingAtPanel = false; };
    document.addEventListener("pointerup", release, { signal });
    document.addEventListener("pointercancel", release, { signal });
    window.addEventListener("hashchange", dismiss, { once: true, signal });
    window.addEventListener("blur", dismiss, { once: true, signal });
    if (!term) return;
    timer = window.setTimeout(async () => {
      let accounts: SuggestedAccount[] = [];
      let unavailable = false;
      try {
        accounts = await searchTikTok(term);
      } catch { unavailable = true; }
      if (!signal.aborted && box.isConnected && input.value.normalize("NFKC").trim() === query) render(accounts, false, unavailable);
    }, 250);
  }
  input.addEventListener("input", e => { if ((e as InputEvent).isComposing) dismiss(); else show(); });
  input.addEventListener("focus", () => { if (panel.hidden) show(); });
  box.addEventListener("focusout", e => {
    if (e.relatedTarget instanceof Node && !box.contains(e.relatedTarget)) dismiss();
    else if (!e.relatedTarget && !pointingAtPanel) queueMicrotask(() => {
      if (!box.contains(document.activeElement)) dismiss();
    });
  });
  box.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (panel.hidden && event.target === input && event.key === "ArrowDown") show();
    if (panel.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      input.focus();
      dismiss();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(panel.querySelectorAll("a"));
    if (!links.length) return;
    const focused = links.findIndex(a => a === document.activeElement);
    if (event.target !== input && focused < 0) return;
    event.preventDefault();
    if (event.key === "ArrowDown") links[(focused + 1) % links.length].focus();
    else if (focused === 0) input.focus();
    else links[focused < 0 ? links.length - 1 : focused - 1].focus();
  });
  return dismiss;
}

export function creatorResults(query: string, signal: AbortSignal) {
  const page = el("div", "", "shop-creator-results");
  const local = searchCreators(query);
  const term = liveSearchTerm(query);
  const handle = username(query);
  const status = el("p", "", "shop-search-status");
  status.setAttribute("role", "status");
  const results = el("div", "", "shop-search-results-list");
  const direct = handle && reportLink("Check @" + handle + " directly →", creatorPriceReportHref(handle, archiveHosting), "shop-search-direct");
  const retry = el("button", "Retry TikTok search", "btn ghost");
  retry.type = "button";
  retry.hidden = true;
  page.append(status, results);
  if (direct) page.append(direct);
  page.append(retry);

  function render(accounts: SuggestedAccount[], state: "loading" | "complete" | "unavailable") {
    const matches = mergeSuggestions(query, local, accounts);
    const active = document.activeElement;
    const focused = results.contains(active) && active instanceof HTMLAnchorElement ? active.dataset.handle : null;
    results.replaceChildren(...(matches.length ? [creatorList(matches)] : []));
    if (focused) results.querySelector<HTMLAnchorElement>('[data-handle="' + focused + '"]')?.focus({ preventScroll: true });
    if (direct) direct.hidden = state === "loading" || matches.some(row => row.handle === handle);
    retry.hidden = state !== "unavailable";
    if (state === "loading") status.textContent = (local.length ? local.length + (local.length === 1 ? " saved match" : " saved matches") : "Saved index checked") + " · Searching TikTok…";
    else if (state === "unavailable") status.textContent = matches.length ? "Showing saved matches. TikTok search is temporarily unavailable." : "TikTok search is temporarily unavailable.";
    else if (matches.length) status.textContent = matches.length + (matches.length === 1 ? " match · Select this account to check prices." : " matches · Select an account to check prices.");
    else status.textContent = term ? "No matching accounts found. Try a different name or an exact @username." : "No saved matches. Enter 2–48 characters to search TikTok.";
  }
  async function load() {
    render([], term ? "loading" : "complete");
    if (!term) return;
    try {
      const accounts = await searchTikTok(term);
      if (!signal.aborted) render(accounts, "complete");
    } catch {
      if (!signal.aborted) render([], "unavailable");
    }
  }
  retry.addEventListener("click", load, { signal });
  void load();
  return page;
}
