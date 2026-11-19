export const SHOP_ONION_VERSION: "shop-onion-v3";
export const SHOP_ONION_V2: "shop-onion-v2";
export const SHOP_ONION_SCALE: readonly (readonly [number, number])[];
export const SHOP_ONION_ALLOWANCES: Readonly<{ "same-sku": 5; measured: 10; variable: 25; general: 15 }>;
export type ShopOnionVersion = "shop-onion-v1" | typeof SHOP_ONION_V2 | typeof SHOP_ONION_VERSION;
export interface ShopOnionContext {
  category: "same-sku" | "measured" | "variable" | "general";
  categoryLabel: string;
  detail: string;
  baseAllowancePct: number;
  allowancePct: number;
  spreadAllowancePct: number;
  peerCount: number;
  lowPeerPrice: number;
  highPeerPrice: number;
  upperPrice: number;
  excessPct: number;
  currency: string;
}
export interface ShopOnionDecision {
  state: "unrated" | "below" | "equal" | "within" | "above" | "sample";
  label: string;
  reason: string;
  action: string;
  confidence: "high" | "medium" | "low" | "insufficient";
  steps: { label: string; detail: string }[];
  context: ShopOnionContext | null;
}
export interface ShopOnionItem {
  productIndex: number;
  variantIndex: number;
  basis: "exact" | "similar";
  sourcePrice: number;
  peerPrice: number;
  currency: string;
  peerUrl: string;
  peerSeller: string;
  peerCount: number;
  peers: { seller: string; url: string; price: number }[];
  premiumPct: number;
  score: number;
  decision?: ShopOnionDecision;
}
export interface ShopOnionVerdict {
  version: ShopOnionVersion;
  basis: "none" | "exact" | "similar" | "mixed";
  score: number | null;
  premiumPct: number | null;
  scoredCount: number;
  linkedCount: number;
  items: ShopOnionItem[];
  decision?: ShopOnionDecision;
  productDecisions?: { productIndex: number; variantIndex: number | null; decision: ShopOnionDecision }[];
}
export function shopOnionVersionForReport(report: unknown): ShopOnionVersion;
export function shopOnionVerdict(report: unknown, options?: { version?: ShopOnionVersion; namedShades?: boolean }): ShopOnionVerdict;
