import { PUBLIC_CREATORS, directoryPage, type CreatorProfile } from "../shared/creator-directory";
import { productCount, renderCreatorProducts } from "./creator-products";

type PublicCreator = CreatorProfile;

interface CreatorExample {
  id: string;
  name: string;
  category: string;
  initials: string;
  posts: number;
  checks: [number, number, number];
  products: string[];
}

// Fictional fixtures only. IDs are local report IDs, never resolved TikTok identities.
const EXAMPLES: CreatorExample[] = [
  { id: "demo-01", name: "Everyday Edit", category: "Home", initials: "EE", posts: 20, checks: [19, 19, 18], products: ["Storage organizer", "Desk lamp", "Kitchen brush"] },
  { id: "demo-02", name: "The Practical Shelf", category: "Tech", initials: "PS", posts: 20, checks: [18, 18, 17], products: ["Phone stand", "USB hub", "Travel charger"] },
  { id: "demo-03", name: "Little Kitchen Notes", category: "Home", initials: "KN", posts: 20, checks: [17, 17, 16], products: ["Vegetable chopper", "Milk frother", "Mini waffle maker"] },
  { id: "demo-04", name: "The Beauty Notebook", category: "Beauty", initials: "BN", posts: 20, checks: [16, 16, 15], products: ["Scalp brush", "Makeup organizer", "Travel mirror"] },
  { id: "demo-05", name: "Off Duty Finds", category: "Style", initials: "OF", posts: 20, checks: [15, 14, 14], products: ["Canvas tote", "Travel pouch", "Satin pillowcase"] },
  { id: "demo-06", name: "Pocket Discoveries", category: "Tech", initials: "PD", posts: 20, checks: [13, 12, 11], products: ["Portable fan", "Cable organizer", "Desk light"] },
];
const DIMENSIONS = [
  { name: "Price transparency", weight: 40, rule: "Price, variant, shipping charges and discount conditions are visible." },
  { name: "Promotion disclosure", weight: 35, rule: "The commercial relationship is explicitly disclosed in the example promotion." },
  { name: "Returns information", weight: 25, rule: "The linked seller provides a clear return window, conditions and contact route." },
];
let root: HTMLElement;
let category = "All";
let sort = "score";
let mode: "public" | "examples" = "public";
let directorySort: "followers" | "name" = "followers";
let directoryQuery = "";
let directoryPageNumber = 1;
let productsOnly = false;
const PRODUCT_HANDLES = new Set(PUBLIC_CREATORS.filter((item) => productCount(item.handle) > 0).map((item) => item.handle));

export function initCreators(container: HTMLElement): void {
  root = container;
}

export function renderCreatorRoute(): void {
  if (!root) return;
  root.className = location.hash.startsWith("#creator/") ? "creator-report" : "creator-home";
  window.scrollTo({ top: 0, behavior: "instant" });
  if (location.hash.startsWith("#creator/")) {
    let id: string;
    try { id = decodeURIComponent(location.hash.slice(9)); }
    catch { renderUnavailable(""); return; }
    const profile = PUBLIC_CREATORS.find((item) => item.handle === parseHandle(id));
    const example = EXAMPLES.find((item) => item.id === id);
    if (profile) renderPublicProfile(profile);
    else if (example) renderProfile(example);
    else renderUnavailable(id);
    return;
  }
  renderBoard();
}

function score(item: CreatorExample): number {
  return Math.round(DIMENSIONS.reduce((sum, dim, i) => sum + dim.weight * item.checks[i]! / item.posts, 0));
}

function grade(value: number): { letter: string; label: string } {
  if (value >= 90) return { letter: "S", label: "Very clear" };
  if (value >= 80) return { letter: "A", label: "Mostly clear" };
  if (value >= 70) return { letter: "B", label: "Some gaps" };
  if (value >= 60) return { letter: "C", label: "Many gaps" };
  return { letter: "D", label: "Limited clarity" };
}

