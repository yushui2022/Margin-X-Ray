import hudCss from "./hud.css";
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
import { initialSteps, SCAN_STEP_DEFS } from "../../shared/steps";
import { EXTENSION_VERSION } from "../../shared/version";
import type {
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
  onCancel: () => void;
  onClose: () => void;
  onOpenOptions: () => void;
  onRetry: (forceDemo: boolean) => void;
  onSubmitLead: (input: LeadInput) => Promise<SaveLeadResult>;
}

type ClosedState = { kind: "closed" };

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

type HudState = ClosedState | ScanningState | ResultState | ErrorState | EmptyState;

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
    style.textContent = hudCss;
    this.shadow.appendChild(style);

    this.root = el("div", {
      className: "xray-root",
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
      el("span", { className: "xray-launcher-mark", text: "⚡" }),
      el("span", { text: "X-Ray Factory Price" }),
      el("span", { className: "xray-launcher-dot" }),
    );
    return launcher;
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
        el("div", { className: "xray-brand-name", text: "MARGIN X-RAY" }),
        el("div", { className: "xray-brand-sub", text: "Factory cost lens" }),
      ]),
    ]);

    const settings = button("⚙", "xray-icon-btn", () =>
      this.callbacks.onOpenOptions(),
    {
      "aria-label": "Open Margin X-Ray settings",
      title: "Settings",
    });

    const close = button("✕", "xray-icon-btn", () => this.handleClose(), {
      "aria-label": "Close Margin X-Ray",
      title: "Close",
    });

    return el("div", { className: "xray-header" }, [
      brand,
      el("div", { className: "xray-header-actions" }, [settings, close]),
    ]);
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
        el("span", { text: "⏳" }),
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
      const dotText =
        step.status === "done"
          ? "✓"
          : step.status === "active"
            ? "●"
            : step.status === "failed"
              ? "!"
              : "";
      const row = el("div", { className: `xray-step ${step.status}` }, [
        el("span", { className: "xray-step-dot", text: dotText }),
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

    const thumb = el("div", { className: "xray-thumb" });
    const fallback = el("span", {
      text: (title.trim()[0] ?? "?").toUpperCase(),
    });
    thumb.append(fallback);
    if (imageUrl) {
      const img = el("img", {
        attrs: {
          src: imageUrl,
          alt: "",
          referrerpolicy: "no-referrer",
          loading: "lazy",
        },
      });
      img.addEventListener("load", () => {
        fallback.remove();
      });
      img.addEventListener("error", () => {
        img.remove();
      });
      thumb.append(img);
    }

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
      el("span", { className: "xray-chip", text: platformLabel({ ...context, platform }) }),
      el("span", { className: "xray-chip", text: pageType }),
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

    const { result, context, assumptions, waterfall } = state;
    const content = el("div", { className: "xray-content" });

    if (result.dataSource !== "api") {
      content.append(
        el("div", { className: `xray-banner ${result.dataSource === "demo" ? "demo" : "info"}` }, [
          el("span", { text: result.dataSource === "demo" ? "🧪" : "🔌" }),
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
        ]),
      );
    }

    content.append(this.renderProductCard(context, result));

    if (context.warnings?.length) {
      content.append(
        el("div", { className: "xray-banner info" }, [
          el("span", { text: "ℹ️" }),
          el("span", { text: truncate(context.warnings[0] ?? "", 180) }),
        ]),
      );
    }

    const priceGrid = el("div", { className: "xray-card" });
    priceGrid.append(
      el("div", { className: "xray-section-head" }, [
        el("div", { className: "xray-section-title", text: "Price X-Ray" }),
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
        el("div", { className: "xray-price-note", attrs: { style: "margin-top:9px" } }, [
          el("strong", {
            text: `Gross margin on ex-works: ${formatPct(
              result.product.retailUsd
                ? ((result.product.retailUsd -
                    (result.priceRange.fobMinUsd + result.priceRange.fobMaxUsd) / 2) /
                    result.product.retailUsd) *
                    100
                : null,
            )}. `,
          }),
          el("span", {
            text: "That is not what the seller keeps — see the waterfall below.",
          }),
        ]),
      );
    }

    content.append(priceGrid);
    content.append(this.renderWaterfallCard(result, assumptions, waterfall));
    content.append(this.renderFunnelCard(result));

    if (result.qualityWarning) {
      content.append(
        el("div", { className: "xray-banner warn" }, [
          el("span", { text: "⚠️" }),
          el("span", {}, [
            el("strong", { text: "Quality trap: " }),
            el("span", { text: result.qualityWarning }),
          ]),
        ]),
      );
    }

    content.append(this.renderFactories(state));

    if (!state.quoteOpen) {
      content.append(
        button(
          "Request a verified quote",
          "xray-btn primary wide",
          () => this.openQuote(),
        ),
      );
    } else {
      content.append(this.renderQuoteForm(state));
    }

    content.append(this.renderSources(result, context));
    return content;
  }

  private renderWaterfallCard(
    result: ScanResult,
    assumptions: CostAssumptions | null,
    waterfall: CostWaterfall | null,
  ): HTMLElement {
    const card = el("div", { className: "xray-card" });

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
          el("span", { text: "ℹ️" }),
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

    const rows: Array<{
      label: string;
      value: number;
      pct: number;
      className?: string;
    }> = [
      { label: "Retail price", value: waterfall.retailUsd, pct: 100 },
      { label: "Ex-works unit price", value: waterfall.fobUsd, pct: pctOf(waterfall.fobUsd, retail) },
      { label: "Freight", value: waterfall.shippingUsd, pct: pctOf(waterfall.shippingUsd, retail) },
      { label: "Duty", value: waterfall.dutyUsd, pct: pctOf(waterfall.dutyUsd, retail) },
      { label: "Landed cost", value: waterfall.landedUsd, pct: pctOf(waterfall.landedUsd, retail) },
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

    for (const row of rows) {
      fragment.append(
        el("div", { className: `xray-row ${row.className ?? ""}`.trim() }, [
          el("div", { className: "xray-row-label", text: row.label }),
          el("div", {
            className: "xray-row-value",
            text: formatUsd(row.value),
          }),
          el("div", { className: "xray-row-pct", text: formatPct(row.pct) }),
        ]),
      );
    }

    if (assumptions.fobUsd <= 0) {
      fragment.append(
        el("div", { className: "xray-banner warn" }, [
          el("span", { text: "⚠️" }),
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
      body.replaceChildren(
        this.renderWaterfallBody(result.product.retailUsd, assumptions, waterfall),
      );
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
          el("span", { text: "ℹ️" }),
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
    const card = el("div", { className: "xray-card" });
    card.append(
      el("div", { className: "xray-section-head" }, [
        el("div", {
          className: "xray-section-title",
          text: "Factory candidates",
        }),
        el("div", {
          className: "xray-section-note",
          text: "Masked · verify before payment",
        }),
      ]),
    );

    if (!state.result.factories.length) {
      card.append(
        el("div", { className: "xray-empty" }, [
          el("div", { className: "xray-empty-icon", text: "🏭" }),
          el("strong", { text: "No verified candidates" }),
          el("div", {
            text: "Live mode should return “insufficient data” here instead of a fallback factory or price.",
          }),
        ]),
      );
      return card;
    }

    for (const factory of state.result.factories) {
      card.append(this.renderFactory(factory, state));
    }
    return card;
  }

  private renderFactory(factory: Factory, state: ResultState): HTMLElement {
    const card = el("div", { className: "xray-factory" });
    const head = el("div", { className: "xray-factory-head" }, [
      el("div", {}, [
        el("div", { className: "xray-factory-name", text: factory.maskedName }),
        el("div", { className: "xray-factory-loc", text: factory.location }),
      ]),
      el("div", { className: "xray-factory-price" }, [
        el("div", {
          className: "xray-factory-price-value",
          text: range(factory.fobMinUsd, factory.fobMaxUsd),
        }),
        el("div", {
          className: "xray-factory-price-label",
          text: "ex-works / unit",
        }),
      ]),
    ]);
    head.append(confidenceBadge(factory.confidence));
    card.append(head);

    const tiers = el("div", { className: "xray-tiers" });
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
    card.append(tiers);

    const signals = el("div", { className: "xray-signals" });
    for (const signal of factory.signals) {
      signals.append(
        el("div", { className: "xray-signal" }, [
          el("span", { className: "xray-signal-dot", text: "●" }),
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
    card.append(signals);
    card.append(
      el("div", {
        className: "xray-confidence-reason",
        text: factory.confidenceReason,
      }),
    );

    card.append(
      el("div", { className: "xray-actions" }, [
        button("Request quote", "xray-btn primary", () =>
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
          el("span", { text: "🔒" }),
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
      body.append(el("div", { text: "Page extraction notes", attrs: { style: "margin-top:8px;font-weight:700;color:#94a3b8" } }), notes);
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
          attrs: { style: "margin-top:8px;font-weight:700;color:#94a3b8" },
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
          attrs: { style: "margin-top:8px;font-weight:700;color:#94a3b8" },
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
        el("span", { text: "🧪" }),
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
        el("div", { className: "xray-empty-icon", text: "🔍" }),
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
