export const ONION_BANDS = [
  { id: "fresh", label: "Fresh", minimum: 0, range: "0–<20", image: "assets/mascot/index-fresh.svg" },
  { id: "spotted", label: "Spotted", minimum: 20, range: "20–<40", image: "assets/mascot/index-spotted.svg" },
  { id: "bruised", label: "Bruised", minimum: 40, range: "40–<60", image: "assets/mascot/index-bruised.svg" },
  { id: "spoiled", label: "Spoiled", minimum: 60, range: "60–<80", image: "assets/mascot/index-spoiled.svg" },
  { id: "rotten", label: "Rotten", minimum: 80, range: "80–100", image: "assets/mascot/index-rotten.svg" },
] as const;
export const UNRATED_ONION = { id: "unrated", label: "Awaiting votes", image: "assets/mascot/index-unrated.svg" } as const;

// An opinion about the report's score, never inferred from missing research.
export function onionIndex(up: number, down: number) {
  if (![up, down, up + down].every(value => Number.isSafeInteger(value) && value >= 0)) return null;
  const total = up + down;
  if (!total) return null;
  const value = Math.round(down / total * 1000) / 10;
  const band = [...ONION_BANDS].reverse().find(band => value >= band.minimum)!;
  return { value, band, total, early: total < 5 };
}
