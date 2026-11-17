// Scenario inputs only. Never substitute unknown public financial data with zero.
export function scenarioNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function commissionScenario(base: number | null, ratePct: number | null): number | null {
  if (base === null || ratePct === null || !Number.isFinite(base) || !Number.isFinite(ratePct) || base < 0 || ratePct < 0 || ratePct > 100) return null;
  const result = base * (ratePct / 100);
  return Number.isFinite(result) ? result : null;
}

export function brandScenario(revenue: number | null, cogs: number | null, variableCosts: number | null) {
  if ([revenue, cogs, variableCosts].some((value) => value === null || !Number.isFinite(value) || value < 0)) return null;
  const gross = revenue! - cogs!;
  const contribution = gross - variableCosts!;
  const grossMarginPct = revenue! > 0 ? gross / revenue! * 100 : null;
  const contributionMarginPct = revenue! > 0 ? contribution / revenue! * 100 : null;
  if (![gross, contribution, grossMarginPct, contributionMarginPct].every((value) => value === null || Number.isFinite(value))) return null;
  return { gross, contribution, grossMarginPct, contributionMarginPct };
}
