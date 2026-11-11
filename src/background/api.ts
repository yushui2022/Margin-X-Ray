import { consumeSse } from "../shared/sse";
import { computeWaterfall } from "../shared/pricing";
import type {
  ApiTestResult,
  Confidence,
  CostAssumptions,
  CostWaterfall,
  DataSource,
  Factory,
  FactorySignal,
  FactoryTier,
  FunnelReason,
  Lead,
  LeadInput,
  ScanFunnel,
  ScanProgress,
  ScanRequest,
  ScanResult,
  ScanSource,
  Settings,
} from "../shared/types";

export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new ApiError(
      "API_NOT_CONFIGURED",
      "Set an API base URL in the extension settings, or run a demo report.",
    );
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ApiError("API_URL_INVALID", "The API base URL is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(
      "API_URL_INVALID",
      "The API base URL must start with http:// or https://.",
    );
  }

  return url.toString().replace(/\/+$/, "");
}

function headers(settings: Settings): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "text/event-stream, application/json",
    ...(settings.apiToken
      ? { Authorization: `Bearer ${settings.apiToken}` }
      : {}),
  };
}

function combineSignals(
  first: AbortSignal | undefined,
  second: AbortSignal,
): AbortSignal {
  if (!first) return second;
  if (first.aborted || second.aborted) {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  first.addEventListener("abort", abort, { once: true });
  second.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function timeoutSignal(ms: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.replace(/\s+/g, " ").slice(0, 220);
  } catch {
    return "";
  }
}

export async function scanWithApi(
  request: ScanRequest,
  settings: Settings,
  onProgress: (progress: ScanProgress) => void,
  externalSignal?: AbortSignal,
): Promise<ScanResult> {
  const base = normalizeApiBaseUrl(settings.apiBaseUrl);
  const timeout = timeoutSignal(75_000);
  const signal = combineSignals(externalSignal, timeout.signal);

  try {
    const response = await fetch(`${base}/api/v1/xray/stream`, {
      method: "POST",
      headers: headers(settings),
      body: JSON.stringify(request),
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new ApiError(
        `API_HTTP_${response.status}`,
        `The API returned HTTP ${response.status}${body ? `: ${body}` : ""}.`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const raw = (await response.json()) as unknown;
      return normalizeScanResult(raw, request.scanId);
    }

    if (!response.body) {
      throw new ApiError("API_EMPTY", "The API returned no response body.");
    }

    let result: ScanResult | null = null;
    await consumeSse(response.body, async (event) => {
      if (event.event === "progress") {
        try {
          const progress = JSON.parse(event.data) as ScanProgress;
          if (progress && typeof progress.scanId === "string") {
            onProgress(progress);
          }
        } catch {
          // Ignore malformed progress events; the stream can continue.
        }
        return;
      }

      if (event.event === "complete") {
        try {
          result = normalizeScanResult(JSON.parse(event.data), request.scanId);
        } catch (error) {
          throw error instanceof ApiError
            ? error
            : new ApiError("API_BAD_RESULT", "The API returned an invalid result.");
        }
        return;
      }

      if (event.event === "error") {
        try {
          const payload = JSON.parse(event.data) as {
            code?: string;
            message?: string;
          };
          throw new ApiError(
            payload.code ?? "API_ERROR",
            payload.message ?? "The API returned an error.",
          );
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new ApiError("API_ERROR", "The API returned an error event.");
        }
      }
    });

    if (!result) {
      throw new ApiError(
        "API_INCOMPLETE",
        "The API stream ended without a complete result.",
      );
    }

    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        "SCAN_ABORTED",
        timeout.signal.aborted
          ? "The scan timed out after 75 seconds."
          : "The scan was cancelled.",
      );
    }
    if (error instanceof TypeError) {
      throw new ApiError(
        "API_UNREACHABLE",
        "Could not reach the API. Check the base URL, start the mock server, or grant host permission in settings.",
      );
    }
    throw new ApiError(
      "API_ERROR",
      error instanceof Error ? error.message : "The API call failed.",
    );
  } finally {
    timeout.cancel();
  }
}

export async function testApi(settings: Settings): Promise<ApiTestResult> {
  const started = Date.now();
  try {
    const base = normalizeApiBaseUrl(settings.apiBaseUrl);
    const timeout = timeoutSignal(6_000);
    const response = await fetch(`${base}/health`, {
      headers: settings.apiToken
        ? { Authorization: `Bearer ${settings.apiToken}` }
        : undefined,
      signal: timeout.signal,
      cache: "no-store",
    }).finally(timeout.cancel);

    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return {
        ok: false,
        latencyMs,
        message: `The server responded with HTTP ${response.status}.`,
      };
    }

    return {
      ok: true,
      latencyMs,
      message: `Connected in ${latencyMs} ms.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not connect to the API.",
    };
  }
}

export async function sendLeadToApi(
  settings: Settings,
  lead: Lead,
  result: ScanResult,
): Promise<boolean> {
  if (!settings.apiBaseUrl || settings.demoMode) return false;

  try {
    const base = normalizeApiBaseUrl(settings.apiBaseUrl);
    const timeout = timeoutSignal(10_000);
    const response = await fetch(`${base}/api/v1/leads`, {
      method: "POST",
      headers: headers(settings),
      body: JSON.stringify({ lead, result }),
      signal: timeout.signal,
      cache: "no-store",
    }).finally(timeout.cancel);
    return response.ok;
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asConfidence(value: unknown): Confidence {
  return value === "high" || value === "medium" || value === "low" || value === "demo"
    ? value
    : "low";
}

function asDataSource(value: unknown): DataSource {
  return value === "demo" || value === "mock" || value === "api" ? value : "api";
}

function asPlatform(value: unknown): ScanResult["product"]["platform"] {
  return value === "tiktok" ||
    value === "shopify" ||
    value === "amazon" ||
    value === "instagram" ||
    value === "youtube" ||
    value === "generic"
    ? value
    : "generic";
}

function normalizeTiers(value: unknown): FactoryTier[] {
  if (!Array.isArray(value)) return [];
  const tiers: FactoryTier[] = [];
  for (const entry of value) {
    const obj = asRecord(entry);
    if (!obj) continue;
    const moq = asNumber(obj.moq, 0);
    const unitUsd = asNumber(obj.unitUsd, 0);
    if (moq > 0 && unitUsd > 0) {
      tiers.push({
        moq,
        unitUsd,
        ...(typeof obj.note === "string" ? { note: obj.note } : {}),
      });
    }
  }
  return tiers;
}

function normalizeSignals(value: unknown): FactorySignal[] {
  if (!Array.isArray(value)) return [];
  const signals: FactorySignal[] = [];
  for (const entry of value) {
    const obj = asRecord(entry);
    if (!obj) continue;
    const label = asString(obj.label).trim();
    const signalValue = asString(obj.value).trim();
    if (!label || !signalValue) continue;
    signals.push({
      label,
      value: signalValue,
      source: asString(obj.source, "Source not provided"),
      ...(typeof obj.asOf === "string" ? { asOf: obj.asOf } : {}),
    });
  }
  return signals;
}

function normalizeFactories(value: unknown): Factory[] {
  if (!Array.isArray(value)) return [];
  const factories: Factory[] = [];

  value.forEach((entry, index) => {
    const obj = asRecord(entry);
    if (!obj) return;
    const tiers = normalizeTiers(obj.tiers);
    const tierMin = tiers.length
      ? Math.min(...tiers.map((tier) => tier.unitUsd))
      : 0;
    const tierMax = tiers.length
      ? Math.max(...tiers.map((tier) => tier.unitUsd))
      : 0;
    const fobMinUsd = asNumber(obj.fobMinUsd, tierMin);
    const fobMaxUsd = asNumber(obj.fobMaxUsd, tierMax);
    if (fobMinUsd <= 0 || fobMaxUsd <= 0) return;

    const insuredEmployees = asOptionalNumber(obj.insuredEmployees);
    const insuredYear = asOptionalNumber(obj.insuredYear);
    const establishedYear = asOptionalNumber(obj.establishedYear);

    factories.push({
      id: asString(obj.id, `factory-${index + 1}`),
      maskedName: asString(obj.maskedName, `Verified factory #${index + 1}`),
      location: asString(obj.location, "Location not disclosed"),
      fobMinUsd,
      fobMaxUsd,
      tiers,
      ...(insuredEmployees !== undefined ? { insuredEmployees } : {}),
      ...(insuredYear !== undefined ? { insuredYear } : {}),
      ...(establishedYear !== undefined ? { establishedYear } : {}),
      signals: normalizeSignals(obj.signals),
      confidence: asConfidence(obj.confidence),
      confidenceReason: asString(
        obj.confidenceReason,
        "Confidence details were not provided.",
      ),
    });
  });

  return factories;
}

