import { parseShopListing } from "./video-lookup.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readLimitedBody, requireShoppingPost, sendJson, ShoppingError } from "./shopping-http.mjs";

const unsupported = () => new ShoppingError(422, "Use a readable PNG or JPEG screenshot of up to 24 megapixels.");
const appleReader = fileURLToPath(new URL("./shopping-ocr.swift", import.meta.url));

function dimensions(data, mime) {
  if (mime === "image/png" && data.length >= 33 && data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    && data.readUInt32BE(8) === 13 && data.toString("ascii", 12, 16) === "IHDR") return [data.readUInt32BE(16), data.readUInt32BE(20)];
  if (mime !== "image/jpeg" || data[0] !== 255 || data[1] !== 216) throw unsupported();
  for (let i = 2; i + 8 < data.length;) {
    if (data[i++] !== 255) break;
    while (data[i] === 255) i++;
    const marker = data[i++];
    if (marker === 218 || marker === 217 || i + 7 > data.length) break;
    const size = data.readUInt16BE(i);
    if (size < 2 || i + size > data.length) break;
    if ([192, 193, 194].includes(marker) && size >= 8) return [data.readUInt16BE(i + 5), data.readUInt16BE(i + 3)];
    i += size;
  }
  throw unsupported();
}

export function validateScreenshot(data, mime) {
  const [width, height] = dimensions(data, mime);
  if (!width || !height || width * height > 24_000_000) throw unsupported();
}

export function screenshotEvidence(raw) {
  const text = raw.trim().slice(0, 6000);
  const candidates = new Map();
  const urls = /(?:https?:\/\/|www\.|\b(?=(?:[\w-]+\.)+(?:com|co\.uk|shop|store|net|org|io)\b))(?:[\w.-]+\.)[a-z]{2,}(?::\d+)?(?:\/[^\s<>"“”]*)?/gi;
  const remaining = text.replace(urls, (match, offset) => {
    if (text[offset - 1] === "@") return "";
    const cleaned = match.replace(/[),.!?;:]+$/, "");
    const url = URL.parse(cleaned.includes("://") ? cleaned : "https://" + cleaned);
    if (!url || url.username || url.password || url.port) return "";
    const listing = parseShopListing(url.href);
    if (listing) {
      candidates.set(listing.url, { kind: "website", url: listing.url, label: "TikTok Shop · " + listing.productId });
      return "";
    }
    if (/^(?:(?:www|m|vt|vm)\.)?tiktok\.com$/.test(url.hostname)) {
      const video = /^\/@[\w.]+\/video\/\d{6,22}\/?$/.test(url.pathname) || /^\/t\/[\w-]+\/?$/.test(url.pathname)
        || (/^(vm|vt)\./.test(url.hostname) && /^\/[\w-]+\/?$/.test(url.pathname));
      const profile = /^\/@[\w.]{1,24}\/?$/.test(url.pathname);
      if (video || profile) {
        url.search = ""; url.hash = "";
        candidates.set(url.href, { kind: video ? "video" : "profile", url: url.href, label: url.href });
      }
    } else if (!/^(?:\d+\.)+\d+$|\.(?:local|internal|localhost|test|invalid|example)$/.test(url.hostname)) {
      candidates.set(url.href, { kind: "website", url: url.href, label: url.hostname + (url.pathname === "/" ? "" : url.pathname) });
    }
    return "";
  });
  for (const match of remaining.matchAll(/(?:^|[^\w@.+-])@([a-z\d_][a-z\d_.]{0,23})(?![\w.])/gi)) {
    const handle = match[1].replace(/\.$/, "").toLowerCase();
    if ([...candidates.values()].some(c => c.url.toLowerCase().includes("/@" + handle + "/video/"))) continue;
    const url = "https://www.tiktok.com/@" + handle;
    candidates.set(url, { kind: "profile", url, label: "@" + handle });
  }
  const rows = [...candidates.values()].slice(0, 8);
  return { text, candidates: rows, message: rows.length ? "Read the visible links and handles in the screenshot."
    : text ? "Confirm the visible brand and product name, or paste the original link." : "No readable text. Add a clearer screenshot showing the handle, product name or link." };
}

function recognize(data) {
  const mac = process.platform === "darwin";
  const command = mac ? "/usr/bin/swift" : "tesseract";
  const args = mac ? [appleReader] : ["stdin", "stdout", "-l", process.env.SHOPPING_OCR_LANGUAGES || "eng", "--psm", "11"];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"], timeout: 35000, killSignal: "SIGKILL",
      env: Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "TESSDATA_PREFIX"].filter(key => process.env[key]).map(key => [key, process.env[key]])) });
    let output = Buffer.alloc(0);
    child.stdout.on("data", chunk => { if (output.length < 64 * 1024) output = Buffer.concat([output, chunk.subarray(0, 65536 - output.length)]); });
    child.once("error", () => reject(new ShoppingError(503, "Screenshot text recognition is unavailable. Paste the link or enter the visible product name.")));
    child.once("close", code => code === 0 ? resolve(output.toString("utf8"))
      : reject(new ShoppingError(code === 2 ? 422 : 503, "Could not read this screenshot. Try a clearer crop or paste the link.")));
    child.stdin.on("error", () => {}); // The OCR process can exit before it has consumed the whole image.
    child.stdin.end(data);
  });
}

export function createShoppingScreenshot({ readText = recognize } = {}) {
  let running = 0;
  let starts = [];
  return { async handle(req, res) {
    if (req.url?.split("?")[0] !== "/api/shopping-screenshot") return false;
    let counted = false;
    try {
      requireShoppingPost(req, res);
      const mime = req.headers["content-type"]?.split(";")[0].trim();
      if (!["image/png", "image/jpeg"].includes(mime)) throw new ShoppingError(415, "Upload a PNG or JPEG screenshot.");
      starts = starts.filter(row => Date.now() - row.time < 600_000);
      const ip = req.socket.remoteAddress;
      if (running >= 2 || starts.length >= 80 || starts.filter(row => row.ip === ip).length >= 20) throw new ShoppingError(429, "Screenshot checks are busy. Try again shortly.");
      counted = true; running++; starts.push({ ip, time: Date.now() });
      const data = await readLimitedBody(req, 5 * 1024 * 1024, "Choose a screenshot under 5 MB.");
      validateScreenshot(data, mime);
      sendJson(res, 200, screenshotEvidence(await readText(data)));
    } catch (err) {
      sendJson(res, err.status ?? 503, { error: err instanceof ShoppingError ? err.message : "Screenshot text recognition is unavailable." });
    } finally { if (counted) running--; }
    return true;
  } };
}
