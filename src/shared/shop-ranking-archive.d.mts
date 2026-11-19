import type { ShopOnionVersion } from "./shop-onion.mjs";

export function rankingSeedVersion(seed: unknown): ShopOnionVersion;
export function rankingReceiptVersion(report: unknown, seedVersion?: ShopOnionVersion): ShopOnionVersion;
