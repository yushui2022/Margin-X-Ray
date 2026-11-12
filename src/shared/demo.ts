import { computeWaterfall, defaultAssumptions } from "./pricing";
import type { Factory, PageContext, ScanResult } from "./types";

const DEMO_FACTORIES: Factory[] = [
  {
    id: "demo-factory-a",
    maskedName: "Verified Ningbo OEM Factory A",
    location: "Cixi, Ningbo, Zhejiang",
    fobMinUsd: 2.55,
    fobMaxUsd: 3.85,
    tiers: [
      { moq: 100, unitUsd: 3.85, note: "Sample / small batch" },
      { moq: 500, unitUsd: 3.1, note: "Standard wholesale" },
      { moq: 2000, unitUsd: 2.55, note: "Container volume" },
    ],
    insuredEmployees: 128,
    insuredYear: 2024,
    establishedYear: 2014,
    signals: [
      {
        label: "Manufacturing scope",
        value: "Registry scope includes manufacturing and assembly",
        source: "Company registry (demo)",
      },
      {
        label: "Insured employees",
        value: "128 insured employees in the 2024 annual report",
        source: "Social insurance filing (demo)",
      },
      {
        label: "Quality system",
        value: "ISO 9001 certificate on file",
        source: "Certificate registry (demo)",
      },
      {
        label: "B2B repeat rate",
        value: "44% repeat purchase rate on the 1688 listing",
        source: "1688 listing (demo)",
      },
      {
        label: "Judicial risk",
        value: "No dishonest-executor records found",
        source: "Court registry (demo)",
      },
    ],
    confidence: "demo",
    confidenceReason:
      "Sample data for UI demonstration. In live mode this card must cite the registry record and date.",
  },
  {
    id: "demo-factory-b",
    maskedName: "Verified Shenzhen OEM Factory B",
    location: "Bao'an, Shenzhen, Guangdong",
    fobMinUsd: 2.8,
    fobMaxUsd: 4.1,
    tiers: [
      { moq: 100, unitUsd: 4.1, note: "Sample / small batch" },
      { moq: 500, unitUsd: 3.35, note: "Standard wholesale" },
      { moq: 2000, unitUsd: 2.8, note: "Container volume" },
    ],
    insuredEmployees: 96,
    insuredYear: 2024,
    establishedYear: 2017,
    signals: [
      {
        label: "Manufacturing scope",
        value: "Registry scope includes electronic product manufacturing",
        source: "Company registry (demo)",
      },
      {
        label: "Insured employees",
        value: "96 insured employees in the 2024 annual report",
        source: "Social insurance filing (demo)",
      },
      {
        label: "Export experience",
        value: "Customs registration and export records found",
        source: "Customs registry (demo)",
      },
      {
        label: "Certifications",
        value: "CE and FCC documentation on file",
        source: "Certificate registry (demo)",
      },
    ],
    confidence: "demo",
    confidenceReason:
      "Sample data for UI demonstration. Live mode should show certificate IDs and validity dates.",
  },
  {
    id: "demo-factory-c",
    maskedName: "Verified Dongguan OEM Factory C",
    location: "Dongguan, Guangdong",
    fobMinUsd: 2.4,
    fobMaxUsd: 3.6,
    tiers: [
      { moq: 100, unitUsd: 3.6, note: "Sample / small batch" },
      { moq: 500, unitUsd: 2.95, note: "Standard wholesale" },
      { moq: 2000, unitUsd: 2.4, note: "Container volume" },
    ],
    insuredEmployees: 64,
    insuredYear: 2024,
    establishedYear: 2016,
    signals: [
      {
        label: "Manufacturing scope",
        value: "Registry scope includes molds, injection molding and assembly",
        source: "Company registry (demo)",
      },
      {
        label: "Insured employees",
        value: "64 insured employees in the 2024 annual report",
        source: "Social insurance filing (demo)",
      },
      {
        label: "Factory footprint",
        value: "Production address listed separately from registered address",
        source: "Registry filing (demo)",
      },
      {
        label: "B2B repeat rate",
        value: "36% repeat purchase rate on the 1688 listing",
        source: "1688 listing (demo)",
      },
    ],
    confidence: "demo",
    confidenceReason:
      "Sample data for UI demonstration. Live mode should verify the production address and audit evidence.",
  },
];

export function createDemoResult(
  context: PageContext,
  scanId = `demo-${Date.now()}`,
): ScanResult {
  const pagePrice = context.price;
  const isUsd = pagePrice?.currency?.toUpperCase() === "USD";
  const retailUsd = isUsd && pagePrice && pagePrice.amount > 0 ? pagePrice.amount : 59.9;

  const assumptions = defaultAssumptions(retailUsd, 3.1);
  const waterfall = computeWaterfall(retailUsd, assumptions);

  return {
    scanId,
    dataSource: "demo",
    generatedAt: new Date().toISOString(),
    product: {
      title: context.title || "Portable Neck Fan — Ultra Cooling",
      imageUrl: context.imageUrl,
      sourceUrl: context.url,
      platform: context.platform,
      retailUsd,
      retailSource:
        isUsd && pagePrice
          ? pagePrice.source === "TikHub"
            ? "TikHub"
            : `Listed on the page (${pagePrice.source})`
          : "Demo retail price — no USD price was found on the page",
    },
    priceRange: {
      fobMinUsd: 2.4,
      fobMaxUsd: 4.1,
      basis:
        "Demo range from a sample 1688 dataset at 100–2,000 pc tiers. Not a live quote.",
      confidence: "demo",
    },
    waterfall,
    assumptions,
    factories: DEMO_FACTORIES,
    funnel: {
      scanned: 58,
      excludedByReason: [
        { reason: "Keyword / accessory listing", count: 9 },
        { reason: "Price outlier", count: 13 },
        { reason: "Outside the industry cluster", count: 21 },
        { reason: "B2B structure mismatch", count: 12 },
      ],
      verified: 3,
      note:
        "Illustrative demo funnel. Live mode must report each exclusion reason separately instead of labeling every non-top-3 listing as a middleman.",
    },
    qualityWarning:
      "Demo only: confirm the exact SKU, certifications, MOQ and current quote before ordering.",
    sources: [
      { label: "Demo product dataset", asOf: "Sample data, not a live query" },
      { label: "Demo factory signals", asOf: "Sample data, not a live query" },
    ],
    disclaimers: [
      "This is a demo report generated from a sample dataset. It is not a real supplier quote.",
      "Factory names and signal values are fictional in demo mode.",
      "The cost waterfall is a model with editable assumptions, not accounting or tax advice.",
      "Verify every supplier claim independently before sending payment.",
    ],
  };
}
