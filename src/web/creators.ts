import { PUBLIC_CREATORS, directoryPage, type CreatorProfile } from "../shared/creator-directory";
import { PRODUCT_ARCHIVE, PRODUCT_SOURCE_COUNT, productCount, renderCreatorProducts, renderProductFile } from "./creator-products";
import { priceArchive, priceReceipt } from "./price-archive";
import { SCREENING_TOTALS, screeningFor, screeningLabel, brandLeadsFor } from "../shared/creator-screening";
import { EVIDENCE_SCORES, EVIDENCE_SCORE_SCOPE, EVIDENCE_SCORE_VERSION, evidenceScoreFor, formatEvidenceScore } from "../shared/creator-evidence-score";
import { renderCreatorFeedback } from "./creator-feedback";
import { createOnionIndicator, renderOnionScale, renderIssueReport } from "./onion-index";
import { ISSUE_SCORES } from "../shared/creator-issues";

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
let directorySort: "followers" | "name" | "evidence" | "evidence-low" | "issues" | "issues-low" = ISSUE_SCORES.size ? "issues" : "name";
let directoryQuery = "";
let directoryPageNumber = 1;
let productsOnly = false;
let researchFilter = "all";
let productQuery = "";
let productCurrency = "all";
const PRODUCT_HANDLES = new Set(PUBLIC_CREATORS.filter((item) => productCount(item.handle) > 0).map((item) => item.handle));
const REPORT_PATHS = ["", "/products", "/sources"] as const;

function reportHref(handle: string, section = 0): string {
  return `#creator/${encodeURIComponent(`@${handle}`)}${REPORT_PATHS[section]}`;
}

export function initCreators(container: HTMLElement): void {
  root = container;
}

