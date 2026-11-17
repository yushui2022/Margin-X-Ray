import { EVIDENCE_SCORE_VERSION } from "../shared/creator-evidence-score";

type Vote = "up" | "down" | null;
interface Feedback { handle: string; version: string; up: number; down: number; yourVote: Vote }

export function renderCreatorFeedback(handle: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "creator-feedback";
  section.setAttribute("aria-label", "Score feedback");
  section.innerHTML = `<div class="creator-feedback-copy"><p class="eyebrow">Community check</p><h2>Does this score seem fair?</h2><p>Vote on the score’s reasoning. Your feedback helps flag reports for review.</p></div>
    <div class="creator-feedback-controls"><div class="creator-vote-buttons"><button type="button" data-vote="up" aria-pressed="false">↑ Seems fair <span>—</span></button><button type="button" data-vote="down" aria-pressed="false">↓ Needs review <span>—</span></button></div><p class="creator-vote-result" role="status" aria-live="polite">Loading community feedback…</p><button type="button" class="creator-feedback-retry" hidden>Retry feedback</button><p class="creator-vote-note">Anonymous browser votes · Tap again to undo. Votes do not change the evidence score.</p></div>`;
  const buttons = [...section.querySelectorAll<HTMLButtonElement>("[data-vote]")];
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
    result.textContent = total ? `${Math.round(state.up / total * 100)}% agree · ${total.toLocaleString("en-US")} ${total === 1 ? "vote" : "votes"}${state.yourVote ? " · Your vote is saved" : ""}` : "No votes yet. Be the first to review this score.";
  };
  async function request(vote?: Vote) {
    if (busy) return;
    setBusy(true);
    retry.hidden = true;
    result.textContent = vote === undefined ? "Loading community feedback…" : "Saving your vote…";
    try {
      const response = await fetch(endpoint, {
        method: vote === undefined ? "GET" : "POST", credentials: "same-origin",
        ...(vote === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote }) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as Feedback;
      if (data.handle !== handle || data.version !== EVIDENCE_SCORE_VERSION || !Number.isSafeInteger(data.up) || data.up < 0 || !Number.isSafeInteger(data.down) || data.down < 0 || !["up", "down", null].includes(data.yourVote)) throw new Error("Invalid response");
      state = data;
      paint();
    } catch {
      // A timed-out write may have reached the server. Reload its authoritative
      // state before allowing another vote, instead of guessing a local count.
      state = undefined;
      result.textContent = "Couldn’t load or confirm feedback. Retry to check your saved vote.";
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
