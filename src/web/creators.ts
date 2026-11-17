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

export function initCreators(container: HTMLElement): void {
  root = container;
}

export function renderCreatorRoute(): void {
  if (!root) return;
  if (location.hash.startsWith("#creator/")) {
    let id: string;
    try { id = decodeURIComponent(location.hash.slice(9)); }
    catch { renderUnavailable(""); return; }
    const example = EXAMPLES.find((item) => item.id === id);
    if (example) renderProfile(example);
    else renderUnavailable(id);
    return;
  }
  renderBoard();
}

function score(item: CreatorExample): number {
  return Math.round(DIMENSIONS.reduce((sum, dim, i) => sum + dim.weight * item.checks[i]! / item.posts, 0));
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

function searchForm(): HTMLElement {
  const wrapper = node("div", "creator-search");
  const form = node("form", "scan-form");
  const label = node("label", "scan-field");
  const input = node("input");
  input.placeholder = "@username or a TikTok profile link";
  input.setAttribute("aria-label", "TikTok username or profile URL");
  input.autocomplete = "off";
  input.spellcheck = false;
  input.required = true;
  input.maxLength = 250;
  label.append(node("span", "creator-at", "@"), input);
  const submit = node("button", "btn primary scan-btn", "Check creator");
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
  details.append(node("p", "", "For live reports, unavailable evidence must remain unknown. Publish a score only after coverage, comparable sampling and review thresholds are defined. Show observation dates, sources and a correction history. Returns describe the linked seller’s policy, not the creator’s fulfillment performance. Wholesale price differences alone cannot establish misconduct."));
  return details;
}

function renderBoard(): void {
  const hero = node("header", "creator-hero");
  const copy = node("div");
  copy.append(node("p", "eyebrow", "The creator leaderboard"));
  const heading = node("h1", "", "Who’s worth ");
  heading.append(node("em", "", "your trust?"));
  copy.append(heading, node("p", "lede", "Check the creator behind the recommendation. Explore their shopping transparency score, then look at the evidence behind it."), searchForm());
  const mascot = node("img", "creator-mascot");
  mascot.src = "assets/mascot/onion-kid.webp";
  mascot.alt = "";
  hero.append(copy, mascot);

  const board = node("section", "creator-board");
  const header = node("div", "creator-board-head");
  const title = node("div");
  title.append(node("p", "eyebrow", "Shopping transparency"), node("h2", "", "The Onion ranking"));
  const selectLabel = node("label", "creator-sort", "Sort by ");
  const select = node("select");
  for (const [value, text] of [["score", "Highest score"], ["name", "Creator name"]]) {
    const option = node("option", "", text);
    option.value = value!;
    select.append(option);
  }
  select.value = sort;
  select.addEventListener("change", () => { sort = select.value; renderRows(); });
  selectLabel.append(select);
  header.append(title, selectLabel);
  const filters = node("div", "creator-filters");
  filters.setAttribute("aria-label", "Filter creators by category");
  for (const name of ["All", "Home", "Beauty", "Tech", "Style"]) {
    const button = action(name, () => {
      category = name;
      for (const child of filters.querySelectorAll("button")) child.setAttribute("aria-pressed", String(child.textContent === category));
      renderRows();
    }, "creator-filter");
    button.setAttribute("aria-pressed", String(name === category));
    filters.append(button);
  }
  const list = node("ol", "creator-ranking");
  const count = node("p", "creator-list-note");
  count.setAttribute("aria-live", "polite");
  function renderRows(): void {
    const ranked = [...EXAMPLES].sort((a, b) => score(b) - score(a));
    const items = ranked.filter((item) => category === "All" || item.category === category);
    if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(...items.map((item) => {
      const li = node("li");
      const link = node("a", "creator-rank-row");
      link.href = `#creator/${item.id}`;
      const identity = node("div", "creator-identity");
      identity.append(node("strong", "", item.name), node("span", "", `${item.category} · Fictional creator`));
      const coverage = node("div", "creator-coverage");
      coverage.append(node("strong", "", `${item.posts} sample posts`), node("span", "", "Illustrative evidence"));
      const value = node("div", "creator-score");
      value.append(node("strong", "", String(score(item))), node("span", "", "/ 100 · sample"));
      link.append(node("span", "creator-rank", String(ranked.indexOf(item) + 1).padStart(2, "0")), node("span", `creator-avatar tone-${item.category.toLowerCase()}`, item.initials), identity, coverage, value, node("span", "creator-arrow", "↗"));
      li.append(link);
      return li;
    }));
    count.textContent = `${items.length} fictional creators · Ranks reflect the full example list · No live accounts have been rated`;
  }
  renderRows();
  board.append(header, filters, count, list);
  root.replaceChildren(hero, sampleNotice(), board, methodology());
}

function backLink(): HTMLElement {
  const back = node("a", "creator-back", "← Back to leaderboard");
  back.href = "#creators";
  return back;
}

function renderProfile(item: CreatorExample): void {
  const header = node("header", "creator-profile-head");
  const identity = node("div");
  identity.append(node("p", "eyebrow", "Fictional creator report"), node("h1", "", item.name), node("p", "", `${item.category} · ${item.posts} constructed sample posts · No TikTok account linked`));
  const value = node("div", "creator-profile-score");
  value.append(node("strong", "", String(score(item))), node("span", "", "Onion Score / 100"), node("small", "", "Illustrative score"));
  header.append(identity, value);
  const grid = node("div", "creator-dimensions");
  DIMENSIONS.forEach((dim, i) => {
    const passed = item.checks[i]!;
    const card = node("section", "card");
    card.append(node("p", "eyebrow", `${dim.weight}% of score`), node("h2", "", dim.name), node("strong", "dimension-value", `${passed} / ${item.posts}`), node("p", "", "Sample posts meeting the check"));
    const meter = node("meter");
    meter.min = 0;
    meter.max = item.posts;
    meter.value = passed;
    meter.setAttribute("aria-label", dim.name);
    card.append(meter, node("p", "", dim.rule));
    grid.append(card);
  });
  const evidence = node("section", "card creator-evidence");
  evidence.append(node("h2", "", "Behind the recommendations"), node("p", "", "Example product cards show the review workflow. They are not evidence for the illustrative score above."));
  for (const product of item.products) {
    const detail = node("details");
    detail.append(node("summary", "", product), node("p", "", "Source video: unavailable · Observation date: unavailable · Retail price: not collected"), node("p", "", "Comparable listings: not matched. Size, material, shipping, warranty and seller terms must be checked before interpreting a price difference."), node("p", "", "Promotion disclosure and return policy: not reviewed for this product card."));
    evidence.append(detail);
  }
  root.replaceChildren(backLink(), sampleNotice(), header, grid, evidence, methodology());
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