export function renderCreatorRoute(): void {
  if (!root) return;
  root.className = location.hash.startsWith("#creator/") ? "creator-report" : "creator-home";
  window.scrollTo({ top: 0, behavior: "instant" });
  if (location.hash.startsWith("#creator/")) {
    const [rawHandle, ...path] = location.hash.slice(9).split("/");
    const productId = path[0] === "products" && path.length === 2 ? path[1] : undefined;
    const section = productId ? 1 : REPORT_PATHS.findIndex(suffix => suffix === (path.length ? `/${path.join("/")}` : ""));
    let id: string;
    try { id = decodeURIComponent(rawHandle!); }
    catch { renderUnavailable(""); return; }
    const profile = PUBLIC_CREATORS.find((item) => item.handle === parseHandle(id));
    const example = EXAMPLES.find((item) => item.id === id);
    if (profile && productId) {
      const product = PRODUCT_ARCHIVE.find(p => p.handle === profile.handle && p.id === productId);
      if (product) {
        root.replaceChildren(renderProductFile(product, profile.name, reportHref(profile.handle, 1)));
        document.title = `${product.name} · Onion Head`;
        const heading = root.querySelector("h1")!;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      } else renderUnavailable(id);
    } else if (profile && section >= 0) renderPublicProfile(profile, section);
    else if (example && section === 0) renderProfile(example);
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

function scoreDisplay(value: number | null, evidence = false): HTMLElement {
  const display = node("div", `creator-score-display${value === null ? " is-pending" : ""}`);
  const title = evidence ? "Evidence Score · Beta" : value === null ? "Onion Score" : "Example transparency";
  display.append(node("span", "eyebrow", title), node("strong", "creator-score-number", value === null ? "—" : evidence ? formatEvidenceScore(value) : String(value)), node("span", "creator-score-denominator", "/ 100"));
  display.setAttribute("aria-label", value === null ? "Onion Score: not rated" : `${title}: ${value} out of 100`);
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

function reportSections(sections: { label: string; content: HTMLElement }[], initial = 0, onSelect?: (index: number) => void): HTMLElement {
  const wrapper = node("div", "creator-report-sections");
  const navigation = node("nav", "creator-report-tabs");
  navigation.setAttribute("aria-label", "Report sections");
  const panels = sections.map(({ content }, i) => {
    const panel = node("section", "creator-report-panel");
    panel.id = `creator-report-panel-${i}`;
    panel.hidden = i !== initial;
    panel.append(content);
    return panel;
  });
  const buttons = sections.map(({ label }, i) => {
    const button = action(label, () => {
      panels.forEach((panel, j) => { panel.hidden = i !== j; buttons[j]!.setAttribute("aria-pressed", String(i === j)); });
      onSelect?.(i);
    }, "creator-report-tab");
    button.setAttribute("aria-pressed", String(i === initial));
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

function renderPublicProfile(item: PublicCreator, section: number): void {
  const hasProducts = productCount(item.handle) > 0;
  const sample = screeningFor(item.handle);
  const leads = brandLeadsFor(item.handle);
  const evidence = evidenceScoreFor(item.handle)!;
  const header = node("header", "creator-scorecard creator-evidence-card");
  const main = node("div", "creator-scorecard-main");
  const identity = node("div", "creator-public-identity");
  const text = node("div");
  text.append(node("p", "eyebrow", `${item.category} / Public profile`), node("h1", "", item.name), node("p", "", `@${item.handle}`));
  identity.append(portrait(item), text);
  const verdict = node("div", "creator-verdict-line");
  verdict.append(node("span", "creator-coverage-dot"), node("div", "", `${evidence.level} · Preliminary`));
  main.append(identity, verdict, node("p", "creator-verdict-copy", hasProducts || leads.length ? "Follow the evidence, layer by layer." : sample?.status === "sampled" ? "A first look. More layers to uncover." : "A research gap. More sources needed."), node("p", "creator-scorecard-note", "Onion Score measures documented product problems in a reviewed sample. Higher is worse. Evidence coverage below describes research progress, not a product-problem rating."));
  const strip = node("div", "creator-scorecard-strip");
  strip.append(node("span", "", item.followersLabel ? `${item.followersLabel} followers · Directory snapshot` : "Follower count not collected"), node("span", "", `${productCount(item.handle)} priced records · ${leads.length} follow-up leads`), node("span", "", screeningLabel(item.handle)));
  const display = node("div", "creator-score-display creator-onion-display");
  display.append(createOnionIndicator(item.handle, false), node("span", "creator-score-check-count", "Out of 100 · Higher is worse"));
  header.append(main, display, strip);
  const details = node("section", "card creator-evidence");
  details.append(node("h2", "", "Public profile & collected evidence"), node("p", "", "The preliminary Evidence Score measures this report's collected sources. Creator transparency, product quality and personal earnings have not received a verified rating."));
  const links = node("div", "creator-profile-links");
  links.append(externalLink("Open TikTok profile ↗", `https://www.tiktok.com/@${item.handle}`), externalLink("Profile & portrait source ↗", item.source));
  details.append(links, node("p", "", `Portrait retrieved ${item.retrievedAt}. ${item.note}`));
  if (item.followersLabel && item.followersSource) {
    details.append(node("p", "", `${item.followersLabel} followers · Observed ${item.followersObservedAt}. ${item.followersNote}`), externalLink("Follower count source ↗", item.followersSource));
  }
  if (item.sourceCategory) details.append(node("p", "", `Directory category: ${item.sourceCategory}. ${item.category === "Uncategorized" ? "A product niche has not been established." : ""}`));
  if (item.country) details.append(node("p", "", `Directory country label: ${item.country}. Not independently verified.`));
  if (sample) details.append(node("p", "", `${screeningLabel(item.handle)} · Attempted ${sample.observedAt}. See Products for the sample and access limitations.`), externalLink("Public TikTok sample source", sample.sourceUrl));
  const scorePanel = node("div");
  scorePanel.append(renderIssueReport(item.handle), renderCreatorFeedback(item.handle), evidenceBreakdown(item.handle), evidenceMethodology());
  const sections = reportSections([
    { label: "Score & coverage", content: scorePanel },
    { label: `Products (${productCount(item.handle)})`, content: renderCreatorProducts(item.handle) },
    { label: "Profile sources", content: details },
  ], section, index => {
    history.replaceState(history.state, "", reportHref(item.handle, index));
  });
  root.replaceChildren(reportToolbar(), header, sections);
  if (section !== 0) {
    sections.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    sections.scrollIntoView({ block: "start", behavior: "instant" });
  }
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

function evidenceBreakdown(handle: string): HTMLElement {
  const evidence = evidenceScoreFor(handle)!;
  const section = node("section", "creator-breakdown creator-evidence-breakdown");
  section.append(node("p", "eyebrow", `Observed ${evidence.observedAt} · ${EVIDENCE_SCORE_VERSION}`), node("h2", "", "Ten checks. Every point explained."), node("p", "creator-breakdown-intro", "Open a check for its calculation, sources and next research step. Collected means this coverage criterion is met; it does not verify a creator’s conduct."));
  const overview = node("nav", "creator-score-overview");
  overview.setAttribute("aria-label", "Score groups");
  const grid = node("div", "creator-score-groups");
  for (const [index, group] of evidence.groups.entries()) {
    const jump = node("a", `creator-group-summary group-${group.id}`);
    jump.href = `#evidence-${group.id}`;
    jump.addEventListener("click", event => {
      event.preventDefault();
      const target = document.getElementById(`evidence-${group.id}`);
      target?.scrollIntoView({ block: "start", behavior: "instant" });
      target?.focus({ preventScroll: true });
    });
    jump.append(node("span", "", group.name), node("strong", "", formatEvidenceScore(group.points)), node("small", "", `/ ${group.maximum}`));
    overview.append(jump);
    const panel = node("section", `creator-score-group group-${group.id}`);
    panel.id = `evidence-${group.id}`;
    panel.tabIndex = -1;
    const heading = node("div", "creator-group-heading");
    heading.append(node("span", "eyebrow", `0${index + 1}`), node("h3", "", group.name), node("span", "", `${formatEvidenceScore(group.points)} / ${group.maximum}`));
    panel.append(heading);
    for (const dimension of evidence.dimensions.filter(dimension => dimension.group === group.id)) {
      const row = node("details", `creator-check${dimension.points === 0 ? " is-missing" : ""}`);
      const summary = node("summary", "creator-check-summary");
      const label = node("div", "creator-dimension-label");
      label.append(node("strong", "", dimension.name), node("span", "creator-check-state", dimension.state));
      const track = node("div", "creator-dimension-track");
      const fill = node("span");
      fill.style.width = `${100 * dimension.points / dimension.maximum}%`;
      track.append(fill);
      track.setAttribute("role", "meter");
      track.setAttribute("aria-label", dimension.name);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", String(dimension.maximum));
      track.setAttribute("aria-valuenow", String(dimension.points));
      summary.append(label, node("strong", "creator-dimension-number", `${formatEvidenceScore(dimension.points)}/${dimension.maximum}`), track, node("span", "creator-check-chevron", "+"));
      row.append(summary);
      const body = node("div", "creator-check-body");
      body.append(node("p", "creator-check-rule", dimension.rule), node("p", "", dimension.detail));
      if (dimension.points < dimension.maximum) {
        const next = node("p", "creator-check-next");
        next.append(node("strong", "", "Next step · "), document.createTextNode(dimension.next));
        body.append(next);
      }
      if (dimension.sources.length) {
        body.append(node("p", "eyebrow", `Sources · ${dimension.sources.length}`));
        const list = node("ul", "creator-score-sources");
        for (const source of dimension.sources) {
          const item = node("li");
          item.append(externalLink(source.label, source.url));
          list.append(item);
        }
        body.append(list);
      }
      row.append(body);
      panel.append(row);
    }
    grid.append(panel);
  }
  section.append(overview, grid);
  section.append(node("p", "creator-report-footnote", `Total: ${evidence.groups.map(group => formatEvidenceScore(group.points)).join(" + ")} = ${formatEvidenceScore(evidence.total)}/100. Checks are rounded to one decimal, then summed exactly. Financial evidence: 0/20 reserved.`));
  return section;
}

function evidenceMethodology(): HTMLElement {
  const details = node("details", "creator-method");
  details.append(node("summary", "", "How the Evidence Score works"), node("p", "", `${EVIDENCE_SCORE_VERSION} · ${EVIDENCE_SCORE_SCOPE}`), node("p", "", "Each volume check = maximum points × collected count ÷ target, capped at its maximum and rounded to one decimal. Targets: 20 distinct usable captions, 4 selected commercial URLs, 3 product-linked posts, and 3 records each for named products, variants, prices and market/condition notes. A matched usable sample earns 10. Group weights remain 20 + 25 + 35 + 20; the two financial checks currently earn 0."), node("p", "", "The total is the exact sum of the displayed checks. For example, one selected URL earns 3.8/15 and two earn 7.5/15. Tenths express the calculation, not statistical confidence. Equal evidence receives equal scores. Targets and weights are editorial choices; v3 changes are not directly comparable with earlier versions."), node("p", "", "A record can satisfy several documentation checks. Notes that disclose unknown shipping, stock or returns count as documented context, not verified purchase terms. A linked post may mention a product line without identifying the listed variant. Financial criteria require primary evidence and a new methodology before points can be awarded."), node("p", "", "The current rubric can reach 80/100. Coverage labels: no usable evidence (0), initial (above 0 and below 30), partial (30 to below 60), broader (60–100). Platform-selected samples and separately priced variants limit comparisons. Followers, keyword cues, calculator assumptions and community votes never add evidence points. Community feedback records agreement with this rubric version, using one changeable choice per browser; it is not a verified-person survey."));
  return details;
}

function methodology(): HTMLElement {
  const details = node("details", "creator-method");
  details.append(node("summary", "", "How the example transparency score works"));
  details.append(node("p", "", "Proposed scoring rules · v0.1. The score describes transparency in sampled shopping recommendations. It does not measure a person’s character or prove product quality."));
  for (const dim of DIMENSIONS) details.append(node("p", "", `${dim.name} · ${dim.weight}% — ${dim.rule}`));
  details.append(node("p", "", "Example score = 40 × price checks / posts + 35 × disclosure checks / posts + 25 × return checks / posts, rounded to a whole number. All 20 example posts are evaluable in each dimension. These are constructed examples, not collected evidence."));
  details.append(node("p", "", "Example tiers: S = 90–100 (Very clear), A = 80–89 (Mostly clear), B = 70–79 (Some gaps), C = 60–69 (Many gaps), D = below 60 (Limited clarity). Tiers describe the example transparency score; unreviewed accounts receive no tier."));
  details.append(node("p", "", "For live reports, unavailable evidence must remain unknown. Publish a score only after coverage, comparable sampling and review thresholds are defined. Show observation dates, sources and a correction history. Returns describe the linked seller’s policy, not the creator’s fulfillment performance. Wholesale price differences alone cannot establish misconduct."));
  return details;
}

function renderBoard(): void {
  const productView = location.hash === "#prices";
  const saved = history.state?.creatorDirectory;
  if (saved) {
    ({ category, sort, mode, directorySort, directoryQuery, directoryPageNumber, productsOnly, researchFilter } = saved);
    productQuery = saved.productQuery ?? "";
    productCurrency = saved.productCurrency ?? "all";
  }
  const hero = node("header", "research-hero");
  const heading = node("h1", "", productView ? "The price " : "The creator ");
  heading.append(node("em", "", productView ? "archive." : "index."));
  const intro = node("div", "research-intro");
  intro.append(heading, node("p", "", productView ? "Look up observed prices, compare variants and inspect the original listings." : "Look up a creator to see the products behind their posts and the sources behind each price."));
  hero.append(intro, priceReceipt());
  const layout = node("div", "research-layout");
  const indexNav = node("nav", "index-nav");
  indexNav.setAttribute("aria-label", "Research collections");
  for (const [name, size, hash] of [["Creator directory", PUBLIC_CREATORS.length, "#creators"], ["Price archive", PRODUCT_ARCHIVE.length, "#prices"]] as const) {
    const link = node("a", "", name);
    link.href = hash;
    link.append(node("span", "", String(size)));
    if ((hash === "#prices") === productView) link.setAttribute("aria-current", "page");
    indexNav.append(link);
  }
  const archive = priceArchive();
  archive.select.addEventListener("change", () => {
    productCurrency = archive.select.value;
    archive.update(productQuery, productCurrency);
  });

  const board = node("section", "creator-board");
  const header = node("div", "creator-board-head");
  const title = node("div");
  const boardTitle = node("h2", "", "Creator index");
  title.append(boardTitle);
  const selectLabel = node("label", "creator-sort");
  selectLabel.append(node("span", "creator-sort-caption", "Sort by"));
  const select = node("select");
  select.setAttribute("aria-label", "Sort by");
  select.addEventListener("change", () => {
    if (mode === "public") { directorySort = select.value as typeof directorySort; directoryPageNumber = 1; }
    else sort = select.value;
    renderRows();
  });
  selectLabel.append(select);
  header.append(title);
  function switchMode(value: typeof mode) {
    mode = value;
    category = "All";
    directoryPageNumber = 1;
    renderRows();
  }
  const modeSwitch = action("", () => switchMode(mode === "public" ? "examples" : "public"), "research-mode-switch");
  const filters = node("div", "creator-filters");
  filters.setAttribute("aria-label", "Filter creators by category");
  const directoryTools = node("div", "creator-directory-tools");
  const directoryInput = node("input");
  directoryInput.type = "search";
  directoryInput.placeholder = productView ? "Product, variant or @handle" : "Name, @handle or TikTok URL";
  directoryInput.spellcheck = false;
  directoryInput.autocomplete = "off";
  directoryInput.setAttribute("aria-label", productView ? "Search price records" : "Search collected creators");
  directoryInput.value = productView ? productQuery : directoryQuery;
  const search = node("form", "research-search");
  search.setAttribute("role", "search");
  const submit = node("button", "btn primary", "Search");
  submit.type = "submit";
  search.append(directoryInput, submit);
  intro.append(search);
  const statsLine = node("div", "index-totals");
  for (const [value, label] of [[PUBLIC_CREATORS.length, "profiles"], [PRODUCT_ARCHIVE.length, "prices"], [PRODUCT_SOURCE_COUNT, "product sources"]] as const) {
    const stat = node("span");
    stat.append(node("b", "", String(value)), ` ${label}`);
    statsLine.append(stat);
  }
  intro.append(statsLine);
  directoryInput.addEventListener("input", () => {
    if (productView) {
      productQuery = directoryInput.value;
      archive.update(productQuery, productCurrency);
      return;
    }
    directoryQuery = directoryInput.value;
    directoryPageNumber = 1;
    if (mode === "examples") switchMode("public");
    else renderRows();
  });
  search.addEventListener("submit", event => {
    event.preventDefault();
    if (productView) {
      archive.count.tabIndex = -1;
      archive.count.focus();
      archive.section.scrollIntoView({ block: "start" });
      return;
    }
    if (mode === "examples") switchMode("public");
    const handle = parseHandle(directoryQuery);
    const match = handle && list.querySelector<HTMLAnchorElement>(`a[href="${reportHref(handle, productsOnly ? 1 : 0)}"]`);
    if (match) { match.click(); return; }
    if (handle && /^(@|https?:\/\/|(?:www\.)?tiktok\.com\/)/i.test(directoryQuery.trim()) && !PUBLIC_CREATORS.some(item => item.handle === handle)) {
      location.hash = reportHref(handle);
      return;
    }
    count.focus({ preventScroll: true });
    board.scrollIntoView({ block: "start" });
  });
  const coverageLabel = node("label", "creator-priced-filter");
  const coverageInput = node("input");
  coverageInput.type = "checkbox";
  coverageInput.checked = productsOnly;
  coverageInput.addEventListener("change", () => { productsOnly = coverageInput.checked; directoryPageNumber = 1; renderRows(); });
  coverageLabel.append(coverageInput, node("span", "", "With priced products"), node("strong", "", String(PRODUCT_HANDLES.size)));
  const researchLabel = node("label", "creator-coverage-filter", "Research status ");
  const researchSelect = node("select");
  researchSelect.setAttribute("aria-label", "Research status");
  for (const [value, text] of [["all", "All research states"], ["sampled", "Public sample collected"], ["leads", "Sourced follow-up leads"], ["unavailable", "Public sample unavailable"]]) {
    const option = node("option", "", text); option.value = value!; researchSelect.append(option);
  }
  researchSelect.value = researchFilter;
  researchSelect.addEventListener("change", () => { researchFilter = researchSelect.value; directoryPageNumber = 1; renderRows(); });
  researchLabel.append(researchSelect);
  const refine = node("details", "creator-refine");
  refine.open = category !== "All" || researchFilter !== "all";
  const refineSummary = node("summary");
  const refineOptions = node("div", "creator-refine-options");
  refineOptions.append(researchLabel);
  refine.append(refineSummary, refineOptions);
  header.append(modeSwitch);
  directoryTools.append(coverageLabel, refine, selectLabel);
  const exampleFilters = node("div");
  const list = node("ol", "creator-ranking");
  const count = node("p", "creator-list-note");
  count.tabIndex = -1;
  count.setAttribute("aria-live", "polite");
  const votingGuide = node("div", "creator-voting-guide");
  votingGuide.append(node("span", "", "Higher score = more product problems"), renderOnionScale());
  const pagination = node("nav", "creator-pagination");
  pagination.setAttribute("aria-label", "Creator directory pages");
  const empty = node("div", "creator-directory-empty");
  const clear = action("Reset filters", () => {
    category = "All"; directoryQuery = ""; directoryInput.value = ""; productsOnly = false; coverageInput.checked = false; researchFilter = "all"; researchSelect.value = "all"; directoryPageNumber = 1; renderRows(); directoryInput.focus();
  }, "research-clear");
  const resultInfo = node("div", "research-result-info");
  resultInfo.append(count, clear);
  empty.append(node("strong", "", "No matching creators"), node("p", "", "Try another name or clear the current filters."));
  function renderRows(): void {
    const activeFilters = Number(category !== "All") + Number(researchFilter !== "all");
    refineSummary.textContent = `More filters${activeFilters ? ` (${activeFilters})` : ""}`;
    const scoreSorts = ISSUE_SCORES.size ? [["issues", "Highest score"], ["issues-low", "Lowest score"]] : [];
    select.replaceChildren(...(mode === "public" ? [...scoreSorts, ["name", "Name A–Z"], ["evidence", "Most evidence"], ["evidence-low", "Least evidence"], ["followers", "Most followers"]] : [["score", "Highest score"], ["lowest", "Lowest score"], ["name", "Name A–Z"]]).map(([value, text]) => {
      const option = node("option", "", text); option.value = value!; return option;
    }));
    select.value = mode === "public" ? directorySort : sort;
    const categories = ["All", ...new Set((mode === "public" ? PUBLIC_CREATORS : EXAMPLES).map((item) => item.category))];
    filters.replaceChildren(...categories.map((name) => {
      const button = action(name, () => {
        category = name; directoryPageNumber = 1; renderRows();
        filters.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
      }, "creator-filter");
      button.setAttribute("aria-pressed", String(name === category));
      return button;
    }));
    modeSwitch.textContent = mode === "public" ? "Fictional examples" : "Public profiles";
    coverageLabel.hidden = refine.hidden = mode !== "public";
    clear.hidden = mode !== "public" || !(activeFilters || productsOnly || directoryQuery);
    votingGuide.hidden = mode !== "public";
    (mode === "public" ? refineOptions : exampleFilters).prepend(filters);
    const exampleKey = board.querySelector<HTMLElement>(".creator-grade-key");
    if (exampleKey) exampleKey.hidden = mode === "public";
    pagination.hidden = mode !== "public";
    empty.hidden = true;
    boardTitle.textContent = mode === "public" ? ISSUE_SCORES.size ? "Onion rankings" : "Creator directory" : "Transparency scores";
    if (mode === "public") {
      const profiles = PUBLIC_CREATORS.filter((item) => researchFilter === "all"
        || (researchFilter === "sampled" && screeningFor(item.handle)?.status === "sampled")
        || (researchFilter === "unavailable" && screeningFor(item.handle)?.status === "unavailable")
        || (researchFilter === "leads" && brandLeadsFor(item.handle).length > 0));
      const query = parseHandle(directoryQuery) ?? directoryQuery;
      const result = directoryPage({ query, category, sort: directorySort, page: directoryPageNumber, productHandles: productsOnly ? PRODUCT_HANDLES : undefined, evidenceScores: EVIDENCE_SCORES, issueScores: ISSUE_SCORES }, profiles);
      directoryPageNumber = result.page;
      list.replaceChildren(...result.items.map((item) => {
        const li = node("li", "creator-public-item");
        const link = node("a", "creator-rank-row creator-public-row");
        link.href = reportHref(item.handle, productsOnly ? 1 : 0);
        const identity = node("div", "creator-identity");
        identity.append(node("strong", "", item.name), node("span", "", `@${item.handle}`), node("span", "creator-follower-count", item.followersLabel ? `${item.followersLabel} followers` : `${item.category} · Followers not collected`));
        const total = productCount(item.handle);
        const leads = brandLeadsFor(item.handle).length;
        const status = node("span", "creator-row-status", total ? `${productsOnly ? "View " : ""}${total} priced ${total === 1 ? "product" : "products"}${productsOnly ? " →" : ""}` : leads ? `${leads} sourced ${leads === 1 ? "lead" : "leads"} · Unverified` : screeningLabel(item.handle));
        status.dataset.kind = total ? "priced" : leads ? "lead" : "sample";
        link.append(portrait(item), identity, status);
        li.append(link, renderCreatorFeedback(item.handle, true));
        return li;
      }));
      const status = ISSUE_SCORES.size ? `${ISSUE_SCORES.size} ranked overall` : "Unranked · Issue reviews pending";
      count.textContent = result.total ? `${result.start + 1}–${result.start + result.items.length} of ${result.total} profiles · ${status}` : "0 matching profiles";
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
  if (productView) archive.update(productQuery, productCurrency);
  else renderRows();
  const toolbar = node("div", "index-toolbar");
  toolbar.append(header, directoryTools);
  const columns = node("div", "index-columns");
  columns.setAttribute("aria-hidden", "true");
  columns.append(...["Creator", "Collected evidence", "Onion Score", "Coverage vote"].map(label => node("span", "", label)));
  const statusBar = node("div", "index-status");
  statusBar.append(resultInfo, votingGuide);
  board.append(toolbar, exampleFilters, statusBar, columns, empty, list, pagination);
  const key = node("div", "creator-grade-key");
  key.hidden = mode === "public";
  key.append(node("span", "", "Example tiers"));
  for (const [letter, threshold] of [["S", "90+"], ["A", "80+"], ["B", "70+"], ["C", "60+"], ["D", "<60"]]) {
    const item = node("span", `creator-key-item grade-${letter!.toLowerCase()}`);
    item.append(node("strong", "", letter), node("small", "", threshold));
    key.append(item);
  }
  board.append(key);
  layout.append(indexNav, productView ? archive.section : board);
  const collection = node("details", "creator-collection-note");
  collection.append(node("summary", "", "About the research sample"), node("p", "", `${SCREENING_TOTALS.attempted} accounts attempted · ${SCREENING_TOTALS.posts.toLocaleString("en-US")} public captions · ${SCREENING_TOTALS.unavailable} sample unavailable · ${SCREENING_TOTALS.brandLeads} creators with follow-up leads. Initial sampling is not a complete product investigation.`));
  const footer = node("footer", "index-notes");
  footer.append(collection, evidenceMethodology());
  const home = node("div", "index-home");
  home.append(hero, layout, footer);
  root.replaceChildren(home);
  // Save the originating result on its history entry so Back works even after
  // the report is reloaded. New visits to the directory have their own entry.
  home.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#creator/"]') : null;
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    history.replaceState({ ...history.state, creatorDirectory: {
      category, sort, mode, directorySort, directoryQuery, directoryPageNumber, productsOnly, researchFilter, productQuery, productCurrency,
      href: link.hash, linkClass: link.className, refineOpen: refine.open,
    } }, "");
  });
  if (saved) {
    refine.open = saved.refineOpen;
    const origin = Array.from(home.querySelectorAll<HTMLAnchorElement>("a")).find(link => link.hash === saved.href && link.className === saved.linkClass);
    origin?.focus();
    history.replaceState({ ...history.state, creatorDirectory: null }, "");
  }
}

function backLink(): HTMLElement {
  const back = node("a", "creator-back", "← Back to directory");
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
  if (handle) {
    const lookup = node("a", "btn secondary", "Check a product from this creator →");
    lookup.href = "#markup";
    card.append(lookup);
  }
  card.append(steps, node("p", "", "No score has been generated and no background request has been queued."), searchForm(), action("Explore a fictional sample report", () => { location.hash = "#creator/demo-01"; }));
  root.replaceChildren(backLink(), card);
}
