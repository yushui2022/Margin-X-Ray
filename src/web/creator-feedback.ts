import { EVIDENCE_SCORE_VERSION } from "../shared/creator-evidence-score";
import { createOnionIndicator, renderOnionScale } from "./onion-index";

type Vote = "up" | "down" | null;
interface Feedback { handle: string; version: string; up: number; down: number; yourVote: Vote }

// Establish the anonymous cookie before parallel directory reads. Otherwise a
// first visit could receive a different cookie from each concurrently loaded row.
let sessionRequest: Promise<void> | undefined;
function ensureFeedbackSession(endpoint: string): Promise<void> {
  if (!sessionRequest) {
    sessionRequest = fetch(endpoint, { credentials: "same-origin", signal: AbortSignal.timeout(10000) })
      .then(response => { if (!response.ok) throw new Error(String(response.status)); })
      .catch(error => { sessionRequest = undefined; throw error; });
  }
  return sessionRequest;
}

export function renderCreatorFeedback(handle: string, compact = false): HTMLElement {
  const section = document.createElement("section");
  section.className = `creator-feedback${compact ? " creator-feedback-compact" : ""}`;
  section.setAttribute("aria-label", `Score feedback for @${handle}`);
  section.innerHTML = `${compact ? '<p class="creator-feedback-prompt">Score fair?</p>' : '<div class="creator-feedback-copy"><p class="eyebrow">Community check</p><h2>Does this score seem fair?</h2><p>Vote on the score’s reasoning. Your feedback helps flag reports for review.</p></div>'}
    <div class="creator-feedback-controls"><div class="creator-vote-buttons"><button type="button" data-vote="up" aria-pressed="false">↑${compact ? "" : " Seems fair"} <span>—</span></button><button type="button" data-vote="down" aria-pressed="false">↓${compact ? "" : " Needs review"} <span>—</span></button></div><p class="creator-vote-result" role="status" aria-live="polite">${compact ? "Loading…" : "Loading community feedback…"}</p><button type="button" class="creator-feedback-retry" hidden>Retry feedback</button>${compact ? "" : '<p class="creator-vote-note">Anonymous browser votes · Tap again to undo. Votes do not change the evidence score.</p>'}</div>`;
  const indicator = createOnionIndicator(compact);
  if (compact) section.querySelector(".creator-feedback-prompt")!.replaceWith(indicator.element);
  else {
    section.querySelector(".creator-feedback-copy")!.append(renderOnionScale());
    section.querySelector(".creator-feedback-controls")!.prepend(indicator.element);
  }
  const buttons = [...section.querySelectorAll<HTMLButtonElement>("[data-vote]")];
  buttons.forEach(button => {
    const label = `${button.dataset.vote === "up" ? "Up: score seems fair" : "Down: score needs review"} for @${handle}`;
    button.setAttribute("aria-label", label);
    button.title = `${label}. Click again to undo.`;
  });
  const result = section.querySelector<HTMLElement>(".creator-vote-result")!;
  const retry = section.querySelector<HTMLButtonElement>(".creator-feedback-retry")!;
  let state: Feedback | undefined;
  let busy = false;
  const endpoint = `/api/creator-feedback?handle=${encodeURIComponent(handle)}&version=${encodeURIComponent(EVIDENCE_SCORE_VERSION)}`;
  const setBusy = (value: boolean) => {
    busy = value;
    section.setAttribute("aria-busy", String(value));
    buttons.forEach(button => { button.disabled = value || !state; });
    retry.disabled = value;
  };
  const paint = () => {
    if (!state) return;
    for (const button of buttons) {
      const vote = button.dataset.vote as "up" | "down";
      button.setAttribute("aria-pressed", String(state.yourVote === vote));
      button.querySelector("span")!.textContent = state[vote].toLocaleString("en-US");
    }
    const total = state.up + state.down;
    indicator.update(state.up, state.down);
    result.textContent = compact
      ? total ? `${Math.round(state.up / total * 100)}% agree${state.yourVote ? " · Saved" : ""}` : "No votes yet"
      : total ? `${Math.round(state.up / total * 100)}% agree · ${total.toLocaleString("en-US")} ${total === 1 ? "vote" : "votes"}${state.yourVote ? " · Your vote is saved" : ""}` : "No votes yet. Be the first to review this score.";
  };
  async function request(vote?: Vote) {
    if (busy) return;
    setBusy(true);
    retry.hidden = true;
    result.textContent = compact ? vote === undefined ? "Loading…" : "Saving…" : vote === undefined ? "Loading community feedback…" : "Saving your vote…";
    try {
      await ensureFeedbackSession(endpoint);
      const response = await fetch(endpoint, {
        method: vote === undefined ? "GET" : "POST", credentials: "same-origin",
        ...(vote === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote }) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as Feedback;
      if (data.handle !== handle || data.version !== EVIDENCE_SCORE_VERSION || !Number.isSafeInteger(data.up) || data.up < 0 || !Number.isSafeInteger(data.down) || data.down < 0 || !Number.isSafeInteger(data.up + data.down) || !["up", "down", null].includes(data.yourVote)) throw new Error("Invalid response");
      state = data;
      paint();
    } catch {
      // A timed-out write may have reached the server. Reload its authoritative
      // state before allowing another vote, instead of guessing a local count.
      state = undefined;
      indicator.update(null, null, "Unavailable");
      result.textContent = compact ? "Couldn’t confirm vote" : "Couldn’t load or confirm feedback. Retry to check your saved vote.";
      retry.hidden = false;
    } finally { setBusy(false); }
  }
  buttons.forEach(button => button.addEventListener("click", () => {
    const vote = button.dataset.vote as "up" | "down";
    void request(state?.yourVote === vote ? null : vote);
  }));
  retry.addEventListener("click", () => { void request(); });
  void request();
  return section;
}
