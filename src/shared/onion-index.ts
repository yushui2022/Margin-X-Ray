export const ONION_BANDS = [
  { id: "fresh", label: "Fresh", minimum: 0, range: "0–<20", image: "assets/mascot/index-fresh.svg" },
  { id: "spotted", label: "Spotted", minimum: 20, range: "20–<40", image: "assets/mascot/index-spotted.svg" },
  { id: "bruised", label: "Bruised", minimum: 40, range: "40–<60", image: "assets/mascot/index-bruised.svg" },
  { id: "spoiled", label: "Spoiled", minimum: 60, range: "60–<80", image: "assets/mascot/index-spoiled.svg" },
  { id: "rotten", label: "Rotten", minimum: 80, range: "80–100", image: "assets/mascot/index-rotten.svg" },
] as const;
export const UNRATED_ONION = { id: "unrated", label: "Pending review", image: "assets/mascot/index-unrated.svg" } as const;

// Confidence is eligible only after a sourced product review. Missing reports
// stay unrated; feedback counts and ranking positions are never inputs.
export function onionIndex(confidence: number | null | undefined) {
  if (confidence == null || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) return null;
  const value = Math.round((100 - confidence) * 10) / 10;
  const band = [...ONION_BANDS].reverse().find(band => value >= band.minimum)!;
  return { value, band };
}
