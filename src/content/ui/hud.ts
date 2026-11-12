import hudCss from "./hud.css";
import tokensCss from "../../styles/tokens.css";
import { createIcon } from "./icons";
import {
  assumptionsForResult,
  computeWaterfall,
} from "../../shared/pricing";
import {
  formatDateTime,
  formatMoney,
  formatPct,
  formatUsd,
  safeImageUrl,
  truncate,
} from "../../shared/format";
import { initialSteps } from "../../shared/steps";
import { isSupportedImageType } from "../../shared/capture";
import { EXTENSION_VERSION } from "../../shared/version";
import type {
  CaptureInput,
  Confidence,
  CostAssumptions,
  CostWaterfall,
  Factory,
  FactoryTier,
  LeadInput,
  PageContext,
  ProgressStep,
  ScanError,
  ScanProgress,
  ScanResult,
  SaveLeadResult,
} from "../../shared/types";

export interface HudCallbacks {
  onLauncherClick: () => void;
  onAnalyzePage: () => void;
  onAnalyzeInput: (input: CaptureInput) => void;
  onNewScan: () => void;
  onCancel: () => void;
  onClose: () => void;
  onOpenOptions: () => void;
  onRetry: (forceDemo: boolean) => void;
  onSubmitLead: (input: LeadInput) => Promise<SaveLeadResult>;
}

type ClosedState = { kind: "closed" };

type CaptureState = {
  kind: "capture";
  context: PageContext | null;
  note?: string;
};

type ScanningState = {
  kind: "scanning";
  context: PageContext;
  progress: ScanProgress | null;
  steps: ProgressStep[];
};

type ResultState = {
  kind: "result";
  context: PageContext;
  result: ScanResult;
  assumptions: CostAssumptions | null;
  waterfall: CostWaterfall | null;
  tab: "overview" | "profit" | "suppliers";
  quoteOpen: boolean;
  quoteFactoryId?: string;
};

type ErrorState = {
  kind: "error";
  context: PageContext | null;
  error: ScanError;
};

type EmptyState = {
  kind: "empty";
  message?: string;
};

type HudState =
  | ClosedState
  | CaptureState
  | ScanningState
  | ResultState
  | ErrorState
  | EmptyState;

interface ElOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  title?: string;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) node.append(child);
  return node;
}

function button(
  text: string,
  className: string,
  onClick: () => void,
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  const node = el("button", {
    className,
    text,
    attrs: { type: "button", ...attrs },
  });
  node.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return node;
}

function range(min: number, max: number): string {
  if (Math.abs(max - min) < 0.005) return formatUsd(min);
  return `${formatUsd(min)}–${formatUsd(max)}`;
}

function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "demo":
      return "Demo data";
    default:
      return "Unknown";
  }
}

function confidenceBadge(confidence: Confidence): HTMLElement {
  return el("span", {
    className: `xray-confidence ${confidence}`,
    text: confidenceLabel(confidence),
  });
}

function platformLabel(context: PageContext): string {
  switch (context.platform) {
    case "tiktok":
      return "TikTok";
    case "shopify":
      return "Shopify";
    case "amazon":
      return "Amazon";
    case "instagram":
      return "Instagram";
    case "youtube":
      return "YouTube";
    case "generic":
      return "Product page";
    default:
      return "Page";
  }
}

function sourceLabel(source: ScanResult["dataSource"]): string {
  switch (source) {
    case "demo":
      return "Demo dataset";
    case "mock":
      return "Mock API";
    case "api":
      return "Live API";
    default:
      return "Unknown";
  }
}

function safePageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function pctOf(value: number, retail: number): number {
  return retail > 0 ? (value / retail) * 100 : 0;
}

function humanizeSourceText(source: string): string {
  return source
    .replace(/dom:\[[^\]]+\]/g, "page price element")
    .replace(/dom:\S+/g, "page price element")
    .replace(/json-ld/gi, "structured product data")
    .replace(/microdata/gi, "product microdata")
    .replace(/\bmeta\b/gi, "page metadata");
}

export class Hud {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private root: HTMLDivElement;
  private callbacks: HudCallbacks;
  private state: HudState = { kind: "closed" };
  private launcherEnabled = false;

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.host = document.createElement("div");
    this.host.setAttribute("data-margin-xray-host", "");
    this.host.style.cssText =
      "all: initial; display: block; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
    document.documentElement.appendChild(this.host);

