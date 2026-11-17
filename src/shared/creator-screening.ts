import data from "../../research/creator-screening.json";
import findings from "../../research/creator-brand-leads.json";
import captionReviews from "../../research/creator-caption-reviews.json";

export const SCREENING = data;
export type ScreeningRecord = (typeof data.creators)[number];
const records = new Map(data.creators.map((record) => [record.handle, record]));
export const screeningFor = (handle: string) => records.get(handle);
const captionLeads = captionReviews.reviews.flatMap((review) => {
  const record = records.get(review.handle);
  const post = record?.posts.find((item) => item.id === review.postId);
  return post && record ? [{ ...review, sourceLabel: "TikTok · Original post", url: post.url,
    access: "Caption from direct public creator embed; video not reviewed", observedAt: record.observedAt, excerpt: post.caption }] : [];
});
const allLeads = [...findings.leads, ...captionLeads];
export const brandLeadsFor = (handle: string) => allLeads.filter((lead) => lead.handle === handle);
export const SCREENING_TOTALS = {
  attempted: data.creators.length,
  sampled: data.creators.filter((record) => record.status === "sampled").length,
  unavailable: data.creators.filter((record) => record.status !== "sampled").length,
  posts: data.creators.reduce((count, record) => count + record.posts.length, 0),
  brandLeads: new Set(allLeads.map((lead) => lead.handle)).size,
};

export function screeningLabel(handle: string): string {
  const record = screeningFor(handle);
  if (!record) return "Research not started";
  if (record.status !== "sampled") return "Public sample unavailable";
  return `${record.posts.length} public posts sampled`;
}
