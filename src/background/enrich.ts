import {
  applyEnrichment,
  recognitionImageSource,
  shouldFetchTikHub,
} from "../shared/identity";
import type {
  PageContext,
  ProductRecognition,
  SampledFrame,
  ScanProgress,
  ScanRequest,
  Settings,
} from "../shared/types";
import { isAbortError } from "./deadline";
import { imageBase64, recognizeProduct } from "./recognize";
import { fetchTikHubVideo } from "./tikhub";

export const EARLY_STEPS = new Set(["capture", "resolve", "image"]);

export async function enrichScan(
  request: ScanRequest,
  settings: Settings,
  tabId: number,
  onProgress: (progress: ScanProgress) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<PageContext> {
  const notes: string[] = [];
  let tikhub: Awaited<ReturnType<typeof fetchTikHubVideo>> | null = null;
  const wantsTikHub = shouldFetchTikHub(request.context);

  await emit(onProgress, request, "capture", 8, "Reading the page you submitted.");

  if (wantsTikHub && settings.tikhubToken) {
    await emit(onProgress, request, "resolve", 22, "Fetching the video from TikHub…");
    try {
      tikhub = await fetchTikHubVideo(settings.tikhubToken, request.context, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      notes.push(
        error instanceof Error
          ? `TikHub: ${error.message}`
          : "TikHub could not resolve this video.",
      );
    }
  } else if (wantsTikHub) {
    notes.push("TikHub token is not set, so the video was not fetched.");
  }

  await emit(
    onProgress,
    request,
    "resolve",
    22,
    tikhub
      ? `TikHub returned the video${tikhub.author ? ` by ${tikhub.author}` : ""}.`
      : wantsTikHub
        ? "TikHub did not return a video."
        : "This page is not a TikTok or Douyin video.",
  );

  const still = stillImage(request.context);
  let frames: SampledFrame[] = [];
  if (!still && request.context.extractedBy !== "url-input") {
    await emit(onProgress, request, "image", 38, "Sampling video frames…");
    frames = await requestFrames(tabId);
    if (!frames.length && request.context.pageType === "video") {
      notes.push(
        "No readable video frame. Cross-origin video stays in the player, so recognition uses a cover or page image when one exists.",
      );
    }
  }

  const target = recognitionTarget(request.context, frames, tikhub?.coverUrl);
  let recognition: ProductRecognition | null = null;
  if (!settings.baiduApiKey || !settings.baiduSecretKey) {
    if (target) {
      notes.push("Baidu product recognition keys are not set, so the image was not identified.");
    }
  } else if (!target) {
    notes.push("No image or video frame was available for product recognition.");
  } else {
    await emit(onProgress, request, "image", 38, "Sending an image to Baidu product recognition…");
    try {
      const base64 = target.dataUrl ? imageBase64(target.dataUrl) : null;
      recognition = await recognizeProduct({
        apiKey: settings.baiduApiKey,
        secretKey: settings.baiduSecretKey,
        ...(base64 ? { imageBase64: base64 } : {}),
        ...(target.url ? { imageUrl: target.url } : {}),
        imageSource: target.imageSource,
        ...(target.timeSec !== undefined ? { frameTimeSec: target.timeSec } : {}),
        signal,
      });
      if (recognition.score < 0.45) {
        notes.push("Product recognition score is below 45%, so it was not used as the product title.");
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      notes.push(
        error instanceof Error
          ? `Baidu product recognition: ${error.message}`
          : "Product recognition failed.",
      );
    }
  }

  const context = applyEnrichment(request.context, {
    tikhub,
    recognition,
    frameCount: frames.length || (still?.source === "video-frame" ? 1 : 0),
    notes,
    previewImage: !request.context.imageUrl ? target?.dataUrl : undefined,
  });

  await emit(
    onProgress,
    request,
    "image",
    38,
    recognition
      ? `Baidu product recognition: ${recognition.name} (${Math.round(recognition.score * 100)}%).`
      : frames.length
        ? `Sampled ${frames.length} frame${frames.length === 1 ? "" : "s"}.`
        : "No product identification was added.",
  );

  return context;
}

function stillImage(
  context: PageContext,
): { dataUrl: string; source: "upload" | "video-frame" | "page" } | null {
  if (!context.imageUrl?.startsWith("data:image/")) return null;
  if (context.extractedBy === "image-upload") {
    return { dataUrl: context.imageUrl, source: "upload" };
  }
  if (context.extractedBy === "screenshot") {
    const videoFrame = (context.warnings ?? []).some((warning) => /video frame/i.test(warning));
    return { dataUrl: context.imageUrl, source: videoFrame ? "video-frame" : "page" };
  }
  return null;
}

function recognitionTarget(
  context: PageContext,
  frames: SampledFrame[],
  coverUrl: string | undefined,
): {
  dataUrl?: string;
  url?: string;
  imageSource: ProductRecognition["imageSource"];
  timeSec?: number;
} | null {
  const still = stillImage(context);
  if (still && imageBase64(still.dataUrl)) {
    return {
      dataUrl: still.dataUrl,
      imageSource: recognitionImageSource(
        context.extractedBy,
        still.source === "video-frame",
        false,
      ),
      ...(context.video?.currentTime !== undefined ? { timeSec: context.video.currentTime } : {}),
    };
  }
  const frame = frames[Math.floor(frames.length / 2)] ?? frames[0];
  if (frame && imageBase64(frame.dataUrl)) {
    return {
      dataUrl: frame.dataUrl,
      imageSource: "video-frame",
      timeSec: frame.timeSec,
    };
  }
  if (coverUrl) return { url: coverUrl, imageSource: "cover" };
  if (context.imageUrl?.startsWith("http://") || context.imageUrl?.startsWith("https://")) {
    return { url: context.imageUrl, imageSource: "page" };
  }
  return null;
}

async function requestFrames(tabId: number): Promise<SampledFrame[]> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_FRAMES" })) as
      | { ok?: boolean; frames?: unknown }
      | undefined;
    if (!response?.ok || !Array.isArray(response.frames)) return [];
    return response.frames.filter(isFrame).slice(0, 3);
  } catch {
    return [];
  }
}

function isFrame(value: unknown): value is SampledFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as SampledFrame;
  return (
    frame.source === "video-frame" &&
    typeof frame.timeSec === "number" &&
    typeof frame.dataUrl === "string" &&
    frame.dataUrl.startsWith("data:image/") &&
    frame.dataUrl.length <= 1_800_000
  );
}

async function emit(
  onProgress: (progress: ScanProgress) => void | Promise<void>,
  request: ScanRequest,
  stepId: string,
  percent: number,
  message: string,
): Promise<void> {
  await onProgress({
    scanId: request.scanId,
    stepId,
    percent,
    message,
  });
}
