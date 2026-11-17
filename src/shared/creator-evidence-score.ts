import products from "../../research/creator-products.json";
import { PUBLIC_CREATORS } from "./creator-directory";
import { brandLeadsFor, screeningFor } from "./creator-screening";

export const EVIDENCE_SCORE_VERSION = "evidence-v2";
export const EVIDENCE_SCORE_SCOPE = "Measures the evidence collected in this report, not creator honesty, product quality or value for money. A low score means limited research coverage. Followers, popularity and assumed earnings earn no points.";
export const EVIDENCE_GROUPS = [
  { id: "sample", name: "Public sample", maximum: 20 },
  { id: "commercial", name: "Commercial trail", maximum: 25 },
  { id: "offers", name: "Product & price", maximum: 35 },
  { id: "financial", name: "Financial evidence", maximum: 20 },
] as const;
type Group = (typeof EVIDENCE_GROUPS)[number]["id"];
type Source = { label: string; url: string };
type Product = (typeof products.products)[number];
export interface EvidenceInput {
  matchedSample: boolean;
  captionIds: readonly string[];
  commercialUrls: readonly string[];
  products: readonly Product[];
}

const distinct = (values: readonly string[]) => [...new Set(values.filter(value => value.trim()))];
const sourceIndex = new Map(products.sources.map(source => [source.id, source]));
const hasSources = (product: Product) => product.sources.some(id => sourceIndex.has(id));
const usableProducts = (records: readonly Product[]) => [...new Map(records.filter(product => product.id && product.name.trim() && hasSources(product)).map(product => [product.id, product])).values()];
const hasPrice = (product: Product) => Number.isFinite(product.price.amount) && product.price.amount > 0 && /^[A-Z]{3}$/.test(product.price.currency);
const hasContext = (product: Product) => hasPrice(product) && !!product.price.market.trim() && !!product.price.conditions.trim();
const hasPost = (product: Product) => !!product.postUrl && /^https:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+$/.test(product.postUrl);

export function evidencePoints(input: EvidenceInput) {
  const records = usableProducts(input.products);
  const captions = input.matchedSample ? distinct(input.captionIds).length : 0;
  const points = {
    identity: captions ? 10 : 0,
    captions: Math.min(captions, 10),
    leads: Math.min(distinct(input.commercialUrls).length, 3) * 5,
    linkage: Math.min(distinct(records.filter(hasPost).map(product => product.postUrl!)).length, 2) * 5,
    products: Math.min(records.length, 2) * 5,
    variants: Math.min(records.filter(product => product.variant.trim()).length, 2) * 5,
    prices: Math.min(records.filter(hasPrice).length, 2) * 5,
    context: records.some(hasContext) ? 5 : 0,
    compensation: 0,
    costs: 0,
  };
  // Financial criteria are reserved until reviewed primary records and a new
  // methodology exist. Descriptive notes and scenario inputs cannot award points.
  return { ...points, total: Object.values(points).reduce((sum, value) => sum + value, 0) };
}

