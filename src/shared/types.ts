/**
 * Shared data contracts between the extension UI, the background worker,
 * and the (future) Margin X-Ray API.
 *
 * Rule: every number that looks authoritative must carry its source and/or
 * confidence. The UI never invents a fallback price.
 */

export type Platform =
  | "tiktok"
  | "shopify"
  | "amazon"
  | "instagram"
  | "youtube"
  | "generic";

export type PageType = "video" | "product" | "unknown";
export type DataSource = "demo" | "mock" | "api";
export type Confidence = "high" | "medium" | "low" | "demo";

export interface PriceInfo {
  amount: number;
  currency: string;
  source: string;
  raw?: string;
}

export interface VideoContext {
  currentSrc?: string;
  poster?: string;
  currentTime?: number;
  width?: number;
  height?: number;
  isPlaying?: boolean;
}

export interface PageContext {
  platform: Platform;
  pageType: PageType;
  url: string;
  canonicalUrl?: string;
  title: string;
  caption?: string;
  brand?: string;
  price?: PriceInfo;
  imageUrl?: string;
  video?: VideoContext;
  identifiers?: Record<string, string>;
  extractedBy: string;
  extractedAt: string;
  warnings?: string[];
}

export interface ScanClientInfo {
  version: string;
  locale: string;
  timezone: string;
}

export interface ScanRequest {
  scanId: string;
  context: PageContext;
  client: ScanClientInfo;
  forceDemo?: boolean;
}

export interface ScanProgress {
  scanId: string;
  stepId: string;
  percent: number;
  message: string;
  detail?: string;
}

export interface ScanError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
  detail?: string;
}

export interface FactoryTier {
  moq: number;
  unitUsd: number;
  note?: string;
}

export interface FactorySignal {
  label: string;
  value: string;
  source: string;
  asOf?: string;
}

export interface Factory {
  id: string;
  maskedName: string;
  location: string;
  fobMinUsd: number;
  fobMaxUsd: number;
  tiers: FactoryTier[];
  insuredEmployees?: number;
  insuredYear?: number;
  establishedYear?: number;
  signals: FactorySignal[];
  confidence: Confidence;
  confidenceReason: string;
}

export interface CostAssumptions {
  fobUsd: number;
  shippingPerUnitUsd: number;
  dutyRatePct: number;
  platformFeePct: number;
  affiliatePct: number;
  paymentPct: number;
  fulfillmentPerUnitUsd: number;
  returnRatePct: number;
  adPct: number;
}

export interface CostWaterfall {
  retailUsd: number;
  fobUsd: number;
  shippingUsd: number;
  dutyUsd: number;
  landedUsd: number;
  platformFeeUsd: number;
  affiliateUsd: number;
  paymentUsd: number;
  fulfillmentUsd: number;
  returnsUsd: number;
  contributionUsd: number;
  contributionMarginPct: number;
  adUsd: number;
  netUsd: number;
  netMarginPct: number;
  grossMarginPct: number;
}

export interface PriceRange {
  fobMinUsd: number;
  fobMaxUsd: number;
  basis: string;
  confidence: Confidence;
}

export interface FunnelReason {
  reason: string;
  count: number;
}

export interface ScanFunnel {
  scanned: number;
  excludedByReason: FunnelReason[];
  verified: number;
  note: string;
}

export interface ScanSource {
  label: string;
  url?: string;
  asOf?: string;
}

export interface ScanResult {
  scanId: string;
  dataSource: DataSource;
  generatedAt: string;
  product: {
    title: string;
    imageUrl?: string;
    sourceUrl: string;
    platform: Platform;
    retailUsd: number | null;
    retailSource: string;
  };
  priceRange: PriceRange | null;
  waterfall: CostWaterfall | null;
  assumptions: CostAssumptions | null;
  factories: Factory[];
  funnel: ScanFunnel;
  qualityWarning?: string;
  sources: ScanSource[];
  disclaimers: string[];
}

export interface LeadInput {
  factoryId?: string;
  factoryName?: string;
  email: string;
  whatsapp?: string;
  country?: string;
  moqTier: string;
  customization: string;
  message?: string;
  consent: boolean;
}

export interface Lead extends LeadInput {
  id: string;
  createdAt: string;
  reportId: string;
  sourceUrl: string;
  productTitle: string;
}

export interface Settings {
  apiBaseUrl: string;
  apiToken: string;
  demoMode: boolean;
  autoOpen: boolean;
  maxScanHistory: number;
}

export interface ScanHistoryItem {
  scanId: string;
  createdAt: string;
  title: string;
  sourceUrl: string;
  platform: Platform;
  dataSource: DataSource;
  retailUsd: number | null;
  fobMinUsd: number | null;
  netMarginPct: number | null;
}

export interface ApiTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface SaveLeadResult {
  ok: boolean;
  message: string;
  leadId?: string;
}
