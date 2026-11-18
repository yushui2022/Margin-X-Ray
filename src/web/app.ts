import {
  buildImageContext,
  buildLinkContext,
  isSupportedImageType,
} from "../shared/capture";
import { consumerVerdict, fairnessLabel, matchLabel } from "../shared/consumer";
import { assumptionsForResult, computeWaterfall } from "../shared/pricing";
import { consumeSse } from "../shared/sse";
import {
  formatDateTime,
  formatMoney,
  formatPct,
  formatUsd,
  safeImageUrl,
  truncate,
} from "../shared/format";
import { EXTENSION_VERSION } from "../shared/version";
import { downloadPoster, renderPosterBlob } from "../content/ui/poster";
import { renderProWorkspace } from "./pro";
import { initCreators, renderCreatorRoute } from "./creators";
import type {
  Confidence,
  CostWaterfall,
  PageContext,
  ScanProgress,
  ScanRequest,
  ScanResult,
} from "../shared/types";

const DEFAULT_API = "http://localhost:8787";
const STORAGE_KEY = "onion-head.apiBase";

interface AgentStepDef {
  id: string;
  label: string;
  hint: string;
}

type StepStatus = "pending" | "active" | "done" | "failed";

const AGENT_STEPS: AgentStepDef[] = [
  { id: "capture", label: "Read the source", hint: "Link, image or page" },
  { id: "resolve", label: "Resolve the product", hint: "Title, price and media" },
  { id: "image", label: "Extract a product image", hint: "Frame, cover or upload" },
  { id: "market", label: "Check market signals", hint: "Retail price and sales" },
  { id: "supply", label: "Search 1688 by image", hint: "Near-identical listings" },
  { id: "verify", label: "Verify suppliers", hint: "Registry and risk signals" },
  { id: "price", label: "Model the fair price", hint: "Landed cost and margin" },
];

const els = {
  hero: byId<HTMLElement>("hero"),
  workspace: byId<HTMLElement>("workspace"),
  scanForm: byId<HTMLFormElement>("scanForm"),
  urlInput: byId<HTMLInputElement>("urlInput"),
  scanBtn: byId<HTMLButtonElement>("scanBtn"),
  uploadBtn: byId<HTMLButtonElement>("uploadBtn"),
  fileInput: byId<HTMLInputElement>("fileInput"),
  imageReady: byId<HTMLElement>("imageReady"),
  imageThumb: byId<HTMLImageElement>("imageThumb"),
  imageName: byId<HTMLElement>("imageName"),
  clearImage: byId<HTMLButtonElement>("clearImage"),
  agentStatus: byId<HTMLElement>("agentStatus"),
  offlineNote: byId<HTMLElement>("offlineNote"),
  traceTitle: byId<HTMLElement>("traceTitle"),
  steps: byId<HTMLOListElement>("steps"),
  progress: byId<HTMLElement>("progress"),
  progressBar: byId<HTMLElement>("progressBar"),
  stopBtn: byId<HTMLButtonElement>("stopBtn"),
  newScanBtn: byId<HTMLButtonElement>("newScanBtn"),
  agentMeta: byId<HTMLElement>("agentMeta"),
  report: byId<HTMLElement>("report"),
  backendBtn: byId<HTMLButtonElement>("backendBtn"),
  backendDialog: byId<HTMLDialogElement>("backendDialog"),
  backendForm: byId<HTMLFormElement>("backendForm"),
  apiBaseInput: byId<HTMLInputElement>("apiBaseInput"),
  dialogStatus: byId<HTMLElement>("dialogStatus"),
  testBackend: byId<HTMLButtonElement>("testBackend"),
  toast: byId<HTMLElement>("toast"),
  proView: byId<HTMLElement>("proView"),
  creatorsView: byId<HTMLElement>("creatorsView"),
};

let apiBase = normalizeBase(localStorage.getItem(STORAGE_KEY) || DEFAULT_API);
let imageInput: { dataUrl: string; fileName: string } | null = null;
let controller: AbortController | null = null;
let timer: number | null = null;
let startedAt = 0;
let stepStates: StepStatus[] = AGENT_STEPS.map(() => "pending");
let result: ScanResult | null = null;
let context: PageContext | null = null;
let scanStarted = false;

boot();

