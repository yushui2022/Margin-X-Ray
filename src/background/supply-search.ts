import { imageBase64 } from "./recognize";
import { isAbortError } from "./deadline";
import { searchAlibabaOpen } from "./alibaba";
import { searchOneBound } from "./onebound";
import { buildSupplyReport, parseFxRate } from "../shared/supply";
import type { PageContext, ScanProgress, ScanRequest, Settings, SupplyReport } from "../shared/types";

export async function searchSupply(
  request: ScanRequest,
  settings: Settings,
  onProgress: (progress: ScanProgress) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<PageContext> {
  const official = Boolean(
    settings.alibabaAppKey && settings.alibabaAppSecret && settings.alibabaAccessToken,
  );
  const onebound = Boolean(settings.oneboundKey && settings.oneboundSecret);
  if (!official && !onebound) {
    return {
      ...request.context,
      supplyNote: "OneBound and 1688 open platform keys are not set, so no listing price was fetched.",
    };
  }

  const image = imageForSearch(request.context);
  if (!image) {
    return {
      ...request.context,
      supplyNote: "No public image or frame was available for 1688 image search.",
    };
  }

  await onProgress({
    scanId: request.scanId,
    stepId: "supply",
    percent: 72,
    message: "Searching 1688 by image…",
  });

  const notes: string[] = [];
  const fxRate = parseFxRate(settings.usdCnyRate);
  let report: SupplyReport | undefined;

  if (onebound && (image.url || image.base64)) {
    try {
      const found = await searchOneBound({
        key: settings.oneboundKey,
        secret: settings.oneboundSecret,
        ...(image.url ? { imageUrl: image.url } : {}),
        ...(image.base64 ? { imageBase64: image.base64 } : {}),
        detailLimit: settings.oneboundFetchTiers ? 1 : 0,
        signal,
      });
      if (found.offers.length) {
        report = buildSupplyReport("onebound", found.scanned, found.offers, fxRate);
      } else {
        notes.push("OneBound returned no priced listings.");
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      notes.push(error instanceof Error ? error.message : "OneBound image search failed.");
    }
  }

  if (!report && official && image.url) {
    try {
      const found = await searchAlibabaOpen({
        appKey: settings.alibabaAppKey,
        appSecret: settings.alibabaAppSecret,
        accessToken: settings.alibabaAccessToken,
        imageUrl: image.url,
        signal,
      });
      if (found.offers.length) {
        report = buildSupplyReport("alibaba-open", found.scanned, found.offers, fxRate);
      } else {
        notes.push("1688 open platform returned no priced listings.");
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      notes.push(error instanceof Error ? error.message : "1688 open platform image search failed.");
    }
  } else if (!report && official && !image.url) {
    notes.push("1688 open platform needs a public image URL. The local frame was not sent there.");
  }

  const message = report
    ? `${report.provider === "alibaba-open" ? "1688 open platform" : "OneBound"} returned ${report.cnyLabel}.`
    : notes[0] ?? "1688 image search returned no price.";

  await onProgress({
    scanId: request.scanId,
    stepId: "supply",
    percent: 72,
    message,
  });

  return {
    ...request.context,
    ...(report ? { supply: report } : {}),
    ...(notes.length ? { supplyNote: notes.join(" ") } : {}),
  };
}

function imageForSearch(context: PageContext): { url?: string; base64?: string } | null {
  const httpImage = context.imageUrl?.startsWith("http") ? context.imageUrl : undefined;
  const cover = context.enrichment?.tikhub?.coverUrl;
  const url = httpImage ?? cover;
  const base64 = context.imageUrl?.startsWith("data:image/")
    ? imageBase64(context.imageUrl) ?? undefined
    : undefined;
  if (!url && !base64) return null;
  return {
    ...(url ? { url } : {}),
    ...(base64 ? { base64 } : {}),
  };
}
