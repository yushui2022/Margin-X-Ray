import { createDemoResult } from "../shared/demo";
import { SCAN_STEP_DEFS } from "../shared/steps";
import type { ScanProgress, ScanRequest, ScanResult } from "../shared/types";

export async function runDemoScan(
  request: ScanRequest,
  onProgress: (progress: ScanProgress) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<ScanResult> {
  await onProgress({
    scanId: request.scanId,
    stepId: "capture",
    percent: 4,
    message: "Captured page context. Starting the demo scan…",
  });

  for (const step of SCAN_STEP_DEFS) {
    await delay(260, signal);
    await onProgress({
      scanId: request.scanId,
      stepId: step.id,
      percent: step.percent,
      message: step.message,
    });
  }

  return createDemoResult(request.context, request.scanId);
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
