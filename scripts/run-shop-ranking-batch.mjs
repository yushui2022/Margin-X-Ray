// node scripts/run-shop-ranking-batch.mjs candidates.ndjson receipts-directory
// Accept one public video URL per line, or JSON lines with url / sourceUrl.
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createShoppingCheck, shoppingInput } from "../server/shopping-check.mjs";
import { parseVideoAddress } from "../server/video-lookup.mjs";
import { freezeShoppingSnapshot } from "../server/shopping-share.mjs";

const [inputFile, directory] = process.argv.slice(2);
if (!inputFile || !directory || !process.env.TIKHUB_TOKEN)
  throw new Error("Supply a candidate file, a receipts directory and TIKHUB_TOKEN in the environment.");

const urls = new Map();
let errors = 0;
const lines = (await readFile(inputFile, "utf8")).split(/\r?\n/);
for (const [index, raw] of lines.entries()) {
  const line = raw.trim();
  if (!line) continue;
  try {
    const row = line.startsWith("{") ? JSON.parse(line) : { url: line };
    const video = parseVideoAddress(row.url ?? row.sourceUrl);
    if (!video?.id || !video.handle || (row.handle && row.handle.toLowerCase() !== video.handle)) throw new Error();
    urls.set(video.url, video);
  } catch {
    errors++;
    console.error("Skipped invalid or conflicting TikTok source on line " + (index + 1) + ".");
  }
}

await mkdir(directory, { recursive: true });
const agent = createShoppingCheck();
const pending = urls.values();

function needsRetry(report) {
  return report.status === "partial" || report.commerce.some(p => p.detailStatus === "unavailable")
    || report.steps.some(s => s.status === "unavailable") || report.checks.some(c =>
      c.status === "unavailable" || c.followUp?.status === "unavailable" || c.followUp?.status === "time_limit");
}

async function worker() {
  for (const video of pending) {
    const path = join(directory, video.handle + "-" + video.id + ".json");
    const temp = path + "." + randomUUID() + ".tmp";
    const input = shoppingInput({ url: video.url, market: "US" });
    try {
      let previous;
      try {
        previous = JSON.parse(await readFile(path, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (previous && previous.report?.video?.url !== video.url) throw new Error("Checkpoint source mismatch.");
      if (previous && !previous.retryable && !needsRetry(previous.report)) continue;
      const started = performance.now();
      const report = await agent.run(input);
      if (report.video?.handle?.toLowerCase() !== video.handle.toLowerCase() || report.video.url !== video.url
        || report.video.provider !== "TikHub" || report.commerce.some(p => p.sourceUrl !== video.url)) {
        throw new Error("Could not verify the original TikHub post and creator.");
      }
      const snapshot = freezeShoppingSnapshot({ input, report });
      const scored = snapshot.report.shopOnion.scoredCount;
      const elapsedSeconds = Math.round((performance.now() - started) / 10) / 100;
      const retryable = needsRetry(report);
      // Preserve a better observation when a retry only returns partial upstream data.
      if (previous && retryable && (scored < previous.report.shopOnion.scoredCount
        || (!scored && report.commerce.length < previous.report.commerce.length))) continue;
      await writeFile(temp, JSON.stringify({ ...snapshot, elapsedSeconds, retryable }) + "\n", { mode: 0o600 });
      await rename(temp, path);
      console.log(JSON.stringify({ url: video.url, score: snapshot.report.shopOnion.score, products: report.commerce.length, elapsedSeconds, retryable }));
    } catch (error) {
      errors++;
      console.error(JSON.stringify({ url: video.url, error: error.status ?? error.code ?? error.name }));
    } finally {
      await rm(temp, { force: true });
    }
  }
}

await Promise.all([worker(), worker()]);
if (errors) process.exitCode = 1;
