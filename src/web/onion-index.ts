import { ONION_BANDS, UNRATED_ONION, onionScore } from "../shared/onion-index";
import { ISSUE_RUBRIC, ISSUE_VERSION, issueFor, issueRank } from "../shared/creator-issues";
import { screeningSampleLinks } from "./product-issue-screening";

export function createOnionIndicator(handle: string, compact: boolean) {
  const element = document.createElement("div");
  element.className = `onion-index${compact ? " is-compact" : ""}`;
  element.innerHTML = '<img width="56" height="60" alt=""><div><span class="onion-index-label"></span><strong class="onion-index-value">—</strong><span class="onion-index-state"></span></div>';
  const image = element.querySelector("img")!;
  const label = element.querySelector<HTMLElement>(".onion-index-label")!;
  const value = element.querySelector<HTMLElement>(".onion-index-value")!;
  const state = element.querySelector<HTMLElement>(".onion-index-state")!;
  label.textContent = "Onion Score";
  const report = issueFor(handle);
  const index = onionScore(report?.points?.total);
  const band = index?.band ?? UNRATED_ONION;
  element.dataset.band = band.id;
  image.src = band.image;
  image.alt = `${band.label} onion`;
  value.textContent = index ? index.value.toFixed(1) : "—";
  state.textContent = index ? `${band.label} · #${issueRank(handle)}` : "Pending review";
  if (report?.points) state.append(document.createElement("br"), `${report.points.affected} of ${report.points.reviewed} products affected`);
  const detail = index && report?.points ? `${index.value.toFixed(1)}/100 · ${band.label}. Global rank #${issueRank(handle)}. ${report.points.affected} of ${report.points.reviewed} reviewed products affected. Higher means more frequent or severe documented product problems in the reviewed sample.` : report?.reason ?? "Source review needed";
  element.title = `Onion Score: ${detail} ${ISSUE_VERSION}. Votes and evidence coverage do not determine the score or rank.`;
  element.setAttribute("aria-label", element.title);
  return element;
}

export function renderOnionScale(): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "onion-scale";
  const summary = document.createElement("summary");
  summary.textContent = "Onion scale";
  summary.setAttribute("aria-label", "Onion Score scale and meaning");
  const explanation = document.createElement("p");
  explanation.textContent = "Onion Score runs from 0 to 100. Higher is worse: more frequent or severe documented product problems in a reviewed sample. Highest scores rank first. Problem frequency contributes up to 70 points and severity up to 30. Votes and evidence coverage do not add points.";
  const grid = document.createElement("div");
  grid.className = "onion-scale-grid";
  for (const band of ONION_BANDS) {
    const item = document.createElement("div");
    const image = document.createElement("img");
    image.src = band.image; image.alt = `${band.label} onion`; image.width = 48; image.height = 52;
    const label = document.createElement("strong"); label.textContent = band.label;
    const range = document.createElement("span"); range.textContent = band.range;
    item.append(image, label, range); grid.append(item);
  }
  const note = document.createElement("p");
  note.textContent = `Gray onion: no completed issue review, so no score or rank. A rating needs at least ${ISSUE_RUBRIC.minimumProducts} reviewed products in the ${ISSUE_RUBRIC.windowStart} to ${ISSUE_RUBRIC.windowEnd} window. Fresh describes a low documented-problem score in that sample; it is not a safety guarantee. Allegations and missing research do not count as confirmed problems.`;
  details.append(summary, explanation, grid, note);
  return details;
}

export function renderIssueReport(handle: string): HTMLElement {
  const report = issueFor(handle)!;
  const section = document.createElement("section");
  section.className = "creator-confidence-report";
  const heading = document.createElement("h2");
  heading.textContent = "Behind the Onion Score";
  const description = document.createElement("p");
  description.textContent = `${ISSUE_VERSION} · Review window: ${ISSUE_RUBRIC.windowStart} to ${ISSUE_RUBRIC.windowEnd}. ${ISSUE_RUBRIC.scope}`;
  const summary = document.createElement("p");
  summary.className = "creator-confidence-summary";
  summary.textContent = report.points ? `${report.points.affected} of ${report.points.reviewed} reviewed products have confirmed problems. Higher is worse. See the calculation and sources below.` : "Not ranked yet. Price listings, public captions and research gaps alone cannot establish recurring product problems. A completed issue review is needed.";
  section.append(heading, description, summary, renderOnionScale());
  const sample = screeningSampleLinks(handle);
  if (sample) section.append(sample);
  const calculation = document.createElement("details");
  calculation.className = "creator-method";
  const title = document.createElement("summary");
  title.textContent = "Score calculation & sources";
  calculation.append(title);
  for (const [key, label, rule] of [
    ["frequency", "Problem frequency", ISSUE_RUBRIC.frequencyRule],
    ["severity", "Problem severity", ISSUE_RUBRIC.severityRule],
  ] as const) {
    const paragraph = document.createElement("p");
    paragraph.textContent = `${label}: ${report.points ? report.points[key].toFixed(1) : "—"}/${ISSUE_RUBRIC.weights[key]}. ${rule}`;
    calculation.append(paragraph);
  }
  const rules = document.createElement("p");
  rules.textContent = `${ISSUE_RUBRIC.eligibility} ${ISSUE_RUBRIC.evidenceRule} ${ISSUE_RUBRIC.rounding} ${ISSUE_RUBRIC.ranking}`;
  calculation.append(rules);
  if (report.review) {
    const method = document.createElement("p");
    method.textContent = `Sample selection: ${report.review.selectionMethod} · Reviewed ${report.review.reviewedAt}`;
    calculation.append(method);
  }
  for (const product of report.review?.products ?? []) {
    const item = document.createElement("div");
    item.className = "creator-confidence-source";
    const name = document.createElement("strong"); name.textContent = product.name;
    const note = document.createElement("p"); note.textContent = `${product.variant} · ${product.outcome}. ${product.reviewNote}`;
    item.append(name, note);
    for (const issue of product.issues) {
      const finding = document.createElement("p");
      finding.textContent = `${issue.occurredAt} · ${issue.status} · ${issue.severity}: ${issue.assessment}`;
      item.append(finding);
    }
    for (const source of [product.creatorLink, ...product.reviewSources, ...product.issues.map(issue => issue.source)]) {
      const link = document.createElement("a"); link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = `${source.label} · ${source.observedAt} ↗`;
      item.append(link);
    }
    calculation.append(item);
  }
  section.append(calculation);
  return section;
}
