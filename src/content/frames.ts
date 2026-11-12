import { frameTimestamps } from "../shared/identity";
import type { SampledFrame } from "../shared/types";

const MAX_EDGE = 960;
const MAX_DATA_URL = 1_800_000;

export function captureCurrentFrame(): SampledFrame | null {
  const video = largestVideo();
  if (!video) return null;
  return drawFrame(video, video.currentTime || 0);
}

export async function sampleVideoFrames(): Promise<SampledFrame[]> {
  const current = captureCurrentFrame();
  const extra = await Promise.race([
    sampleExtraFrames(),
    delay(4500).then(() => [] as SampledFrame[]),
  ]);
  if (extra.length) return extra.slice(0, 3);
  return current ? [current] : [];
}

async function sampleExtraFrames(): Promise<SampledFrame[]> {
  const live = largestVideo();
  const src = live?.currentSrc || live?.src || "";
  if (!live || !src || src.startsWith("blob:")) return [];

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;";
  holder.append(video);
  document.documentElement.append(holder);

  try {
    video.src = src;
    await waitFor(video, "loadeddata", 4000);
    const times = frameTimestamps(video.duration, live.currentTime);
    const frames: SampledFrame[] = [];
    for (const time of times) {
      await seekTo(video, time, 2000);
      const frame = drawFrame(video, time);
      if (frame) frames.push(frame);
    }
    return frames;
  } catch {
    return [];
  } finally {
    video.removeAttribute("src");
    video.load();
    holder.remove();
  }
}

function largestVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll("video"));
  const ready = videos
    .filter((video) => video.readyState >= 2 && video.videoWidth > 0)
    .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight);
  return ready[0] ?? null;
}

function drawFrame(video: HTMLVideoElement, timeSec: number): SampledFrame | null {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    if (!dataUrl.startsWith("data:image/jpeg") || dataUrl.length > MAX_DATA_URL) {
      return null;
    }
    return {
      timeSec: Math.round(timeSec * 10) / 10,
      dataUrl,
      source: "video-frame",
    };
  } catch {
    return null;
  }
}

function seekTo(video: HTMLVideoElement, time: number, timeoutMs: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.08 && video.readyState >= 2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("seek timeout")), timeoutMs);
    const onSeeked = () => finish();
    const onError = () => finish(new Error("video error"));
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    try {
      video.currentTime = time;
    } catch (error) {
      finish(error instanceof Error ? error : new Error("seek failed"));
    }
  });
}

function waitFor(video: HTMLVideoElement, eventName: "loadeddata", timeoutMs: number): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("load timeout")), timeoutMs);
    const onReady = () => finish();
    const onError = () => finish(new Error("video error"));
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    video.addEventListener(eventName, onReady);
    video.addEventListener("error", onError);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
