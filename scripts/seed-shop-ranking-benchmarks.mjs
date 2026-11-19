// node scripts/seed-shop-ranking-benchmarks.mjs public-listing-check.json ... > edition.json
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { freezeShoppingSnapshot } from "../server/shopping-share.mjs";
import { parseShopListing } from "../server/video-lookup.mjs";

const {positionals:files,values} = parseArgs({allowPositionals:true,options:{candidates:{type:"string"}}});
if (!files.length) throw new Error("Supply completed US TikTok Shop listing checks.");
const observations = [];
for (const file of files) {
  const job = JSON.parse(await readFile(file, "utf8"));
  if (job.status !== "ready") throw new Error("A completed shopping check is required.");
  const { input, report } = freezeShoppingSnapshot(job);
  const listing = parseShopListing(input.url);
  if (input.kind !== "website" || report.kind !== "website" || input.market !== "US" ||
      report.market !== "US" || report.scope !== "tiktok-shop" || !listing?.skuId || listing.market !== "US")
    throw new Error("Supply a US listing check for a specific SKU.");
  const product = report.commerce.find(p => p.productId === listing.productId);
  const check = report.checks.find(c => report.commerce[c.productIndex] === product &&
    product?.variants[c.variantIndex]?.skuId === listing.skuId);
  if (!check || !["compared","candidates","insufficient"].includes(check.status) || product?.detailStatus !== "read" ||
      product.market !== "US" || product.sourceUrl !== listing.url ||
      !Number.isFinite(Date.parse(product.observedAt))) throw new Error("The receipt does not cover this original SKU.");
  observations.push({product,checks:[{...check,productIndex:0}],sourceUrl:listing.url,observedAt:product.observedAt});
}
observations.sort((a,b) => a.sourceUrl.localeCompare(b.sourceUrl) || a.observedAt.localeCompare(b.observedAt));
const candidates = [];
if (values.candidates) {
  const notes = JSON.parse(await readFile(values.candidates,"utf8"));
  if (notes.formatVersion !== 1 || notes.market !== "US") throw new Error("Unsupported candidate evidence.");
  for (const note of notes.rows) {
    const listing = parseShopListing(note.url);
    const original = observations.find(o => o.product.productId === note.sourceProductId &&
      o.product.variants[o.checks[0].variantIndex].skuId === note.sourceSkuId);
    if (!original || note.eligibility !== "candidate_only" || listing?.market !== "US" ||
      listing.skuId !== note.skuId || listing.productId === note.sourceProductId ||
      note.currency !== "USD" || !(note.price > 0) || !Number.isFinite(note.price) || !note.reason ||
      !Number.isFinite(Date.parse(note.observedAt))) throw new Error("Invalid additional listing evidence.");
    candidates.push({productId:note.sourceProductId,skuId:note.sourceSkuId,observedAt:note.observedAt,
      url:listing.url,label:note.seller + " · $" + note.price.toFixed(2),reason:note.reason});
  }
}
process.stdout.write(JSON.stringify({ formatVersion:1,method:"shop-ranking-benchmark-v1",observations,candidates },null,2)+"\n");
