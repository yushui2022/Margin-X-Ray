import { el } from "./shop-dom";
import { archiveHosting } from "./hosting-mode";
import { creatorByHandle, creatorNameKey, creatorPriceReportHref, creatorResultsHref, exactCreator, isCreatorQuery, searchCreators, username, type CreatorSearchEntry } from "./shopping-creator-search";

export const creatorLookupOrigin = "https://onion-head-creator-lookup.purebeak64.chatgpt.site";
type SelectResult = (destination: string) => void;

export function searchResultButton(label: string, destination: string, className: string, select: SelectResult) {
  const button = el("button", label, className);
  button.type = "button";
  button.dataset.choice = destination;
  button.addEventListener("click", () => select(destination));
  return button;
}

function creatorList(matches: CreatorSearchEntry[], select: SelectResult, dropdown = false) {
  const list = el("ul", "", "shop-creator-matches");
  for (const creator of matches) {
    const item = el("li");
    const row = searchResultButton("", creator.href, "shop-creator-match", select);
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
    const label = creator.score !== null ? (creator.rank ? "#" + creator.rank + " · " : "") + creator.score + "/100"
      : creator.hasCheck ? "Unrated" : "Check prices";
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
const recentSearches = new Map<string, { accounts: SuggestedAccount[]; expires: number }>();
const suggestionUpdates = new EventTarget();
type SuggestionState = "loading" | "complete" | "unavailable";

function matchesTypedName(account: SuggestedAccount, key: string) {
  return key.length > 0 && (creatorNameKey(account.handle).includes(key) || creatorNameKey(account.name).includes(key));
}

function cachedAccounts(term: string) {
  const record = recentSearches.get(term);
  if (!record || record.expires <= Date.now()) return;
  recentSearches.delete(term);
  recentSearches.set(term, record);
  return record.accounts;
}

function provisionalAccounts(key: string) {
  const matches = new Map<string, SuggestedAccount>();
  for (const record of Array.from(recentSearches.values()).reverse()) {
    if (record.expires <= Date.now()) continue;
    for (const account of record.accounts) {
      if (!matches.has(account.handle) && matchesTypedName(account, key)) matches.set(account.handle, account);
    }
  }
  return Array.from(matches.values()).slice(0, 6);
}

function searchTikTok(term: string): Promise<SuggestedAccount[]> {
  const cached = cachedAccounts(term);
  if (cached) return Promise.resolve(cached);
  const pending = pendingSearches.get(term);
  if (pending) return pending;
  // Submitting while autocomplete is loading should reuse the same provider request.
  const request = fetch(creatorLookupOrigin + "/api/creator-suggestions?" + new URLSearchParams({ q: term }), {
    signal: AbortSignal.timeout(25_000), credentials: "omit",
  }).then(async response => {
    if (!response.ok) throw new Error("TikTok search unavailable");
    const data = await response.json();
    if (!Array.isArray(data?.creators)) throw new Error("Incomplete TikTok search results");
    const accounts: SuggestedAccount[] = data.creators.slice(0, 6).flatMap((account: SuggestedAccount | null) => {
      if (typeof account?.handle !== "string") return [];
      const handle = username(account.handle);
      return handle ? [{ handle, name: typeof account.name === "string" ? account.name : handle, avatar: account.avatar }] : [];
    });
    recentSearches.delete(term);
    recentSearches.set(term, {accounts, expires: Date.now() + 5 * 60_000});
    if (recentSearches.size > 32) recentSearches.delete(recentSearches.keys().next().value!);
    suggestionUpdates.dispatchEvent(new CustomEvent("accounts", {detail: {term, accounts}}));
    return accounts;
  }).finally(() => pendingSearches.delete(term));
  pendingSearches.set(term, request);
  return request;
}

// Partial matches can populate the picker while the provider checks the actual
// query. Only a response for the exact term can finish that search.
export function loadCreatorSuggestions(term: string | null, signal: AbortSignal, delayMs: number,
  show: (accounts: SuggestedAccount[], state: SuggestionState) => void) {
  if (signal.aborted) return;
  if (!term) { show([], "complete"); return; }
  const cached = cachedAccounts(term);
  if (cached) {
    show(cached, "complete");
    return;
  }
  const key = creatorNameKey(term);
  show(provisionalAccounts(key), "loading");
  function onUpdate(event: Event) {
    const update = (event as CustomEvent<{term: string; accounts: SuggestedAccount[]}>).detail;
    if (update.term !== term && update.accounts.some(account => matchesTypedName(account, key)))
      show(provisionalAccounts(key), "loading");
  }
  suggestionUpdates.addEventListener("accounts", onUpdate, {signal});
  async function load(exact: string) {
    try {
      const accounts = await searchTikTok(exact);
      if (!signal.aborted) show(accounts, "complete");
    } catch {
      if (!signal.aborted) show(provisionalAccounts(key), "unavailable");
    } finally { suggestionUpdates.removeEventListener("accounts", onUpdate); }
  }
  if (pendingSearches.has(term) || !delayMs) void load(term);
  else {
    const timer = setTimeout(() => void load(term), delayMs);
    signal.addEventListener("abort", () => clearTimeout(timer), {once:true});
  }
}

function suggestionEntry(account: SuggestedAccount): CreatorSearchEntry {
  const { handle } = account;
  const known = creatorByHandle(handle);
  const checked = known?.hasCheck ? known : undefined;
  const avatar = typeof account.avatar === "string" && account.avatar.startsWith("https://") ? account.avatar : undefined;
  return {
    handle, name: account.name.trim() ? account.name : handle, avatar: known?.avatar || avatar,
    hasCheck: Boolean(checked), score: checked?.score ?? null, rank: checked?.rank,
    href: creatorPriceReportHref(handle, archiveHosting),
  };
}

export function lookupCreatorIdentity(handle: string) {
  for (const record of Array.from(recentSearches.values()).reverse()) {
    if (record.expires <= Date.now()) continue;
    const exact = record.accounts.find(account => account.handle === handle);
    if (exact) return suggestionEntry(exact);
  }
  return creatorByHandle(handle);
}

function mergeSuggestions(query: string, local: CreatorSearchEntry[], accounts: SuggestedAccount[]) {
  const rows = new Map<string, CreatorSearchEntry>();
  for (const account of accounts) {
    if (!rows.has(account.handle)) rows.set(account.handle, suggestionEntry(account));
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

export function suggestCreators(box: HTMLElement, input: HTMLInputElement, select: SelectResult) {
  const panel = el("div", "", "shop-creator-suggestions");
  const status = el("span", "", "shop-creator-announcement");
  status.setAttribute("role", "status");
  panel.hidden = true;
  box.classList.add("shop-creator-picker");
  box.append(status, panel);
  input.autocomplete = "off";
  let pending: AbortController | undefined;
  function dismiss() {
    pending?.abort();
    pending = undefined;
    panel.hidden = true;
    status.textContent = "";
  }
  function choose(destination: string) {
    select(destination);
    dismiss();
  }
  function show(pasted = false) {
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
    function render(accounts: SuggestedAccount[], state: SuggestionState) {
      const active = panel.contains(document.activeElement) ? document.activeElement as HTMLButtonElement : null;
      const matches = mergeSuggestions(query, local, accounts);
      const visible = matches.slice(0, accounts.length ? 8 : 5);
      const body = document.createDocumentFragment();
      if (visible.length) body.append(creatorList(visible, choose, true));
      if (state === "unavailable") {
        body.append(el("p", "TikTok suggestions are temporarily unavailable."));
        const retry = el("button", "Retry search", "shop-creator-retry");
        retry.type = "button";
        retry.addEventListener("click", () => { input.focus(); show(true); });
        body.append(retry);
      } else if (!visible.length) {
        const message = state === "loading" ? "Searching TikTok…" : term ? "No matching creators found." : "Enter 2–48 characters to search TikTok.";
        body.append(el("p", message));
      }
      if (visible.length < matches.length) {
        body.append(searchResultButton("See all " + matches.length + " matches", creatorResultsHref(query), "shop-creator-see-all", choose));
      }
      if (handle && !visible.some(row => row.handle === handle)) {
        body.append(searchResultButton("Check @" + handle + " directly", creatorPriceReportHref(handle, archiveHosting), "shop-creator-see-all", choose));
      }
      panel.replaceChildren(body);
      status.textContent = visible.length ? visible.length + (visible.length === 1 ? " matching creator." : " matching creators.") : panel.textContent;
      if (active) {
        const next = Array.from(panel.querySelectorAll("button")).find(button => button.dataset.choice === active.dataset.choice);
        (next ?? input).focus({ preventScroll: true });
      }
    }
    const debounceMs = pasted ? 0 : (query.length < 3 || pendingSearches.size ? 250 : 150);
    loadCreatorSuggestions(term, signal, debounceMs, render);
    // Dismiss on an actual move outside the picker. Window switches and native
    // input-method panels can temporarily take focus without selecting anything.
    function outside(e: Event) {
      if (!box.contains(e.target as Node)) dismiss();
    }
    document.addEventListener("pointerdown", outside, { capture: true, signal });
    document.addEventListener("focusin", outside, { signal });
    window.addEventListener("hashchange", dismiss, { once: true, signal });
  }
  input.addEventListener("input", event => show((event as InputEvent).inputType === "insertFromPaste"));
  input.addEventListener("compositionend", () => show());
  function reopen() { if (panel.hidden) show(); }
  input.addEventListener("focus", reopen);
  input.addEventListener("click", reopen);
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
    const choices = Array.from(panel.querySelectorAll("button"));
    if (!choices.length) return;
    const focused = choices.indexOf(document.activeElement as HTMLButtonElement);
    if (event.target !== input && focused < 0) return;
    event.preventDefault();
    if (event.key === "ArrowDown") choices[(focused + 1) % choices.length].focus();
    else if (focused === 0) input.focus();
    else choices[focused < 0 ? choices.length - 1 : focused - 1].focus();
  });
  return dismiss;
}

export function creatorResults(query: string, signal: AbortSignal, select: SelectResult) {
  const page = el("div", "", "shop-creator-results");
  const local = searchCreators(query);
  const term = liveSearchTerm(query);
  const handle = username(query);
  const status = el("p", "", "shop-search-status");
  status.setAttribute("role", "status");
  const results = el("div", "", "shop-search-results-list");
  const direct = handle && searchResultButton("Check @" + handle + " directly", creatorPriceReportHref(handle, archiveHosting), "shop-search-direct", select);
  const retry = el("button", "Retry TikTok search", "btn ghost");
  retry.type = "button";
  retry.hidden = true;
  page.append(status, results);
  if (direct) page.append(direct);
  page.append(retry);

  function render(accounts: SuggestedAccount[], state: SuggestionState) {
    const matches = mergeSuggestions(query, local, accounts);
    const active = document.activeElement;
    const focused = results.contains(active) && active instanceof HTMLButtonElement ? active.dataset.handle : null;
    results.replaceChildren(...(matches.length ? [creatorList(matches, select)] : []));
    if (focused) results.querySelector<HTMLButtonElement>('[data-handle="' + focused + '"]')?.focus({ preventScroll: true });
    if (direct) direct.hidden = state === "loading" || matches.some(row => row.handle === handle);
    retry.hidden = state !== "unavailable";
    if (state === "loading") status.textContent = (matches.length ? matches.length + (matches.length === 1 ? " match" : " matches") : "Saved index checked") + " · Searching TikTok…";
    else if (state === "unavailable") status.textContent = matches.length ? "Showing available matches. TikTok search is temporarily unavailable." : "TikTok search is temporarily unavailable.";
    else if (matches.length) status.textContent = matches.length + (matches.length === 1 ? " matching creator" : " matching creators");
    else status.textContent = term ? "No matching accounts found. Try a different name or an exact @username." : "No saved matches. Enter 2–48 characters to search TikTok.";
  }
  function load() { loadCreatorSuggestions(term, signal, 0, render); }
  retry.addEventListener("click", load, { signal });
  void load();
  return page;
}