function normalizeAssumptions(value: unknown): CostAssumptions | null {
  const obj = asRecord(value);
  if (!obj) return null;
  const keys: Array<keyof CostAssumptions> = [
    "fobUsd",
    "shippingPerUnitUsd",
    "dutyRatePct",
    "platformFeePct",
    "affiliatePct",
    "paymentPct",
    "fulfillmentPerUnitUsd",
    "returnRatePct",
    "adPct",
  ];
  const out = {} as CostAssumptions;
  for (const key of keys) {
    const number = asOptionalNumber(obj[key]);
    if (number === undefined || number < 0) return null;
    out[key] = number;
  }
  return out;
}

function normalizeWaterfall(value: unknown): CostWaterfall | null {
  const obj = asRecord(value);
  if (!obj) return null;
  const keys: Array<keyof CostWaterfall> = [
    "retailUsd",
    "fobUsd",
    "shippingUsd",
    "dutyUsd",
    "landedUsd",
    "platformFeeUsd",
    "affiliateUsd",
    "paymentUsd",
    "fulfillmentUsd",
    "returnsUsd",
    "contributionUsd",
    "contributionMarginPct",
    "adUsd",
    "netUsd",
    "netMarginPct",
    "grossMarginPct",
  ];
  const out = {} as CostWaterfall;
  for (const key of keys) {
    const number = asOptionalNumber(obj[key]);
    if (number === undefined) return null;
    out[key] = number;
  }
  return out;
}

