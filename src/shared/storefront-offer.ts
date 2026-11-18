interface PublicOffer {
  id: string;
  title: string;
  price: number;
  currency: string;
  barcode?: string;
}

/** Public Shopify oEmbed includes a currency and a price for each available variant. */
export async function storefrontOffers(raw: string): Promise<PublicOffer[]> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !/\/products\/[\w%-]+\/?$/.test(url.pathname)) return [];
  if ([...url.searchParams.keys()].some(key => key !== "variant" && !key.startsWith("utm_"))) return [];
  const variant = url.searchParams.get("variant");
  const base = url.origin + url.pathname.replace(/\/$/, "");
  const options: RequestInit = { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(6000) };
  async function get(suffix: string) {
    const response = await fetch(base + suffix, options);
    if (!response.ok) throw new Error("Offer unavailable");
    return response.json();
  }
  const [priceData, metadata] = await Promise.all([get(".oembed"), get(".js").catch(() => null)]);
  if (!Array.isArray(priceData?.offers)) return [];
  const offers: PublicOffer[] = [];
  for (const offer of priceData.offers) {
    if (!offer || !/^\d+$/.test(String(offer.offer_id)) || (variant && String(offer.offer_id) !== variant)) continue;
    const price = Number(offer.price);
    if (offer.in_stock !== true || !Number.isFinite(price) || price <= 0 || !/^[A-Z]{3}$/.test(offer.currency_code)) continue;
    const info = Array.isArray(metadata?.variants) ? metadata.variants.find((row: { id?: number } | null) => String(row?.id) === String(offer.offer_id)) : undefined;
    const title = [priceData.title, offer.title === "Default Title" ? "" : offer.title].filter(Boolean).join(" · ");
    offers.push({ id: String(offer.offer_id), title: title || "Storefront offer", price, currency: offer.currency_code,
      barcode: typeof info?.barcode === "string" ? info.barcode : undefined });
  }
  return offers;
}
