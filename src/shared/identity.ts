import { parsePriceText, truncate } from "./format";
import type {
  CaptureEnrichment,
  PageContext,
  PriceInfo,
  ProductRecognition,
  RecognitionImageSource,
  ScanResult,
  ScanSource,
  TikHubVideo,
} from "./types";

const TITLE_SCORE = 0.45;

const CURRENCY_MARK =
  /(?:US\$|CA\$|AU\$|C\$|A\$|\$|£|€|¥|￥)|\b(?:USD|EUR|GBP|CNY|RMB|CAD|AUD|JPY|HKD|SGD)\b/i;

export function isWeakTitle(title: string): boolean {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length < 2) return true;
  if (
    /^(pasted product link|uploaded product image|short video|product page|video product|untitled product)/i.test(
      clean,
    )
  ) {
    return true;
  }
  if (/^product link · /i.test(clean)) return true;
  const head = clean.split("·")[0]?.trim() ?? clean;
  return /^\d+$/.test(head);
}

export function awemeIdFromUrl(raw: string): string | undefined {
  const match = raw.match(/\/video\/(\d{6,})/);
  return match?.[1];
}

export function shouldFetchTikHub(context: PageContext): boolean {
  if (/tiktok\.com|douyin\.com|iesdouyin\.com/i.test(context.url)) return true;
  return context.platform === "tiktok";
}

export function frameTimestamps(
  durationSec: number | undefined,
  currentTime?: number,
): number[] {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec < 0.8) {
    return [Math.max(0, currentTime ?? 0)];
  }
  const points = [0.2, 0.5, 0.8].map((ratio) =>
    Math.min(durationSec - 0.05, Math.max(0.05, durationSec * ratio)),
  );
  return [...new Set(points.map((time) => Math.round(time * 10) / 10))];
}

