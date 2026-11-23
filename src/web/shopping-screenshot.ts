import { tikTokCheckRoute } from "./shopping-job";
import { uiText } from "./language";
import { backLink, details, el, link } from "./shop-dom";

interface ScreenshotEvidence {
  text: string;
  candidates: { kind: string; url: string; label: string }[];
  message: string;
}

type Submit = (route: string) => void;
let pending: File | undefined;

export function screenshotPicker(submit: Submit, caption = "Upload a screenshot", inputArea?: HTMLElement) {
  const box = el("div", "", "shop-screenshot-picker");
  const label = el("label", caption);
  const input = el("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg";
  const help = el("span", "", "shop-small");
  help.setAttribute("role", "alert");
  function openFile(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      help.textContent = "Choose a PNG or JPEG screenshot up to 5 MB.";
      return;
    }
    help.textContent = "";
    pending = file;
    submit("#shop/screenshot");
  }
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) openFile(file);
  });
  inputArea?.addEventListener("paste", event => {
    const data = event.clipboardData;
    if (!data) return;
    const image = Array.from(data.files).find(file => file.type.startsWith("image/")) ??
      Array.from(data.items).find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
    if (!image) return;
    event.preventDefault();
    openFile(image);
  });
  inputArea?.addEventListener("dragover", event => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  inputArea?.addEventListener("drop", event => {
    const file = event.dataTransfer?.files[0];
    if (!file) return;
    event.preventDefault();
    openFile(file);
  });
  label.append(input);
  box.append(label, help);
  return box;
}

export function screenshotPage(signal: AbortSignal, submit: Submit) {
  const main = el("div", "", "shop-page shop-narrow");
  main.append(backLink("Shopping check", "#shop"), el("h1", "Check a screenshot"));
  const file = pending;
  pending = undefined;
  if (!file) {
    main.append(el("p", "Choose a screenshot showing a TikTok handle, video URL or TikTok Shop product link. PNG and JPEG images up to 5 MB are supported.", "shop-lede"), screenshotPicker(submit));
    return main;
  }
  main.append(el("p", file.name, "shop-small"));
  const status = el("p", "Reading text and links from your screenshot…", "shop-progress");
  status.setAttribute("role", "status");
  const result = el("div");
  const retry = el("button", "Read screenshot again", "btn secondary");
  retry.type = "button";
  retry.hidden = true;
  const picker = screenshotPicker(submit, "Choose another screenshot");
  main.append(status, result, retry, picker);

  async function read() {
    retry.hidden = true;
    status.textContent = "Reading text and links from your screenshot…";
    try {
      const res = await fetch("/api/shopping-screenshot", {
        method: "POST", headers: { "Content-Type": file!.type }, body: file,
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The screenshot reader is unavailable.");
      if (signal.aborted) return;
      const evidence = data as ScreenshotEvidence;
      const choices = (evidence.candidates ?? []).filter(c => tikTokCheckRoute(c.url));
      const only = choices.length === 1 ? choices[0]! : undefined;
      if (only) {
        submit(tikTokCheckRoute(only.url)!); return;
      }
      result.replaceChildren();
      status.textContent = choices.length ? "Review the TikTok source read from your screenshot." : "The screenshot didn’t contain a usable TikTok link or handle.";
      if (choices.length > 1) {
        result.append(el("h2", "Which TikTok source should we check?"));
        for (const candidate of choices) {
          const destination = tikTokCheckRoute(candidate.url)!;
          const choice = link(candidate.label || candidate.url, destination, "shop-action-link");
          choice.addEventListener("click", event => { event.preventDefault(); submit(destination); });
          result.append(choice);
        }
      }
      if (evidence.text?.trim()) result.append(details("Text read from the screenshot", el("p", evidence.text, "shop-ocr-text")));
      const form = el("form", "", "shop-ocr-form");
      const label = el("label", "TikTok video, creator or Shop link");
      const input = el("input");
      input.type = "text"; input.required = true; input.maxLength = 2048;
      input.placeholder = "@creator or tiktok.com/…";
      input.addEventListener("input", () => input.setCustomValidity(""));
      const check = el("button", "Check source", "btn primary"); check.type = "submit";
      form.addEventListener("submit", event => {
        event.preventDefault();
        const route = tikTokCheckRoute(input.value);
        if (!route) {
          input.setCustomValidity(uiText("Enter a TikTok video, creator handle or TikTok Shop listing.")); input.reportValidity(); return;
        }
        submit(route);
      });
      label.append(input); form.append(label, check); result.append(form);
    } catch (error) {
      if (signal.aborted) return;
      status.textContent = error instanceof Error && error.name === "Error" ? error.message : "Couldn’t read the screenshot. Try again or choose a clearer image.";
      retry.hidden = false;
    }
  }
  retry.addEventListener("click", () => void read());
  void read();
  return main;
}
