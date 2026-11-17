import collection from "../../research/creator-issue-reviews.json";
import rubric from "../../research/creator-issue-rubric.json";
import { PUBLIC_CREATORS } from "./creator-directory";
import { sumEvidencePoints } from "./creator-evidence-score";

export const ISSUE_RUBRIC = rubric;
export const ISSUE_VERSION = rubric.version;
export type IssueSeverity = keyof typeof rubric.severity;
export interface IssueSource { label: string; url: string; observedAt: string }
export interface ProductIssue {
  id: string;
  status: "confirmed" | "alleged" | "disputed";
  occurredAt: string;
  severity: IssueSeverity;
  assessment: string;
  kind: "regulator" | "recall" | "ruling" | "test-report" | "seller-resolution";
  source: IssueSource;
}
export interface ReviewedIssueProduct {
  id: string;
  name: string;
  variant: string;
  creatorLink: IssueSource;
  reviewSources: IssueSource[];
  outcome: "documented-issue" | "no-documented-issue" | "unresolved";
  reviewNote: string;
  issues: ProductIssue[];
}
export interface CreatorIssueReview {
  handle: string;
  version: string;
  windowStart: string;
  windowEnd: string;
  reviewedAt: string;
  complete: boolean;
  selectionMethod: string;
  products: ReviewedIssueProduct[];
}

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function validSource(source: IssueSource) {
  try { return !!source.label.trim() && validDate(source.observedAt) && ["http:", "https:"].includes(new URL(source.url).protocol); }
  catch { return false; }
}
const round = (value: number) => Math.round(value * 10) / 10;

export function issuePoints(review: CreatorIssueReview | undefined) {
  if (!review || review.version !== ISSUE_VERSION || review.windowStart !== rubric.windowStart || review.windowEnd !== rubric.windowEnd
    || !review.complete || !review.selectionMethod.trim() || !validDate(review.reviewedAt) || review.reviewedAt < review.windowEnd
    || review.products.length < rubric.minimumProducts || new Set(review.products.map(product => product.id)).size !== review.products.length) return null;
  let affected = 0, severitySum = 0;
  for (const product of review.products) {
    if (!product.id.trim() || !product.name.trim() || !product.variant.trim() || !product.reviewNote.trim()
      || !validSource(product.creatorLink) || product.creatorLink.observedAt > review.reviewedAt
      || !product.reviewSources.length || !product.reviewSources.every(source => validSource(source) && source.observedAt <= review.reviewedAt)
      || !["documented-issue", "no-documented-issue"].includes(product.outcome)) return null;
    if (product.outcome === "no-documented-issue" && product.issues.length) return null;
    if (product.outcome === "documented-issue" && !product.issues.length) return null;
    let severity = 0;
    for (const issue of product.issues) {
      if (!issue.id.trim() || issue.status !== "confirmed" || !validDate(issue.occurredAt)
        || issue.occurredAt < review.windowStart || issue.occurredAt > review.windowEnd
        || !["regulator", "recall", "ruling", "test-report", "seller-resolution"].includes(issue.kind)
        || !issue.assessment.trim() || !validSource(issue.source) || issue.source.observedAt < issue.occurredAt || issue.source.observedAt > review.reviewedAt
        || !Number.isFinite(rubric.severity[issue.severity])) return null;
      severity = Math.max(severity, rubric.severity[issue.severity]);
    }
    if (severity > 0) affected++;
    severitySum += severity;
  }
  const reviewed = review.products.length;
  const frequency = round(rubric.weights.frequency * affected / reviewed);
  const severity = round(rubric.weights.severity * severitySum / reviewed);
  return { total: sumEvidencePoints([frequency, severity]), frequency, severity, affected, reviewed };
}

// Admission is a source-review decision recorded in the research file; URL/date
// validation cannot independently establish the truth of a product complaint.
const reviews = collection.reviews as CreatorIssueReview[];
const reports = new Map(PUBLIC_CREATORS.map(profile => {
  const matches = reviews.filter(review => review.handle === profile.handle);
  const review = matches.length === 1 && collection.version === ISSUE_VERSION ? matches[0] : undefined;
  return [profile.handle, { handle: profile.handle, review, points: issuePoints(review), reason: "A completed, sourced product-problem review is needed" }] as const;
}));
export const issueFor = (handle: string) => reports.get(handle);
export const ISSUE_SCORES = new Map([...reports].flatMap(([handle, report]) => report.points ? [[handle, report.points.total] as const] : []));
const ordered = [...ISSUE_SCORES.values()].sort((a, b) => b - a);
export const issueRank = (handle: string) => {
  const score = ISSUE_SCORES.get(handle);
  return score === undefined ? null : ordered.indexOf(score) + 1;
};