export function parseTikHubVideo(payload: unknown): TikHubVideo | null {
  const root = unwrapTikHub(payload);
  if (!root) return null;
  const detail = videoDetail(root);
  if (!detail) return null;

  const video = asRecord(detail.video);
  const author = asRecord(detail.author);
  const description = stringField(detail.desc) ?? stringField(detail.title);
  const awemeId = stringField(detail.aweme_id) ?? stringField(detail.awemeId);
  const coverUrl =
    firstUrl(video?.cover) ??
    firstUrl(video?.origin_cover) ??
    firstUrl(video?.dynamic_cover) ??
    firstUrl(detail.cover) ??
    firstUrl(detail.cover_url);
  const playUrl =
    firstUrl(video?.play_addr) ??
    firstUrl(video?.download_addr) ??
    firstUrl(detail.video_url) ??
    firstUrl(detail.play_url) ??
    firstUrl(detail.nwm_video_url);
  const durationSec = durationOf(video?.duration ?? detail.duration);
  const authorName =
    stringField(author?.nickname) ?? stringField(detail.author_name);
  const product = findAnchoredProduct(detail);

  if (!description && !coverUrl && !awemeId && !product?.title) return null;

  return {
    ...(awemeId ? { awemeId } : {}),
    ...(description ? { description } : {}),
    ...(authorName ? { author: authorName } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(playUrl ? { playUrl } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(product?.title ? { productTitle: product.title } : {}),
    ...(product?.price ? { price: product.price } : {}),
  };
}

export function parseBaiduProduct(
  payload: unknown,
): { name: string; score: number } | { error: string } {
  const root = asRecord(payload);
  if (!root) return { error: "Product recognition returned an unreadable response." };
  if (typeof root.error_code === "number") {
    const message =
      stringField(root.error_msg) ?? `Baidu error ${root.error_code}.`;
    return { error: message };
  }
  const rows = Array.isArray(root.result) ? root.result : [];
  let best: { name: string; score: number } | null = null;
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const name = stringField(record.name)?.replace(/\s+/g, " ").trim();
    const score = numberField(record.score);
    if (!name || score === undefined || score < 0 || score > 1) continue;
    if (!best || score > best.score) best = { name, score };
  }
  if (!best) return { error: "Product recognition found no product in the image." };
  return best;
}

export function applyEnrichment(
  context: PageContext,
  input: {
    tikhub?: TikHubVideo | null;
    recognition?: ProductRecognition | null;
    frameCount: number;
    notes: string[];
    previewImage?: string;
  },
): PageContext {
  const tikhub = input.tikhub ?? undefined;
  const recognition = input.recognition ?? undefined;
  const notes = input.notes.filter(Boolean);
  let title = context.title;
  let price = context.price;
  let imageUrl = context.imageUrl;
  let caption = context.caption;

  if (tikhub?.productTitle) {
    title = truncate(tikhub.productTitle, 180);
  } else if (isWeakTitle(title) && tikhub?.description) {
    title = truncate(tikhub.description, 180);
  } else if (
    isWeakTitle(title) &&
    recognition &&
    recognition.score >= TITLE_SCORE
  ) {
    title = truncate(recognition.name, 180);
  }

  if (!price && tikhub?.price) price = tikhub.price;
  if (!imageUrl) imageUrl = tikhub?.coverUrl ?? input.previewImage;
  if (!caption && tikhub?.description) caption = tikhub.description;

  const enrichment: CaptureEnrichment = {
    ...(tikhub ? { tikhub } : {}),
    ...(recognition ? { recognition } : {}),
    frameCount: input.frameCount,
    notes,
  };

  return {
    ...context,
    title,
    ...(price ? { price } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(caption ? { caption } : {}),
    enrichment,
  };
}

export function attachIdentity(result: ScanResult, context: PageContext): ScanResult {
  const extra = identitySources(context);
  const sources = [...result.sources];
  for (const source of extra) {
    if (!sources.some((item) => item.label === source.label)) sources.push(source);
  }

  const product = { ...result.product };
  if (
    result.dataSource !== "api" &&
    !isWeakTitle(context.title) &&
    context.title !== product.title
  ) {
    product.title = context.title;
  }
  if (result.dataSource !== "api" && !product.imageUrl && context.imageUrl) {
    product.imageUrl = context.imageUrl;
  }
  if (
    result.dataSource !== "api" &&
    context.price &&
    context.price.currency.toUpperCase() !== "USD" &&
    product.retailSource.startsWith("Demo retail")
  ) {
    product.retailSource = `Demo retail price — ${context.price.source} listed ${context.price.amount} ${context.price.currency}, which was not converted to USD`;
  }

  return { ...result, product, sources };
}

export function enrichedStepMessage(
  stepId: string,
  fallback: string,
  context: PageContext,
): string {
  const enrichment = context.enrichment;
  if (!enrichment) return fallback;
  if (stepId === "capture") {
    if (enrichment.frameCount > 0) {
      return `Sampled ${enrichment.frameCount} video frame${
        enrichment.frameCount === 1 ? "" : "s"
      }.`;
    }
    return fallback;
  }
  if (stepId === "resolve" && enrichment.tikhub) {
    const who = enrichment.tikhub.author ? ` by ${enrichment.tikhub.author}` : "";
    return `TikHub returned the video${who}.`;
  }
  if (stepId === "image" && enrichment.recognition) {
    const pct = Math.round(enrichment.recognition.score * 100);
    return `Baidu product recognition: ${enrichment.recognition.name} (${pct}%).`;
  }
  return fallback;
}

export function recognitionImageSource(
  extractedBy: string,
  fromFrame: boolean,
  fromCover: boolean,
): RecognitionImageSource {
  if (fromFrame) return "video-frame";
  if (extractedBy === "image-upload") return "upload";
  if (fromCover) return "cover";
  return "page";
}

function identitySources(context: PageContext): ScanSource[] {
  const enrichment = context.enrichment;
  if (!enrichment) return [];
  const sources: ScanSource[] = [];
  if (enrichment.tikhub) {
    sources.push({
      label: enrichment.tikhub.awemeId
        ? `TikHub video ${enrichment.tikhub.awemeId}`
        : "TikHub video",
      asOf: new Date().toISOString(),
    });
  }
  if (enrichment.frameCount > 0) {
    sources.push({
      label: `${enrichment.frameCount} video frame${
        enrichment.frameCount === 1 ? "" : "s"
      } sampled in the browser`,
    });
  }
  if (enrichment.recognition) {
    const pct = Math.round(enrichment.recognition.score * 100);
    sources.push({
      label: `Baidu product recognition: ${enrichment.recognition.name} (${pct}%)`,
      asOf: new Date().toISOString(),
    });
  }
  return sources;
}

function unwrapTikHub(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  if (!root) return null;
  if (typeof root.data !== "string") return root;
  try {
    const parsed = JSON.parse(root.data) as unknown;
    return { ...root, data: parsed };
  } catch {
    return root;
  }
}

function videoDetail(root: Record<string, unknown>): Record<string, unknown> | null {
  const data = asRecord(root.data) ?? root;
  return (
    asRecord(data.aweme_detail) ??
    asRecord(data.awemeDetail) ??
    firstRecord(data.aweme_details) ??
    firstRecord(data.aweme_list) ??
    data
  );
}

function findAnchoredProduct(
  detail: Record<string, unknown>,
): { title?: string; price?: PriceInfo } | null {
  for (const key of ["anchors", "commerce_info", "product_info", "extra"]) {
    const found = walkProduct(detail[key], 0);
    if (found?.title) return found;
  }
  return null;
}

function walkProduct(
  value: unknown,
  depth: number,
): { title?: string; price?: PriceInfo } | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    if (trimmed.length > 20_000) return null;
    try {
      return walkProduct(JSON.parse(trimmed) as unknown, depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 12)) {
      const found = walkProduct(item, depth + 1);
      if (found?.title) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const title = productTitle(record);
  const price = priceFromRecord(record);
  if (title) return price ? { title, price } : { title };
  for (const key of ["anchors", "extra", "commerce_info", "product_info", "price_info"]) {
    if (!(key in record)) continue;
    const found = walkProduct(record[key], depth + 1);
    if (found?.title) return found;
  }
  return null;
}

function productTitle(record: Record<string, unknown>): string | undefined {
  const explicit =
    stringField(record.product_title) ?? stringField(record.product_name);
  if (explicit) return explicit;
  const looksLikeProduct = Boolean(
    record.product_id ?? record.productId ?? record.price_info ?? record.product_info,
  );
  if (!looksLikeProduct) return undefined;
  return stringField(record.title);
}

function priceFromRecord(record: Record<string, unknown>): PriceInfo | undefined {
  const formatted =
    stringField(record.format_price) ??
    stringField(record.price_str) ??
    stringField(record.display_price) ??
    stringField(record.sale_price_str);
  const fromText = explicitPrice(formatted);
  if (fromText) return fromText;

  const nested = asRecord(record.price_info);
  if (nested && nested !== record) {
    const nestedPrice = priceFromRecord(nested);
    if (nestedPrice) return nestedPrice;
  }

  const currency = (
    stringField(record.currency) ?? stringField(record.currency_name)
  )?.toUpperCase();
  const decimal = numberField(record.price_decimal);
  if (currency && decimal !== undefined && decimal > 0 && decimal < 1_000_000) {
    return {
      amount: decimal,
      currency,
      source: "TikHub",
    };
  }
  return undefined;
}

function explicitPrice(raw: string | undefined): PriceInfo | undefined {
  if (!raw || !CURRENCY_MARK.test(raw)) return undefined;
  const parsed = parsePriceText(raw);
  if (!parsed) return undefined;
  return {
    amount: parsed.amount,
    currency: parsed.currency,
    source: "TikHub",
    raw,
  };
}

function durationOf(value: unknown): number | undefined {
  const duration = numberField(value);
  if (duration === undefined || duration <= 0) return undefined;
  return duration > 1000 ? duration / 1000 : duration;
}

function firstUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  const record = asRecord(value);
  if (!record) return undefined;
  const list = record.url_list ?? record.urlList;
  if (!Array.isArray(list)) return undefined;
  const found = list.find(
    (item) => typeof item === "string" && /^https?:\/\//.test(item),
  );
  return typeof found === "string" ? found : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  return asRecord(value[0]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

function numberField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}
