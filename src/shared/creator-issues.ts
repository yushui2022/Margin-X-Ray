import collection from "../../research/creator-issue-reviews.json";
import rubric from "../../research/creator-issue-rubric.json";
import { PUBLIC_CREATORS } from "./creator-directory";
import { admittedReviewFor, issuePoints } from "./creator-scoring.mjs";
export { issuePoints } from "./creator-scoring.mjs";

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

// Admission is a source-review decision recorded in the research file; URL/date
// validation cannot independently establish the truth of a product complaint.
const reports = new Map(PUBLIC_CREATORS.map(profile => {
  const review = admittedReviewFor(profile.handle, collection);
  return [profile.handle, { handle: profile.handle, review, points: issuePoints(review), reason: "A completed, sourced product-problem review is needed" }] as const;
}));
export const issueFor = (handle: string) => reports.get(handle);
export const ISSUE_SCORES = new Map([...reports].flatMap(([handle, report]) => report.points ? [[handle, report.points.total] as const] : []));
const ordered = [...ISSUE_SCORES.values()].sort((a, b) => b - a);
export const issueRank = (handle: string) => {
  const score = ISSUE_SCORES.get(handle);
  return score === undefined ? null : ordered.indexOf(score) + 1;
};