function gradeBadge(value: number | null): HTMLElement {
  const tier = value === null ? { letter: "—", label: "Not rated" } : grade(value);
  const badge = node("span", `creator-grade grade-${tier.letter.toLowerCase()}`, tier.letter);
  badge.setAttribute("aria-label", value === null ? tier.label : `Example tier ${tier.letter}: ${tier.label}`);
  return badge;
}

function scoreDisplay(value: number | null): HTMLElement {
  const display = node("div", `creator-score-display${value === null ? " is-pending" : ""}`);
  display.append(node("span", "eyebrow", value === null ? "Onion Score" : "Example Onion Score"), node("strong", "creator-score-number", value === null ? "—" : String(value)), node("span", "creator-score-denominator", "/ 100"));
  display.setAttribute("aria-label", value === null ? "Onion Score: not rated" : `Example Onion Score: ${value} out of 100`);
  return display;
}

function reportToolbar(): HTMLElement {
  const bar = node("div", "creator-report-toolbar");
  const status = node("span", "creator-copy-status");
  status.setAttribute("role", "status");
  const copy = action("Copy report link ↗", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      status.textContent = "Link copied";
    } catch { status.textContent = "Copy the URL from your address bar."; }
  });
  bar.append(backLink(), status, copy);
  return bar;
}

function reportSections(sections: { label: string; content: HTMLElement }[]): HTMLElement {
  const wrapper = node("div", "creator-report-sections");
  const navigation = node("nav", "creator-report-tabs");
  navigation.setAttribute("aria-label", "Report sections");
  const panels = sections.map(({ content }, i) => {
    const panel = node("section", "creator-report-panel");
    panel.id = `creator-report-panel-${i}`;
    panel.hidden = i !== 0;
    panel.append(content);
    return panel;
  });
  const buttons = sections.map(({ label }, i) => {
    const button = action(label, () => {
      panels.forEach((panel, j) => { panel.hidden = i !== j; buttons[j]!.setAttribute("aria-pressed", String(i === j)); });
    }, "creator-report-tab");
    button.setAttribute("aria-pressed", String(i === 0));
    button.setAttribute("aria-controls", panels[i]!.id);
    return button;
  });
  navigation.append(...buttons);
  wrapper.append(navigation, ...panels);
  return wrapper;
}

