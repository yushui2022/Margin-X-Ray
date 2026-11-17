import { ONION_BANDS, UNRATED_ONION, onionIndex } from "../shared/onion-index";

export function createOnionIndicator(compact: boolean) {
  const element = document.createElement("div");
  element.className = `onion-index${compact ? " is-compact" : ""}`;
  element.innerHTML = '<img width="56" height="60" alt=""><div><span class="onion-index-label"></span><strong class="onion-index-value">—</strong><span class="onion-index-state"></span></div>';
  const image = element.querySelector("img")!;
  const label = element.querySelector<HTMLElement>(".onion-index-label")!;
  const value = element.querySelector<HTMLElement>(".onion-index-value")!;
  const state = element.querySelector<HTMLElement>(".onion-index-state")!;
  label.textContent = compact ? "Rotten index" : "Rotten Onion Index";
  function update(up: number | null, down: number | null, pending = "Awaiting votes") {
    const index = up === null || down === null ? null : onionIndex(up, down);
    const band = index?.band ?? UNRATED_ONION;
    element.dataset.band = band.id;
    image.src = band.image;
    image.alt = `${band.label} onion`;
    value.textContent = index ? index.value.toFixed(1) : "—";
    state.textContent = index ? `${band.label}${index.early ? " · Early" : ""}` : pending;
    const detail = index ? `${index.value.toFixed(1)}/100 · ${band.label}. ${index.total} ${index.total === 1 ? "vote" : "votes"}.${index.early ? " Early signal: fewer than 5 votes." : ""}` : pending;
    element.title = `Rotten Onion Index: ${detail} Share of Needs review votes about this score, not proof of creator misconduct.`;
    element.setAttribute("aria-label", element.title);
  }
  update(null, null, "Loading votes…");
  return { element, update };
}

export function renderOnionScale(): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "onion-scale";
  const summary = document.createElement("summary");
  summary.textContent = "Onion scale";
  summary.setAttribute("aria-label", "Rotten Onion Index scale and meaning");
  const explanation = document.createElement("p");
  explanation.textContent = "Rotten Onion Index = ↓ Needs review ÷ all votes × 100. Higher means more disagreement with this score, not proven misconduct or poor product quality.";
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
  note.textContent = "No votes: gray onion and no index. Fewer than 5 votes: Early signal. Anonymous browser votes can be changed or withdrawn; evidence points stay separate.";
  details.append(summary, explanation, grid, note);
  return details;
}