function buildScore(handle: string) {
  const sample = screeningFor(handle);
  const leads = brandLeadsFor(handle);
  const records = usableProducts(products.products.filter(product => product.handle === handle));
  const matchedSample = sample?.status === "sampled" && sample.platformHandle?.toLowerCase() === handle.toLowerCase();
  const captionIds = sample?.posts.filter(post => post.caption.trim()).map(post => post.id) ?? [];
  const points = evidencePoints({ matchedSample, captionIds, commercialUrls: leads.map(lead => lead.url), products: records });
  const uniqueSources = (sources: Source[]) => [...new Map(sources.map(source => [source.url, source])).values()];
  const productSources = (items: Product[]) => uniqueSources(items.flatMap(product => product.sources.flatMap(id => {
    const source = sourceIndex.get(id);
    return source ? [{ label: source.label, url: source.url }] : [];
  })));
  const sampleSources = sample ? [{ label: "TikTok public caption sample", url: sample.sourceUrl }] : [];
  const dimension = (id: Exclude<keyof typeof points, "total">, group: Group, name: string, maximum: number, rule: string, detail: string, next: string, sources: Source[]) => ({
    id, group, name, maximum, points: points[id], rule, detail, next, sources,
    state: points[id] === maximum ? "Collected" : points[id] ? "Partial" : "Missing evidence",
  });
  const dimensions = [
    dimension("identity", "sample", "Account-matched sample", 10, "10 points for a matching public account with a usable caption.",
      points.identity ? "The returned handle matches this profile. Caption metadata was collected; video and audio were not reviewed." : "No usable identity-matched caption sample is available.",
      "Retrieve a usable public caption sample whose returned handle matches this profile.", sampleSources),
    dimension("captions", "sample", "Caption sample depth", 10, "1 point per distinct non-empty caption, capped at 10.",
      `${matchedSample ? distinct(captionIds).length : 0} distinct usable captions. Platform-selected samples do not establish representative or complete coverage.`,
      "Collect additional distinct captions from the matched account, up to 10 for this check.", points.identity ? sampleSources : []),
    dimension("leads", "commercial", "Selected commercial leads", 15, "5 points per distinct manually selected URL, capped at 3.",
      `${distinct(leads.map(lead => lead.url)).length} selected sources for brand, product or service follow-up. A lead does not establish a paid relationship.`,
      "Review and source additional commercial leads; keyword matches alone do not count.", uniqueSources(leads.map(lead => ({ label: lead.title, url: lead.url })))),
    dimension("linkage", "commercial", "Product-to-post links", 10, "5 points per distinct post linked to an accepted product, capped at 2.",
      `${distinct(records.filter(hasPost).map(product => product.postUrl!)).length} linked posts. Links may identify a product line; they do not verify the exact shade, pack, advertised price or paid disclosure.`,
      "Match accepted products to distinct source posts and document any variant uncertainty.", productSources(records.filter(hasPost))),
    dimension("products", "offers", "Sourced product records", 10, "5 points per named, sourced product record, capped at 2.",
      `${records.length} accepted product records with resolvable sources. Separately listed variants can count; unresolved leads cannot.`,
      "Identify additional products and attach supporting sources before accepting a record.", productSources(records)),
    dimension("variants", "offers", "Variant documentation", 10, "5 points per sourced record with a variant description, capped at 2.",
      `${records.filter(product => product.variant.trim()).length} records describe a size, shade, pack or model. This checks documentation, not exact matching to a promotion.`,
      "Document the specific size, shade, pack or model for accepted product records.", productSources(records.filter(product => product.variant.trim()))),
    dimension("prices", "offers", "Reference price & currency", 10, "5 points per sourced positive reference price with currency, capped at 2.",
      `${records.filter(hasPrice).length} priced records. Indexed reference prices may be stale; checkout and value for money remain unverified.`,
      "Collect a sourced reference amount and currency for accepted products.", productSources(records.filter(hasPrice))),
    dimension("context", "offers", "Market & offer notes", 5, "5 points for a priced record with market and purchase-condition notes.",
      records.some(hasContext) ? "Market and conditions are documented, including limitations. Notes may explicitly say shipping, tax, stock or returns are unknown." : "No accepted priced record has market and purchase-condition notes.",
      "Document the market and known conditions or limitations of a reference offer.", productSources(records.filter(hasContext))),
    dimension("compensation", "financial", "Compensation records", 10, "10 points reserved; no qualifying records in this version.",
      "Creator-specific commission contracts, sponsorship fees and settlements have not been verified. Unknown compensation is not zero income.",
      "Obtain and review creator-specific contracts or settlement records, then publish a versioned scoring rule.", []),
    dimension("costs", "financial", "Costs & profit records", 10, "10 points reserved; no qualifying records in this version.",
      "Costs, ownership allocations and personal distributions remain unknown. Company revenue or margins do not establish creator take-home profit.",
      "Review attributable cost and distribution records, then publish a versioned scoring rule. Calculator assumptions do not qualify.", []),
  ];
  const groups = EVIDENCE_GROUPS.map(group => ({ ...group, points: dimensions.filter(dimension => dimension.group === group.id).reduce((sum, dimension) => sum + dimension.points, 0) }));
  const level = points.total === 0 ? "No usable evidence yet" : points.total < 30 ? "Initial evidence" : points.total < 60 ? "Partial evidence" : "Broader evidence";
  return { ...points, level, observedAt: sample?.observedAt ?? products.observedAt, dimensions, groups };
}

const scores = new Map(PUBLIC_CREATORS.map(profile => [profile.handle, buildScore(profile.handle)]));
export const evidenceScoreFor = (handle: string) => scores.get(handle);
export const EVIDENCE_SCORES = new Map([...scores].map(([handle, record]) => [handle, record.total]));