function breakdown(example?: CreatorExample): HTMLElement {
  const section = node("section", "creator-breakdown");
  section.append(node("p", "eyebrow", "01 / The breakdown"), node("h2", "", "Every point needs a receipt."));
  for (const [i, dim] of DIMENSIONS.entries()) {
    const row = node("div", "creator-dimension-row");
    const label = node("div", "creator-dimension-label");
    label.append(node("strong", "", dim.name), node("span", "", `${dim.weight}% weight`));
    const track = node("div", `creator-dimension-track${example ? "" : " is-pending"}`);
    if (example) {
      const value = example.checks[i]! / example.posts * 100;
      const fill = node("span");
      fill.style.width = `${value}%`;
      track.append(fill);
      track.setAttribute("role", "meter");
      track.setAttribute("aria-label", `Example ${dim.name}`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(value));
    } else track.setAttribute("aria-hidden", "true");
    const value = node("strong", "creator-dimension-number", example ? `${Math.round(example.checks[i]! / example.posts * 100)}` : "—");
    row.append(label, track, value, node("p", "", example ? `${example.checks[i]} / ${example.posts} fictional posts meet this check. ${dim.rule}` : `Not reviewed. ${dim.rule}`));
    section.append(row);
  }
  section.append(node("p", "creator-report-footnote", example ? "Constructed sample · All posts are evaluable in each dimension. This demonstrates the scoring rules." : "Unreviewed means unknown. It is not a zero or a negative rating."));
  return section;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function action(text: string, onClick: () => void, className = "btn secondary"): HTMLButtonElement {
  const button = node("button", className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function sampleNotice(): HTMLElement {
  return node("p", "creator-notice", "Interface preview · All ranked creators, scores and evidence below are fictional examples. Live TikTok lookup is not connected.");
}

function portrait(item: PublicCreator): HTMLElement {
  const wrapper = node("span", "creator-avatar creator-photo");
  const image = node("img");
  image.src = item.image;
  image.alt = `${item.name} profile portrait`;
  image.width = 160;
  image.height = 160;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    wrapper.textContent = item.initials;
    wrapper.setAttribute("aria-label", `${item.name} — portrait unavailable`);
  }, { once: true });
  wrapper.append(image);
  return wrapper;
}

function externalLink(label: string, url: string): HTMLAnchorElement {
  const link = node("a", "btn secondary", label);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderPublicProfile(item: PublicCreator): void {
  const hasProducts = productCount(item.handle) > 0;
  const header = node("header", "creator-scorecard");
  const main = node("div", "creator-scorecard-main");
  const identity = node("div", "creator-public-identity");
  const text = node("div");
  text.append(node("p", "eyebrow", `${item.category} / Public profile`), node("h1", "", item.name), node("p", "", `@${item.handle}`));
  identity.append(portrait(item), text);
  const verdict = node("div", "creator-verdict-line");
  verdict.append(gradeBadge(null), node("div", "", "Not rated · Evidence review pending"));
  main.append(identity, verdict, node("p", "creator-verdict-copy", hasProducts ? "The receipts are coming together." : "On the radar. Ready for research."), node("p", "creator-scorecard-note", hasProducts ? "Products and relationships are collected. Comparable promotion sampling and a scoring review are still needed." : "This account is included in the launch directory. Product research and promotion sampling have not started; no score has been assigned."));
  const strip = node("div", "creator-scorecard-strip");
  strip.append(node("span", "", item.followersLabel ? `${item.followersLabel} followers · Directory snapshot` : "Follower count not collected"), node("span", "", `${productCount(item.handle)} product records`), node("span", "", `Collected ${item.retrievedAt}`));
  header.append(main, scoreDisplay(null), strip);
  const details = node("section", "card creator-evidence");
  details.append(node("h2", "", "Public profile & collected evidence"), node("p", "", hasProducts ? "This profile includes product listings and promotion evidence with sources and access limitations. Coverage is incomplete and has not undergone a scoring review, so no Onion Score or rank is assigned." : "Account name, handle and portrait were collected from a public creator directory. This is a discovery record, with no completed product research or scoring review."));
  const links = node("div", "creator-profile-links");
  links.append(externalLink("Open TikTok profile ↗", `https://www.tiktok.com/@${item.handle}`), externalLink("Profile & portrait source ↗", item.source));
  details.append(links, node("p", "", `Portrait retrieved ${item.retrievedAt}. ${item.note}`));
  if (item.followersLabel && item.followersSource) {
    details.append(node("p", "", `${item.followersLabel} followers · Observed ${item.followersObservedAt}. ${item.followersNote}`), externalLink("Follower count source ↗", item.followersSource));
  }
  if (item.sourceCategory) details.append(node("p", "", `Directory category: ${item.sourceCategory}. ${item.category === "Uncategorized" ? "A product niche has not been established." : ""}`));
  if (item.country) details.append(node("p", "", `Directory country label: ${item.country}. Not independently verified.`));
  const scorePanel = node("div");
  scorePanel.append(breakdown(), methodology());
  root.replaceChildren(reportToolbar(), header, reportSections([
    { label: "Score breakdown", content: scorePanel },
    { label: `Products & earnings (${productCount(item.handle)})`, content: renderCreatorProducts(item.handle) },
    { label: "Profile sources", content: details },
  ]));
}

function searchForm(): HTMLElement {
  const wrapper = node("div", "creator-search");
  const form = node("form", "scan-form");
  const label = node("label", "scan-field");
  const input = node("input");
  input.placeholder = "username or TikTok profile URL";
  input.setAttribute("aria-label", "TikTok username or profile URL");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.required = true;
  input.maxLength = 250;
  label.append(node("span", "creator-at", "@"), input);
  const submit = node("button", "btn primary scan-btn", "Get scorecard →");
  submit.type = "submit";
  form.append(label, submit);
  const status = node("p", "creator-input-status");
  status.setAttribute("role", "status");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const handle = parseHandle(input.value);
    if (!handle) {
      status.textContent = "Enter a TikTok username or profile URL, such as tiktok.com/@username. Video links belong in Product scan.";
      input.setAttribute("aria-invalid", "true");
      return;
    }
    location.hash = `#creator/${encodeURIComponent(`@${handle}`)}`;
  });
  input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); status.textContent = ""; });
  wrapper.append(form, status);
  return wrapper;
}

