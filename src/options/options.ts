import {
  getLeads,
  getScanHistory,
  getSettings,
} from "../shared/settings";
import { EXTENSION_VERSION } from "../shared/version";
import type { RuntimeResponse } from "../shared/messages";
import type { Settings } from "../shared/types";

const form = document.getElementById("settingsForm") as HTMLFormElement;
const apiBaseUrl = document.getElementById("apiBaseUrl") as HTMLInputElement;
const apiToken = document.getElementById("apiToken") as HTMLInputElement;
const tikhubToken = document.getElementById("tikhubToken") as HTMLInputElement;
const baiduApiKey = document.getElementById("baiduApiKey") as HTMLInputElement;
const baiduSecretKey = document.getElementById("baiduSecretKey") as HTMLInputElement;
const oneboundKey = document.getElementById("oneboundKey") as HTMLInputElement;
const oneboundSecret = document.getElementById("oneboundSecret") as HTMLInputElement;
const oneboundFetchTiers = document.getElementById("oneboundFetchTiers") as HTMLInputElement;
const alibabaAppKey = document.getElementById("alibabaAppKey") as HTMLInputElement;
const alibabaAppSecret = document.getElementById("alibabaAppSecret") as HTMLInputElement;
const alibabaAccessToken = document.getElementById("alibabaAccessToken") as HTMLInputElement;
const usdCnyRate = document.getElementById("usdCnyRate") as HTMLInputElement;
const demoMode = document.getElementById("demoMode") as HTMLInputElement;
const autoOpen = document.getElementById("autoOpen") as HTMLInputElement;
const maxScanHistory = document.getElementById(
  "maxScanHistory",
) as HTMLInputElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const testBtn = document.getElementById("testBtn") as HTMLButtonElement;
const testTikhubBtn = document.getElementById("testTikhubBtn") as HTMLButtonElement;
const testRecognizerBtn = document.getElementById("testRecognizerBtn") as HTMLButtonElement;
const clearBtn = document.getElementById("clearBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const modeBadge = document.getElementById("modeBadge") as HTMLSpanElement;
const dataSummary = document.getElementById("dataSummary") as HTMLParagraphElement;
const versionEl = document.getElementById("version") as HTMLSpanElement;

function setStatus(
  text: string,
  kind: "default" | "ok" | "warn" | "error" = "default",
): void {
  statusEl.textContent = text;
  statusEl.className = `status${kind === "default" ? "" : ` ${kind}`}`;
}

function updateMode(settings: Settings): void {
  if (settings.demoMode) {
    modeBadge.textContent = "DEMO";
    modeBadge.className = "badge demo";
  } else {
    modeBadge.textContent = "LIVE";
    modeBadge.className = "badge live";
  }
}

function fillForm(settings: Settings): void {
  apiBaseUrl.value = settings.apiBaseUrl;
  apiToken.value = settings.apiToken;
  tikhubToken.value = settings.tikhubToken;
  baiduApiKey.value = settings.baiduApiKey;
  baiduSecretKey.value = settings.baiduSecretKey;
  oneboundKey.value = settings.oneboundKey;
  oneboundSecret.value = settings.oneboundSecret;
  oneboundFetchTiers.checked = settings.oneboundFetchTiers;
  alibabaAppKey.value = settings.alibabaAppKey;
  alibabaAppSecret.value = settings.alibabaAppSecret;
  alibabaAccessToken.value = settings.alibabaAccessToken;
  usdCnyRate.value = settings.usdCnyRate;
  demoMode.checked = settings.demoMode;
  autoOpen.checked = settings.autoOpen;
  maxScanHistory.value = String(settings.maxScanHistory);
  updateMode(settings);
}

function readForm(): Partial<Settings> {
  return {
    apiBaseUrl: apiBaseUrl.value.trim(),
    apiToken: apiToken.value.trim(),
    tikhubToken: tikhubToken.value.trim(),
    baiduApiKey: baiduApiKey.value.trim(),
    baiduSecretKey: baiduSecretKey.value.trim(),
    oneboundKey: oneboundKey.value.trim(),
    oneboundSecret: oneboundSecret.value.trim(),
    oneboundFetchTiers: oneboundFetchTiers.checked,
    alibabaAppKey: alibabaAppKey.value.trim(),
    alibabaAppSecret: alibabaAppSecret.value.trim(),
    alibabaAccessToken: alibabaAccessToken.value.trim(),
    usdCnyRate: usdCnyRate.value.trim(),
    demoMode: demoMode.checked,
    autoOpen: autoOpen.checked,
    maxScanHistory: Number(maxScanHistory.value) || 20,
  };
}

function apiOriginPattern(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The API URL must start with http:// or https://.");
  }
  return `${url.origin}/*`;
}

/**
 * Must be called directly from a user gesture. Do not await anything else
 * before calling chrome.permissions.request, or Chrome may drop the gesture.
 */
