import products from "../../research/creator-products.json";
import rubric from "../../research/creator-score-rubric.json";
import { PUBLIC_CREATORS } from "./creator-directory";
import { brandLeadsFor, screeningFor } from "./creator-screening";

export const EVIDENCE_SCORE_VERSION = rubric.version;
export const formatEvidenceScore = (value: number) => value.toFixed(1);
export const sumEvidencePoints = (values: number[]) => values.reduce((sum, value) => sum + Math.round(value * 10), 0) / 10;
export const coveragePoints = (count: number, target: number, maximum: number) => Math.round(maximum * Math.min(Math.max(count, 0), target) / target * 10) / 10;
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
    captions: coveragePoints(captions, rubric.targets.captions, 10),
    leads: coveragePoints(distinct(input.commercialUrls).length, rubric.targets.leads, 15),
    linkage: coveragePoints(distinct(records.filter(hasPost).map(product => product.postUrl!)).length, rubric.targets.linkage, 10),
    products: coveragePoints(records.length, rubric.targets.products, 10),
    variants: coveragePoints(records.filter(product => product.variant.trim()).length, rubric.targets.variants, 10),
    prices: coveragePoints(records.filter(hasPrice).length, rubric.targets.prices, 10),
    context: coveragePoints(records.filter(hasContext).length, rubric.targets.context, 5),
    compensation: 0,
    costs: 0,
  };
  // Financial criteria are reserved until reviewed primary records and a new
  // methodology exist. Descriptive notes and scenario inputs cannot award points.
  return { ...points, total: sumEvidencePoints(Object.values(points)) };
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
    dimension("captions", "sample", "Caption sample depth", 10, "10 × distinct non-empty captions ÷ 20, capped at 10; rounded to one decimal.",
      `${matchedSample ? distinct(captionIds).length : 0} distinct usable captions. Platform-selected samples do not establish representative or complete coverage.`,
      "Collect additional distinct captions from the matched account, up to 20 for this check.", points.identity ? sampleSources : []),
    dimension("leads", "commercial", "Selected commercial leads", 15, "15 × distinct manually selected URLs ÷ 4, capped at 15; rounded to one decimal.",
      `${distinct(leads.map(lead => lead.url)).length} selected sources for brand, product or service follow-up. A lead does not establish a paid relationship.`,
      "Review and source additional commercial leads; keyword matches alone do not count.", uniqueSources(leads.map(lead => ({ label: lead.title, url: lead.url })))),
    dimension("linkage", "commercial", "Product-to-post links", 10, "10 × distinct product-linked posts ÷ 3, capped at 10; rounded to one decimal.",
      `${distinct(records.filter(hasPost).map(product => product.postUrl!)).length} linked posts. Links may identify a product line; they do not verify the exact shade, pack, advertised price or paid disclosure.`,
      "Match accepted products to distinct source posts and document any variant uncertainty.", productSources(records.filter(hasPost))),
    dimension("products", "offers", "Sourced product records", 10, "10 × named, sourced product records ÷ 3, capped at 10; rounded to one decimal.",
      `${records.length} accepted product records with resolvable sources. Separately listed variants can count; unresolved leads cannot.`,
      "Identify additional products and attach supporting sources before accepting a record.", productSources(records)),
    dimension("variants", "offers", "Variant documentation", 10, "10 × sourced records with variant descriptions ÷ 3, capped at 10; rounded to one decimal.",
      `${records.filter(product => product.variant.trim()).length} records describe a size, shade, pack or model. This checks documentation, not exact matching to a promotion.`,
      "Document the specific size, shade, pack or model for accepted product records.", productSources(records.filter(product => product.variant.trim()))),
    dimension("prices", "offers", "Reference price & currency", 10, "10 × sourced positive prices with currency ÷ 3, capped at 10; rounded to one decimal.",
      `${records.filter(hasPrice).length} priced records. Indexed reference prices may be stale; checkout and value for money remain unverified.`,
      "Collect a sourced reference amount and currency for accepted products.", productSources(records.filter(hasPrice))),
    dimension("context", "offers", "Market & offer notes", 5, "5 × priced records with market and condition notes ÷ 3, capped at 5; rounded to one decimal.",
      records.some(hasContext) ? "Market and conditions are documented, including limitations. Notes may explicitly say shipping, tax, stock or returns are unknown." : "No accepted priced record has market and purchase-condition notes.",
      "Document the market and known conditions or limitations of a reference offer.", productSources(records.filter(hasContext))),
    dimension("compensation", "financial", "Compensation records", 10, "10 points reserved; no qualifying records in this version.",
      "Creator-specific commission contracts, sponsorship fees and settlements have not been verified. Unknown compensation is not zero income.",
      "Obtain and review creator-specific contracts or settlement records, then publish a versioned scoring rule.", []),
    dimension("costs", "financial", "Costs & profit records", 10, "10 points reserved; no qualifying records in this version.",
      "Costs, ownership allocations and personal distributions remain unknown. Company revenue or margins do not establish creator take-home profit.",
      "Review attributable cost and distribution records, then publish a versioned scoring rule. Calculator assumptions do not qualify.", []),
  ];
  const groups = EVIDENCE_GROUPS.map(group => ({ ...group, points: sumEvidencePoints(dimensions.filter(dimension => dimension.group === group.id).map(dimension => dimension.points)) }));
  const level = points.total === 0 ? "No usable evidence yet" : points.total < 30 ? "Initial evidence" : points.total < 60 ? "Partial evidence" : "Broader evidence";
  return { ...points, level, observedAt: sample?.observedAt ?? products.observedAt, dimensions, groups };
}

const scores = new Map(PUBLIC_CREATORS.map(profile => [profile.handle, buildScore(profile.handle)]));
export const evidenceScoreFor = (handle: string) => scores.get(handle);
export const EVIDENCE_SCORES = new Map([...scores].map(([handle, record]) => [handle, record.total]));
