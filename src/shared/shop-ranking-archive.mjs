import { SHOP_ONION_V2, SHOP_ONION_VERSION, shopOnionVersionForReport } from "./shop-onion.mjs";

const versions = new Set(["shop-onion-v1", SHOP_ONION_V2, SHOP_ONION_VERSION]);

export function rankingSeedVersion(seed) {
  if (seed?.formatVersion !== 1 || !Array.isArray(seed.samples) || !versions.has(seed.version))
    throw new Error("Unsupported ranking seed format or scoring version.");
  return seed.version;
}

// Earlier portable editions only recorded a version on the outer seed.
// New editions preserve each source report's own method explicitly.
export function rankingReceiptVersion(report, seedVersion) {
  const recorded = report?.shopOnion?.version;
  if (recorded !== undefined && !versions.has(recorded))
    throw new Error("Unsupported scoring version on the original shopping receipt.");
  if (recorded !== undefined || report?.methodVersion || !seedVersion)
    return shopOnionVersionForReport(report);
  return seedVersion;
}
