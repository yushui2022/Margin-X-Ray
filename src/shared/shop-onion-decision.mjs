import { RANKING_SCORE_VERSION, rankingPriceScore } from "./shop-ranking-scale.mjs";

export const SHOP_ONION_SCALE = Object.freeze(
  [
    [0, 0],
    [10, 20],
    [30, 45],
    [75, 70],
    [150, 85],
    [300, 97],
    [500, 100],
  ].map(Object.freeze),
);
export const SHOP_ONION_ALLOWANCES = Object.freeze({
  "same-sku": 5,
  measured: 10,
  variable: 25,
  general: 15,
});
const points = SHOP_ONION_SCALE;
const pct = (n) => String(Number(n.toFixed(1))) + "%";
const money = (n, currency) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
const plural = (n, s) => n + " " + s + (n === 1 ? "" : "s");

export function pointsForExcess(excessPct) {
  if (excessPct <= 0) return 0;
  for (let i = 1; i < points.length; i++) {
    const [right, high] = points[i];
    if (excessPct <= right) {
      const [left, low] = points[i - 1];
      return Math.round(low + ((high - low) * (excessPct - left)) / (right - left));
    }
  }
  return 100;
}

const measuredGoods =
  /\b(?:adapters?|batter(?:y|ies)|bottles?|cables?|chargers?|drives?|filters?|memory cards?|refills?|storage cards?|tubes?|wire|bulbs?|tape|scales?)\b/i;
const materialGoods =
  /\b(?:bracelets?|necklaces?|earrings?|rings?|chairs?|tables?|furniture|cabinets?|watches|coats?|jackets?|sweaters?|scarves|scarfs?|bags?|boots?|shoes?|pottery|vases?|figurines?|sculptures?)\b/i;
const collectibleGoods =
  /\b(?:figurin(?:e|es)|figures?|cards?|playsets?|toys?|dolls?|prints?|coins?|books?|records?|comics?)\b/i;
const measures =
  /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(mah|wh|watts?|w|volts?|v|gb|tb|ml|oz|cm|mm|meters?|metres?|inches|inch|ft|kg|liters?|litres?)\b/gi;
const materials =
  /\b(?:solid (?:oak|walnut|wood|cherry|maple)|sterling silver|full[- ]grain leather|cashmere|merino wool|hand[- ](?:blown|carved|woven|thrown|forged)|wheel[- ]thrown|porcelain)\b/i;
