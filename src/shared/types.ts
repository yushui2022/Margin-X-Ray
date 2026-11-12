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

export type CaptureInput =
  | { kind: "link"; url: string }
  | { kind: "image"; dataUrl: string; fileName: string }
  | { kind: "screenshot" };

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

export interface TikHubVideo {
  awemeId?: string;
  description?: string;
  author?: string;
  coverUrl?: string;
  playUrl?: string;
  durationSec?: number;
  productTitle?: string;
  price?: PriceInfo;
}

export type RecognitionImageSource = "video-frame" | "cover" | "upload" | "page";

export interface ProductRecognition {
  provider: "baidu-product";
  name: string;
  score: number;
  imageSource: RecognitionImageSource;
  frameTimeSec?: number;
}

export interface CaptureEnrichment {
  tikhub?: TikHubVideo;
  recognition?: ProductRecognition;
  frameCount: number;
  notes: string[];
}

export interface SampledFrame {
  timeSec: number;
  dataUrl: string;
  source: "video-frame";
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
  enrichment?: CaptureEnrichment;
  supply?: SupplyReport;
  supplyNote?: string;
}

export interface SupplyTier {
  moq: number;
  unitCny: number;
}

export interface SupplyOffer {
  id: string;
  title: string;
  provider: "onebound" | "alibaba-open";
  tiers: SupplyTier[];
  location?: string;
  shopName?: string;
  detailUrl?: string;
  sales?: number;
}

export interface SupplyReport {
  provider: "onebound" | "alibaba-open";
  scanned: number;
  priced: number;
  offers: SupplyOffer[];
  fxRate?: number;
  cnyLabel: string;
  note: string;
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
  currency?: "USD" | "CNY";
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
  currency?: "USD" | "CNY";
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
  supply?: SupplyReport;
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
  tikhubToken: string;
  baiduApiKey: string;
  baiduSecretKey: string;
  oneboundKey: string;
  oneboundSecret: string;
  oneboundFetchTiers: boolean;
  alibabaAppKey: string;
  alibabaAppSecret: string;
  alibabaAccessToken: string;
  usdCnyRate: string;
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
