import { onionScore, UNRATED_ONION } from "../shared/onion-index";
import { CREATOR_SHOP_PRODUCTS, productCount } from "./creator-products";
import { creatorShopProducts, premiumSummary } from "./creator-shopping";
import { linkHref, productHref, publicUrl } from "../shared/shopping-links";
import { archiveHosting } from "./hosting-mode";

interface Source { label: string; url: string; observedAt?: string }
interface ResearchReport {
  handle: string;
  profile: { handle: string; name: string; bio: string; followers: number | null; url: string };
  provider: string;
  observedAt: string;
  explanation: string;
  warnings: string[];
  posts: { id: string; caption: string; url: string; publishedAt: string | null }[];
  score: {
    status: "pending" | "rated"; value: number | null; reason: string; version: string;
    windowStart: string; windowEnd: string; minimumProducts: number;
    weights: { frequency: number; severity: number }; frequency: number | null; severity: number | null;
    affected: number | null; reviewed: number | null; sources: Source[];
  };
  coverage: { version: string; value: number; captionCount: number; productCount: number; archivedSources?: Source[] };
  leads: (Source & { kind: "caption" | "reviewed"; detail: string })[];
  screenings: { product: string; variant: string; checkedAt: string; detail: string; sources: Source[] }[];
  sourceChecks?: (Source & { status: "candidates" | "no-match" | "unavailable"; detail: string })[];
  productCandidates?: { label: string; postUrl: string; observedAt: string; listings: (Source & { id?: string })[] }[];
}
interface Job {
  status: "idle" | "running" | "ready" | "failed";
  stage?: string;
  stale?: boolean;
  report?: ResearchReport;
  retryAfter?: number;
  freshUntil?: string;
  error?: string;
}

const steps = [
  ["collecting", "Collect public posts", "Match the account and collect its public captions."],
  ["checking", "Trace product evidence", "Follow commercial leads and check available product records."],
  ["scoring", "Review the evidence", "Apply the published coverage and product-issue rubrics."],
  ["explaining", "Explain the findings", "Summarize the evidence and gaps, with original sources."],
] as const;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function sourceLink(label: string, url: string): HTMLElement {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return element("span", label);
    const link = element("a", label + " ↗");
    link.href = parsed.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  } catch { return element("span", label); }
}

function disclosure(name: string, entries: HTMLElement[]): HTMLDetailsElement {
  const details = element("details");
  details.append(element("summary", name), ...entries);
  return details;
}

