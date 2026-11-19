import { el } from "./shop-dom";

export function reportShareControl(jobId: string, title: string, text: string): HTMLElement {
  const wrap = el("div", "", "report-share");
  const button = el("button", "Share report ↗", "btn report-share-button");
  button.type = "button";
  const message = el("span", "", "report-share-message");
  message.setAttribute("role", "status");
  const manual = el("input", "", "report-share-url");
  manual.type = "url";
  manual.readOnly = true;
  manual.hidden = true;
  manual.setAttribute("aria-label", "Shareable report link");
  manual.addEventListener("focus", () => manual.select());
  wrap.append(button, message, manual);

  let permalink: string | undefined;
  button.addEventListener("click", async () => {
    button.disabled = true;
    message.textContent = "";
    manual.hidden = true;
    try {
      if (!permalink) {
        button.textContent = "Preparing link…";
        const response = await fetch("/api/shopping-jobs/" + encodeURIComponent(jobId) + "/share", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) throw new Error("Share request failed");
        const result = await response.json();
        // Accept only the frozen snapshot for the exact job the reader chose.
        if (result.url !== "/r/" + jobId) throw new Error("Unexpected share address");
        permalink = new URL(result.url, location.origin).href;
      }
      const payload = { title, text, url: permalink };
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(payload))) {
        try {
          await navigator.share(payload);
          return;
        } catch (failure) {
          if (failure instanceof Error && failure.name === "AbortError") return;
          // Some browsers require a fresh gesture after the link is prepared.
        }
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(permalink);
        message.textContent = "Link copied.";
      } catch {
        manual.value = permalink;
        manual.hidden = false;
        message.textContent = "Copy this link to share the report.";
        manual.focus();
        manual.select();
      }
    } catch {
      message.textContent = "Couldn’t prepare the report link. Try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Share report ↗";
    }
  });
  return wrap;
}
