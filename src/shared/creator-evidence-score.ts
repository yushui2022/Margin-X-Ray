import products from "../../research/creator-products.json";
import { PUBLIC_CREATORS } from "./creator-directory";
import { brandLeadsFor, screeningFor } from "./creator-screening";

export const EVIDENCE_SCORE_VERSION = "evidence-v1";
export const EVIDENCE_SCORE_SCOPE = "Measures the evidence collected in this report, not creator honesty, product quality or value for money. A low score means limited research coverage. Followers, popularity and assumed earnings earn no points.";

export function evidencePoints(input: { hasPublicSample: boolean; commercialUrls: readonly string[]; productIds: readonly string[] }) {
  const sample = input.hasPublicSample ? 20 : 0;
  const commercial = Math.min(new Set(input.commercialUrls).size, 3) * 10;
  const prices = Math.min(new Set(input.productIds).size, 2) * 15;
  // No verified financial records exist in this collection. User assumptions
  // and a creator's claimed revenue cannot fill this dimension.
  const financial = 0;
  return { sample, commercial, prices, financial, total: sample + commercial + prices + financial };
}

function buildScore(handle: string) {
  const sample = screeningFor(handle);
  const leads = brandLeadsFor(handle);
  const priced = products.products.filter((product) => product.handle === handle);
  const points = evidencePoints({
    hasPublicSample: sample?.status === "sampled" && sample.posts.length > 0,
    commercialUrls: leads.map((lead) => lead.url),
    productIds: priced.map((product) => product.id),
  });
  const sourceCount = new Set(leads.map((lead) => lead.url)).size;
  const level = points.total === 0 ? "No usable evidence yet" : points.total < 30 ? "Initial evidence" : points.total < 60 ? "Partial evidence" : "Broader evidence";
  return {
    ...points, level, observedAt: sample?.observedAt ?? products.observedAt,
    dimensions: [
      { name: "Public caption sample", points: points.sample, maximum: 20,
        explanation: points.sample ? `${sample!.posts.length} public captions collected. One usable identity-matched sample earns 20 points; more posts do not imply a representative history.` : "No usable public caption sample. This is a research gap, not a negative finding about the creator.",
        sources: sample ? [{ label: "TikTok public sample", url: sample.sourceUrl }] : [] },
      { name: "Selected commercial sources", points: points.commercial, maximum: 30,
        explanation: `${sourceCount} distinct source URLs selected for product, brand or service follow-up. 10 points each, capped at 3. These are leads, not verified paid relationships.`,
        sources: [...new Map(leads.map((lead) => [lead.url, { label: lead.title, url: lead.url }])).values()] },
      { name: "Sourced reference prices", points: points.prices, maximum: 30,
        explanation: `${priced.length} accepted product reference-price records. 15 points each, capped at 2. Pack variants can count separately. Reference prices do not verify current checkout or a good deal.`,
        sources: [...new Map(priced.flatMap((product) => product.sources.map((id) => products.sources.find((source) => source.id === id)!)).map((source) => [source.url, { label: source.label, url: source.url }])).values()] },
      { name: "Verified financial evidence", points: 0, maximum: 20,
        explanation: "0 verified financial records. No creator-specific contract, settlement or cost evidence has been verified. Unknown earnings are not zero earnings; calculator assumptions earn no points.",
        sources: [] },
    ],
  };
}

const scores = new Map(PUBLIC_CREATORS.map((profile) => [profile.handle, buildScore(profile.handle)]));
export const evidenceScoreFor = (handle: string) => scores.get(handle);
export const EVIDENCE_SCORES = new Map([...scores].map(([handle, record]) => [handle, record.total]));