const editions =
  /\b(?:first (?:edition|printing|pressing)|numbered (?:edition|series|print)|collector['’]?s? edition|limited (?:edition|run) of \d+|edition of \d+)\b/i;
const productText = (product, variant) =>
  [product.name, product.material, variant?.material, variant?.variant]
    .filter((v) => typeof v === "string")
    .join(" ");
const normMeasure = (text) =>
  [...text.matchAll(measures)].map(
    (m) =>
      m[1] +
      m[2]
        .toLowerCase()
        .replace(/watts?/, "w")
        .replace(/volts?/, "v"),
  );
const sameText = (evidence, regex) => {
  const marker = evidence[0].match(regex)?.[0]?.toLowerCase();
  return marker && evidence.every((text) => text.toLowerCase().includes(marker)) ? marker : null;
};

function categoryAllowance(item, variant, basis, quotes) {
  if (basis === "exact")
    return {
      category: "same-sku",
      categoryLabel: "Same SKU",
      baseAllowancePct: SHOP_ONION_ALLOWANCES["same-sku"],
      detail: "The same variant qualifies for the 5% editorial allowance.",
    };
  const texts = [productText(item, variant), ...quotes.map((q) => productText(q, q))];
  const matchedMeasure = normMeasure(texts[0]).find((m) =>
    texts.slice(1).every((text) => normMeasure(text).includes(m)),
  );
  if (texts.every((text) => measuredGoods.test(text)) && matchedMeasure)
    return {
      category: "measured",
      categoryLabel: "Measured item",
      baseAllowancePct: SHOP_ONION_ALLOWANCES["measured"],
      detail:
        "The listings specify the same " +
        matchedMeasure +
        " measurement on a standardized item. The editorial allowance is 10%.",
    };
  const material = texts.every((text) => materialGoods.test(text)) && sameText(texts, materials);
  const edition = texts.every((text) => collectibleGoods.test(text)) && sameText(texts, editions);
  if (material || edition)
    return {
      category: "variable",
      categoryLabel: material ? "Material or craft" : "Collectible edition",
      baseAllowancePct: SHOP_ONION_ALLOWANCES["variable"],
      detail:
        "The listings identify “" +
        (material || edition) +
        "”. This " +
        (material ? "material or process" : "edition detail") +
        " qualifies for a wider 25% editorial allowance.",
    };
  return {
    category: "general",
    categoryLabel: "Similar item",
    baseAllowancePct: SHOP_ONION_ALLOWANCES["general"],
    detail: "Matching options establish a similar item. The general editorial allowance is 15%.",
  };
}

export function packageDifference(item, variant, offer) {
  const substitutions = {
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
  };
  function offerTerms(product, sku) {
    const quantity = (text) =>
      text
        .match(/\b(?:pack|set|bundle|box|case) of (\d+)\b|\b(\d+)[- ]?(?:packs?|pk|pieces?|pcs|count)\b/)
        ?.slice(1)
        .find(Boolean);
    const clean = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (m) => substitutions[m]);
    const name = clean(product.name),
      option = clean(sku?.variant);
    const words = name + " " + option;
    const promo = words.match(
      /\bbuy\s+(\d+)\s*[,/-]?\s*get\s+(\d+)(?:\s+(free|half[- ]price|\d+%\s*off))?\b/,
    );
    const promotion = promo
      ? "buy " + promo[1] + " get " + promo[2] + (promo[3] ? " " + promo[3] : "")
      : /\bbogo\b/.test(words)
        ? "buy 1 get 1 free"
        : words.match(
            /\b(?:includes? (?:a )?free|bonus)\s+(?!shipping\b|delivery\b|returns?\b)([a-z0-9-]+(?:\s+(?:kit|case|pack|set))?)/,
          )?.[0] || "";
    const explicit = [sku?.unitsPerPack, sku?.packQuantity, product.unitsPerPack, product.packQuantity].find(
      (n) => Number.isSafeInteger(n) && n > 0,
    );
    return { pack: explicit ? String(explicit) : quantity(option) || quantity(name) || "1", promotion };
  }
  const source = offerTerms(item, variant),
    peer = offerTerms(offer, offer);
  if (source.pack !== peer.pack)
    return "The listings specify different pack sizes (" + source.pack + " versus " + peer.pack + ").";
  if (source.promotion !== peer.promotion)
    return (
      "The bundle or promotion differs (" +
      (source.promotion || "no listed bonus") +
      " versus " +
      (peer.promotion || "no listed bonus") +
      ")."
    );
  return null;
}

function fourSteps(match, context, grade, action) {
  return [
    { label: "Match", detail: match },
    { label: "Context", detail: context },
    { label: "Grade", detail: grade },
    { label: "Action", detail: action },
  ];
}

export function decideItem(item, variant, result, version) {
  const { basis, quotes, peerCents } = result;
  const sourceCents = Math.round(variant.price * 100);
  const cents = quotes.map((quote) => Math.round(quote.price * 100));
  const peerCount = quotes.length,
    low = Math.min(...cents),
    high = Math.max(...cents);
  const policy = categoryAllowance(item, variant, basis, quotes);
  // A second store can widen the band only by the premium actually observed.
  // The cap limits the influence of a distant quote in this small search window.
  const observedPct = ((high - peerCents) * 100) / peerCents;
  const base = policy.baseAllowancePct;
  const allowance = peerCount >= 2 ? Math.max(base, Math.min(base + 10, observedPct)) : base;
  const upperCents = (peerCents * (100 + allowance)) / 100;
  const excessPct = Math.max(0, ((sourceCents - upperCents) * 100) / upperCents);
  const state =
    sourceCents < peerCents
      ? "below"
      : sourceCents === peerCents
        ? "equal"
        : sourceCents <= upperCents + 1e-9
          ? "within"
          : "above";
  const current = version === RANKING_SCORE_VERSION;
  const score = current
    ? rankingPriceScore({sourcePrice:sourceCents / 100, peerPrice:peerCents / 100, allowancePct:allowance})
    : pointsForExcess(excessPct);
  const confidence =
    basis === "exact" ? (peerCount >= 2 ? "high" : "medium") : peerCount >= 2 ? "medium" : "low";
  const currency = variant.currency,
    reference = money(peerCents / 100, currency),
    ceiling = money(upperCents / 100, currency);
  const evidence =
    basis === "exact" ? "Verified the same in-stock SKU" : "Matched the item type and selected options";
  const match =
    evidence +
    " across the original shop and " +
    plural(peerCount, "other shop") +
    ". " +
    (basis === "exact" ? "Lowest eligible price" : "Median other-shop price") +
    ": " +
    reference +
    ".";
  const spread =
    peerCount < 2
      ? "One other shop cannot establish a price range."
      : "Observed " +
        money(low / 100, currency) +
        "–" +
        money(high / 100, currency) +
        " across " +
        plural(peerCount, "other shop") +
        ". " +
        (allowance > base
          ? "That raises the allowance to " + pct(allowance) + ", capped at " + pct(base + 10) + "."
          : "That range leaves the default allowance in place.");
  const labels = {
    below: "Below the reference",
    equal: "Level with the reference",
    within: "Inside the price band",
    above:
      confidence === "low"
        ? "Above the estimated band"
        : score >= 70
          ? "Far above the price band"
          : "Above the price band",
  };
  const reason =
    state === "below"
      ? "The original item price is below " + reference + "."
      : state === "equal"
        ? "Both the original and the reference are " + reference + "."
        : state === "within"
          ? "The original costs more than the reference and stays within the " + ceiling + " upper edge."
          : "The original is " + pct(excessPct) + " above the " + ceiling + " upper edge.";
  let action;
  if (basis === "similar")
    action =
      state === "above"
        ? confidence === "low"
          ? "Wait for a closer match"
          : "Compare alternatives before paying more"
        : "Keep this offer in consideration";
  else if (state === "above") action = "Favor the lower-priced shop";
  else if (state === "below") action = "Keep the original offer";
  else if (state === "equal") action = "Choose by delivery and returns";
  else action = "Choose by the checkout total";
  const advice =
    confidence === "low"
      ? "Confirm the edition, included items and one more shop price before deciding."
      : basis === "similar"
        ? "Check the exact SKU and what each seller includes before treating the price gap as savings."
        : "Compare shipping, taxes and discounts for this variant at checkout.";
  const gap = ((sourceCents - peerCents) * 100) / peerCents;
  const gapLabel = gap === 0 ? "the same as" : pct(Math.abs(gap)) + (gap > 0 ? " above" : " below");
  const grade = current
    ? "The original price is " + gapLabel + " the reference. Prices within 5% of the reference score 50. This price scores " + score + "/100."
    : reason + " " + score + "/100 on the price scale.";
  return {
    score,
    decision: {
      state,
      label: labels[state],
      reason,
      action,
      confidence,
      steps: fourSteps(
        match,
        policy.detail + " " + spread,
        grade,
        advice,
      ),
      context: {
        ...policy,
        allowancePct: allowance,
        spreadAllowancePct: allowance - base,
        peerCount,
        lowPeerPrice: low / 100,
        highPeerPrice: high / 100,
        upperPrice: upperCents / 100,
        excessPct,
        currency,
      },
    },
  };
}

export function unscoredDecision(reason) {
  return {
    state: "unrated",
    label: "More evidence needed",
    reason,
    action: "Check the listing details",
    confidence: "insufficient",
    steps: fourSteps(
      reason,
      "A price band requires a comparable in-stock offer.",
      "The score is pending.",
      "Open the original SKU and check its pack, options and availability against another shop.",
    ),
    context: null,
  };
}

export function sampleDecision(items, linkedCount, score) {
  const confidences = ["low", "medium", "high"];
  const lowest = Math.min(...items.map((i) => confidences.indexOf(i.decision.confidence)));
  const confidence = items.length < linkedCount ? "low" : confidences[lowest];
  const coverage = plural(items.length, "product") + " scored out of " + linkedCount + " linked.";
  const above = items.filter((item) => item.decision.state === "above").length;
  const below = items.filter((item) => item.decision.state === "below").length;
  const label = above
    ? plural(above, "item") + (above === 1 ? " above its price band" : " above their price bands")
    : below === items.length
      ? "Sample below reference prices"
      : "Sample inside the price bands";
  const reason =
    coverage +
    " " +
    above +
    " above the upper edge, " +
    below +
    " below reference and " +
    (items.length - above - below) +
    " at or within the band.";
  return {
    state: "sample",
    label,
    reason,
    action: "Choose item by item",
    confidence,
    steps: fourSteps(
      coverage,
      "Each item has its own product type, reference price and upper edge.",
      "The median product score is " + score + "/100. Only the sampled, scored products contribute.",
      "Open the individual product checks to compare the offers and see which listings still need evidence.",
    ),
    context: null,
  };
}
