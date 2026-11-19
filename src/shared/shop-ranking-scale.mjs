export const RANKING_SCORE_VERSION = "shop-onion-v3";

// A is the receipt's category allowance (5–25%) with up to ten additional
// points of observed spread. A wider allowance slows the rise above parity.
// Each pair is [price difference as a percentage of the peer price, points].
export function rankingScoreAnchors(allowancePct) {
  if (!Number.isFinite(allowancePct) || allowancePct < 5 || allowancePct > 35) return [];
  return [
    [-50, 0],
    [-30, 15],
    [-15, 35],
    [-5, 50],
    [5, 50],
    [5 + allowancePct, 65],
    [5 + 2 * allowancePct, 75],
    [100, 90],
    [200, 100],
  ];
}

// The caller supplies an admitted cross-shop pair in the same currency.
// The peer price can contain half a cent when it is a two-shop median.
export function rankingPriceScore(comparison) {
  const { sourcePrice, peerPrice, allowancePct } = comparison ?? {};
  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0 || !Number.isFinite(peerPrice) || peerPrice <= 0)
    return null;
  const anchors = rankingScoreAnchors(allowancePct);
  if (!anchors.length) return null;
  // Remove floating point noise at decimal price boundaries without rounding
  // the reference to a whole cent or using a displayed one-decimal premium.
  const premiumPct = Number((((sourcePrice - peerPrice) / peerPrice) * 100).toFixed(10));
  if (premiumPct <= -50) return 0;
  if (premiumPct >= 200) return 100;
  if (Math.abs(premiumPct) <= 5) return 50;
  const right = anchors.findIndex(([pct]) => pct >= premiumPct);
  const [lowPct, lowScore] = anchors[right - 1];
  const [highPct, highScore] = anchors[right];
  const fraction = (premiumPct - lowPct) / (highPct - lowPct);
  const score = Math.round(lowScore + fraction * (highScore - lowScore));
  // Reserve the midpoint and endpoints for their explicitly defined ranges.
  return premiumPct < 0 ? Math.max(1, Math.min(49, score)) : Math.max(51, Math.min(99, score));
}

// Supply one score per distinct checked product. A null represents a product
// awaiting evidence. A measured zero carries the same weight as every score.
export function rankingMedianScore(scores) {
  const ranked = scores.filter(score => Number.isInteger(score) && score >= 0 && score <= 100)
    .sort((a, b) => a - b);
  if (!ranked.length) return null;
  const middle = Math.floor(ranked.length / 2);
  return ranked.length % 2 ? ranked[middle] : Math.round((ranked[middle - 1] + ranked[middle]) / 2);
}
