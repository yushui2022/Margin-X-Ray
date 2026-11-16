import { imageBase64 } from "./recognize";
import { isAbortError } from "./deadline";
import { searchJustOneAPI } from "./justoneapi";
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
  const justoneapi = Boolean(settings.justoneapiToken);
  if (!official && !onebound && !justoneapi) {
    return {
      ...request.context,
      supplyNote:
        "JustOneAPI, OneBound and 1688 open platform keys are not set, so no listing price was fetched.",
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

  if (justoneapi) {
    try {
      const found = await searchJustOneAPI({
        token: settings.justoneapiToken,
        ...(image.url ? { imageUrl: image.url } : {}),
        ...(image.base64 ? { imageBase64: image.base64 } : {}),
        isFactory: true,
        verifiedSupplier: false,
        signal,
      });
      if (found.offers.length) {
        report = buildSupplyReport("justoneapi", found.scanned, found.offers, fxRate);
      } else {
        notes.push("JustOneAPI returned no priced 1688 listings.");
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      notes.push(
        error instanceof Error ? error.message : "JustOneAPI image search failed.",
      );
    }
  }

  if (!report && onebound) {
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
    ? `${providerLabel(report.provider)} returned ${report.cnyLabel}.`
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

function providerLabel(provider: SupplyReport["provider"]): string {
  switch (provider) {
    case "justoneapi":
      return "JustOneAPI";
    case "alibaba-open":
      return "1688 open platform";
    case "onebound":
      return "OneBound";
  }
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
