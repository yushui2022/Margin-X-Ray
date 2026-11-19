import { EVIDENCE_SCORE_VERSION } from "../shared/creator-evidence-score";
import { archiveHosting } from "./hosting-mode";

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
  section.setAttribute("aria-label", `Evidence coverage feedback for @${handle}`);
  if (archiveHosting) {
    if (!compact) {
      const note = document.createElement("p");
      note.className = "creator-vote-note";
      note.textContent = "Community voting is unavailable in this archive.";
      section.append(note);
    } else section.hidden = true;
    return section;
  }
  section.innerHTML = `${compact ? '' : '<div class="creator-feedback-copy"><p class="eyebrow">Community feedback</p><h2>Is the evidence coverage score fair?</h2><p>Vote on how fairly the ten evidence checks represent this report. The price premium and product-issue scores are calculated separately.</p></div>'}
    <div class="creator-feedback-controls">${compact ? '<span class="creator-vote-label">Coverage vote</span>' : ""}<div class="creator-vote-buttons"><button type="button" data-vote="up" aria-pressed="false">↑${compact ? "" : " Seems fair"} <span>—</span></button><button type="button" data-vote="down" aria-pressed="false">↓${compact ? "" : " Needs review"} <span>—</span></button></div><p class="creator-vote-result" role="status" aria-live="polite">${compact ? "Loading…" : "Loading community feedback…"}</p><button type="button" class="creator-feedback-retry" hidden>Retry feedback</button>${compact ? "" : '<p class="creator-vote-note">Anonymous browser votes · Tap again to undo. Votes do not change the evidence score.</p>'}</div>`;
  const buttons = [...section.querySelectorAll<HTMLButtonElement>("[data-vote]")];
  buttons.forEach(button => {
    const label = `${button.dataset.vote === "up" ? "Up: evidence coverage score seems fair" : "Down: evidence coverage score needs review"} for @${handle}`;
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
    result.textContent = compact
      ? state.yourVote ? "Vote saved" : `${total.toLocaleString("en-US")} ${total === 1 ? "vote" : "votes"}`
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
