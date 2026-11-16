/**
 * Share-card renderer for the consumer report.
 *
 * The card is drawn locally on a canvas. If the product image is cross-origin
 * and taints the canvas, the export fails and the UI reports it instead of
 * shipping a broken image.
 */

import { formatUsd } from "../../shared/format";

export interface PosterData {
  title: string;
  imageUrl?: string;
  retailUsd: number | null;
  factoryLowUsd: number | null;
  factoryHighUsd: number | null;
  fairLowUsd: number | null;
  fairHighUsd: number | null;
  markupX: number | null;
  fairness: string;
  matchLabel: string;
  disclaimer: string;
  generatedAt: string;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 72;
const INK = "#1e1a17";
const MUTED = "#6b6259";
const LINE = "#e8dfd1";
const ACCENT = "#c0492f";
const ALERT = "#a63c25";

export async function renderPosterBlob(data: PosterData): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#faf6ee";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);

  drawHeader(context);

  const image = await loadImage(data.imageUrl);
  drawProduct(context, data.title, image);

  drawBigNumber(context, data);

  drawRows(context, data);
  drawMatch(context, data.matchLabel);
  drawFooter(context, data.disclaimer, data.generatedAt);

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  });
}

export function downloadPoster(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function drawHeader(context: CanvasRenderingContext2D): void {
  drawOnionHead(context, PAD + 22, 80, 21);

  context.textAlign = "left";
  context.fillStyle = INK;
  context.font = "700 30px 'PingFang SC', 'Helvetica Neue', Arial, sans-serif";
  context.fillText("别做洋葱头", PAD + 58, 74);
  context.fillStyle = MUTED;
  context.font = "600 15px 'Helvetica Neue', Arial, sans-serif";
  context.fillText("DON'T BE THE ONION HEAD", PAD + 58, 97);

  context.textAlign = "right";
  context.fillStyle = MUTED;
  context.font = "600 14px 'Helvetica Neue', Arial, sans-serif";
  context.fillText("SCAN BEFORE YOU BUY", WIDTH - PAD, 82);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

function drawOnionHead(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  context.fillStyle = "#2f6f68";
  context.beginPath();
  context.ellipse(cx - 7, cy - r - 6, 5, 12, -0.5, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(cx + 7, cy - r - 6, 5, 12, 0.5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#e8b27f";
  context.beginPath();
  context.ellipse(cx, cy + 2, r * 0.92, r * 1.06, 0, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = INK;
  context.stroke();

  context.fillStyle = INK;
  context.beginPath();
  context.arc(cx - r * 0.3, cy, r * 0.13, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(cx + r * 0.3, cy, r * 0.13, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(cx, cy + r * 0.16, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
  context.stroke();
}

function drawProduct(
  context: CanvasRenderingContext2D,
  title: string,
  image: HTMLImageElement | null,
): void {
  const top = 150;
  const size = 132;
  if (image) {
    context.save();
    roundRect(context, PAD, top, size, size, 14);
    context.clip();
    drawImageCover(context, image, PAD, top, size, size);
    context.restore();
    context.strokeStyle = LINE;
    context.lineWidth = 2;
    roundRect(context, PAD, top, size, size, 14);
    context.stroke();
  }

  const textLeft = image ? PAD + size + 26 : PAD;
  const maxWidth = WIDTH - PAD - textLeft;
  context.fillStyle = MUTED;
  context.font = "600 14px 'Helvetica Neue', Arial, sans-serif";
  context.fillText("PRODUCT", textLeft, top + 16);

  context.fillStyle = INK;
  context.font = "700 30px Georgia, 'Times New Roman', serif";
  const lines = wrapText(context, title, maxWidth, 2);
  lines.forEach((line, index) => {
    context.fillText(line, textLeft, top + 52 + index * 38);
  });

  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PAD, 322);
  context.lineTo(WIDTH - PAD, 322);
  context.stroke();
}

function drawBigNumber(context: CanvasRenderingContext2D, data: PosterData): void {
  const top = 400;
  context.fillStyle = MUTED;
  context.font = "600 15px 'Helvetica Neue', Arial, sans-serif";
  context.fillText("RETAIL PRICE vs EST. FACTORY COST", PAD, top);

  if (data.markupX === null) {
    context.fillStyle = INK;
    context.font = "700 64px Georgia, 'Times New Roman', serif";
    context.fillText("Not enough data", PAD, top + 92);
    return;
  }

  context.fillStyle = data.markupX >= 5 ? ALERT : INK;
  context.font = "800 150px Georgia, 'Times New Roman', serif";
  const big = `${data.markupX.toFixed(1)}×`;
  context.fillText(big, PAD, top + 158);

  context.fillStyle = INK;
  context.font = "600 24px Georgia, 'Times New Roman', serif";
  context.fillText(data.fairness, PAD, top + 198);
}

function drawRows(context: CanvasRenderingContext2D, data: PosterData): void {
  const rows: Array<[string, string]> = [
    ["You pay", money(data.retailUsd)],
    ["Est. factory cost", factoryLabel(data)],
    ["Fair price range", fairLabel(data)],
  ];
  let top = 690;
  for (const [label, value] of rows) {
    context.fillStyle = MUTED;
    context.font = "500 18px 'Helvetica Neue', Arial, sans-serif";
    context.fillText(label, PAD, top);

    context.textAlign = "right";
    context.fillStyle = INK;
    context.font = "700 30px 'PingFang SC', 'Helvetica Neue', Arial, sans-serif";
    context.fillText(value, WIDTH - PAD, top + 2);
    context.textAlign = "left";

    top += 54;
    context.strokeStyle = LINE;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(PAD, top);
    context.lineTo(WIDTH - PAD, top);
    context.stroke();
    top += 44;
  }
}

function drawMatch(context: CanvasRenderingContext2D, label: string): void {
  const top = 950;
  context.fillStyle = "#f5eee2";
  roundRect(context, PAD, top, WIDTH - PAD * 2, 62, 10);
  context.fill();

  context.fillStyle = MUTED;
  context.font = "600 12px 'Helvetica Neue', Arial, sans-serif";
  context.fillText("1688 IMAGE SEARCH", PAD + 22, top + 24);
  context.fillStyle = INK;
  context.font = "600 20px 'Helvetica Neue', Arial, sans-serif";
  context.fillText(label, PAD + 22, top + 48);
}

function drawFooter(
  context: CanvasRenderingContext2D,
  disclaimer: string,
  generatedAt: string,
): void {
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PAD, 1160);
  context.lineTo(WIDTH - PAD, 1160);
  context.stroke();

  context.fillStyle = MUTED;
  context.font = "500 14px 'Helvetica Neue', Arial, sans-serif";
  const lines = wrapText(
    context,
    disclaimer,
    WIDTH - PAD * 2,
    3,
    22,
  );
  lines.forEach((line, index) => context.fillText(line, PAD, 1200 + index * 24));

  context.fillStyle = "#9ca3af";
  context.font = "500 13px 'Helvetica Neue', Arial, sans-serif";
  context.fillText(`Generated ${generatedAt}`, PAD, 1310);
  context.textAlign = "right";
  context.fillText("别做洋葱头 · estimates only", WIDTH - PAD, 1310);
  context.textAlign = "left";
}

function factoryLabel(data: PosterData): string {
  if (data.factoryLowUsd === null && data.factoryHighUsd === null) return "Not found";
  const low = data.factoryLowUsd ?? data.factoryHighUsd ?? 0;
  const high = data.factoryHighUsd ?? data.factoryLowUsd ?? 0;
  if (Math.abs(high - low) < 0.005) return formatUsd(low);
  return `${formatUsd(low)}–${formatUsd(high)}`;
}

function fairLabel(data: PosterData): string {
  if (data.fairLowUsd === null || data.fairHighUsd === null) return "Not enough data";
  return `${formatUsd(data.fairLowUsd)}–${formatUsd(data.fairHighUsd)}`;
}

function money(value: number | null): string {
  return value === null ? "Not found" : formatUsd(value);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  lineHeight = 38,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? "";
    if (context.measureText(last).width > maxWidth) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 2))}…`;
    }
  }
  return lines;
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

async function loadImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
