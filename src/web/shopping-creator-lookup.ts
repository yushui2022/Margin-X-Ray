import { el, link } from "./shop-dom";
import { exactCreator, searchCreators, type CreatorSearchEntry } from "./shopping-creator-search";

export const creatorLookupOrigin = "https://onion-head-creator-lookup.purebeak64.chatgpt.site";
export const creatorResultsHref = (q: string) => "#shop/creators?" + new URLSearchParams({ q });
export const liveCreatorHref = (handle: string) => "#shop/tiktok?" + new URLSearchParams({ user: handle });

export function username(raw: string) {
  const handle = raw.normalize("NFKC").trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_][a-z0-9_.]{0,23}$/.test(handle) && !handle.endsWith(".") ? handle : null;
}

export function isCreatorQuery(raw: string) {
  const query = raw.normalize("NFKC").trim();
  return /[\p{L}\p{N}_]/u.test(query) && !/[:/\\?#]|^www\.|^(?:(?:m|vm|vt|shop)\.)?tiktok\.com(?:\s|$)/i.test(query);
}

function creatorList(matches: CreatorSearchEntry[], dropdown = false) {
  const list = el("ul", "", "shop-creator-matches");
  for (const creator of matches) {
    const item = el("li");
    const row = link("", creator.href, "shop-creator-match");
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
    const label = creator.score !== null ? creator.score + "/100" : creator.hasCheck ? "Unrated" : "Profile";
    row.append(identity);
    if (!dropdown || creator.hasCheck) row.append(el("span", label, "shop-creator-result-score"));
    item.append(row);
    list.append(item);
  }
  return list;
}

interface SuggestedAccount { handle: string; name: string; avatar: string | null }

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
      avatar: checked?.avatar || avatar, hasCheck: Boolean(checked), score: checked?.score ?? null,
      href: checked?.href ?? liveCreatorHref(handle),
    });
  }
  for (const row of local) if (!rows.has(row.handle)) rows.set(row.handle, row);
  const text = query.normalize("NFKC").replace(/^@/, "").toLowerCase();
  const exact = exactCreator(query);
  function priority(row: CreatorSearchEntry) {
    if (row.handle === text) return 0;
    if (row.name.normalize("NFKC").toLowerCase() === text || row.handle === exact?.handle) return 1;
    return 2;
  }
  return [...rows.values()].sort((a, b) => priority(a) - priority(b)).slice(0, accounts.length ? 8 : 5);
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
    const term = query.replace(/^@/, "").trim();
    const length = Array.from(term).length;
    const canSuggest = length >= 2 && length <= 48 && !/[\r\n\t]/.test(term);
    panel.hidden = false;
    function render(accounts: SuggestedAccount[], waiting = false, unavailable = false) {
      const active = panel.contains(document.activeElement) ? document.activeElement as HTMLAnchorElement : null;
      const visible = mergeSuggestions(query, local, accounts);
      const body = document.createDocumentFragment();
      if (visible.length) body.append(creatorList(visible, true));
      else if (waiting || !handle) {
        const message = waiting ? "Searching TikTok…" : unavailable ? "TikTok suggestions are unavailable." : "No matching creators found.";
        body.append(el("p", message));
      }
      if (local.some(row => !visible.some(option => option.handle === row.handle))) {
        body.append(link("See all " + local.length + " archive results →", creatorResultsHref(query), "shop-creator-see-all"));
      }
      if (handle && !visible.some(row => row.handle === handle && (row.hasCheck || row.href === liveCreatorHref(handle)))) {
        body.append(link("Search TikTok for @" + handle, liveCreatorHref(handle), "shop-creator-see-all"));
      }
      panel.replaceChildren(body);
      status.textContent = visible.length ? visible.length + (visible.length === 1 ? " matching creator." : " matching creators.") : panel.textContent;
      if (active) {
        const next = Array.from(panel.querySelectorAll("a")).find(a => a.href === active.href || (active.dataset.handle && a.dataset.handle === active.dataset.handle));
        (next ?? input).focus({ preventScroll: true });
      }
    }
    render([], canSuggest);
    document.addEventListener("pointerdown", e => {
      pointingAtPanel = panel.contains(e.target as Node);
      if (!box.contains(e.target as Node)) dismiss();
    }, { capture: true, signal });
    const release = () => { pointingAtPanel = false; };
    document.addEventListener("pointerup", release, { signal });
    document.addEventListener("pointercancel", release, { signal });
    window.addEventListener("hashchange", dismiss, { once: true, signal });
    window.addEventListener("blur", dismiss, { once: true, signal });
    if (!canSuggest) return;
    timer = window.setTimeout(async () => {
      let accounts: SuggestedAccount[] = [];
      let unavailable = true;
      try {
        const response = await fetch(creatorLookupOrigin + "/api/creator-suggestions?" + new URLSearchParams({ q: term }), { signal, credentials: "omit" });
        if (response.ok) {
          const json = await response.json();
          if (Array.isArray(json?.creators)) {
            accounts = json.creators.slice(0, 6);
            unavailable = false;
          }
        }
      } catch { /* Saved matches remain available if the live service cannot respond. */ }
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
}

export function creatorResultsPage(query: string, form: HTMLElement) {
  const page = el("div", "", "shop-page shop-narrow shop-creator-results");
  page.append(link("← Shopping check", "#shop", "shop-back"), el("h1", "Search creators"), form);
  if (!query.trim()) return page;
  const matches = searchCreators(query);
  if (matches.length) {
    page.append(el("h2", matches.length + (matches.length === 1 ? " creator" : " creators") + " matching “" + query + "”"), creatorList(matches));
  } else {
    page.append(el("h2", "No creators found"), el("p", "Try another username or display name. This search covers the saved creator archive."));
  }
  return page;
}
