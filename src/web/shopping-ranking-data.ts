import archivePosts from "../../research/shop-archive-creators.json";
import seed from "../../research/shop-price-ranking-seed.json";
import editionChecks from "../../research/shop-price-benchmark-checks.json";
import extraPosts from "../../research/shop-price-batches/2026-11-19-additional-posts.json";
import { rankingReceiptVersion, rankingSeedVersion } from "../shared/shop-ranking-archive.mjs";
import type { Check, Product } from "./shopping-live";
import { collectRankingQuotes,rankWithQuotes,type RankingObservation,type RankingReceiptObservation,type CandidateNote } from "./shopping-ranking-quotes";

type PriceCheck = Omit<Check, "followUp">;

interface Sample {
  handle: string;
  sourceUrl: string;
  observedAt: string;
  report: { market: string; scope: string; commerce: Product[]; checks: PriceCheck[]; methodVersion?: string; shopOnion?: {version: string} };
}

interface Seed {
  formatVersion: number;
  version: string;
  samples: Sample[];
}

interface Collection {
  handle: string;
  posts: Set<string>;
  products: Map<string, RankingReceiptObservation>;
  observedAt: string;
}

function videoHandle(url: string) {
  return /^https:\/\/(?:www\.)?tiktok\.com\/@([\w.]+)\/video\/\d+\/?$/i.exec(url)?.[1]?.toLowerCase();
}

function editionSamples(seed: Seed) {
  const defaultVersion = rankingSeedVersion(seed);
  return seed.samples.map(sample => ({...sample, receiptVersion: rankingReceiptVersion(sample.report, defaultVersion)}));
}

export function rankShopSamples(archives: Seed | Seed[], supplemental: RankingObservation[] = [], notes: CandidateNote[] = []) {
  const samples = (Array.isArray(archives) ? archives : [archives]).flatMap(editionSamples);
  const creators = new Map<string, Collection>();
  const observationsForEdition: RankingObservation[] = [];
  for (const {handle, sourceUrl, observedAt, report, receiptVersion} of samples) {
    const key = handle.toLowerCase();
    if (report.scope !== "tiktok-shop" || report.market !== "US" || videoHandle(sourceUrl) !== key) continue;
    const date = new Date(observedAt);
    if (!Number.isFinite(date.valueOf())) continue;
    const timestamp = date.toISOString();
    const group = creators.get(key) ?? {handle:key, posts:new Set<string>(), products:new Map<string, RankingReceiptObservation>(), observedAt:timestamp};
    creators.set(key, group);
    group.posts.add(sourceUrl);
    if (timestamp > group.observedAt) group.observedAt = timestamp;
    for (const [index, product] of report.commerce.entries()) {
      const post = product.sourceUrl ?? sourceUrl;
      if (post !== sourceUrl || videoHandle(post) !== key) continue;
      const recorded = new Date(product.observedAt || timestamp);
      if (!Number.isFinite(recorded.valueOf())) continue;
      const productTime = recorded.toISOString();
      const observation = {
        product, sourceUrl:post, observedAt:productTime, receiptVersion, checks:report.checks.filter(check => check.productIndex === index),
      };
      observationsForEdition.push(observation);
      const previous = group.products.get(product.productId);
      // A same-instant reassessment of the same post keeps its original receipt.
      if (previous && (previous.observedAt > productTime || (previous.observedAt === productTime &&
        (previous.sourceUrl < post || (previous.sourceUrl === post && previous.receiptVersion <= receiptVersion))))) continue;
      group.products.set(product.productId, observation);
    }
  }

  const quotes = collectRankingQuotes(observationsForEdition,notes,supplemental);
  const rows = Array.from(creators.values(), group => {
    const observations = Array.from(group.products.values()).sort((a,b) => a.product.productId.localeCompare(b.product.productId));
    return {handle:group.handle, posts:[...group.posts], observedAt:group.observedAt, observations,
      ...rankWithQuotes(observations,quotes),rank:null as number | null};
  });
  rows.sort((a,b) => (b.verdict.score ?? -1) - (a.verdict.score ?? -1) || a.handle.localeCompare(b.handle));
  for (const [index, row] of rows.entries()) {
    if (row.verdict.score !== null) {
      row.rank = index > 0 && row.verdict.score === rows[index - 1].verdict.score ? rows[index - 1].rank : index + 1;
    }
  }
  return rows;
}

export type ShopRankingRow = ReturnType<typeof rankShopSamples>[number];
if (editionChecks.formatVersion !== 1 || editionChecks.method !== "shop-ranking-benchmark-v1")
  throw new Error("Unsupported ranking benchmark edition.");
export const shopRankingRows = rankShopSamples([seed,extraPosts],editionChecks.observations,editionChecks.candidates);
export const tiedShopRanks = new Set(shopRankingRows.flatMap((row, i) =>
  row.rank !== null && i > 0 && row.rank === shopRankingRows[i - 1].rank ? [row.rank] : []));

const featuredPosts = new Map(archivePosts.map(post => [post.sourceUrl + "/" + post.productId, post]));

export function featuredRankingSample(row: ShopRankingRow) {
  for (const item of row.verdict.items) {
    const {product, sourceUrl} = row.observations[item.productIndex];
    const post = featuredPosts.get(sourceUrl + "/" + product.productId);
    if (post?.handle === row.handle) return {item, post};
  }
}
