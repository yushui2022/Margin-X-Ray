import archivePosts from "../../research/shop-archive-creators.json";
import { PUBLIC_CREATORS } from "../shared/creator-directory";
import { creatorHref, shoppingRankingHref } from "../shared/shopping-links";
import { shopRankingRows } from "./shopping-ranking-data";

export interface CreatorSearchEntry {
  handle: string;
  name: string;
  avatar?: string;
  href: string;
  score: number | null;
  hasCheck: boolean;
}

function fold(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function creatorQuery(raw: string) {
  const text = raw.normalize("NFKC").trim().replace(/^@/, "").trim().toLowerCase();
  if (/[/\\?#@]/.test(text)) return;
  const key = fold(text);
  if (key) return { text, key };
}

const directory = new Map(PUBLIC_CREATORS.map(profile => [profile.handle.toLowerCase(), profile]));
const checks = new Map(shopRankingRows.map(row => [row.handle, row]));
const posts = new Map(archivePosts.map(post => [post.handle.toLowerCase(), post]));
const handles = new Set([...checks.keys(), ...directory.keys()]);
const index = Array.from(handles, handle => {
  const profile = directory.get(handle);
  const checked = checks.get(handle);
  const post = posts.get(handle);
  const name = post?.displayName || profile?.name || handle;
  const entry: CreatorSearchEntry = {
    handle, name, avatar: post?.avatar || profile?.image,
    href: checked ? shoppingRankingHref(handle) : creatorHref(handle),
    score: checked?.verdict.score ?? null,
    hasCheck: Boolean(checked),
  };
  const names = [name, profile?.name ?? name].map(value => value.normalize("NFKC").trim().toLowerCase());
  const keys = [...new Set([handle, ...names].map(fold))].filter(Boolean);
  return { entry, names, keys };
});

export function searchCreators(query: string): CreatorSearchEntry[] {
  const match = creatorQuery(query);
  if (!match) return [];
  const matches: { entry: CreatorSearchEntry; priority: number }[] = [];
  for (const { entry, names, keys } of index) {
    let priority;
    if (entry.handle === match.text) priority = 0;
    else if (names.includes(match.text)) priority = 1;
    else if (keys.includes(match.key)) priority = 2;
    else if (keys.some(key => key.startsWith(match.key))) priority = 3;
    else if (keys.some(key => key.includes(match.key))) priority = 4;
    else continue;
    matches.push({ entry, priority });
  }
  matches.sort((a, b) => a.priority - b.priority
    || Number(b.entry.hasCheck) - Number(a.entry.hasCheck)
    || (b.entry.score ?? -1) - (a.entry.score ?? -1)
    || a.entry.handle.localeCompare(b.entry.handle));
  return matches.map(match => match.entry);
}

export function exactCreator(query: string): CreatorSearchEntry | undefined {
  const match = creatorQuery(query);
  if (!match) return;
  const handle = index.find(({ entry }) => entry.handle === match.text);
  if (handle) return handle.entry;
  const named = index.filter(({ names }) => names.includes(match.text));
  if (named.length) return named.length === 1 ? named[0].entry : undefined;
  if (Array.from(match.key).length < 2) return;
  const exact = index.filter(({ keys }) => keys.includes(match.key));
  if (exact.length === 1) return exact[0].entry;
}
