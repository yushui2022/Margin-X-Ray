// Merge explicitly selected public reports with a previous portable seed, then replace it on success.
// seed=research/shop-price-ranking-seed.json
// draft=$(mktemp research/.shop-price-ranking-XXXXXX) &&
//   node scripts/seed-shop-price-ranking.mjs "$seed" public-job.json > "$draft" && mv "$draft" "$seed"
import { readFile } from "node:fs/promises";
import { freezeShoppingSnapshot } from "../server/shopping-share.mjs";
import { parseVideoAddress } from "../server/video-lookup.mjs";
import { SHOP_ONION_VERSION } from "../src/shared/shop-onion.mjs";
import { rankingReceiptVersion, rankingSeedVersion } from "../src/shared/shop-ranking-archive.mjs";

const filenames = process.argv.slice(2);
if (!filenames.length) throw new Error("Supply at least one public shopping job JSON file.");
const sources = new Map();

function records(input) {
  if (Object.hasOwn(input, "samples")) {
    const seedVersion = rankingSeedVersion(input);
    return input.samples.map(({ report }) => ({
      ...report, shopOnion: { version: rankingReceiptVersion(report, seedVersion) },
    }));
  }
  return Array.isArray(input) ? input : [input];
}

function addSource(address, report) {
  if (!address?.handle || address.handle !== report.video?.handle?.toLowerCase()) {
    throw new Error("Creator attribution does not match the public source.");
  }
  const version = report.shopOnion.version;
  const key = address.url + "#" + version;
  if (!sources.has(key)) {
    sources.set(key, { address, version, provider: report.video.provider, products: new Map(), observedAt: null });
  }
  return sources.get(key);
}

for (const path of filenames) {
  const input = JSON.parse(await readFile(path, "utf8"));
  for (const record of records(input)) {
    const job = record.report ? record : {
      status: "ready",
      input: { kind: record.kind, market: record.market, url: record.video?.url },
      report: record,
    };
    if (job.status !== "ready") throw new Error("A completed report is required.");
    rankingReceiptVersion(job.report);
    const { report } = freezeShoppingSnapshot(job, job.publishedAt);
    if (report.market !== "US" || report.scope !== "tiktok-shop" || !report.video?.handle) continue;
    const address = parseVideoAddress(report.video.url);
    const posts = report.kind === "profile" ? report.sampledPosts : [report.video];
    for (const candidate of posts) {
      const post = parseVideoAddress(candidate.url);
      if (!post?.id) continue;
      const group = addSource(post, report);
      if (!group.observedAt || report.video.observedAt > group.observedAt) group.observedAt = report.video.observedAt;
    }
    for (const [index, product] of report.commerce.entries()) {
      // A profile may include several posts. Attribute a product to the post that linked it.
      const post = parseVideoAddress(product.sourceUrl);
      if (!post?.id || (address?.id && address.url !== post.url)) throw new Error("Product has no matching source post.");
      const group = addSource(post, report);
      const previous = group.products.get(product.productId);
      if (previous && previous.product.observedAt >= product.observedAt) continue;
      group.products.set(product.productId, { product, checks: report.checks.filter(c => c.productIndex === index) });
    }
  }
}

const samples = [];
for (const group of sources.values()) {
  const { handle, url: sourceUrl } = group.address;
  const commerce = [], checks = [];
  let observedAt = null;
  for (const { product, checks: localChecks } of group.products.values()) {
    const index = commerce.length;
    commerce.push(product);
    for (const check of localChecks) checks.push({ ...check, productIndex: index });
    if (!observedAt || product.observedAt > observedAt) observedAt = product.observedAt;
  }
  observedAt ??= group.observedAt;
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) throw new Error("Evidence needs an observation date.");
  const report = { kind: "video", market: "US", scope: "tiktok-shop", shopOnion:{ version:group.version },
    video: { handle, url: sourceUrl, provider: group.provider, observedAt }, commerce, checks, steps: [] };
  samples.push({ handle, sourceUrl, observedAt, report });
}
samples.sort((a, b) => a.handle.localeCompare(b.handle) || a.sourceUrl.localeCompare(b.sourceUrl) ||
  a.report.shopOnion.version.localeCompare(b.report.shopOnion.version));
if (!samples.length) throw new Error("No attributable US TikTok Shop posts in these inputs.");
process.stdout.write(JSON.stringify({ formatVersion: 1, version: SHOP_ONION_VERSION, samples }, null, 2) + "\n");
