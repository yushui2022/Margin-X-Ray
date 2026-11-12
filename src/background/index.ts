import { runDemoScan } from "./demo-runner";
import {
  ApiError,
  makeLead,
  scanWithApi,
  sendLeadToApi,
  testApi,
} from "./api";
import {
  addLead,
  addScanHistory,
  clearAllLocalData,
  getSettings,
  saveSettings,
} from "../shared/settings";
import { computeWaterfall } from "../shared/pricing";
import type { RuntimeMessage, RuntimeResponse } from "../shared/messages";
import type {
  ScanProgress,
  ScanRequest,
  ScanResult,
  Settings,
} from "../shared/types";

const activeScans = new Map<string, AbortController>();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: "xray-scan-page",
        title: "Scan with Margin X-Ray",
        contexts: ["page"],
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  });

  void saveSettings({});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "xray-scan-page" || !tab?.id) return;
  void injectAndOpen(tab.id);
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: RuntimeResponse) => void,
  ) => {
    if (!message || typeof message.type !== "string") return false;

    if (message.type === "SCAN_REQUEST") {
      sendResponse({ ok: true });
      void handleScanRequest(message.request, sender);
      return false;
    }

    if (message.type === "SCAN_CANCEL") {
      activeScans.get(message.scanId)?.abort();
      activeScans.delete(message.scanId);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "SCAN_PROGRESS" || message.type === "SCAN_COMPLETE" || message.type === "SCAN_ERROR") {
      // These are background -> content messages. Ignore if they loop back.
      return false;
    }

    void handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: {
            code: "BACKGROUND_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "The background worker failed.",
          },
        });
      });

    return true;
  },
);

async function handleMessage(message: RuntimeMessage): Promise<RuntimeResponse> {
  switch (message.type) {
    case "GET_SETTINGS":
      return { ok: true, settings: await getSettings() };

    case "SAVE_SETTINGS":
      return { ok: true, settings: await saveSettings(message.settings) };

    case "TEST_API": {
      const current = await getSettings();
      const settings: Settings = { ...current, ...(message.settings ?? {}) };
      return { ok: true, apiTest: await testApi(settings) };
    }

    case "SAVE_LEAD": {
      const lead = makeLead(message.lead, message.result);
      await addLead(lead);
      const settings = await getSettings();
      if (!settings.demoMode) {
        await sendLeadToApi(settings, lead, message.result);
      }
      return { ok: true, lead };
    }

    case "CLEAR_DATA":
      await clearAllLocalData();
      return { ok: true };

    case "OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return { ok: true };

    case "CAPTURE_VISIBLE_TAB": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.windowId) {
        throw new Error("No active tab to capture.");
      }
      const captureDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 82,
      });
      return { ok: true, captureDataUrl };
    }

    case "OPEN_HUD":
    case "CAPTURE_AND_SCAN":
      return { ok: true };

    case "SCAN_REQUEST":
    case "SCAN_CANCEL":
      return { ok: true };

    default:
      return {
        ok: false,
        error: {
          code: "UNKNOWN_MESSAGE",
          message: "Unknown extension message.",
        },
      };
  }
}

async function handleScanRequest(
  request: ScanRequest,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  activeScans.get(request.scanId)?.abort();
  const controller = new AbortController();
  activeScans.set(request.scanId, controller);

  const sendProgress = (progress: ScanProgress) => {
    if (controller.signal.aborted) return;
    const safeProgress: ScanProgress = {
      ...progress,
      scanId: request.scanId,
    };
    void chrome.tabs
      .sendMessage(tabId, { type: "SCAN_PROGRESS", progress: safeProgress })
      .catch(() => undefined);
  };

  try {
    const settings = await getSettings();
    const forceDemo =
      Boolean(request.forceDemo) || settings.demoMode || !settings.apiBaseUrl;

    const result = forceDemo
      ? await runDemoScan(request, sendProgress, controller.signal)
      : await scanWithApi(
          request,
          settings,
          sendProgress,
          controller.signal,
        );

    if (controller.signal.aborted) return;

    await saveHistory(result);
    void chrome.tabs
      .sendMessage(tabId, { type: "SCAN_COMPLETE", result })
      .catch(() => undefined);
  } catch (error) {
    if (controller.signal.aborted) return;

    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(
            "SCAN_FAILED",
            error instanceof Error ? error.message : "The scan failed.",
          );

    void chrome.tabs
      .sendMessage(tabId, {
        type: "SCAN_ERROR",
        scanId: request.scanId,
        error: {
          code: apiError.code,
          message: apiError.message,
          retryable: true,
        },
      })
      .catch(() => undefined);
  } finally {
    activeScans.delete(request.scanId);
  }
}

async function saveHistory(result: ScanResult): Promise<void> {
  const retail = result.product.retailUsd;
  const fobMin = result.priceRange?.fobMinUsd ?? null;

  let netMarginPct: number | null = null;
  if (result.assumptions && retail && retail > 0) {
    netMarginPct = computeWaterfall(retail, result.assumptions).netMarginPct;
  } else if (result.waterfall) {
    netMarginPct = result.waterfall.netMarginPct;
  }

  await addScanHistory({
    scanId: result.scanId,
    createdAt: result.generatedAt,
    title: result.product.title,
    sourceUrl: result.product.sourceUrl,
    platform: result.product.platform,
    dataSource: result.dataSource,
    retailUsd: retail,
    fobMinUsd: fobMin,
    netMarginPct,
  });
}

async function injectAndOpen(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tabId, { type: "OPEN_HUD" });
  } catch {
    // Restricted pages (chrome://, the Web Store, PDF viewer) cannot be
    // injected. The popup shows the same error if the user tries.
  }
}
