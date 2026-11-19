import archive from "../../research/creator-products.json";
import type { CreatorIssueReview } from "./creator-issues";
import type { EvidenceInput } from "./creator-evidence-score";

type Product = (typeof archive.products)[number];
type CoverageItem = "identity" | "captions" | "leads" | "linkage" | "products" | "variants" | "prices" | "context" | "compensation" | "costs" | "total";

export function sumEvidencePoints(values: number[]): number;
export function coveragePoints(count: number, target: number, maximum: number): number;
export function distinct(values: readonly string[]): string[];
export const sourceIndex: ReadonlyMap<string, (typeof archive.sources)[number]>;
export function usableProducts(records: readonly Product[]): Product[];
export function hasPrice(product: Product): boolean;
export function hasContext(product: Product): boolean;
export function hasPost(product: Product): boolean;
export function evidencePoints(input: EvidenceInput): Record<CoverageItem, number>;
export function issuePoints(review: CreatorIssueReview | undefined): { total: number; frequency: number; severity: number; affected: number; reviewed: number } | null;
export function admittedReviewFor(handle: string, collection: { version: string; reviews: readonly CreatorIssueReview[] }): CreatorIssueReview | undefined;