async function requestApiPermission(value: string): Promise<boolean> {
  if (!value.trim()) return true;
  let pattern: string;
  try {
    pattern = apiOriginPattern(value);
  } catch {
    return false;
  }
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function load(): Promise<void> {
  versionEl.textContent = `v${EXTENSION_VERSION}`;
  try {
    const settings = await getSettings();
    fillForm(settings);
  } catch {
    setStatus("Could not read settings.", "error");
  }
  await loadCounts();
}

async function loadCounts(): Promise<void> {
  try {
    const [history, leads] = await Promise.all([getScanHistory(), getLeads()]);
    dataSummary.textContent = `${history.length} scan${
      history.length === 1 ? "" : "s"
    } and ${leads.length} lead${
      leads.length === 1 ? "" : "s"
    } stored in this browser.`;
  } catch {
    dataSummary.textContent = "Could not read local data.";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    const patch = readForm();
    let permissionOk = true;

    if (patch.apiBaseUrl && !patch.demoMode) {
      permissionOk = await requestApiPermission(patch.apiBaseUrl);
    }

    saveBtn.disabled = true;
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        settings: patch,
      })) as RuntimeResponse | undefined;

      if (response?.ok && response.settings) {
        fillForm(response.settings);
        setStatus(
          permissionOk
            ? "Settings saved."
            : "Settings saved, but live API host permission was denied. Live scans will fail; demo mode still works.",
          permissionOk ? "ok" : "warn",
        );
      } else {
        setStatus(
          response?.ok === false
            ? response.error.message
            : "Could not save settings.",
          "error",
        );
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save settings.",
        "error",
      );
    } finally {
      saveBtn.disabled = false;
    }
  })();
});

testBtn.addEventListener("click", () => {
  void (async () => {
    const patch = readForm();
    if (!patch.apiBaseUrl) {
      setStatus("Enter an API base URL first.", "error");
      return;
    }

    const permissionOk = await requestApiPermission(patch.apiBaseUrl);
    if (!permissionOk) {
      setStatus(
        "Host permission was denied. Chrome cannot call this API from the extension.",
        "error",
      );
      return;
    }

    testBtn.disabled = true;
    setStatus("Testing connection…");
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "TEST_API",
        settings: {
          apiBaseUrl: patch.apiBaseUrl,
          apiToken: patch.apiToken,
        },
      })) as RuntimeResponse | undefined;

      if (response?.ok && response.apiTest) {
        setStatus(response.apiTest.message, response.apiTest.ok ? "ok" : "error");
      } else {
        setStatus(
          response?.ok === false
            ? response.error.message
            : "The connection test failed.",
          "error",
        );
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The connection test failed.",
        "error",
      );
    } finally {
      testBtn.disabled = false;
    }
  })();
});

testTikhubBtn.addEventListener("click", () => {
  void runKeyedTest(testTikhubBtn, "Testing TikHub…", {
    type: "TEST_TIKHUB",
    token: tikhubToken.value.trim(),
  });
});

testRecognizerBtn.addEventListener("click", () => {
  void runKeyedTest(testRecognizerBtn, "Testing Baidu…", {
    type: "TEST_RECOGNIZER",
    apiKey: baiduApiKey.value.trim(),
    secretKey: baiduSecretKey.value.trim(),
  });
});

async function runKeyedTest(
  button: HTMLButtonElement,
  pending: string,
  message: { type: "TEST_TIKHUB"; token: string } | { type: "TEST_RECOGNIZER"; apiKey: string; secretKey: string },
): Promise<void> {
  button.disabled = true;
  setStatus(pending);
  try {
    const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse | undefined;
    if (response?.ok && response.apiTest) {
      setStatus(response.apiTest.message, response.apiTest.ok ? "ok" : "error");
    } else {
      setStatus(response?.ok === false ? response.error.message : "The connection test failed.", "error");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The connection test failed.", "error");
  } finally {
    button.disabled = false;
  }
}

clearBtn.addEventListener("click", () => {
  void (async () => {
    if (
      !window.confirm(
        "Delete locally stored scans and leads? This cannot be undone.",
      )
    ) {
      return;
    }
    clearBtn.disabled = true;
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "CLEAR_DATA",
      })) as RuntimeResponse | undefined;
      if (response?.ok) {
        await loadCounts();
        setStatus("Local scans and leads deleted.", "ok");
      } else {
        setStatus("Could not delete local data.", "error");
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not delete local data.",
        "error",
      );
    } finally {
      clearBtn.disabled = false;
    }
  })();
});

demoMode.addEventListener("change", () => {
  updateMode({
    ...readForm(),
    apiBaseUrl: apiBaseUrl.value.trim(),
    apiToken: apiToken.value.trim(),
    demoMode: demoMode.checked,
    autoOpen: autoOpen.checked,
    maxScanHistory: Number(maxScanHistory.value) || 20,
  } as Settings);
});

void load();