function boot(): void {
  renderSteps();
  els.apiBaseInput.value = apiBase;
  els.scanForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitScan();
  });
  els.uploadBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files?.[0];
    if (file) void loadImage(file);
  });
  els.clearImage.addEventListener("click", () => {
    imageInput = null;
    els.fileInput.value = "";
    els.imageReady.hidden = true;
  });
  els.stopBtn.addEventListener("click", () => abortScan());
  els.newScanBtn.addEventListener("click", () => resetToHero());
  els.backendBtn.addEventListener("click", () => {
    els.apiBaseInput.value = apiBase;
    els.dialogStatus.textContent = "";
    els.dialogStatus.className = "dialog-status";
    els.backendDialog.showModal();
  });
  els.testBackend.addEventListener("click", () => void testBackend());
  els.backendForm.addEventListener("submit", () => {
    apiBase = normalizeBase(els.apiBaseInput.value || DEFAULT_API);
    localStorage.setItem(STORAGE_KEY, apiBase);
    els.backendDialog.close();
    void refreshHealth();
    toast("Backend saved.");
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-example]")) {
    button.addEventListener("click", () => {
      els.urlInput.value = button.dataset.example ?? "";
      els.urlInput.focus();
    });
  }
  initCreators(els.creatorsView);
  window.addEventListener("hashchange", routeView);
  routeView();
  void refreshHealth();
}

function routeView(): void {
  showView(location.hash === "#pro" ? "pro" : location.hash === "#scan" ? "scan" : "creators");
}

