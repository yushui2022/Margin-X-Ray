import { detectPage, isAutoMountHost } from "./adapters";
import type { PageAdapter } from "./adapters";
import { Hud } from "./ui/hud";
import { getSettings } from "../shared/settings";
import { EXTENSION_VERSION } from "../shared/version";
import type { RuntimeMessage, RuntimeResponse } from "../shared/messages";
import type {
  LeadInput,
  PageContext,
  SaveLeadResult,
  ScanResult,
  Settings,
} from "../shared/types";

const CONTROLLER_KEY = "__MARGIN_XRAY_CONTROLLER__";
const SCAN_POLL_INTERVAL_MS = 1200;

type GlobalWithController = typeof globalThis & {
  [CONTROLLER_KEY]?: XRayController;
};

class XRayController {
  private hud: Hud;
  private adapter: PageAdapter | null = null;
  private currentUrl = location.href;
  private scanId: string | null = null;
  private lastResult: ScanResult | null = null;
  private settings: Settings | null = null;
  private manualMode = false;
  private urlTimer: number;

  constructor() {
    this.hud = new Hud({
      onLauncherClick: () => {
        void this.open();
      },
      onCancel: () => {
        this.cancelAndClose();
      },
      onClose: () => {
        this.cancelAndClose();
      },
      onOpenOptions: () => {
        void chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      },
      onRetry: (forceDemo) => {
        void this.startScan(forceDemo);
      },
      onSubmitLead: (input) => this.submitLead(input),
    });

    chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
      this.handleRuntimeMessage(message);
    });

    window.addEventListener("popstate", () => this.onUrlMaybeChanged());
    this.urlTimer = window.setInterval(
      () => this.onUrlMaybeChanged(),
      SCAN_POLL_INTERVAL_MS,
    );

    void this.init();
  }

  openFromInjection(): void {
    this.manualMode = true;
    this.detect();
    void this.open();
  }

  private async init(): Promise<void> {
    try {
      this.settings = await getSettings();
    } catch {
      this.settings = null;
    }
    this.detect();
    if (this.settings?.autoOpen && this.adapter) {
      void this.open();
    }
  }

  private detect(): void {
    try {
      const url = new URL(location.href);
      const detected = detectPage(document, url);
      this.adapter = detected?.adapter ?? null;

      if (detected && (isAutoMountHost(url) || this.manualMode)) {
        this.hud.mountLauncher();
      } else {
        this.hud.hideLauncher();
      }
    } catch {
      this.adapter = null;
      this.hud.hideLauncher();
    }
  }

  private onUrlMaybeChanged(): void {
    if (location.href === this.currentUrl) return;
    this.currentUrl = location.href;
    this.cancelScan();
    this.hud.close();
    this.detect();
  }

  private async open(): Promise<void> {
    try {
      this.settings = await getSettings();
    } catch {
      this.settings = null;
    }

    this.detect();
    if (!this.adapter) {
      this.hud.showEmpty(
        "This page doesn't look like a product or video page. Try a TikTok video, TikTok Shop product, Shopify product page, or Amazon listing.",
      );
      return;
    }

    const context = this.adapter.extract(document, new URL(location.href));
    await this.startScan(false, context);
  }

  private async startScan(
    forceDemo: boolean,
    existingContext?: PageContext,
  ): Promise<void> {
    let context = existingContext;
    if (!context) {
      if (!this.adapter) {
        this.hud.showEmpty();
        return;
      }
      context = this.adapter.extract(document, new URL(location.href));
    }

    if (!context) return;

    this.cancelScan();
    this.lastResult = null;
    this.scanId = createId();
    this.hud.openScanning(context);

    const request = {
      scanId: this.scanId,
      context,
      forceDemo,
      client: {
        version: EXTENSION_VERSION,
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    try {
      const response = (await chrome.runtime.sendMessage({
        type: "SCAN_REQUEST",
        request,
      })) as RuntimeResponse | undefined;

      if (response && response.ok === false) {
        this.hud.showError(response.error, context);
        this.scanId = null;
      }
    } catch (error: unknown) {
      this.hud.showError(
        {
          code: "EXTENSION_CONTEXT",
          message:
            error instanceof Error
              ? error.message
              : "The extension was reloaded. Refresh this page and try again.",
          retryable: true,
        },
        context,
      );
      this.scanId = null;
    }
  }

  private cancelScan(): void {
    if (!this.scanId) return;
    const scanId = this.scanId;
    this.scanId = null;
    void chrome.runtime
      .sendMessage({ type: "SCAN_CANCEL", scanId })
      .catch(() => undefined);
  }

  private cancelAndClose(): void {
    this.cancelScan();
    this.hud.close();
  }

  private handleRuntimeMessage(message: RuntimeMessage): void {
    if (!message || typeof message.type !== "string") return;

    if (message.type === "OPEN_HUD") {
      this.openFromInjection();
      return;
    }

    if (message.type === "SCAN_PROGRESS") {
      if (message.progress.scanId === this.scanId) {
        this.hud.updateProgress(message.progress);
      }
      return;
    }

    if (message.type === "SCAN_COMPLETE") {
      if (message.result.scanId === this.scanId) {
        this.lastResult = message.result;
        this.scanId = null;
        this.hud.showResult(message.result);
      }
      return;
    }

    if (message.type === "SCAN_ERROR") {
      if (message.scanId === this.scanId) {
        this.scanId = null;
        this.hud.showError(
          message.error,
          this.adapter
            ? this.adapter.extract(document, new URL(location.href))
            : null,
        );
      }
    }
  }

  private async submitLead(input: LeadInput): Promise<SaveLeadResult> {
    if (!this.lastResult) {
      return {
        ok: false,
        message: "The scan result expired. Run the scan again before requesting a quote.",
      };
    }

    try {
      const response = (await chrome.runtime.sendMessage({
        type: "SAVE_LEAD",
        lead: input,
        result: this.lastResult,
      })) as RuntimeResponse | undefined;

      if (response?.ok) {
        return {
          ok: true,
          message:
            "A sourcing operator can follow up when live mode is configured. In demo mode this stays in your browser.",
        };
      }

      return {
        ok: false,
        message: response?.error?.message ?? "Could not save the request.",
      };
    } catch (error: unknown) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not save the request. Refresh the page and try again.",
      };
    }
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const globalObject = globalThis as GlobalWithController;
if (globalObject[CONTROLLER_KEY]) {
  globalObject[CONTROLLER_KEY]?.openFromInjection();
} else {
  globalObject[CONTROLLER_KEY] = new XRayController();
}
