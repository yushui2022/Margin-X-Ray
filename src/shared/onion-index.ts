export const ONION_BANDS = [
  { id: "fresh", label: "Fresh", minimum: 0, range: "0–<20", image: "assets/mascot/index-fresh.svg" },
  { id: "spotted", label: "Spotted", minimum: 20, range: "20–<40", image: "assets/mascot/index-spotted.svg" },
  { id: "bruised", label: "Bruised", minimum: 40, range: "40–<60", image: "assets/mascot/index-bruised.svg" },
  { id: "spoiled", label: "Spoiled", minimum: 60, range: "60–<80", image: "assets/mascot/index-spoiled.svg" },
  { id: "rotten", label: "Rotten", minimum: 80, range: "80–100", image: "assets/mascot/index-rotten.svg" },
] as const;
export const UNRATED_ONION = { id: "unrated", label: "Pending review", image: "assets/mascot/index-unrated.svg" } as const;

// Map a published higher-is-worse score to its artwork. The caller owns the
// rubric and eligibility. Missing scores have no rot band.
export function onionScore(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score) || score < 0 || score > 100) return null;
  const value = Math.round(score * 10) / 10;
  const band = [...ONION_BANDS].reverse().find(band => value >= band.minimum)!;
  return { value, band };
}