function showView(view: "scan" | "pro" | "creators"): void {
  const pro = view === "pro";
  els.proView.hidden = !pro;
  els.creatorsView.hidden = view !== "creators";
  els.hero.hidden = view !== "scan" || scanStarted;
  els.workspace.hidden = view !== "scan" || !scanStarted;
  document.body.dataset.view = view;
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".topnav [data-view]")) {
    const active = link.dataset.view === view;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = `${{ creators: "Creator research", scan: "Product scan", pro: "Pricing workspace" }[view]} · Onion Head`;
  if (pro) {
    renderProWorkspace();
  }
  const hash = view === "creators" && location.hash.startsWith("#creator/") ? location.hash : `#${view}`;
  if (location.hash !== hash) location.hash = hash;
  if (view === "creators") renderCreatorRoute();
  else window.scrollTo({ top: 0, behavior: "instant" });
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function refreshHealth(): Promise<void> {
  setAgentStatus("checking", "Checking agent");
  const health = await ping(apiBase);
  if (!health.ok) {
    setAgentStatus("offline", "Agent offline");
    els.offlineNote.hidden = false;
    return;
  }
  const mock = (health.service ?? "").toLowerCase().includes("mock");
  setAgentStatus(mock ? "mock" : "online", mock ? "Mock backend" : "Agent connected");
  els.offlineNote.hidden = true;
}

function setAgentStatus(
  state: "checking" | "online" | "offline" | "mock",
  label: string,
): void {
  els.agentStatus.className = `agent-status ${state}`;
  const text = els.agentStatus.querySelector("span");
  if (text) text.textContent = label;
}

async function ping(base: string): Promise<{ ok: boolean; service?: string }> {
  const ctrl = new AbortController();
  const timeout = window.setTimeout(() => ctrl.abort(), 4000);
  try {
    const response = await fetch(`${base}/health`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!response.ok) return { ok: false };
    const body = (await response.json().catch(() => null)) as
      | { service?: string }
      | null;
    return { ok: true, ...(body?.service ? { service: body.service } : {}) };
  } catch {
    return { ok: false };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function testBackend(): Promise<void> {
  const base = normalizeBase(els.apiBaseInput.value || DEFAULT_API);
  els.dialogStatus.textContent = "Testing…";
  els.dialogStatus.className = "dialog-status";
  const health = await ping(base);
  const mock = (health.service ?? "").toLowerCase().includes("mock");
  els.dialogStatus.textContent = health.ok
    ? `Connected to ${base}${mock ? " (mock backend)" : ""}`
    : `No response from ${base}`;
  els.dialogStatus.className = `dialog-status ${health.ok ? "ok" : "error"}`;
}

async function loadImage(file: File): Promise<void> {
  if (!isSupportedImageType(file.type)) {
    toast("Use a JPG, PNG, WebP or GIF image.");
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast("Keep the image under 8 MB.");
    return;
  }
  const dataUrl = await readAsDataUrl(file);
  imageInput = { dataUrl, fileName: file.name };
  els.imageThumb.src = dataUrl;
  els.imageName.textContent = truncate(file.name, 48);
  els.imageReady.hidden = false;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

async function submitScan(): Promise<void> {
  let scanContext: PageContext;
  try {
    if (imageInput) {
      scanContext = buildImageContext(imageInput.dataUrl, imageInput.fileName);
    } else {
      const raw = els.urlInput.value.trim();
      if (!raw) {
        toast("Paste a product link or choose an image first.");
        els.urlInput.focus();
        return;
      }
      scanContext = buildLinkContext(raw);
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : "That input was not readable.");
    return;
  }
  await runScan(scanContext);
}

async function runScan(scanContext: PageContext): Promise<void> {
  abortScan();
  context = scanContext;
  result = null;
  controller = new AbortController();
  startedAt = Date.now();

  showWorkspace();
  resetSteps();
  els.traceTitle.textContent = "Starting the agent…";
  els.stopBtn.hidden = false;
  els.newScanBtn.hidden = true;
  setProgress(2);
  startTimer();

  const request: ScanRequest = {
    scanId: crypto.randomUUID(),
    context: scanContext,
    client: {
      version: EXTENSION_VERSION,
      locale: navigator.language || "en-US",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  };

  try {
    const response = await fetch(`${apiBase}/api/v1/xray/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `The agent returned HTTP ${response.status}${body ? `: ${body.replace(/\s+/g, " ").slice(0, 160)}` : ""}.`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const raw = (await response.json()) as ScanResult;
      completeScan(raw);
      return;
    }
    if (!response.body) throw new Error("The agent returned no stream.");

    let received = false;
    await consumeSse(response.body, async (event) => {
      if (event.event === "progress") {
        try {
          const progress = JSON.parse(event.data) as ScanProgress;
          applyProgress(progress);
        } catch {
          // Ignore malformed progress events.
        }
        return;
      }
      if (event.event === "complete") {
        const raw = JSON.parse(event.data) as ScanResult;
        received = true;
        completeScan(raw);
        return;
      }
      if (event.event === "error") {
        let message = "The agent returned an error.";
        try {
          const payload = JSON.parse(event.data) as { message?: string };
          if (payload.message) message = payload.message;
        } catch {
          // Keep the fallback.
        }
        throw new Error(message);
      }
    });

    if (!received) throw new Error("The agent stream ended without a result.");
  } catch (error) {
    failScan(error);
  }
}

function applyProgress(progress: ScanProgress): void {
  const index = AGENT_STEPS.findIndex((step) => step.id === progress.stepId);
  if (index >= 0) {
    for (let i = 0; i < index; i += 1) {
      if (stepStates[i] !== "failed") stepStates[i] = "done";
    }
    stepStates[index] = "active";
    renderSteps(progress.message);
    els.traceTitle.textContent = AGENT_STEPS[index].label;
  } else if (progress.message) {
    els.traceTitle.textContent = progress.message;
  }
  setProgress(progress.percent);
}

function completeScan(raw: ScanResult): void {
  result = raw;
  stepStates = stepStates.map(() => "done");
  renderSteps();
  setProgress(100);
  els.traceTitle.textContent = "Scan complete";
  els.stopBtn.hidden = true;
  els.newScanBtn.hidden = false;
  els.agentMeta.textContent = `${elapsedSeconds()}s · ${sourceLabel(raw.dataSource)}`;
  stopTimer();
  if (context) renderReport(raw, context);
}

function failScan(error: unknown): void {
  const message =
    error instanceof DOMException && error.name === "AbortError"
      ? "Scan stopped."
      : error instanceof Error
        ? error.message
        : "The scan failed.";
  const active = stepStates.indexOf("active");
  if (active >= 0) stepStates[active] = "failed";
  renderSteps();
  stopTimer();
  els.stopBtn.hidden = true;
  els.newScanBtn.hidden = false;
  els.traceTitle.textContent =
    error instanceof DOMException && error.name === "AbortError"
      ? "Stopped"
      : "Scan failed";
  els.agentMeta.textContent = `${elapsedSeconds()}s`;
  renderError(message);
}

function abortScan(): void {
  controller?.abort();
  controller = null;
  stopTimer();
}

function resetToHero(): void {
  abortScan();
  scanStarted = false;
  showView("scan");
  els.workspace.hidden = true;
  els.hero.hidden = false;
  els.report.replaceChildren();
  els.traceTitle.textContent = "Working…";
  els.agentMeta.textContent = "";
  els.stopBtn.hidden = true;
  els.newScanBtn.hidden = true;
  setProgress(0);
  resetSteps();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showWorkspace(): void {
  scanStarted = true;
  showView("scan");
  els.workspace.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetSteps(): void {
  stepStates = AGENT_STEPS.map(() => "pending");
  renderSteps();
}

function renderSteps(detail?: string): void {
  els.steps.replaceChildren(
    ...AGENT_STEPS.map((step, index) => {
      const status = stepStates[index] ?? "pending";
      const item = el("li", { class: `step ${status}` });
      const marker = el("span", { class: "step-marker" });
      marker.innerHTML =
        status === "done"
          ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6.5"/></svg>'
          : status === "failed"
            ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'
            : "";
      const body = el("div", { class: "step-body" }, [
        el("strong", { text: step.label }),
        el("span", {
          class: "step-detail",
          text:
            status === "active" && detail
              ? detail
              : status === "done"
                ? "Done"
                : status === "failed"
                  ? "Failed"
                  : step.hint,
        }),
      ]);
      item.append(marker, body);
      return item;
    }),
  );
}

function setProgress(percent: number): void {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  els.progressBar.style.width = `${value}%`;
  els.progress.setAttribute("aria-valuenow", String(value));
}

function startTimer(): void {
  stopTimer();
  timer = window.setInterval(() => {
    els.agentMeta.textContent = `${elapsedSeconds()}s · streaming`;
  }, 500);
}

function stopTimer(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function elapsedSeconds(): number {
  return Math.max(1, Math.round((Date.now() - startedAt) / 1000));
}

function sourceLabel(source: ScanResult["dataSource"]): string {
  if (source === "api") return "Live agent";
  if (source === "mock") return "Mock agent run";
  return "Demo dataset";
}

function renderReport(scan: ScanResult, scanContext: PageContext): void {
  const assumptions = assumptionsForResult(scan);
  const waterfall =
    scan.waterfall ??
    (assumptions && scan.product.retailUsd
      ? computeWaterfall(scan.product.retailUsd, assumptions)
      : null);
  const verdict = consumerVerdict(scan, waterfall, assumptions);
  const nodes: HTMLElement[] = [];

  if (scan.dataSource !== "api") {
    nodes.push(
      el("div", { class: "notice" }, [
        el("strong", { text: sourceLabel(scan.dataSource) }),
        el("span", {
          text:
            scan.dataSource === "mock"
              ? " — the local mock backend returned sample data. The flow is real; the supplier numbers are not."
              : " — sample dataset for interface review. Not a real price check.",
        }),
      ]),
    );
  }

  nodes.push(renderProduct(scan, scanContext));

  const card = el("section", { class: "verdict" });
  card.append(
    el("div", { class: "verdict-head" }, [
      el("p", { class: "eyebrow", text: fairnessLabel(verdict.fairness) }),
      el("div", {
        class: `verdict-number ${
          verdict.fairness === "extreme" || verdict.fairness === "well-above"
            ? "warn"
            : verdict.fairness === "fair"
              ? "good"
              : ""
        }`.trim(),
        text: verdict.markupX === null ? "—" : `${verdict.markupX.toFixed(1)}×`,
      }),
      el("p", {
        class: "verdict-sub",
        text: "retail price vs estimated factory cost",
      }),
    ]),
  );

  const factoryValue =
    verdict.factoryLowUsd !== null
      ? range(verdict.factoryLowUsd, verdict.factoryHighUsd ?? verdict.factoryLowUsd)
      : scan.supply?.cnyLabel ?? "—";
  const fairValue =
    verdict.fairLowUsd !== null && verdict.fairHighUsd !== null
      ? range(verdict.fairLowUsd, verdict.fairHighUsd)
      : scan.supply && !scan.supply.fxRate
        ? "Needs FX"
        : "—";

  card.append(
    el("div", { class: "kpis" }, [
      kpi("You pay", verdict.retailUsd === null ? "—" : formatUsd(verdict.retailUsd), "listed price"),
      kpi("Est. factory cost", factoryValue, verdict.factorySource === "listing" ? "1688 image search" : "model estimate"),
      kpi("Fair range", fairValue, "15–25% margin model", "good"),
    ]),
  );
  card.append(
    el("div", { class: "match" }, [
      el("span", {
        class: `badge ${verdict.matchStrength}`,
        text:
          verdict.matchStrength === "high"
            ? "High match"
            : verdict.matchStrength === "medium"
              ? "Match"
              : verdict.matchStrength === "low"
                ? "Few matches"
                : verdict.matchStrength === "none"
                  ? "No match"
                  : "Not checked",
      }),
      el("span", { text: matchLabel(verdict.matchStrength, verdict.matchCount) }),
    ]),
  );
  card.append(
    el("div", { class: "verdict-actions" }, [
      button("Download share card", "btn primary", () => void shareCard(scan, verdict)),
      button("Source listings", "btn secondary", () => {
        document.getElementById("listings")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    ]),
  );
  nodes.push(card);

  nodes.push(renderFair(scan, verdict, assumptions));
  if (waterfall) nodes.push(renderCosts(waterfall));
  nodes.push(renderListings(scan));
  nodes.push(renderSources(scan, scanContext));

  els.report.replaceChildren(...nodes);
}

function renderProduct(scan: ScanResult, scanContext: PageContext): HTMLElement {
  const image = safeImageUrl(scan.product.imageUrl);
  const node = el("section", { class: "product" });
  if (image) {
    const img = el("img", { class: "product-img", attrs: { alt: "" } });
    img.src = image;
    node.append(img);
  } else {
    const placeholder = el("div", { class: "product-img placeholder" });
    placeholder.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>';
    node.append(placeholder);
  }
  const meta = el("div", { class: "product-meta" }, [
    el("p", {
      class: "product-platform",
      text: `${platformLabel(scanContext.platform)} · ${scanContext.pageType}`,
    }),
    el("h2", { text: scan.product.title }),
    el("p", {
      class: "product-price",
      text:
        scan.product.retailUsd === null
          ? "No USD retail price found"
          : `${formatUsd(scan.product.retailUsd)}`,
    }),
    el("p", { class: "product-source", text: truncate(scan.product.retailSource, 120) }),
  ]);
  node.append(meta);
  return node;
}

function renderFair(
  scan: ScanResult,
  verdict: ReturnType<typeof consumerVerdict>,
  assumptions: ReturnType<typeof assumptionsForResult>,
): HTMLElement {
  const card = el("section", { class: "card" }, [
    el("header", { class: "card-head" }, [
      el("h3", { text: "How the fair range is built" }),
      el("span", { text: "No paid-ads load" }),
    ]),
  ]);
  const rows: Array<[string, string]> = [
    ["Landed cost", verdict.landedUsd === null ? "Not enough data" : formatUsd(verdict.landedUsd)],
    [
      "Platform, payment & returns",
      assumptions
        ? `${formatPct(
            assumptions.platformFeePct + assumptions.paymentPct + assumptions.returnRatePct,
          )} of retail`
        : "Not enough data",
    ],
    [
      "Fair price range",
      verdict.fairLowUsd !== null && verdict.fairHighUsd !== null
        ? range(verdict.fairLowUsd, verdict.fairHighUsd)
        : "Not enough data",
    ],
  ];
  for (const [label, value] of rows) {
    card.append(
      el("div", { class: "row" }, [
        el("span", { text: label }),
        el("strong", { text: value }),
      ]),
    );
  }
  card.append(
    el("p", {
      class: "fine-print",
      text:
        "The fair range covers landed cost and fulfillment plus platform, payment and returns fees, at a 15–25% net margin. It is a model, not a market survey.",
    }),
  );
  if (scan.supply && !scan.supply.fxRate) {
    card.append(
      el("div", { class: "inline-note" }, [
        "The 1688 listing is in CNY. Add a CNY per USD rate to convert it and fill the range.",
      ]),
    );
  }
  return card;
}

function renderCosts(waterfall: CostWaterfall): HTMLElement {
  const card = el("section", { class: "card" }, [
    el("header", { class: "card-head" }, [
      el("h3", { text: "Cost breakdown" }),
      el("span", { text: `Net ${formatUsd(waterfall.netUsd)} · ${formatPct(waterfall.netMarginPct)}` }),
    ]),
  ]);
  const rows: Array<[string, number, string]> = [
    ["Retail price", waterfall.retailUsd, ""],
    ["Factory cost", waterfall.fobUsd, pct(waterfall.fobUsd, waterfall.retailUsd)],
    ["Freight", waterfall.shippingUsd, pct(waterfall.shippingUsd, waterfall.retailUsd)],
    ["Duty", waterfall.dutyUsd, pct(waterfall.dutyUsd, waterfall.retailUsd)],
    [
      "Platform, affiliate & payment",
      waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd,
      pct(
        waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd,
        waterfall.retailUsd,
      ),
    ],
    [
      "Fulfillment & returns",
      waterfall.fulfillmentUsd + waterfall.returnsUsd,
      pct(waterfall.fulfillmentUsd + waterfall.returnsUsd, waterfall.retailUsd),
    ],
    ["Ads", waterfall.adUsd, pct(waterfall.adUsd, waterfall.retailUsd)],
    ["Net before tax", waterfall.netUsd, formatPct(waterfall.netMarginPct)],
  ];
  for (const [label, value, share] of rows) {
    card.append(
      el("div", { class: `row ${label === "Net before tax" ? "total" : ""}`.trim() }, [
        el("span", { text: label }),
        el("strong", { text: formatUsd(value) }),
        el("em", { text: share }),
      ]),
    );
  }
  card.append(
    el("p", {
      class: "fine-print",
      text: "Model estimate with visible assumptions. Freight, duty and fees are defaults, not a quote.",
    }),
  );
  return card;
}

function renderListings(scan: ScanResult): HTMLElement {
  const card = el("section", { class: "card", attrs: { id: "listings" } }, [
    el("header", { class: "card-head" }, [
      el("h3", { text: "1688 source listings" }),
      el("span", {
        text: scan.supply
          ? `${scan.supply.priced} priced · image search`
          : "No image search in this run",
      }),
    ]),
  ]);

  if (!scan.factories.length) {
    card.append(
      el("div", { class: "empty" }, [
        el("strong", { text: "No near-identical listing found" }),
        el("p", {
          text: "Try a sharper product image, or scan the product page instead of a wide video shot.",
        }),
      ]),
    );
    return card;
  }

  for (const factory of scan.factories.slice(0, 3)) {
    const row = el("div", { class: "listing" });
    row.append(
      el("div", { class: "listing-main" }, [
        el("div", { class: "listing-name" }, [
          el("strong", { text: factory.maskedName }),
          confidenceBadge(factory.confidence),
        ]),
        el("p", { class: "listing-meta", text: factory.location }),
        el("p", {
          class: "listing-moq",
          text:
            factory.tiers.length > 1
              ? `MOQ ${factory.tiers.map((tier) => tier.moq).join(" · ")}`
              : factory.tiers.length === 1
                ? `MOQ ${factory.tiers[0]?.moq ?? 1}`
                : "MOQ not listed",
        }),
      ]),
      el("div", { class: "listing-price" }, [
        el("strong", {
          text:
            factory.currency === "CNY"
              ? `${formatMoney(factory.fobMinUsd, "CNY")}–${formatMoney(factory.fobMaxUsd, "CNY")}`
              : range(factory.fobMinUsd, factory.fobMaxUsd),
        }),
        el("span", { text: factory.currency === "CNY" ? "CNY / unit" : "USD / unit" }),
      ]),
    );

    if (factory.signals.length) {
      const details = el("details", { class: "listing-details" });
      details.append(el("summary", { text: `Evidence (${factory.signals.length})` }));
      for (const signal of factory.signals) {
        details.append(
          el("div", { class: "signal" }, [
            el("strong", { text: `${signal.label}: ` }),
            el("span", { text: signal.value }),
            el("em", { text: signal.source }),
          ]),
        );
      }
      row.append(details);
    }
    card.append(row);
  }

  card.append(
    el("p", {
      class: "fine-print",
      text: scan.supply
        ? "1688 listing prices, in CNY unless a rate is saved. A shop name is not a factory verification."
        : "Sample listings for interface review.",
    }),
  );
  return card;
}

function renderSources(scan: ScanResult, scanContext: PageContext): HTMLElement {
  const details = el("details", { class: "sources" });
  details.append(el("summary", { text: "Sources, assumptions & disclaimers" }));
  const list = el("div", { class: "sources-body" });
  list.append(
    el("p", {
      text: `${sourceLabel(scan.dataSource)} · generated ${formatDateTime(scan.generatedAt)}`,
    }),
  );
  if (scan.sources.length) {
    const ul = el("ul");
    for (const source of scan.sources) {
      ul.append(
        el("li", {
          text: `${source.label}${source.asOf ? ` · ${source.asOf}` : ""}`,
        }),
      );
    }
    list.append(el("p", { class: "sources-label", text: "Sources" }), ul);
  }
  if (scan.disclaimers.length) {
    const ul = el("ul");
    for (const line of scan.disclaimers) ul.append(el("li", { text: line }));
    list.append(el("p", { class: "sources-label", text: "Disclaimers" }), ul);
  }
  if (scanContext.warnings?.length) {
    const ul = el("ul");
    for (const line of scanContext.warnings) ul.append(el("li", { text: line }));
    list.append(el("p", { class: "sources-label", text: "Input notes" }), ul);
  }
  details.append(list);
  return details;
}

function renderError(message: string): void {
  els.report.replaceChildren(
    el("section", { class: "error-card" }, [
      el("p", { class: "eyebrow", text: "Scan failed" }),
      el("h2", { text: "The agent could not finish." }),
      el("p", { text: message }),
      el("div", { class: "error-actions" }, [
        button("Try again", "btn primary", () => {
          if (!context) return;
          void runScan(context);
        }),
        button("Backend settings", "btn secondary", () => els.backendBtn.click()),
      ]),
      el("p", {
        class: "fine-print",
        text: "If you are testing locally, start the mock agent with npm run mock and set the backend to http://localhost:8787.",
      }),
    ]),
  );
}

function kpi(label: string, value: string, note: string, tone?: "good"): HTMLElement {
  return el("div", { class: "kpi" }, [
    el("span", { class: "kpi-label", text: label }),
    el("strong", { class: `kpi-value ${tone ?? ""}`.trim(), text: value }),
    el("span", { class: "kpi-note", text: note }),
  ]);
}

function confidenceBadge(confidence: Confidence): HTMLElement {
  return el("span", {
    class: `confidence ${confidence}`,
    text: confidence === "high" ? "High" : confidence === "medium" ? "Medium" : confidence === "demo" ? "Demo" : "Low",
  });
}

function range(min: number, max: number): string {
  if (Math.abs(max - min) < 0.005) return formatUsd(min);
  return `${formatUsd(min)}–${formatUsd(max)}`;
}

function pct(value: number, total: number): string {
  if (!total) return "";
  return formatPct((value / total) * 100);
}

function platformLabel(platform: PageContext["platform"]): string {
  switch (platform) {
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
    default:
      return "Product";
  }
}

async function shareCard(
  scan: ScanResult,
  verdict: ReturnType<typeof consumerVerdict>,
): Promise<void> {
  const blob = await renderPosterBlob({
    title: scan.product.title,
    ...(scan.product.imageUrl ? { imageUrl: scan.product.imageUrl } : {}),
    mascotUrl: new URL("assets/mascot/onion-head.webp", window.location.href).href,
    retailUsd: verdict.retailUsd,
    factoryLowUsd: verdict.factoryLowUsd,
    factoryHighUsd: verdict.factoryHighUsd,
    fairLowUsd: verdict.fairLowUsd,
    fairHighUsd: verdict.fairHighUsd,
    markupX: verdict.markupX,
    fairness: fairnessLabel(verdict.fairness),
    matchLabel: matchLabel(verdict.matchStrength, verdict.matchCount),
    disclaimer:
      scan.dataSource !== "api"
        ? "Sample agent run. The factory range, markup and fair price are not a real price check."
        : "Estimated from 1688 image-search listing prices and a cost model. Not a legal finding of white-labeling.",
    generatedAt: new Date(scan.generatedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  });
  if (!blob) {
    toast("Could not render the share card. The product image blocked the canvas.");
    return;
  }
  downloadPoster(blob, `onion-head-${Date.now()}.png`);
  toast("Share card downloaded.");
}

function toast(message: string): void {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

interface ElProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
}

function el<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  props: ElProps = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[T] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) node.append(child);
  return node;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", { class: className, text, attrs: { type: "button" } });
  node.addEventListener("click", onClick);
  return node;
}