function parseHandle(raw: string): string | null {
  let value = raw.trim();
  if (/^(https?:\/\/|(?:www\.)?tiktok\.com\/)/i.test(value)) {
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(url.hostname) || url.username || url.password || url.port) return null;
      const match = url.pathname.match(/^\/@([^/]+)\/?$/);
      if (!match) return null;
      value = decodeURIComponent(match[1]!);
    } catch { return null; }
  } else value = value.replace(/^@/, "");
  return /^[a-zA-Z0-9_][a-zA-Z0-9_.]{0,23}$/.test(value) && !value.endsWith(".") ? value.toLowerCase() : null;
}

function methodology(): HTMLElement {
  const details = node("details", "creator-method");
  details.append(node("summary", "", "How the Onion Score works"));
  details.append(node("p", "", "Proposed scoring rules · v0.1. The score describes transparency in sampled shopping recommendations. It does not measure a person’s character or prove product quality."));
  for (const dim of DIMENSIONS) details.append(node("p", "", `${dim.name} · ${dim.weight}% — ${dim.rule}`));
  details.append(node("p", "", "Example score = 40 × price checks / posts + 35 × disclosure checks / posts + 25 × return checks / posts, rounded to a whole number. All 20 example posts are evaluable in each dimension. These are constructed examples, not collected evidence."));
  details.append(node("p", "", "Example tiers: S = 90–100 (Very clear), A = 80–89 (Mostly clear), B = 70–79 (Some gaps), C = 60–69 (Many gaps), D = below 60 (Limited clarity). Tiers describe the example transparency score; unreviewed accounts receive no tier."));
  details.append(node("p", "", "For live reports, unavailable evidence must remain unknown. Publish a score only after coverage, comparable sampling and review thresholds are defined. Show observation dates, sources and a correction history. Returns describe the linked seller’s policy, not the creator’s fulfillment performance. Wholesale price differences alone cannot establish misconduct."));
  return details;
}

