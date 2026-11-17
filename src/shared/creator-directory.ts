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
  sort: "followers" | "name" | "evidence" | "evidence-low";
  page: number;
  productHandles?: ReadonlySet<string>;
  evidenceScores?: ReadonlyMap<string, number>;
}, profiles: readonly CreatorProfile[] = PUBLIC_CREATORS) {
  const query = options.query.trim().replace(/^@/, "").normalize("NFKC").toLocaleLowerCase();
  const items = profiles.filter((item) =>
    (options.category === "All" || item.category === options.category)
    && (!options.productHandles || options.productHandles.has(item.handle))
    && (!query || `${item.name} ${item.handle}`.normalize("NFKC").toLocaleLowerCase().includes(query)),
  ).sort((a, b) => options.sort === "followers"
    ? (b.followers ?? -1) - (a.followers ?? -1) || a.handle.localeCompare(b.handle)
    : ((options.sort === "evidence" || options.sort === "evidence-low")
      ? ((options.evidenceScores?.get(b.handle) ?? 0) - (options.evidenceScores?.get(a.handle) ?? 0)) * (options.sort === "evidence-low" ? -1 : 1)
      : 0) || a.name.localeCompare(b.name) || a.handle.localeCompare(b.handle));
  const pageCount = Math.max(1, Math.ceil(items.length / DIRECTORY_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(options.page) || 1));
  const start = (page - 1) * DIRECTORY_PAGE_SIZE;
  return { items: items.slice(start, start + DIRECTORY_PAGE_SIZE), total: items.length, page, pageCount, start };
}