function normalizeFunnel(value: unknown): ScanFunnel {
  const obj = asRecord(value);
  if (!obj) {
    return {
      scanned: 0,
      excludedByReason: [],
      verified: 0,
      note: "No funnel data was returned.",
    };
  }

  const excluded: FunnelReason[] = [];
  if (Array.isArray(obj.excludedByReason)) {
    for (const entry of obj.excludedByReason) {
      const reason = asRecord(entry);
      if (!reason) continue;
      const label = asString(reason.reason).trim();
      const count = asNumber(reason.count, 0);
      if (label && count >= 0) excluded.push({ reason: label, count });
    }
  }

  return {
    scanned: Math.max(0, asNumber(obj.scanned, 0)),
    excludedByReason: excluded,
    verified: Math.max(0, asNumber(obj.verified, 0)),
    note: asString(obj.note, "No funnel note was returned."),
  };
}

function normalizeSources(value: unknown): ScanSource[] {
  if (!Array.isArray(value)) return [];
  const sources: ScanSource[] = [];
  for (const entry of value) {
    const obj = asRecord(entry);
    if (!obj) continue;
    const label = asString(obj.label).trim();
    if (!label) continue;
    sources.push({
      label,
      ...(typeof obj.url === "string" ? { url: obj.url } : {}),
      ...(typeof obj.asOf === "string" ? { asOf: obj.asOf } : {}),
    });
  }
  return sources;
}

function normalizeDisclaimers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["This is an estimate, not a supplier quote."];
  }
  const disclaimers = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return disclaimers.length
    ? disclaimers
    : ["This is an estimate, not a supplier quote."];
}

export function normalizeScanResult(
  raw: unknown,
  fallbackScanId: string,
): ScanResult {
  const obj = asRecord(raw);
  if (!obj) {
    throw new ApiError("API_BAD_RESULT", "The API returned an empty result.");
  }

  const productRaw = asRecord(obj.product);
  if (!productRaw) {
    throw new ApiError(
      "API_BAD_RESULT",
      "The API result is missing product data.",
    );
  }

  const title = asString(productRaw.title).trim();
  if (!title) {
    throw new ApiError(
      "API_BAD_RESULT",
      "The API result is missing product.title.",
    );
  }

  const retailUsd = asOptionalNumber(productRaw.retailUsd);
  const assumptions = normalizeAssumptions(obj.assumptions);
  const providedWaterfall = normalizeWaterfall(obj.waterfall);
  const computedWaterfall =
    !providedWaterfall && assumptions && retailUsd && retailUsd > 0
      ? computeWaterfall(retailUsd, assumptions)
      : null;

  const priceRangeRaw = asRecord(obj.priceRange);
  const fobMinUsd = priceRangeRaw ? asNumber(priceRangeRaw.fobMinUsd, 0) : 0;
  const fobMaxUsd = priceRangeRaw ? asNumber(priceRangeRaw.fobMaxUsd, 0) : 0;
  const priceRange =
    priceRangeRaw && fobMinUsd > 0 && fobMaxUsd > 0
      ? {
          fobMinUsd,
          fobMaxUsd,
          basis: asString(
            priceRangeRaw.basis,
            "Basis not provided by the API.",
          ),
          confidence: asConfidence(priceRangeRaw.confidence),
        }
      : null;

  return {
    scanId: asString(obj.scanId, fallbackScanId),
    dataSource: asDataSource(obj.dataSource),
    generatedAt: asString(obj.generatedAt, new Date().toISOString()),
    product: {
      title,
      ...(typeof productRaw.imageUrl === "string"
        ? { imageUrl: productRaw.imageUrl }
        : {}),
      sourceUrl: asString(productRaw.sourceUrl, ""),
      platform: asPlatform(productRaw.platform),
      retailUsd: retailUsd ?? null,
      retailSource: asString(
        productRaw.retailSource,
        "Retail source not provided.",
      ),
    },
    priceRange,
    waterfall:
      providedWaterfall ??
      computedWaterfall,
    assumptions,
    factories: normalizeFactories(obj.factories),
    funnel: normalizeFunnel(obj.funnel),
    ...(typeof obj.qualityWarning === "string"
      ? { qualityWarning: obj.qualityWarning }
      : {}),
    sources: normalizeSources(obj.sources),
    disclaimers: normalizeDisclaimers(obj.disclaimers),
  };
}

export function makeLead(
  input: LeadInput,
  result: ScanResult,
): Lead {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reportId: result.scanId,
    sourceUrl: result.product.sourceUrl,
    productTitle: result.product.title,
  };
}