function renderBoard(): void {
  const hero = node("header", "creator-rating-intro");
  hero.append(node("p", "eyebrow", "The internet has opinions. We look for receipts."));
  const heading = node("h1", "", "Rate my ");
  heading.append(node("em", "", "creator."));
  hero.append(heading, node("p", "", "One scorecard. The products, the prices, the story behind the pitch."));
  const layout = node("div", "creator-rating-layout");
  const entry = node("aside", "creator-rating-entry");
  const formCard = node("section", "creator-entry-card");
  const mascot = node("img", "creator-entry-mascot");
  mascot.src = "assets/mascot/onion-kid.webp";
  mascot.alt = "";
  formCard.append(mascot, node("p", "eyebrow", "Put a creator under the lens"), node("h2", "", "Who's on your feed?"), node("p", "creator-field-caption", "TIKTOK USERNAME"), searchForm());
  const quick = node("div", "creator-quick-picks");
  quick.append(node("span", "", "Try"));
  for (const handle of ["mikaylanogueira", "glamzilla"]) {
    const link = node("a", "", `@${handle}`);
    link.href = `#creator/${encodeURIComponent(`@${handle}`)}`;
    quick.append(link);
  }
  formCard.append(quick, node("p", "creator-entry-note", `${PUBLIC_CREATORS.length} collected profiles. Search any included handle to open its scorecard. Live lookup is not connected; unreviewed accounts remain unrated.`));
  const preview = node("a", "creator-score-preview");
  preview.href = "#creator/demo-01";
  const previewCopy = node("div");
  previewCopy.append(node("p", "eyebrow", "Fictional score preview"), node("strong", "", "What does a score look like?"), node("span", "", "Open a sample scorecard ↗"));
  preview.append(previewCopy, node("strong", "creator-preview-number", String(score(EXAMPLES[0]!))));
  entry.append(formCard, preview);

  const board = node("section", "creator-board");
  const header = node("div", "creator-board-head");
  const title = node("div");
  const boardTitle = node("h2", "", "The leaderboard");
  title.append(node("p", "eyebrow", "The Onion index"), boardTitle);
  const selectLabel = node("label", "creator-sort", "Sort by ");
  const select = node("select");
  select.addEventListener("change", () => {
    if (mode === "public") { directorySort = select.value === "name" ? "name" : "followers"; directoryPageNumber = 1; }
    else sort = select.value;
    renderRows();
  });
  selectLabel.append(select);
  header.append(title, selectLabel);
  const modes = node("div", "creator-filters creator-modes");
  for (const [value, label] of [["public", "Public profiles"], ["examples", "Scoring examples"]] as const) {
    const button = action(label, () => {
      mode = value;
      category = "All";
      directoryPageNumber = 1;
      for (const child of modes.querySelectorAll("button")) child.setAttribute("aria-pressed", String(child === button));
      renderRows();
    }, "creator-filter");
    button.setAttribute("aria-pressed", String(mode === value));
    modes.append(button);
  }
  const filters = node("div", "creator-filters");
  filters.setAttribute("aria-label", "Filter creators by category");
  const directoryTools = node("div", "creator-directory-tools");
  const directoryInput = node("input");
  directoryInput.type = "search";
  directoryInput.placeholder = `Search ${PUBLIC_CREATORS.length} names or @handles`;
  directoryInput.setAttribute("aria-label", "Search collected creators");
  directoryInput.value = directoryQuery;
  directoryInput.addEventListener("input", () => { directoryQuery = directoryInput.value; directoryPageNumber = 1; renderRows(); });
  const coverageLabel = node("label", "creator-coverage-filter");
  const coverageInput = node("input");
  coverageInput.type = "checkbox";
  coverageInput.checked = productsOnly;
  coverageInput.addEventListener("change", () => { productsOnly = coverageInput.checked; directoryPageNumber = 1; renderRows(); });
  coverageLabel.append(coverageInput, node("span", "", `With product evidence (${PRODUCT_HANDLES.size})`));
  directoryTools.append(directoryInput, coverageLabel);
  const list = node("ol", "creator-ranking");
  const count = node("p", "creator-list-note");
  count.setAttribute("aria-live", "polite");
  const pagination = node("nav", "creator-pagination");
  pagination.setAttribute("aria-label", "Creator directory pages");
  const empty = node("div", "creator-directory-empty");
  empty.append(node("p", "", "No creators match these filters."), action("Reset filters", () => {
    category = "All"; directoryQuery = ""; directoryInput.value = ""; productsOnly = false; coverageInput.checked = false; directoryPageNumber = 1; renderRows();
  }));
  function renderRows(): void {
    select.replaceChildren(...(mode === "public" ? [["followers", "Most followers"], ["name", "Creator name"]] : [["score", "Highest score"], ["lowest", "Lowest score"], ["name", "Creator name"]]).map(([value, text]) => {
      const option = node("option", "", text); option.value = value!; return option;
    }));
    select.value = mode === "public" ? directorySort : sort;
    const categories = ["All", ...new Set((mode === "public" ? PUBLIC_CREATORS : EXAMPLES).map((item) => item.category))];
    filters.replaceChildren(...categories.map((name) => {
      const button = action(name, () => { category = name; directoryPageNumber = 1; renderRows(); }, "creator-filter");
      button.setAttribute("aria-pressed", String(name === category));
      return button;
    }));
    directoryTools.hidden = mode !== "public";
    pagination.hidden = mode !== "public";
    empty.hidden = true;
    boardTitle.textContent = mode === "public" ? "The leaderboard" : "The leaderboard · examples";
    if (mode === "public") {
      const result = directoryPage({ query: directoryQuery, category, sort: directorySort, page: directoryPageNumber, productHandles: productsOnly ? PRODUCT_HANDLES : undefined });
      directoryPageNumber = result.page;
      list.replaceChildren(...result.items.map((item) => {
        const li = node("li");
        const link = node("a", "creator-rank-row creator-public-row");
        link.href = `#creator/${encodeURIComponent(`@${item.handle}`)}`;
        const identity = node("div", "creator-identity");
        identity.append(node("strong", "", item.name), node("span", "", `@${item.handle}`), node("span", "creator-follower-count", item.followersLabel ? `${item.followersLabel} followers · Snapshot` : `${item.category} · Followers not collected`));
        const value = node("div", "creator-list-score is-pending");
        value.append(node("strong", "", "—"), node("span", "", "Not rated"));
        const total = productCount(item.handle);
        const status = node("span", "creator-row-status", total ? `${total} ${total === 1 ? "product" : "products"} · Review pending` : "Profile collected · Products not researched");
        identity.append(status);
        link.append(gradeBadge(null), portrait(item), identity, value, node("span", "creator-arrow", "↗"));
        li.append(link);
        return li;
      }));
      count.textContent = result.total ? `${result.start + 1}–${result.start + result.items.length} of ${result.total} profiles · ${directorySort === "followers" ? "Directory follower order, not score rank" : "Alphabetical order"}` : "0 matching profiles";
      empty.hidden = result.total > 0;
      pagination.replaceChildren();
      pagination.hidden = result.pageCount <= 1;
      const go = (page: number) => {
        directoryPageNumber = page; renderRows();
        board.scrollIntoView({ block: "start", behavior: "instant" });
        pagination.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({ preventScroll: true });
      };
      const previous = action("← Previous", () => go(result.page - 1));
      previous.disabled = result.page === 1;
      pagination.append(previous);
      const pages = [...new Set([1, result.page - 1, result.page, result.page + 1, result.pageCount])].filter((page) => page >= 1 && page <= result.pageCount).sort((a, b) => a - b);
      for (const [index, page] of pages.entries()) {
        if (index && page - pages[index - 1]! > 1) pagination.append(node("span", "", "…"));
        const button = action(String(page), () => go(page));
        button.setAttribute("aria-label", `Page ${page}`);
        if (page === result.page) button.setAttribute("aria-current", "page");
        pagination.append(button);
      }
      const next = action("Next →", () => go(result.page + 1));
      next.disabled = result.page === result.pageCount;
      pagination.append(next);
      return;
    }
    const ranked = [...EXAMPLES].sort((a, b) => score(b) - score(a));
    const items = ranked.filter((item) => category === "All" || item.category === category);
    if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "lowest") items.sort((a, b) => score(a) - score(b));
    list.replaceChildren(...items.map((item) => {
      const li = node("li");
      const link = node("a", "creator-rank-row");
      link.href = `#creator/${item.id}`;
      const identity = node("div", "creator-identity");
      identity.append(node("strong", "", item.name), node("span", "", `${item.category} · Fictional creator`));
      identity.append(node("span", "creator-row-status", `${grade(score(item)).letter} tier · ${grade(score(item)).label}`));
      const value = node("div", "creator-list-score creator-score");
      value.append(node("strong", "", String(score(item))), node("span", "", "/ 100 · sample"));
      link.append(node("span", "creator-rank", String(ranked.indexOf(item) + 1).padStart(2, "0")), node("span", `creator-avatar tone-${item.category.toLowerCase()}`, item.initials), identity, value, node("span", "creator-arrow", "↗"));
      li.append(link);
      return li;
    }));
    count.textContent = `${items.length} fictional creators · Ranks reflect the full example list · No live accounts have been rated`;
  }
  renderRows();
  board.append(header, modes, directoryTools, filters, count, empty, list, pagination);
  const key = node("div", "creator-grade-key");
  key.append(node("span", "", "Example tiers"));
  for (const [letter, threshold] of [["S", "90+"], ["A", "80+"], ["B", "70+"], ["C", "60+"], ["D", "<60"]]) {
    const item = node("span", `creator-key-item grade-${letter!.toLowerCase()}`);
    item.append(node("strong", "", letter), node("small", "", threshold));
    key.append(item);
  }
  board.append(key);
  layout.append(entry, board);
  const coverage = node("div", "creator-launch-stats");
  for (const [value, label] of [[String(PUBLIC_CREATORS.length), "Collected profiles"], [String(PRODUCT_HANDLES.size), "With product evidence"], ["0", "Rated creators"]]) {
    const stat = node("div"); stat.append(node("strong", "", value), node("span", "", label)); coverage.append(stat);
  }
  root.replaceChildren(hero, coverage, layout, methodology());
}

