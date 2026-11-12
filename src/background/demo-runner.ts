import { EARLY_STEPS } from "./enrich";
import { createDemoResult } from "../shared/demo";
import { enrichedStepMessage } from "../shared/identity";
import { SCAN_STEP_DEFS } from "../shared/steps";
import type { ScanProgress, ScanRequest, ScanResult } from "../shared/types";

export async function runDemoScan(
  request: ScanRequest,
  onProgress: (progress: ScanProgress) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<ScanResult> {
  const enriched = Boolean(request.context.enrichment);
  if (!enriched) {
    const captureMessage =
      request.context.extractedBy === "url-input"
        ? "Loaded the pasted link. Starting the demo scan…"
        : request.context.extractedBy === "image-upload"
          ? "Loaded the uploaded image. Starting the demo scan…"
          : request.context.extractedBy === "screenshot"
            ? "Captured the current screen. Starting the demo scan…"
            : "Captured page context. Starting the demo scan…";

    await onProgress({
      scanId: request.scanId,
      stepId: "capture",
      percent: 4,
      message: captureMessage,
    });
  }

  for (const step of SCAN_STEP_DEFS) {
    if (enriched && EARLY_STEPS.has(step.id)) continue;
    if (
      (request.context.supply || request.context.supplyNote) &&
      step.id === "supply"
    ) {
      continue;
    }
    await delay(260, signal);
    await onProgress({
      scanId: request.scanId,
      stepId: step.id,
      percent: step.percent,
      message: demoStepMessage(step.id, request.context, step.message),
    });
  }

  return createDemoResult(request.context, request.scanId);
}

function demoStepMessage(
  stepId: string,
  context: ScanRequest["context"],
  fallback: string,
): string {
  if (stepId === "verify" && (context.supply || context.supplyNote)) {
    return "Registry, headcount and lawsuit checks were not run.";
  }
  if (stepId === "price" && context.supply) {
    return context.supply.fxRate
      ? "Converted the 1688 CNY tiers with the saved exchange rate."
      : "Kept the 1688 prices in CNY. No exchange rate is saved.";
  }
  return enrichedStepMessage(stepId, fallback, context);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
