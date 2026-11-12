import { getScanHistory, getSettings, saveSettings } from "../shared/settings";
import { formatDateTime } from "../shared/format";
import { EXTENSION_VERSION } from "../shared/version";
import type { Settings } from "../shared/types";

const scanBtn = document.getElementById("scanBtn") as HTMLButtonElement;
const captureBtn = document.getElementById("captureBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const demoToggle = document.getElementById("demoToggle") as HTMLInputElement;
const demoHint = document.getElementById("demoHint") as HTMLDivElement;
const modeBadge = document.getElementById("modeBadge") as HTMLSpanElement;
const optionsBtn = document.getElementById("optionsBtn") as HTMLButtonElement;
const versionEl = document.getElementById("version") as HTMLSpanElement;
const lastScan = document.getElementById("lastScan") as HTMLElement;
const lastScanTitle = document.getElementById("lastScanTitle") as HTMLDivElement;
const lastScanMeta = document.getElementById("lastScanMeta") as HTMLDivElement;

function setStatus(text: string, kind: "default" | "ok" | "error" = "default"): void {
  statusEl.textContent = text;
  statusEl.className = `status${kind === "default" ? "" : ` ${kind}`}`;
}

function updateMode(settings: Settings): void {
  if (settings.demoMode) {
    modeBadge.textContent = "DEMO";
    modeBadge.className = "badge demo";
    demoHint.textContent =
      "Demo mode keeps factory cards on the sample dataset. TikHub and Baidu run only when their keys are saved in Settings.";
  } else {
    modeBadge.textContent = "LIVE";
    modeBadge.className = "badge live";
    demoHint.textContent = settings.apiBaseUrl
      ? `Live API: ${settings.apiBaseUrl}. If the request fails, use “Run demo report” in the panel.`
      : "Live mode is on, but no API URL is configured. Set one in Settings or turn demo mode back on.";
  }
}

async function load(): Promise<void> {
  versionEl.textContent = `v${EXTENSION_VERSION}`;
  try {
    const settings = await getSettings();
    demoToggle.checked = settings.demoMode;
    updateMode(settings);
  } catch {
    setStatus("Could not read extension settings.", "error");
  }

  try {
    const history = await getScanHistory();
    const latest = history[0];
    if (latest) {
      lastScan.hidden = false;
      lastScanTitle.textContent = latest.title || "Untitled product";
      lastScanMeta.textContent = `${latest.platform} · ${formatDateTime(
        latest.createdAt,
      )} · ${latest.dataSource}`;
    }
  } catch {
    // History is optional; ignore.
  }
}

async function openOnActiveTab(message: { type: string }): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) throw new Error("No active tab.");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
  await chrome.tabs.sendMessage(tab.id, message);
}

scanBtn.addEventListener("click", () => {
  void (async () => {
    scanBtn.disabled = true;
    setStatus("Opening the X-Ray panel on this tab…");
    try {
      await openOnActiveTab({ type: "OPEN_HUD" });
      setStatus("X-Ray opened. Choose how you want to start the scan.", "ok");
      window.setTimeout(() => window.close(), 500);
    } catch {
      setStatus(
        "Chrome blocks extensions on this page. Open a normal http(s) product page and try again.",
        "error",
      );
      scanBtn.disabled = false;
    }
  })();
});

captureBtn.addEventListener("click", () => {
  void (async () => {
    captureBtn.disabled = true;
    setStatus("Capturing the visible screen and opening the report…");
    try {
      await openOnActiveTab({ type: "CAPTURE_AND_SCAN" });
      setStatus("Capture started. The report will open on this tab.", "ok");
      window.setTimeout(() => window.close(), 500);
    } catch {
      setStatus(
        "Chrome blocks screenshots on this page. Open a normal http(s) page and try again.",
        "error",
      );
      captureBtn.disabled = false;
    }
  })();
});

demoToggle.addEventListener("change", () => {
  void (async () => {
    try {
      const settings = await saveSettings({ demoMode: demoToggle.checked });
      updateMode(settings);
      setStatus(
        settings.demoMode
          ? "Demo mode is on. No external API will be called."
          : "Live mode is on. Scans will call the configured API.",
        "ok",
      );
    } catch {
      setStatus("Could not save the setting.", "error");
    }
  })();
});

optionsBtn.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

void load();