function date(value: string): string {
  const day = new Date(value);
  if (!Number.isFinite(day.getTime())) return value;
  return day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function productMentions(report: ResearchReport) {
  const section = element("section", "", "creator-shop-mentions");
  const candidates = report.productCandidates ?? [];
  if (!candidates.length) {
    if (!productCount(report.handle)) {
      section.append(element("h2", "Products from the post sample"), element("p", "No specific catalog product was identified in these captions. Check the video or listing you have in mind."));
      const link = element("a", "Check a video or listing →", "btn secondary");
      link.href = "#shop"; section.append(link);
    }
    return section;
  }
  section.append(element("h2", "Product mentions to check"), element("p", "These captions name a product line. Choose a listing to inspect its variant and retailer price."));
  const posts = new Map(report.posts.map(post => [post.url, post]));
  const ordered = [...candidates].sort((a, b) => (posts.get(b.postUrl)?.publishedAt ?? "").localeCompare(posts.get(a.postUrl)?.publishedAt ?? ""));
  for (const candidate of ordered) {
    const entry = element("article", "", "creator-shop-mention");
    entry.append(element("h3", candidate.label));
    const published = posts.get(candidate.postUrl)?.publishedAt;
    const source = sourceLink(published ? "Source post · " + date(published) : "Source post · observed " + date(candidate.observedAt), candidate.postUrl);
    entry.append(source);
    const links = element("div", "", "creator-shop-options");
    for (const listing of candidate.listings) {
      if (!listing.id || !CREATOR_SHOP_PRODUCTS.some(record => record.id === listing.id)) {
        const page = publicUrl(listing.url);
        if (page) {
          const check = element("a", "Check " + listing.label + " →");
          check.href = linkHref(page.href);
          links.append(check);
        }
        links.append(sourceLink(listing.label, listing.url));
        continue;
      }
      const check = element("a", listing.label + " →");
      check.href = productHref(listing.id);
      links.append(check);
    }
    entry.append(links); section.append(entry);
  }
  return section;
}

function reading(report: ResearchReport): HTMLElement {
  const result = element("section", "", "agent-findings");
  const score = report.score;
  const assessed = score.status === "rated" ? onionScore(score.value) : null;
  const band = assessed?.band ?? UNRATED_ONION;
  const card = element("div", "", "agent-score");
  const onion = element("img");
  onion.alt = "";
  onion.src = band.image;
  onion.width = 60;
  onion.height = 64;
  const rating = element("div");
  rating.append(element("p", "Product-issue score · " + score.version, "eyebrow"), element("h2", assessed ? assessed.value.toFixed(1) + " / 100" : "Pending review"));
  if (assessed) rating.append(element("small", band.label + " · Higher means more product problems"));
  card.append(onion, rating);
  if (!report.explanation.includes(score.reason)) card.append(element("p", score.reason, "agent-score-reason"));

  const sources = element("section", "", "agent-sources");
  sources.append(element("h2", "Evidence & sources"));
  const coverage = report.coverage;
  const overview = element("div", "", "agent-summary");
  overview.append(element("span", "Evidence coverage"), element("strong", coverage.value.toFixed(1) + " / 100"),
    element("p", coverage.captionCount + " usable captions · " + coverage.productCount + " priced products · " + coverage.version));
  const scoreText = element("p", score.version + " · A completed sample needs at least " + score.minimumProducts + " distinct creator-linked products. Review window " + score.windowStart + " to " + score.windowEnd + ".");
  const formula = element("p", "Frequency = " + score.weights.frequency + " × affected products ÷ reviewed products. Severity = " + score.weights.severity + " × the sum of each product’s highest confirmed severity factor ÷ reviewed products. The two contributions add to the Onion Score.");
  const math = [scoreText, formula] as HTMLElement[];
  if (assessed) math.push(element("p", score.affected + " of " + score.reviewed + " reviewed products affected. Frequency " + score.frequency + " + severity " + score.severity + " = " + assessed.value + "."));
  for (const source of score.sources) math.push(sourceLink(source.label + (source.observedAt ? " · " + date(source.observedAt) : ""), source.url));
  sources.append(overview);
  card.append(disclosure("Issue score calculation & review window", math));
  if (coverage.archivedSources?.length) sources.append(disclosure("Previously collected sources (" + coverage.archivedSources.length + ")",
    coverage.archivedSources.map(source => sourceLink(source.label + (source.observedAt ? " · " + date(source.observedAt) : ""), source.url))));

  const profile = element("div", "", "agent-source-entry");
  profile.append(sourceLink(report.profile.name || "Public TikTok profile", report.profile.url));
  if (report.profile.bio) profile.append(element("p", report.profile.bio));
  if (report.profile.followers !== null) profile.append(element("small", report.profile.followers.toLocaleString("en-US") + " followers at collection"));
  const posts = report.posts.map(post => {
    const entry = element("div", "", "agent-source-entry");
    entry.append(sourceLink(post.publishedAt ? "TikTok post · " + date(post.publishedAt) : "Open TikTok post", post.url));
    if (post.caption) entry.append(element("p", post.caption));
    return entry;
  });
  sources.append(disclosure("Public profile & sampled posts (" + posts.length + ")", [profile, ...posts]));
  if (report.leads.length) {
    const items = report.leads.map(lead => {
      const entry = element("div", "", "agent-source-entry");
      entry.append(sourceLink(lead.label, lead.url), element("small", lead.kind === "caption" ? "Caption cue · Needs verification" : "Reviewed research lead"), element("p", lead.detail));
      return entry;
    });
    sources.append(disclosure("Commercial leads (" + items.length + ")", items));
  }
  const checks = (report.sourceChecks ?? []).map(check => {
    const entry = element("div", "", "agent-source-entry");
    const state = { candidates: "Candidate matches", "no-match": "No matching records", unavailable: "Source unavailable" }[check.status];
    entry.append(sourceLink(check.label, check.url), element("small", state + (check.observedAt ? " · " + date(check.observedAt) : "")), element("p", check.detail));
    return entry;
  });
  for (const screening of report.screenings) {
    const entry = element("div", "", "agent-source-entry");
    entry.append(element("strong", screening.product), element("small", screening.variant + " · " + date(screening.checkedAt)), element("p", screening.detail));
    for (const source of screening.sources) entry.append(sourceLink(source.label, source.url));
    checks.push(entry);
  }
  if (checks.length) sources.append(disclosure("Product evidence checks (" + checks.length + ")", checks));
  if (report.warnings.length) {
    const warnings = element("aside", "", "agent-limits");
    warnings.append(element("strong", "Collection limits"), ...report.warnings.map(warning => element("p", warning)));
    sources.append(warnings);
  }
  const quality = disclosure("Documented product issues & review", [card, element("p", report.explanation)]);
  quality.className = "creator-shop-files";
  result.append(sources, quality);
  return result;
}

export function creatorAgent(handle: string): HTMLElement {
  const main = element("section", "", "creator-agent");
  const intro = element("div", "", "agent-intro");
  const title = element("h1", "@");
  for (const part of handle.split(/(?<=[_.])/)) title.append(part, element("wbr"));
  title.tabIndex = -1;
  const lead = element("p", "", "agent-lede");
  const provenance = element("p", "", "agent-provenance");
  const notice = element("p", "", "agent-state");
  notice.setAttribute("role", "status");
  const tools = element("div", "", "agent-actions");
  const action = element("button", "Loading report…", "btn primary");
  action.type = "button";
  action.disabled = true;
  tools.append(action, sourceLink("Open TikTok profile", "https://www.tiktok.com/@" + handle));
  intro.append(element("p", "Creator price research", "eyebrow"), title, lead, provenance, tools, notice);
  const trail = element("aside", "", "agent-trail");
  const trailTitle = element("h2", "Research steps");
  const list = element("ol");
  const items = steps.map(([, label, detail]) => {
    const row = element("li");
    row.append(element("strong", label), element("span", detail));
    list.append(row);
    return row;
  });
  trail.append(trailTitle, list);
  const top = element("div", "", "agent-top");
  top.append(intro, premiumSummary(handle));
  const priced = productCount(handle);
  const mentions = element("div");
  const body = element("div");
  const progress = element("details", "", "creator-shop-files creator-shop-progress");
  progress.append(element("summary", "Research steps"), trail);
  main.append(top);
  if (priced) main.append(creatorShopProducts(handle));
  if (archiveHosting) {
    action.remove();
    lead.textContent = priced ? `${priced} archived product ${priced === 1 ? "listing" : "listings"}.` : "No recorded product listings in this archive.";
    notice.textContent = "Live post research is unavailable in this archive.";
    return main;
  }
  main.append(mentions, progress, body);

  const endpoint = "/api/creator-research/" + encodeURIComponent(handle);
  const lifetime = new AbortController();
  let timer = 0;
  window.addEventListener("hashchange", () => {
    lifetime.abort();
    window.clearTimeout(timer);
  }, { once: true });
  let busy = false;
  let wasRunning = false;
  let method: "GET" | "POST" = "GET";
  let last: ResearchReport | undefined;
  const defaultLead = priced ? `Browse ${priced} recorded ${priced === 1 ? "listing" : "listings"}, or search the latest public post sample for other product mentions.` : "Look for product mentions in this creator’s public posts, then choose a listing to check its price.";
  lead.textContent = defaultLead;
  function showJob(job: Job) {
    const running = job.status === "running";
    if (running !== wasRunning) progress.open = running;
    wasRunning = running;
    main.dataset.status = job.status;
    const phase = steps.findIndex(([stage]) => stage === job.stage);
    for (const [i, item] of items.entries()) {
      item.dataset.state = running && i === phase ? "active" : (running && phase > i) || job.status === "ready" ? "done" : "";
      if (item.dataset.state === "active") item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
    if (job.report && (job.report.handle !== handle || job.report.profile.handle !== handle)) throw new Error("Identity mismatch");
    if (job.report && (!last || last.observedAt !== job.report.observedAt || last.explanation !== job.report.explanation || job.status === "ready")) {
      const report = job.report;
      const findings = reading(report);
      const count = report.productCandidates?.length ?? 0;
      lead.textContent = `${report.posts.length} public ${report.posts.length === 1 ? "post" : "posts"} sampled · ${count} possible product ${count === 1 ? "mention" : "mentions"}.`;
      mentions.replaceChildren(productMentions(report));
      provenance.textContent = [report.profile.name, "Collected " + date(report.observedAt), report.provider].filter(Boolean).join(" · ");
      body.replaceChildren(findings);
      last = report;
    }
    notice.textContent = running ? (phase >= 0 ? steps[phase]![1] + "…" : "Research queued…")
      : job.status === "failed" ? (job.error || "Research could not finish.") + (last ? " Showing the saved report." : "")
      : job.status === "ready" ? (job.stale ? "Showing the last saved report. A fresh check is available." : "Saved report available.") : "";
    method = "POST";
    action.hidden = false;
    action.disabled = running;
    action.textContent = running ? "Searching public posts…" : job.status === "failed" ? "Retry research" : last ? "Refresh research" : "Find products in public posts";
    const remaining = Date.parse(job.freshUntil ?? "") - Date.now();
    if (job.status === "ready" && remaining > 0) {
      action.hidden = true;
      const when = new Date(job.freshUntil!).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      notice.textContent = "Next refresh available " + when + ".";
      timer = window.setTimeout(() => void request("GET"), Math.min(2147483647, remaining + 100));
    }
    if (running) timer = window.setTimeout(() => void request("GET"), Math.max(1, Math.min(job.retryAfter ?? 1, 10)) * 1000);
    if (job.status === "failed" && job.retryAfter) waitForRetry(job.retryAfter);
  }

  function waitForRetry(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    action.disabled = true;
    notice.textContent += " You can retry in " + Math.ceil(seconds) + " seconds.";
    timer = window.setTimeout(() => { action.disabled = false; notice.textContent = "You can retry now."; }, Math.min(2147483, seconds) * 1000);
  }

  async function request(verb: "GET" | "POST") {
    if (busy || lifetime.signal.aborted) return;
    busy = true;
    action.disabled = true;
    if (verb === "POST") notice.textContent = "Starting research…";
    try {
      const response = await fetch(endpoint, {
        method: verb, credentials: "same-origin", cache: "no-store",
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
      });
      const data = await response.json() as Job;
      if (lifetime.signal.aborted) return;
      if (!response.ok || !["idle", "ready", "running", "failed"].includes(data.status) || (data.status === "ready" && !data.report)) {
        if (response.status === 429 || response.status === 503) {
          method = verb;
          const delay = Number(response.headers.get("Retry-After") ?? data.retryAfter ?? 0);
          notice.textContent = data.error || (response.status === 429 ? "Research limit reached. Try again later." : "Research service is temporarily unavailable.");
          action.textContent = "Retry";
          action.hidden = false;
          action.disabled = false;
          waitForRetry(delay);
          return;
        }
        throw new Error("Unavailable response");
      }
      showJob(data);
    } catch {
      if (lifetime.signal.aborted) return;
      // A POST may have reached the server. Read back the job before starting another.
      method = "GET";
      notice.textContent = "Couldn’t reach the research service. Reconnect to check the saved report or job.";
      action.textContent = "Reconnect";
      action.hidden = false;
      action.disabled = false;
    } finally { busy = false; }
  }
  action.addEventListener("click", () => void request(method));
  void request("GET");
  return main;
}
