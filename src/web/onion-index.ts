import { ONION_BANDS, UNRATED_ONION, onionScore } from "../shared/onion-index";
import { CONFIDENCE_RUBRIC, CONFIDENCE_VERSION, confidenceFor, confidenceRank } from "../shared/creator-confidence";

export function createOnionIndicator(handle: string, compact: boolean) {
  const element = document.createElement("div");
  element.className = `onion-index${compact ? " is-compact" : ""}`;
  element.innerHTML = '<img width="56" height="60" alt=""><div><span class="onion-index-label"></span><strong class="onion-index-value">—</strong><span class="onion-index-state"></span></div>';
  const image = element.querySelector("img")!;
  const label = element.querySelector<HTMLElement>(".onion-index-label")!;
  const value = element.querySelector<HTMLElement>(".onion-index-value")!;
  const state = element.querySelector<HTMLElement>(".onion-index-state")!;
  label.textContent = "Onion Score";
  const report = confidenceFor(handle);
  const index = onionScore(report?.points?.total);
  const band = index?.band ?? UNRATED_ONION;
  element.dataset.band = band.id;
  image.src = band.image;
  image.alt = `${band.label} onion`;
  value.textContent = index ? index.value.toFixed(1) : "—";
  state.textContent = index ? `${band.label} · #${confidenceRank(handle)}` : "Pending review";
  const detail = index ? `${index.value.toFixed(1)}/100 · ${band.label}. Global rank #${confidenceRank(handle)}. Higher is fresher.` : report?.reason ?? "Source review needed";
  element.title = `Onion Score: ${detail} ${CONFIDENCE_VERSION}. Based on evidence confidence. Votes do not affect the score or rank.`;
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
  explanation.textContent = "Onion Score runs from 0 to 100. Higher is fresher and ranks higher by default. The score uses source reliability (40), report completeness (40) and cross-checks (20). Votes do not affect scores, onions or ranks.";
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
  note.textContent = "Gray onion: pending a sourced product review, with no score or rank. The score describes confidence in collected evidence, not a creator’s character or product quality. It is an editorial score, not a statistical probability. Open a report for its sources and calculation.";
  details.append(summary, explanation, grid, note);
  return details;
}

export function renderConfidenceReport(handle: string): HTMLElement {
  const report = confidenceFor(handle)!;
  const section = document.createElement("section");
  section.className = "creator-confidence-report";
  const heading = document.createElement("h2");
  heading.textContent = "Behind the Onion Score";
  const description = document.createElement("p");
  description.textContent = `${CONFIDENCE_VERSION} · Reviewed ${report.observedAt}. ${CONFIDENCE_RUBRIC.scope}`;
  const summary = document.createElement("p");
  summary.className = "creator-confidence-summary";
  summary.textContent = report.points ? "Higher is fresher. Explore the three scoring components and their sources below." : `Pending review · ${report.reason}. No score or rank yet.`;
  section.append(heading, description, summary, renderOnionScale());
  const calculation = document.createElement("details");
  calculation.className = "creator-method";
  const title = document.createElement("summary");
  title.textContent = "Score calculation & sources";
  calculation.append(title);
  for (const [key, label, rule] of [
    ["sources", "Source reliability", CONFIDENCE_RUBRIC.sourceRule],
    ["coverage", "Report completeness", CONFIDENCE_RUBRIC.coverageRule],
    ["corroboration", "Cross-checks", CONFIDENCE_RUBRIC.corroborationRule],
  ] as const) {
    const paragraph = document.createElement("p");
    paragraph.textContent = `${label}: ${report.points ? report.points[key].toFixed(1) : "—"}/${CONFIDENCE_RUBRIC.weights[key]}. ${rule}`;
    calculation.append(paragraph);
  }
  const rules = document.createElement("p");
  rules.textContent = `${CONFIDENCE_RUBRIC.eligibility} ${CONFIDENCE_RUBRIC.rounding} ${CONFIDENCE_RUBRIC.ranking}`;
  calculation.append(rules);
  for (const { product, review, relationship, listing } of report.reviewed) {
    const item = document.createElement("div");
    item.className = "creator-confidence-source";
    const name = document.createElement("strong"); name.textContent = product.name;
    const note = document.createElement("p"); note.textContent = review.note;
    const factors = document.createElement("p");
    factors.textContent = `Relationship: ${review.relationshipProvenance}; listing: ${review.listingProvenance}; cross-check: ${review.corroboration}.`;
    item.append(name, note, factors);
    for (const [role, source] of [["Relationship", relationship], ["Listing", listing]] as const) {
      const link = document.createElement("a"); link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = `${role}: ${source.label} ↗`;
      item.append(link);
    }
    calculation.append(item);
  }
  section.append(calculation);
  return section;
}
