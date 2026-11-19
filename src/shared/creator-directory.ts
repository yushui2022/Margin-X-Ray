import records from "../../assets/creators/sources.json";

export interface CreatorProfile {
  handle: string;
  name: string;
  category: string;
  initials: string;
  source: string;
  imageUrl: string;
  image: string;
  retrievedAt: string;
  note: string;
  collection?: string;
  profileSource?: string;
  sourceCategory?: string | null;
  country?: string | null;
  followers?: number | null;
  followersLabel?: string | null;
  followersSource?: string | null;
  followersObservedAt?: string | null;
  followersNote?: string;
  sourceRank?: number | null;
  score?: number | null;
  reviewStatus?: string;
}

export const PUBLIC_CREATORS: CreatorProfile[] = records;
export const DIRECTORY_PAGE_SIZE = 20;

export function directoryPage(options: {
  query: string;
  category: string;
  sort: "followers" | "name" | "evidence" | "evidence-low" | "confidence" | "confidence-low" | "issues" | "issues-low" | "products" | "premium" | "premium-low";
  page: number;
  productHandles?: ReadonlySet<string>;
  pricedProducts?: ReadonlyMap<string, number>;
  premiumScores?: ReadonlyMap<string, number>;
  evidenceScores?: ReadonlyMap<string, number>;
  confidenceScores?: ReadonlyMap<string, number>;
  issueScores?: ReadonlyMap<string, number>;
}, profiles: readonly CreatorProfile[] = PUBLIC_CREATORS) {
  const query = options.query.trim().replace(/^@/, "").normalize("NFKC").toLocaleLowerCase();
  const items = profiles.filter((item) =>
    (options.category === "All" || item.category === options.category)
    && (!options.productHandles || options.productHandles.has(item.handle))
    && (!query || `${item.name} ${item.handle}`.normalize("NFKC").toLocaleLowerCase().includes(query)),
  ).sort((a, b) => {
    let order = 0;
    switch (options.sort) {
      case "followers":
        return (b.followers ?? -1) - (a.followers ?? -1) || a.handle.localeCompare(b.handle);
      case "products":
        order = (options.pricedProducts?.get(b.handle) ?? 0) - (options.pricedProducts?.get(a.handle) ?? 0);
        break;
      case "premium":
      case "premium-low":
        order = compareScores(a.handle, b.handle, options.premiumScores, options.sort === "premium-low");
        break;
      case "issues":
      case "issues-low":
        order = compareScores(a.handle, b.handle, options.issueScores, options.sort === "issues-low");
        break;
      case "confidence":
      case "confidence-low":
        order = compareScores(a.handle, b.handle, options.confidenceScores, options.sort === "confidence-low");
        break;
      case "evidence":
      case "evidence-low":
        order = ((options.evidenceScores?.get(b.handle) ?? 0) - (options.evidenceScores?.get(a.handle) ?? 0)) * (options.sort === "evidence-low" ? -1 : 1);
        break;
    }
    return order || a.name.localeCompare(b.name) || a.handle.localeCompare(b.handle);
  });
  const pageCount = Math.max(1, Math.ceil(items.length / DIRECTORY_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(options.page) || 1));
  const start = (page - 1) * DIRECTORY_PAGE_SIZE;
  return { items: items.slice(start, start + DIRECTORY_PAGE_SIZE), total: items.length, page, pageCount, start };
}

function compareScores(a: string, b: string, scores: ReadonlyMap<string, number> | undefined, ascending: boolean): number {
  const left = scores?.get(a), right = scores?.get(b);
  if (left === undefined || right === undefined) return left === right ? 0 : left === undefined ? 1 : -1;
  return (right - left) * (ascending ? -1 : 1);
}