    this.shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${tokensCss}\n${hudCss}`;
    this.shadow.appendChild(style);

    this.root = el("div", {
      className: "xray-root mx-theme",
      attrs: { role: "region", "aria-label": "Margin X-Ray" },
    });
    this.shadow.appendChild(this.root);
    this.render();
  }

  mountLauncher(): void {
    this.launcherEnabled = true;
    if (this.state.kind === "closed") this.render();
  }

  hideLauncher(): void {
    this.launcherEnabled = false;
    if (this.state.kind === "closed") this.render();
  }

  isOpen(): boolean {
    return this.state.kind !== "closed";
  }

  showCapture(context: PageContext | null, note?: string): void {
    this.state = { kind: "capture", context, ...(note ? { note } : {}) };
    this.render();
  }

  setHostHidden(hidden: boolean): void {
    this.host.style.display = hidden ? "none" : "block";
  }

  openScanning(context: PageContext): void {
    this.state = {
      kind: "scanning",
      context,
      progress: null,
      steps: initialSteps(),
    };
    this.render();
  }

  updateProgress(progress: ScanProgress): void {
    if (this.state.kind !== "scanning") return;
    const steps = this.state.steps;
    const index = steps.findIndex((step) => step.id === progress.stepId);

    if (index === -1) {
      steps.forEach((step) => {
        if (step.status !== "failed") step.status = "done";
      });
      steps.push({
        id: progress.stepId,
        label: progress.message,
        status: "active",
        detail: progress.detail,
      });
    } else {
      steps.forEach((step, stepIndex) => {
        if (step.status === "failed") return;
        step.status =
          stepIndex < index ? "done" : stepIndex === index ? "active" : "pending";
      });
      if (progress.detail) {
        const current = steps[index];
        if (current) current.detail = progress.detail;
      }
    }

    if (progress.percent >= 100) {
      steps.forEach((step) => {
        if (step.status !== "failed") step.status = "done";
      });
    }

    this.state.progress = progress;
    this.render();
  }

  showResult(result: ScanResult): void {
    const assumptions = assumptionsForResult(result);
    const waterfall =
      assumptions && result.product.retailUsd
        ? computeWaterfall(result.product.retailUsd, assumptions)
        : null;

    this.state = {
      kind: "result",
      context: this.state.kind === "scanning" ? this.state.context : {
        platform: result.product.platform,
        pageType: "product",
        url: result.product.sourceUrl,
        title: result.product.title,
        imageUrl: result.product.imageUrl,
        price:
          result.product.retailUsd !== null
            ? {
                amount: result.product.retailUsd,
                currency: "USD",
                source: result.product.retailSource,
              }
            : undefined,
        extractedBy: "result",
        extractedAt: result.generatedAt,
      },
      result,
      assumptions,
      waterfall,
      tab: "overview",
      quoteOpen: false,
    };
    this.render();
  }

  showError(error: ScanError, context: PageContext | null = null): void {
    this.state = { kind: "error", error, context };
    this.render();
  }

  showEmpty(message?: string): void {
    this.state = { kind: "empty", message };
    this.render();
  }

  close(): void {
    this.state = { kind: "closed" };
    this.render();
  }

  destroy(): void {
    this.host.remove();
  }

  private render(): void {
    this.root.replaceChildren();

    switch (this.state.kind) {
      case "closed":
        if (this.launcherEnabled) this.root.append(this.renderLauncher());
        break;
      case "capture":
        this.root.append(this.renderPanel(this.renderCapture()));
        break;
      case "scanning":
        this.root.append(this.renderPanel(this.renderScanning()));
        break;
      case "result":
        this.root.append(this.renderPanel(this.renderResult()));
        break;
      case "error":
        this.root.append(this.renderPanel(this.renderError()));
        break;
      case "empty":
        this.root.append(this.renderPanel(this.renderEmpty()));
        break;
    }
  }

  private renderLauncher(): HTMLElement {
    const launcher = button("", "xray-launcher", () =>
      this.callbacks.onLauncherClick(),
    {
      "aria-label": "Scan this page with Margin X-Ray",
      title: "Scan this page with Margin X-Ray",
    });
    launcher.append(
      el("span", { className: "xray-launcher-mark" }, [createIcon("bolt", 14)]),
      el("span", { text: "Open X-Ray" }),
      el("span", { className: "xray-launcher-dot" }),
    );
    return launcher;
  }

  private renderCapture(): HTMLElement {
    const state = this.state;
    if (state.kind !== "capture") return el("div");

    const content = el("div", { className: "xray-content xray-capture" });
    content.append(
      el("div", { className: "xray-capture-intro" }, [
        el("div", { className: "xray-eyebrow", text: "Product research" }),
        el("h2", { className: "xray-capture-title", text: "Capture product" }),
        el("p", {
          className: "xray-capture-lede",
          text: "Choose a source. X-Ray will identify the product and estimate the opportunity.",
        }),
      ]),
    );

    if (state.note) {
      content.append(
        el("div", { className: "xray-banner info" }, [
          createIcon("info", 14),
          el("span", { text: state.note }),
        ]),
      );
    }

    const context = state.context;
    if (context) {
      const price = context.price
        ? formatMoney(context.price.amount, context.price.currency)
        : "No price found";
      const pageCard = el("div", { className: "xray-capture-page" }, [
        this.renderThumb(context.title, context.imageUrl),
        el("div", { className: "xray-capture-page-meta" }, [
          el("div", {
            className: "xray-eyebrow",
            text: `${platformLabel(context)} · ${
              context.pageType === "video" ? "Video" : "Product page"
            }`,
          }),
          el("div", { className: "xray-capture-page-title", text: context.title }),
          el("div", { className: "xray-capture-page-price", text: price }),
        ]),
        button(
          "Analyze this page",
          "xray-btn primary xray-capture-page-btn",
          () => this.callbacks.onAnalyzePage(),
        ),
      ]);
      content.append(pageCard);
    } else {
      content.append(
        el("div", { className: "xray-capture-empty" }, [
          createIcon("alert", 16),
          el("span", {
            text: "This tab is not a recognized product or video page. Use a link, an image, or a screenshot below.",
          }),
        ]),
      );
    }

    content.append(
      el("div", { className: "xray-capture-label", text: "Choose a source" }),
    );

    const options = el("div", { className: "xray-capture-options" });

    const linkInput = el("input", {
      className: "xray-input",
      attrs: {
        type: "url",
        placeholder: "https://www.tiktok.com/@brand/video/…",
        "aria-label": "Product, video or image link",
      },
    });
    const linkError = el("div", {
      className: "xray-capture-error",
      attrs: { role: "alert" },
    });
    const linkPanel = el("div", { className: "xray-capture-expand" });
    linkPanel.hidden = true;
    const submitLink = (): void => {
      const value = linkInput.value.trim();
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Only http and https links are supported.");
        }
        linkError.textContent = "";
        if (/\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) {
          this.callbacks.onAnalyzeInput({
            kind: "image",
            dataUrl: url.toString(),
            fileName: url.pathname.split("/").pop() || "pasted-image",
          });
          return;
        }
        this.callbacks.onAnalyzeInput({ kind: "link", url: url.toString() });
      } catch {
        linkError.textContent = "Enter a valid product or video URL.";
        linkInput.focus();
      }
    };
    linkInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitLink();
      }
    });
    linkPanel.append(
      linkInput,
      el("div", { className: "xray-capture-expand-row" }, [
        button("Analyze link", "xray-btn primary", submitLink),
        linkError,
      ]),
    );
    const linkOption = button("", "xray-capture-option", () => {
      linkPanel.hidden = !linkPanel.hidden;
      if (!linkPanel.hidden) linkInput.focus();
    });
    linkOption.append(
      this.renderCaptureOptionContent(
        "link",
        "Paste link",
        "TikTok, Amazon, Shopify or image URL",
      ),
    );

    const imageInput = el("input", {
      attrs: {
        type: "file",
        accept: "image/jpeg,image/png,image/webp,image/gif",
        "aria-label": "Upload a product image",
      },
    });
    imageInput.style.display = "none";
    const imagePanel = el("div", { className: "xray-capture-expand" });
    imagePanel.hidden = true;
    const imageOption = button("", "xray-capture-option", () => imageInput.click());
    imageOption.append(
      this.renderCaptureOptionContent(
        "image",
        "Upload image",
        "JPG, PNG or WebP, up to 8 MB",
      ),
    );
    imageInput.addEventListener("change", () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      imagePanel.replaceChildren();
      imagePanel.hidden = false;
      if (!isSupportedImageType(file.type)) {
        imagePanel.append(
          el("div", {
            className: "xray-capture-error",
            text: "Use a JPG, PNG or WebP image.",
          }),
        );
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        imagePanel.append(
          el("div", {
            className: "xray-capture-error",
            text: "The image is larger than 8 MB. Use a smaller file.",
          }),
        );
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) return;
        const preview = el("img", {
          className: "xray-capture-preview",
          attrs: { src: dataUrl, alt: "Selected product" },
        });
        imagePanel.replaceChildren(
          el("div", { className: "xray-capture-preview-row" }, [
            preview,
            el("div", {}, [
              el("div", { className: "xray-capture-file", text: file.name }),
              el("div", {
                className: "xray-capture-file-note",
                text: "The server will isolate the product before searching.",
              }),
            ]),
          ]),
          button("Analyze image", "xray-btn primary", () =>
            this.callbacks.onAnalyzeInput({
              kind: "image",
              dataUrl,
              fileName: file.name,
            }),
          ),
        );
      });
      reader.readAsDataURL(file);
    });

    const screenshotOption = button(
      "",
      "xray-capture-option",
      () => this.callbacks.onAnalyzeInput({ kind: "screenshot" }),
    );
    screenshotOption.append(
      this.renderCaptureOptionContent(
        "camera",
        "Capture screen",
        "Use the visible page or current video frame",
      ),
    );

    options.append(linkOption, imageOption, screenshotOption);
    content.append(options, linkPanel, imagePanel, imageInput);
    content.append(
      el("div", { className: "xray-capture-footnote" }, [
        createIcon("flask", 12),
        el("span", {
          text: "Demo mode is on by default. No supplier API is called until live mode is configured.",
        }),
      ]),
    );

    return content;
  }

  private renderCaptureOptionContent(
    icon: "link" | "image" | "camera",
    title: string,
    detail: string,
  ): DocumentFragment {
    const fragment = document.createDocumentFragment();
    fragment.append(
      el("span", { className: "xray-capture-option-icon" }, [createIcon(icon, 18)]),
      el("span", { className: "xray-capture-option-text" }, [
        el("strong", { text: title }),
        el("span", { text: detail }),
      ]),
      el("span", { className: "xray-capture-option-arrow" }, [createIcon("chevron", 14)]),
    );
    return fragment;
  }

  private renderThumb(title: string, imageUrl?: string): HTMLElement {
    const thumb = el("div", { className: "xray-thumb" });
    const fallback = el("span", {
      text: (title.trim()[0] ?? "?").toUpperCase(),
    });
    thumb.append(fallback);
    const safe = safeImageUrl(imageUrl);
    if (!safe) return thumb;
    const img = el("img", {
      attrs: {
        src: safe,
        alt: "",
        referrerpolicy: "no-referrer",
        loading: "lazy",
      },
    });
    img.addEventListener("load", () => fallback.remove());
    img.addEventListener("error", () => img.remove());
    thumb.append(img);
    return thumb;
  }

  private renderPanel(content: HTMLElement): HTMLElement {
    const panel = el("div", {
      className: "xray-panel",
      attrs: {
        role: "dialog",
        "aria-label": "Margin X-Ray report",
        "aria-modal": "false",
      },
    });
    panel.append(this.renderHeader(), content, this.renderFooter());
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.handleClose();
      }
    });
    return panel;
  }

  private renderHeader(): HTMLElement {
    const brand = el("div", { className: "xray-brand" }, [
      el("div", { className: "xray-logo", text: "X" }),
      el("div", { className: "xray-brand-text" }, [
        el("div", { className: "xray-brand-name", text: "Margin X-Ray" }),
        el("div", { className: "xray-brand-sub", text: "Factory cost lens" }),
      ]),
    ]);

    const settings = button(
      "",
      "xray-icon-btn",
      () => this.callbacks.onOpenOptions(),
      {
        "aria-label": "Open Margin X-Ray settings",
        title: "Settings",
      },
    );
    settings.append(createIcon("settings", 15));

    const close = button("", "xray-icon-btn", () => this.handleClose(), {
      "aria-label": "Close Margin X-Ray",
      title: "Close",
    });
    close.append(createIcon("x", 15));

    const actions = el("div", { className: "xray-header-actions" });
    if (this.state.kind === "scanning" || this.state.kind === "result") {
      const newScan = button("", "xray-icon-btn", () =>
        this.callbacks.onNewScan(),
      {
        "aria-label": "Start a new scan",
        title: "New scan",
      });
      newScan.append(createIcon("scan", 15));
      actions.append(newScan);
    }
    actions.append(settings, close);

    return el("div", { className: "xray-header" }, [brand, actions]);
  }

  private renderFooter(): HTMLElement {
    return el("div", { className: "xray-footer" }, [
      el("span", { text: `v${EXTENSION_VERSION}` }),
      el("span", {
        text: "Estimates, not a quote · assumptions shown",
      }),
    ]);
  }

  private renderScanning(): HTMLElement {
    const state = this.state;
    if (state.kind !== "scanning") return el("div");

    const content = el("div", { className: "xray-content" });
    content.append(this.renderProductCard(state.context));

    const progress = el("div", { className: "xray-progress" });
    const percent = Math.max(0, Math.min(100, state.progress?.percent ?? 0));
    const progressLabel =
      state.progress?.message ?? "Capturing page context and starting the scan…";

    progress.append(
      el("div", { className: "xray-progress-top" }, [
        el("div", { className: "xray-progress-label", text: progressLabel }),
        el("div", {
          className: "xray-progress-pct",
          text: `${Math.round(percent)}%`,
        }),
      ]),
      el("div", { className: "xray-progress-track" }, [
        el("div", {
          className: "xray-progress-fill",
          attrs: { style: `width:${percent}%` },
        }),
      ]),
      this.renderSteps(state.steps),
    );

    content.append(progress);
    content.append(
      el("div", { className: "xray-banner info" }, [
        createIcon("clock", 14),
        el("span", {
          text: "You can cancel at any time. Demo mode never calls an external API.",
        }),
      ]),
    );
    content.append(
      button("Cancel scan", "xray-btn ghost wide", () =>
        this.callbacks.onCancel(),
      ),
    );

    return content;
  }

  private renderSteps(steps: ProgressStep[]): HTMLElement {
    const list = el("div", { className: "xray-steps" });
    for (const step of steps) {
      const dot = el("span", { className: "xray-step-dot" });
      if (step.status === "done") dot.append(createIcon("check", 8));
      if (step.status === "failed") dot.append(createIcon("x", 8));

      const row = el("div", { className: `xray-step ${step.status}` }, [
        dot,
        el("span", {}, [
          el("span", { text: step.label }),
          ...(step.detail
            ? [el("span", { className: "xray-step-detail", text: step.detail })]
            : []),
        ]),
      ]);
      list.append(row);
    }
    return list;
  }

  private renderProductCard(
    context: PageContext,
    result?: ScanResult,
  ): HTMLElement {
    const title = result?.product.title ?? context.title ?? "Untitled product";
    const platform = result?.product.platform ?? context.platform;
    const pageType = context.pageType === "video" ? "Video" : "Product";
    const imageUrl = safeImageUrl(result?.product.imageUrl ?? context.imageUrl);

    const thumb = this.renderThumb(title, imageUrl);

    const priceValue = result
      ? result.product.retailUsd !== null
        ? formatUsd(result.product.retailUsd)
        : "Not found"
      : context.price
        ? formatMoney(context.price.amount, context.price.currency)
        : "Not found";

    const priceNote = result
      ? humanizeSourceText(result.product.retailSource)
      : context.price
        ? `Source: ${humanizeSourceText(context.price.source)}`
        : "No price found on this page.";

    const pageUrl = safePageUrl(result?.product.sourceUrl ?? context.url);
    const sub = el("div", { className: "xray-sub" });
    sub.append(
      el("span", { className: "xray-price-inline", text: priceValue }),
    );
    if (pageUrl) {
      const link = el("a", {
        className: "xray-link",
        text: "Open page",
        attrs: {
          href: pageUrl,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      });
      link.append(createIcon("external", 10));
      sub.append(link);
    }

    return el("div", { className: "xray-product" }, [
      thumb,
      el("div", { className: "xray-product-meta" }, [
        el("div", {
          className: "xray-eyebrow",
          text: `${platformLabel({ ...context, platform })} · ${pageType}`,
        }),
        el("div", { className: "xray-title", text: title }),
        sub,
        el("div", { className: "xray-price-note", text: priceNote }),
      ]),
    ]);
  }

  private renderResult(): HTMLElement {
    const state = this.state;
    if (state.kind !== "result") return el("div");

    const content = el("div", { className: "xray-content xray-result" });
    content.append(this.renderResultTabs(state));
    if (state.tab === "profit") {
      content.append(this.renderProfit(state));
    } else if (state.tab === "suppliers") {
      content.append(this.renderSuppliers(state));
    } else {
      content.append(this.renderOverview(state));
    }
    return content;
  }

  private renderResultTabs(state: ResultState): HTMLElement {
    const tabs = el("div", {
      className: "xray-tabs",
      attrs: { role: "tablist", "aria-label": "Report sections" },
    });
    const items: Array<{
      id: ResultState["tab"];
      label: string;
      count?: number;
    }> = [
      { id: "overview", label: "Overview" },
      { id: "profit", label: "Profit" },
      {
        id: "suppliers",
        label: "Suppliers",
        count: state.result.factories.length,
      },
    ];

    for (const item of items) {
      const active = state.tab === item.id;
      const tab = button("", `xray-tab ${active ? "active" : ""}`.trim(), () =>
        this.switchTab(item.id),
      {
        role: "tab",
        "aria-selected": active ? "true" : "false",
      });
      tab.append(el("span", { text: item.label }));
      if (item.count !== undefined) {
        tab.append(el("span", { className: "xray-tab-count", text: String(item.count) }));
      }
      tabs.append(tab);
    }
    return tabs;
  }

  private switchTab(tab: ResultState["tab"]): void {
    if (this.state.kind !== "result") return;
    this.state.tab = tab;
    this.render();
  }

  private renderOverview(state: ResultState): HTMLElement {
    const { result, context } = state;
    const body = el("div", { className: "xray-tab-panel" });

    if (result.dataSource !== "api") {
      body.append(
        el(
          "div",
          {
            className: `xray-banner ${
              result.dataSource === "demo" ? "demo" : "info"
            }`,
          },
          [
            createIcon(result.dataSource === "demo" ? "flask" : "plug", 14),
            el("span", {}, [
              el("strong", {
                text: result.dataSource === "demo" ? "DEMO DATA" : "MOCK API",
              }),
              el("span", {
                text:
                  result.dataSource === "demo"
                    ? " — sample dataset for UI review. Not a real supplier quote."
                    : " — local mock server. Replace it with the real pipeline before launch.",
              }),
            ]),
          ],
        ),
      );
    }

    body.append(this.renderProductCard(context, result));

    if (context.warnings?.length) {
      body.append(
        el("div", { className: "xray-banner info" }, [
          createIcon("info", 14),
          el("span", { text: truncate(context.warnings[0] ?? "", 180) }),
        ]),
      );
    }

    body.append(this.renderOverviewMetrics(state));
    body.append(this.renderFunnelCard(result));

    if (result.qualityWarning) {
      body.append(
        el("div", { className: "xray-banner warn" }, [
          createIcon("alert", 14),
          el("span", {}, [
            el("strong", { text: "Quality trap: " }),
            el("span", { text: result.qualityWarning }),
          ]),
        ]),
      );
    }

    body.append(
      el("div", { className: "xray-next-actions" }, [
        button("See profit breakdown", "xray-btn primary", () =>
          this.switchTab("profit"),
        ),
        button("View supplier matches", "xray-btn secondary", () =>
          this.switchTab("suppliers"),
        ),
      ]),
    );
    body.append(this.renderSources(result, context));
    return body;
  }

  private renderOverviewMetrics(state: ResultState): HTMLElement {
    const { result, waterfall } = state;
    const retail = result.product.retailUsd;
    const landed = waterfall?.landedUsd ??
      (result.priceRange
        ? (result.priceRange.fobMinUsd + result.priceRange.fobMaxUsd) / 2
        : null);
    const margin = waterfall?.netMarginPct ?? null;
    const metrics = el("div", { className: "xray-kpi-card" });
    metrics.append(
      el("div", { className: "xray-kpi-grid" }, [
        this.renderKpi("Retail price", retail === null ? "—" : formatUsd(retail), "page listing"),
        this.renderKpi("Est. landed", landed === null ? "—" : formatUsd(landed), "modelled cost"),
        this.renderKpi(
          "Net margin",
          margin === null ? "—" : formatPct(margin),
          waterfall ? "after fees & returns" : "needs cost inputs",
          margin !== null && margin < 0 ? "negative" : "positive",
        ),
      ]),
      el("div", { className: "xray-kpi-footer" }, [
        el("span", { text: result.priceRange ? confidenceLabel(result.priceRange.confidence) : "No cost range" }),
        el("span", { text: "Estimates update in Profit" }),
      ]),
    );
    return metrics;
  }

  private renderKpi(
    label: string,
    value: string,
    note: string,
    tone?: "positive" | "negative",
  ): HTMLElement {
    return el("div", { className: "xray-kpi" }, [
      el("div", { className: "xray-kpi-label", text: label }),
      el("div", { className: `xray-kpi-value ${tone ?? ""}`.trim(), text: value }),
      el("div", { className: "xray-kpi-note", text: note }),
    ]);
  }

  private renderPriceCard(result: ScanResult): HTMLElement {
    const priceGrid = el("div", { className: "xray-card" });
    priceGrid.append(
      el("div", { className: "xray-section-head" }, [
        el("div", { className: "xray-section-title", text: "Price comparison" }),
        el("div", {
          className: "xray-section-note",
          text: result.priceRange
            ? confidenceLabel(result.priceRange.confidence)
            : "No range returned",
        }),
      ]),
      el("div", { className: "xray-price-grid" }, [
        el("div", { className: "xray-price-box red" }, [
          el("div", { className: "xray-price-label", text: "Page price" }),
          el("div", {
            className: "xray-price-value",
            text:
              result.product.retailUsd !== null
                ? formatUsd(result.product.retailUsd)
                : "Not found",
          }),
          el("div", {
            className: "xray-price-note",
            text: humanizeSourceText(result.product.retailSource),
          }),
        ]),
        el("div", { className: "xray-price-box green" }, [
          el("div", {
            className: "xray-price-label",
            text: "Estimated ex-works",
          }),
          el("div", {
            className: result.priceRange
              ? "xray-price-value range"
              : "xray-price-value",
            text: result.priceRange
              ? range(result.priceRange.fobMinUsd, result.priceRange.fobMaxUsd)
              : "Insufficient data",
          }),
          el("div", {
            className: "xray-price-note",
            text:
              result.priceRange?.basis ??
              "No verified factory range was returned. We do not fill a fallback number.",
          }),
        ]),
      ]),
    );

    if (result.priceRange) {
      priceGrid.append(
        el(
          "div",
          { className: "xray-price-note", attrs: { style: "margin-top:9px" } },
          [
            el("strong", {
              text: `Gross margin on ex-works: ${formatPct(
                result.product.retailUsd
                  ? ((result.product.retailUsd -
                      (result.priceRange.fobMinUsd +
                        result.priceRange.fobMaxUsd) /
                        2) /
                      result.product.retailUsd) *
                      100
                  : null,
              )}. `,
            }),
            el("span", {
              text: "That is not what the seller keeps. Open Profit for the landed-cost model.",
            }),
          ],
        ),
      );
    }

    return priceGrid;
  }

  private renderProfit(state: ResultState): HTMLElement {
    const { result, assumptions, waterfall } = state;
    const body = el("div", { className: "xray-tab-panel" });
    body.append(
      el("div", { className: "xray-section-head xray-section-head-page" }, [
        el("div", {
          className: "xray-section-title",
          text: "Landed cost & margin",
        }),
        el("div", {
          className: "xray-section-note",
          text: "Edit assumptions to test the model",
        }),
      ]),
    );
    body.append(this.renderWaterfallCard(result, assumptions, waterfall));
    body.append(
      el("div", { className: "xray-next-actions" }, [
        button("View supplier matches", "xray-btn primary", () =>
          this.switchTab("suppliers"),
        ),
        button("Back to overview", "xray-btn ghost", () =>
          this.switchTab("overview"),
        ),
      ]),
    );
    return body;
  }

  private renderSuppliers(state: ResultState): HTMLElement {
    const body = el("div", { className: "xray-tab-panel" });
    body.append(this.renderFactories(state));
    if (!state.quoteOpen) {
      body.append(
        button("Request a verified quote", "xray-btn primary wide", () =>
          this.openQuote(),
        ),
      );
    } else {
      body.append(this.renderQuoteForm(state));
    }
    body.append(
      el("div", { className: "xray-next-actions" }, [
        button("Back to profit", "xray-btn ghost", () =>
          this.switchTab("profit"),
        ),
        button("Back to overview", "xray-btn ghost", () =>
          this.switchTab("overview"),
        ),
      ]),
    );
    return body;
  }

  private renderWaterfallCard(
    result: ScanResult,
    assumptions: CostAssumptions | null,
    waterfall: CostWaterfall | null,
  ): HTMLElement {
    const card = el("div", { className: "xray-card accent" });

    const head = el("div", { className: "xray-section-head" }, [
      el("div", { className: "xray-section-title", text: "What the seller keeps" }),
      el("div", {
        className: `xray-chip ${waterfall && waterfall.netUsd < 0 ? "red" : "green"}`,
        attrs: { "data-role": "net-chip" },
        text: waterfall
          ? `Net ${formatUsd(waterfall.netUsd)} · ${formatPct(waterfall.netMarginPct)}`
          : "No model",
      }),
    ]);
    card.append(head);

    if (!assumptions || !waterfall || !result.product.retailUsd) {
      card.append(
        el("div", { className: "xray-banner info" }, [
          createIcon("info", 14),
          el("span", {
            text: "Not enough data to model landed cost and margin. Live mode should return the assumptions it used.",
          }),
        ]),
      );
      return card;
    }

    const body = el("div", { attrs: { "data-role": "waterfall-body" } });
    body.append(this.renderWaterfallBody(result.product.retailUsd, assumptions, waterfall));
    card.append(body);
    card.append(this.renderAssumptionsEditor(assumptions));
    return card;
  }

  private renderWaterfallBody(
    retail: number,
    assumptions: CostAssumptions,
    waterfall: CostWaterfall,
  ): DocumentFragment {
    const fragment = document.createDocumentFragment();

    const segments = [
      { className: "landed", amount: waterfall.landedUsd, label: "Landed cost" },
      {
        className: "fees",
        amount:
          waterfall.platformFeeUsd +
          waterfall.affiliateUsd +
          waterfall.paymentUsd,
        label: "Platform, affiliate & payment fees",
      },
      {
        className: "fulfillment",
        amount: waterfall.fulfillmentUsd,
        label: "Fulfillment",
      },
      { className: "returns", amount: waterfall.returnsUsd, label: "Returns reserve" },
      { className: "ads", amount: waterfall.adUsd, label: "Ads" },
      {
        className: waterfall.netUsd >= 0 ? "profit" : "loss",
        amount: Math.abs(waterfall.netUsd),
        label: waterfall.netUsd >= 0 ? "Net before tax" : "Modeled loss",
      },
    ].filter((segment) => segment.amount > 0);

    const total = segments.reduce((sum, segment) => sum + segment.amount, 0);
    if (total > 0) {
      const bar = el("div", {
        className: "xray-bar",
        attrs: {
          role: "img",
          "aria-label": `Cost breakdown from ${formatUsd(retail)} retail: ${formatUsd(
            waterfall.landedUsd,
          )} landed, ${formatUsd(
            waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd,
          )} fees, ${formatUsd(waterfall.netUsd)} net before tax.`,
        },
      });
      for (const segment of segments) {
        bar.append(
          el("div", {
            className: `xray-bar-segment ${segment.className}`,
            attrs: {
              style: `width:${(segment.amount / total) * 100}%`,
              title: `${segment.label}: ${formatUsd(segment.amount)}`,
            },
          }),
        );
      }
      fragment.append(bar);
    }

    type WaterfallRow = {
      label: string;
      value: number;
      pct: number;
      className?: string;
    };

    const makeRow = (row: WaterfallRow): HTMLElement =>
      el("div", { className: `xray-row ${row.className ?? ""}`.trim() }, [
        el("div", { className: "xray-row-label", text: row.label }),
        el("div", {
          className: "xray-row-value",
          text: formatUsd(row.value),
        }),
        el("div", { className: "xray-row-pct", text: formatPct(row.pct) }),
      ]);

    const fees =
      waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd;
    const fulfillmentAndReturns =
      waterfall.fulfillmentUsd + waterfall.returnsUsd;

    const summaryRows: WaterfallRow[] = [
      { label: "Retail price", value: waterfall.retailUsd, pct: 100 },
      {
        label: "Ex-works unit price",
        value: waterfall.fobUsd,
        pct: pctOf(waterfall.fobUsd, retail),
      },
      {
        label: "Landed cost (freight + duty)",
        value: waterfall.landedUsd,
        pct: pctOf(waterfall.landedUsd, retail),
      },
      {
        label: "Platform, affiliate & payment",
        value: fees,
        pct: pctOf(fees, retail),
      },
      {
        label: "Fulfillment & returns",
        value: fulfillmentAndReturns,
        pct: pctOf(fulfillmentAndReturns, retail),
      },
      {
        label: "Contribution",
        value: waterfall.contributionUsd,
        pct: waterfall.contributionMarginPct,
        className: "subtotal",
      },
      { label: "Ads", value: waterfall.adUsd, pct: pctOf(waterfall.adUsd, retail) },
      {
        label: "Net before tax",
        value: waterfall.netUsd,
        pct: waterfall.netMarginPct,
        className: `total ${waterfall.netUsd < 0 ? "negative" : ""}`.trim(),
      },
    ];

    for (const row of summaryRows) fragment.append(makeRow(row));

    const detailRows: WaterfallRow[] = [
      {
        label: "Freight",
        value: waterfall.shippingUsd,
        pct: pctOf(waterfall.shippingUsd, retail),
      },
      {
        label: "Duty",
        value: waterfall.dutyUsd,
        pct: pctOf(waterfall.dutyUsd, retail),
      },
      {
        label: "Platform fee",
        value: waterfall.platformFeeUsd,
        pct: pctOf(waterfall.platformFeeUsd, retail),
      },
      {
        label: "Creator / affiliate",
        value: waterfall.affiliateUsd,
        pct: pctOf(waterfall.affiliateUsd, retail),
      },
      {
        label: "Payment fee",
        value: waterfall.paymentUsd,
        pct: pctOf(waterfall.paymentUsd, retail),
      },
      {
        label: "Fulfillment",
        value: waterfall.fulfillmentUsd,
        pct: pctOf(waterfall.fulfillmentUsd, retail),
      },
      {
        label: "Returns reserve",
        value: waterfall.returnsUsd,
        pct: pctOf(waterfall.returnsUsd, retail),
      },
    ];

    const details = el("details", {
      className: "xray-waterfall-details",
      attrs: { "data-role": "waterfall-details" },
    });
    details.append(el("summary", { text: "Show full line items" }));
    const detailList = el("div", { className: "xray-waterfall-detail-rows" });
    for (const row of detailRows) detailList.append(makeRow(row));
    details.append(detailList);
    fragment.append(details);

    if (assumptions.fobUsd <= 0) {
      fragment.append(
        el("div", { className: "xray-banner warn" }, [
          createIcon("alert", 14),
          el("span", {
            text: "Ex-works price is zero. Enter a real unit cost before trusting this margin.",
          }),
        ]),
      );
    }

    return fragment;
  }

  private renderAssumptionsEditor(assumptions: CostAssumptions): HTMLElement {
    const details = el("details", { className: "xray-assumptions" });
    details.append(
      el("summary", { text: "Edit assumptions (illustrative defaults)" }),
    );

    const fields: Array<{
      key: keyof CostAssumptions;
      label: string;
      step: string;
      value: number;
    }> = [
      { key: "fobUsd", label: "Ex-works $/unit", step: "0.01", value: assumptions.fobUsd },
      {
        key: "shippingPerUnitUsd",
        label: "Freight $/unit",
        step: "0.01",
        value: assumptions.shippingPerUnitUsd,
      },
      { key: "dutyRatePct", label: "Duty %", step: "0.1", value: assumptions.dutyRatePct },
      {
        key: "platformFeePct",
        label: "Platform fee %",
        step: "0.1",
        value: assumptions.platformFeePct,
      },
      {
        key: "affiliatePct",
        label: "Affiliate %",
        step: "0.1",
        value: assumptions.affiliatePct,
      },
      {
        key: "paymentPct",
        label: "Payment fee %",
        step: "0.1",
        value: assumptions.paymentPct,
      },
      {
        key: "fulfillmentPerUnitUsd",
        label: "Fulfillment $/unit",
        step: "0.01",
        value: assumptions.fulfillmentPerUnitUsd,
      },
      {
        key: "returnRatePct",
        label: "Returns %",
        step: "0.1",
        value: assumptions.returnRatePct,
      },
      { key: "adPct", label: "Ads %", step: "0.1", value: assumptions.adPct },
    ];

    const grid = el("div", { className: "xray-assumption-grid" });
    for (const field of fields) {
      const input = el("input", {
        className: "xray-input",
        attrs: {
          type: "number",
          min: "0",
          step: field.step,
          inputmode: "decimal",
          "aria-label": field.label,
        },
      });
      input.dataset.assumption = field.key;
      input.value = String(field.value);
      grid.append(
        el("div", { className: "xray-field" }, [
          el("label", { text: field.label }),
          input,
        ]),
      );
    }

    details.append(grid);
    details.append(
      el("div", { className: "xray-actions" }, [
        button("Reset assumptions", "xray-btn ghost", () => this.resetAssumptions()),
        el("div", {
          className: "xray-section-note",
          text: "Edit and press Tab to recompute.",
        }),
      ]),
    );
    details.addEventListener("change", () => this.handleAssumptionChange());
    return details;
  }

  private handleAssumptionChange(): void {
    if (this.state.kind !== "result") return;
    if (!this.state.assumptions || !this.state.result.product.retailUsd) return;

    const next: CostAssumptions = { ...this.state.assumptions };
    const inputs = this.root.querySelectorAll<HTMLInputElement>(
      "input[data-assumption]",
    );
    for (const input of inputs) {
      const key = input.dataset.assumption as keyof CostAssumptions | undefined;
      if (!key) continue;
      const value = Number.parseFloat(input.value);
      if (Number.isFinite(value) && value >= 0) {
        next[key] = value;
      } else {
        input.value = String(next[key]);
      }
    }

    this.state.assumptions = next;
    this.state.waterfall = computeWaterfall(
      this.state.result.product.retailUsd,
      next,
    );
    this.updateWaterfallDom();
  }

  private resetAssumptions(): void {
    if (this.state.kind !== "result") return;
    const reset = assumptionsForResult(this.state.result);
    if (!reset) return;
    this.state.assumptions = reset;
    this.state.waterfall = this.state.result.product.retailUsd
      ? computeWaterfall(this.state.result.product.retailUsd, reset)
      : null;

    const inputs = this.root.querySelectorAll<HTMLInputElement>(
      "input[data-assumption]",
    );
    for (const input of inputs) {
      const key = input.dataset.assumption as keyof CostAssumptions | undefined;
      if (key) input.value = String(reset[key]);
    }
    this.root.querySelectorAll(".xray-tier.active").forEach((node) =>
      node.classList.remove("active"),
    );
    this.updateWaterfallDom();
  }

  private updateWaterfallDom(): void {
    if (this.state.kind !== "result") return;
    const { assumptions, waterfall, result } = this.state;
    if (!assumptions || !waterfall || !result.product.retailUsd) return;

    const body = this.root.querySelector('[data-role="waterfall-body"]');
    if (body) {
      const previousDetails =
        this.root.querySelector<HTMLDetailsElement>(
          '[data-role="waterfall-details"]',
        );
      const wasOpen = previousDetails?.open ?? false;
      body.replaceChildren(
        this.renderWaterfallBody(result.product.retailUsd, assumptions, waterfall),
      );
      if (wasOpen) {
        const nextDetails = this.root.querySelector<HTMLDetailsElement>(
          '[data-role="waterfall-details"]',
        );
        if (nextDetails) nextDetails.open = true;
      }
    }

    const chip = this.root.querySelector('[data-role="net-chip"]');
    if (chip) {
      chip.className = `xray-chip ${waterfall.netUsd < 0 ? "red" : "green"}`;
      chip.textContent = `Net ${formatUsd(waterfall.netUsd)} · ${formatPct(
        waterfall.netMarginPct,
      )}`;
    }
  }

  private renderFunnelCard(result: ScanResult): HTMLElement {
    const card = el("div", { className: "xray-card" });
    card.append(
      el("div", { className: "xray-section-head" }, [
        el("div", { className: "xray-section-title", text: "Supply-chain filter" }),
        el("div", {
          className: "xray-section-note",
          text: "Reasons, not a subtraction trick",
        }),
      ]),
    );

    if (!result.funnel || result.funnel.scanned <= 0) {
      card.append(
        el("div", { className: "xray-banner info" }, [
          createIcon("info", 14),
          el("span", { text: "No live funnel data was returned for this scan." }),
        ]),
      );
      return card;
    }

    const chips = el("div", { className: "xray-funnel" });
    chips.append(
      el("span", { className: "xray-chip" }, [
        el("span", { text: "Scanned " }),
        el("strong", { text: String(result.funnel.scanned) }),
      ]),
    );
    for (const reason of result.funnel.excludedByReason) {
      chips.append(
        el("span", { className: "xray-chip red" }, [
          el("span", { text: `${reason.reason} ` }),
          el("strong", { text: String(reason.count) }),
        ]),
      );
    }
    chips.append(
      el("span", { className: "xray-chip green" }, [
        el("span", { text: "Verified " }),
        el("strong", { text: String(result.funnel.verified) }),
      ]),
    );
    card.append(chips);
    card.append(
      el("div", {
        className: "xray-section-note",
        attrs: { style: "margin-top:9px;line-height:1.5" },
        text: result.funnel.note,
      }),
    );
    return card;
  }

  private renderFactories(state: ResultState): HTMLElement {
    const card = el("div", { className: "xray-card xray-supplier-card" });
    card.append(
      el("div", { className: "xray-section-head" }, [
        el("div", {
          className: "xray-section-title",
          text: "Supplier matches",
        }),
        el("div", {
          className: "xray-section-note",
          text: `${Math.min(3, state.result.factories.length)} results · compare MOQ`,
        }),
      ]),
    );

    if (!state.result.factories.length) {
      card.append(
        el("div", { className: "xray-empty" }, [
          el("div", { className: "xray-empty-icon" }, [createIcon("factory", 20)]),
          el("strong", { text: "No verified candidates" }),
          el("div", {
            text: "Live mode should return “insufficient data” here instead of a fallback factory or price.",
          }),
        ]),
      );
      return card;
    }

    const table = el("div", {
      className: "xray-supplier-table",
      attrs: { role: "table", "aria-label": "Supplier matches" },
    });
    table.append(
      el("div", { className: "xray-supplier-table-head", attrs: { role: "row" } }, [
        el("span", { text: "Supplier", attrs: { role: "columnheader" } }),
        el("span", { text: "MOQ tiers", attrs: { role: "columnheader" } }),
        el("span", { text: "Price", attrs: { role: "columnheader" } }),
      ]),
    );
    for (const factory of state.result.factories.slice(0, 3)) {
      table.append(this.renderFactory(factory, state));
    }
    card.append(table);
    card.append(
      el("div", { className: "xray-supplier-note" }, [
        createIcon("info", 12),
        el("span", { text: "Names are masked. Open a row for evidence and request a quote." }),
      ]),
    );
    return card;
  }

  private renderFactory(factory: Factory, state: ResultState): HTMLElement {
    const card = el("div", { className: "xray-factory xray-supplier-row", attrs: { role: "row" } });
    const supplier = el("div", { className: "xray-supplier-cell xray-supplier-name-cell", attrs: { role: "cell" } }, [
      el("div", { className: "xray-factory-name", text: factory.maskedName }),
      el("div", { className: "xray-factory-meta" }, [
        el("span", { className: "xray-factory-loc", text: factory.location }),
        confidenceBadge(factory.confidence),
      ]),
    ]);

    const tiers = el("div", { className: "xray-tiers xray-supplier-cell", attrs: { role: "cell" } });
    for (const tier of factory.tiers) {
      const active =
        state.assumptions &&
        Math.abs(state.assumptions.fobUsd - tier.unitUsd) < 0.005;
      const tierButton = button(
        "",
        `xray-tier ${active ? "active" : ""}`.trim(),
        () => this.selectTier(tier),
        {
          "aria-label": `Use ${formatUsd(tier.unitUsd)} per unit at MOQ ${tier.moq}`,
          title: tier.note ?? `MOQ ${tier.moq}`,
        },
      );
      tierButton.append(
        el("div", { className: "xray-tier-moq", text: `MOQ ${tier.moq}` }),
        el("div", {
          className: "xray-tier-price",
          text: `${formatUsd(tier.unitUsd)}/u`,
        }),
      );
      tiers.append(tierButton);
    }
    const price = el("div", { className: "xray-supplier-cell xray-supplier-price-cell", attrs: { role: "cell" } }, [
      el("div", {
        className: "xray-factory-price-value",
        text: range(factory.fobMinUsd, factory.fobMaxUsd),
      }),
      el("div", { className: "xray-factory-price-label", text: "USD / unit" }),
    ]);
    card.append(supplier, tiers, price);

    const details = el("details", { className: "xray-factory-details" });
    details.append(
      el("summary", {
        text: `Due diligence & signals (${factory.signals.length})`,
      }),
    );
    const detailBody = el("div", { className: "xray-factory-details-body" });
    const signals = el("div", { className: "xray-signals" });
    for (const signal of factory.signals) {
      signals.append(
        el("div", { className: "xray-signal" }, [
          el("span", { className: "xray-signal-dot" }),
          el("span", { className: "xray-signal-value" }, [
            el("strong", { text: `${signal.label}: ` }),
            el("span", { text: signal.value }),
            el("span", {
              className: "xray-signal-source",
              text: `${signal.source}${signal.asOf ? ` · ${signal.asOf}` : ""}`,
            }),
          ]),
        ]),
      );
    }
    detailBody.append(signals);
    detailBody.append(
      el("div", {
        className: "xray-confidence-reason",
        text: factory.confidenceReason,
      }),
    );
    details.append(detailBody);
    card.append(details);

    card.append(
      el("div", { className: "xray-actions xray-supplier-actions" }, [
        button("Request quote", "xray-btn secondary xray-btn-small", () =>
          this.openQuote(factory.id),
        { "aria-label": `Request a quote from ${factory.maskedName}` }),
      ]),
    );
    return card;
  }

  private selectTier(tier: FactoryTier): void {
    if (this.state.kind !== "result") return;
    if (!this.state.assumptions) return;
    this.state.assumptions = {
      ...this.state.assumptions,
      fobUsd: tier.unitUsd,
    };
    this.state.waterfall = this.state.result.product.retailUsd
      ? computeWaterfall(this.state.result.product.retailUsd, this.state.assumptions)
      : null;

    const fobInput = this.root.querySelector<HTMLInputElement>(
      'input[data-assumption="fobUsd"]',
    );
    if (fobInput) fobInput.value = String(tier.unitUsd);
    this.root.querySelectorAll(".xray-tier.active").forEach((node) =>
      node.classList.remove("active"),
    );
    this.root.querySelectorAll(".xray-tier").forEach((node) => {
      const label = node.querySelector(".xray-tier-price")?.textContent;
      if (label === `${formatUsd(tier.unitUsd)}/u`) {
        node.classList.add("active");
      }
    });
    this.updateWaterfallDom();
  }

  private openQuote(factoryId?: string): void {
    if (this.state.kind !== "result") return;
    this.state.quoteOpen = true;
    this.state.quoteFactoryId = factoryId;
    this.state.tab = "suppliers";
    this.render();
    requestAnimationFrame(() => {
      const form = this.root.querySelector<HTMLElement>(
        '[data-role="quote-form"]',
      );
      form?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      form?.querySelector<HTMLInputElement>('[name="email"]')?.focus();
    });
  }

  private renderQuoteForm(state: ResultState): HTMLElement {
    const factory = state.quoteFactoryId
      ? state.result.factories.find((entry) => entry.id === state.quoteFactoryId)
      : undefined;

    const card = el("div", {
      className: "xray-card",
      attrs: { "data-role": "quote-form" },
    });
    card.append(
      el("div", { className: "xray-section-head" }, [
        el("div", { className: "xray-section-title", text: "Request a quote" }),
        el("div", {
          className: "xray-section-note",
          text: factory ? factory.maskedName : "General sourcing request",
        }),
      ]),
    );

    if (state.result.dataSource !== "api") {
      card.append(
        el("div", { className: "xray-banner info" }, [
          createIcon("lock", 14),
          el("span", {
            text: "Demo mode stores this lead locally in your browser. It is not sent to a supplier.",
          }),
        ]),
      );
    }

    const form = el("form", { className: "xray-form" });
    const errorBox = el("div", {
      className: "xray-banner warn",
      attrs: { style: "display:none", role: "alert" },
    });
    form.append(errorBox);

    const email = el("input", {
      className: "xray-input",
      attrs: {
        type: "email",
        name: "email",
        placeholder: "you@company.com",
        autocomplete: "email",
        required: "true",
      },
    });
    const whatsapp = el("input", {
      className: "xray-input",
      attrs: {
        type: "tel",
        name: "whatsapp",
        placeholder: "+1 555 000 0000",
        autocomplete: "tel",
      },
    });
    const country = el("input", {
      className: "xray-input",
      attrs: {
        type: "text",
        name: "country",
        placeholder: "United States",
        autocomplete: "country-name",
      },
    });

    const moq = el("select", { className: "xray-select", attrs: { name: "moq" } });
    for (const option of ["100–300", "500–1,000", "2,000+", "Not sure"]) {
      moq.append(el("option", { text: option, attrs: { value: option } }));
    }

    const customization = el("select", {
      className: "xray-select",
      attrs: { name: "customization" },
    });
    for (const option of [
      "Ready to ship",
      "Custom logo / packaging",
      "OEM / mold",
      "Not sure",
    ]) {
      customization.append(
        el("option", { text: option, attrs: { value: option } }),
      );
    }

    const message = el("textarea", {
      className: "xray-textarea",
      attrs: {
        name: "message",
        placeholder: "Target price, specs, certification needs, sample deadline…",
        rows: "3",
      },
    });

    const consent = el("input", {
      attrs: { type: "checkbox", name: "consent" },
    });
    const consentLabel = el("label", { className: "xray-check" }, [
      consent,
      el("span", {
        text: "I agree to be contacted about this sourcing request. I understand this is an estimate, not a purchase order.",
      }),
    ]);

    form.append(
      el("div", { className: "xray-form-row" }, [
        el("div", { className: "xray-field" }, [
          el("label", { text: "Email *" }),
          email,
        ]),
        el("div", { className: "xray-field" }, [
          el("label", { text: "WhatsApp" }),
          whatsapp,
        ]),
      ]),
      el("div", { className: "xray-form-row" }, [
        el("div", { className: "xray-field" }, [
          el("label", { text: "Country" }),
          country,
        ]),
        el("div", { className: "xray-field" }, [
          el("label", { text: "Target MOQ" }),
          moq,
        ]),
      ]),
      el("div", { className: "xray-field" }, [
        el("label", { text: "Customization" }),
        customization,
      ]),
      el("div", { className: "xray-field" }, [
        el("label", { text: "What do you need?" }),
        message,
      ]),
      consentLabel,
    );

    const submit = button("Send request", "xray-btn primary", () => {});
    submit.setAttribute("type", "submit");
    const cancel = button("Cancel", "xray-btn ghost", () => this.closeQuote());
    form.append(
      el("div", { className: "xray-form-actions" }, [submit, cancel]),
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const emailValue = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
        errorBox.textContent = "Enter a valid email address.";
        errorBox.style.display = "flex";
        email.focus();
        return;
      }
      if (!consent.checked) {
        errorBox.textContent = "Please confirm that we may contact you.";
        errorBox.style.display = "flex";
        consent.focus();
        return;
      }

      errorBox.style.display = "none";
      submit.disabled = true;
      submit.textContent = "Sending…";

      const input: LeadInput = {
        factoryName: factory?.maskedName,
        factoryId: factory?.id,
        email: emailValue,
        whatsapp: whatsapp.value.trim() || undefined,
        country: country.value.trim() || undefined,
        moqTier: moq.value,
        customization: customization.value,
        message: message.value.trim() || undefined,
        consent: consent.checked,
      };

      void this.callbacks
        .onSubmitLead(input)
        .then((result) => {
          if (!result.ok) {
            errorBox.textContent = result.message;
            errorBox.style.display = "flex";
            submit.disabled = false;
            submit.textContent = "Send request";
            return;
          }
          const success = el("div", { className: "xray-success" }, [
            el("strong", { text: "Request saved. " }),
            el("span", { text: result.message }),
          ]);
          card.replaceChildren(success);
        })
        .catch((error: unknown) => {
          errorBox.textContent =
            error instanceof Error ? error.message : "Could not save the request.";
          errorBox.style.display = "flex";
          submit.disabled = false;
          submit.textContent = "Send request";
        });
    });

    card.append(form);
    return card;
  }

  private closeQuote(): void {
    if (this.state.kind !== "result") return;
    this.state.quoteOpen = false;
    this.state.quoteFactoryId = undefined;
    this.render();
  }

  private renderSources(result: ScanResult, context: PageContext): HTMLElement {
    const details = el("details", { className: "xray-details" });
    details.append(el("summary", { text: "Sources, assumptions & disclaimers" }));

    const body = el("div", { className: "xray-details-body" });
    body.append(
      el("div", {
        text: `Data source: ${sourceLabel(result.dataSource)} · Generated ${formatDateTime(
          result.generatedAt,
        )}`,
      }),
    );

    if (context.warnings?.length) {
      const notes = el("ul");
      for (const warning of context.warnings) {
        notes.append(el("li", { text: warning }));
      }
      body.append(el("div", { text: "Page extraction notes", attrs: { style: "margin-top:8px;font-weight:600;color:var(--mx-muted)" } }), notes);
    }

    if (result.sources.length) {
      const sourceList = el("ul");
      for (const source of result.sources) {
        sourceList.append(
          el("li", {
            text: `${source.label}${source.asOf ? ` · ${source.asOf}` : ""}`,
          }),
        );
      }
      body.append(
        el("div", {
          text: "Sources",
          attrs: { style: "margin-top:8px;font-weight:600;color:var(--mx-muted)" },
        }),
        sourceList,
      );
    }

    if (result.disclaimers.length) {
      const disclaimers = el("ul");
      for (const disclaimer of result.disclaimers) {
        disclaimers.append(el("li", { text: disclaimer }));
      }
      body.append(
        el("div", {
          text: "Disclaimers",
          attrs: { style: "margin-top:8px;font-weight:600;color:var(--mx-muted)" },
        }),
        disclaimers,
      );
    }

    details.append(body);
    return details;
  }

  private renderError(): HTMLElement {
    const state = this.state;
    if (state.kind !== "error") return el("div");

    const content = el("div", { className: "xray-content" });
    if (state.context) content.append(this.renderProductCard(state.context));

    content.append(
      el("div", { className: "xray-error-box" }, [
        el("div", { className: "xray-error-title", text: "Scan failed" }),
        el("div", { text: state.error.message }),
        el("div", {
          className: "xray-error-code",
          text: `Code: ${state.error.code}`,
        }),
      ]),
    );

    content.append(
      el("div", { className: "xray-banner info" }, [
        createIcon("flask", 14),
        el("span", {
          text: "You can still open a demo report to review the interface without a backend.",
        }),
      ]),
    );

    content.append(
      el("div", { className: "xray-actions" }, [
        button("Try again", "xray-btn secondary", () =>
          this.callbacks.onRetry(false),
        ),
        button("Run demo report", "xray-btn primary", () =>
          this.callbacks.onRetry(true),
        ),
        button("Settings", "xray-btn ghost", () =>
          this.callbacks.onOpenOptions(),
        ),
      ]),
    );

    return content;
  }

  private renderEmpty(): HTMLElement {
    const state = this.state;
    const content = el("div", { className: "xray-content" });
    content.append(
      el("div", { className: "xray-empty" }, [
        el("div", { className: "xray-empty-icon" }, [createIcon("search", 20)]),
        el("strong", {
          text:
            state.kind === "empty" && state.message
              ? "No product detected"
              : "Nothing to scan yet",
        }),
        el("div", {
          text:
            state.kind === "empty" && state.message
              ? state.message
              : "Open a TikTok video, TikTok Shop product, Shopify product page, or Amazon listing. You can also right-click any page and choose “Scan with Margin X-Ray”.",
        }),
      ]),
    );
    content.append(
      el("div", { className: "xray-actions" }, [
        button("Open settings", "xray-btn secondary", () =>
          this.callbacks.onOpenOptions(),
        ),
        button("Close", "xray-btn ghost", () => this.handleClose()),
      ]),
    );
    return content;
  }

  private handleClose(): void {
    this.close();
    this.callbacks.onClose();
  }
}