function backLink(): HTMLElement {
  const back = node("a", "creator-back", "← Back to leaderboard");
  back.href = "#creators";
  return back;
}

function renderProfile(item: CreatorExample): void {
  const header = node("header", "creator-scorecard is-example");
  const main = node("div", "creator-scorecard-main");
  const identity = node("div", "creator-public-identity");
  const text = node("div");
  text.append(node("p", "eyebrow", `${item.category} / Fictional creator`), node("h1", "", item.name), node("p", "", "Scoring demonstration · No real account"));
  identity.append(node("span", `creator-avatar creator-example-avatar tone-${item.category.toLowerCase()}`, item.initials), text);
  const verdict = node("div", "creator-verdict-line");
  verdict.append(gradeBadge(score(item)), node("div", "", `${grade(score(item)).label} · Example tier ${grade(score(item)).letter}`));
  main.append(identity, verdict, node("p", "creator-verdict-copy", score(item) >= 80 ? "More clarity. Less guesswork." : "There are layers left to peel."), node("p", "creator-scorecard-note", "A constructed example of how price, promotion disclosure and returns information contribute to a score."));
  const rank = [...EXAMPLES].sort((a, b) => score(b) - score(a)).indexOf(item) + 1;
  const strip = node("div", "creator-scorecard-strip");
  strip.append(node("span", "", `#${String(rank).padStart(2, "0")} of ${EXAMPLES.length} examples`), node("span", "", `${item.posts} fictional posts`), node("span", "", "Method v0.1"));
  header.append(main, scoreDisplay(score(item)), strip);
  const evidence = node("section", "card creator-evidence");
  evidence.append(node("h2", "", "Behind the recommendations"), node("p", "", "Example product cards show the review workflow. They are not evidence for the illustrative score above."));
  for (const product of item.products) {
    const detail = node("details");
    detail.append(node("summary", "", product), node("p", "", "Source video: unavailable · Observation date: unavailable · Retail price: not collected"), node("p", "", "Comparable listings: not matched. Size, material, shipping, warranty and seller terms must be checked before interpreting a price difference."), node("p", "", "Promotion disclosure and return policy: not reviewed for this product card."));
    evidence.append(detail);
  }
  const scorePanel = node("div");
  scorePanel.append(breakdown(item), methodology());
  root.replaceChildren(reportToolbar(), sampleNotice(), header, reportSections([
    { label: "Score breakdown", content: scorePanel },
    { label: "Example products", content: evidence },
  ]));
}

function renderUnavailable(raw: string): void {
  const handle = parseHandle(raw);
  const card = node("section", "creator-unavailable card");
  card.append(node("p", "eyebrow", "Creator lookup"), node("h1", "", handle ? `@${handle}` : "Invalid creator address"), node("span", "creator-unrated", "Not rated"), node("p", "lede", handle ? "Your username is ready for lookup. Live TikTok retrieval is not connected, so we have not verified this account or retrieved its posts." : "Enter a valid TikTok username to prepare a lookup."));
  const steps = node("ol", "creator-pending");
  for (const text of ["Resolve the public TikTok profile", "Collect recent shopping recommendations", "Check products, disclosures and seller policies", "Review evidence coverage before scoring"]) steps.append(node("li", "", `${text} — not started`));
  card.append(steps, node("p", "", "No score has been generated and no background request has been queued."), searchForm(), action("Explore a fictional sample report", () => { location.hash = "#creator/demo-01"; }));
  root.replaceChildren(backLink(), card);
}
