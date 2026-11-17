import products from "../../research/creator-products.json";
import assessments from "../../research/creator-confidence-assessments.json";
import rubric from "../../research/creator-confidence-rubric.json";
import { PUBLIC_CREATORS } from "./creator-directory";
import { evidenceScoreFor, sumEvidencePoints } from "./creator-evidence-score";

export const CONFIDENCE_RUBRIC = rubric;
export const CONFIDENCE_VERSION = rubric.version;
export type Provenance = keyof typeof rubric.provenance;
export type Corroboration = keyof typeof rubric.corroboration;
export interface ConfidenceInput {
  matchedSample: boolean;
  coverage: number;
  products: readonly { id: string; relationship: Provenance; listing: Provenance; corroboration: Corroboration }[];
  completeReview: boolean;
}
const round = (value: number) => Math.round(value * 10) / 10;

export function confidencePoints(input: ConfidenceInput) {
  if (!input.matchedSample || !input.completeReview || !input.products.length || !Number.isFinite(input.coverage) || input.coverage < 0 || input.coverage > 100) return null;
  const records = [...new Map(input.products.map(record => [record.id, record])).values()];
  const reliability = records.map(record => Math.min(rubric.provenance[record.relationship], rubric.provenance[record.listing]));
  const corroboration = records.map(record => rubric.corroboration[record.corroboration]);
  if ([...reliability, ...corroboration].some(value => !Number.isFinite(value))) return null;
  const parts = {
    sources: round(rubric.weights.sources * reliability.reduce((a, b) => a + b, 0) / records.length),
    coverage: round(rubric.weights.coverage * input.coverage / 100),
    corroboration: round(rubric.weights.corroboration * corroboration.reduce((a, b) => a + b, 0) / records.length),
  };
  return { ...parts, total: sumEvidencePoints(Object.values(parts)) };
}

const sources = new Map(products.sources.map(source => [source.id, source]));
const reviews = new Map(assessments.products.map(review => [review.productId, review]));
function buildConfidence(handle: string) {
  const evidence = evidenceScoreFor(handle)!;
  const records = products.products.filter(product => product.handle === handle);
  const reviewed = records.flatMap(product => {
    const review = reviews.get(product.id);
    if (!review || assessments.version !== rubric.version) return [];
    const relationship = sources.get(review.relationshipSource);
    const listing = sources.get(review.listingSource);
    if (!relationship || !listing || !product.sources.includes(relationship.id) || !product.sources.includes(listing.id)) return [];
    return [{ product, review, relationship, listing }];
  });
  const points = confidencePoints({ matchedSample: evidence.identity > 0, coverage: evidence.total, completeReview: reviewed.length === records.length,
    products: reviewed.map(({ product, review }) => ({ id: product.id, relationship: review.relationshipProvenance as Provenance, listing: review.listingProvenance as Provenance, corroboration: review.corroboration as Corroboration })) });
  return { handle, points, reviewed, observedAt: rubric.observedAt, reason: !evidence.identity ? "Usable account-matched sample needed" : !records.length ? "Sourced product review needed" : "Source assessment incomplete" };
}
const reports = new Map(PUBLIC_CREATORS.map(profile => [profile.handle, buildConfidence(profile.handle)]));
export const confidenceFor = (handle: string) => reports.get(handle);
export const CONFIDENCE_SCORES = new Map([...reports].flatMap(([handle, report]) => report.points ? [[handle, report.points.total] as const] : []));
const orderedScores = [...CONFIDENCE_SCORES.values()].sort((a, b) => b - a);
export const confidenceRank = (handle: string) => {
  const value = CONFIDENCE_SCORES.get(handle);
  return value === undefined ? null : orderedScores.indexOf(value) + 1;
};
