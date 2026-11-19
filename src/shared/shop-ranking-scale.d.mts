export const RANKING_SCORE_VERSION: "shop-onion-v3";
export function rankingScoreAnchors(allowancePct: number | null | undefined): ReadonlyArray<readonly [number, number]>;
export function rankingPriceScore(comparison: {
  sourcePrice?: number | null;
  peerPrice?: number | null;
  allowancePct?: number | null;
} | null | undefined): number | null;
export function rankingMedianScore(scores: readonly (number | null | undefined)[]): number | null;
