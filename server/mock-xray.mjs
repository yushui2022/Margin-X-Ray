#!/usr/bin/env node
/**
 * Local mock API for the Margin X-Ray Chrome extension.
 *
 * This is a test harness, not the real supply-chain engine. It returns a
 * clearly labeled mock dataset so the extension's streaming, rendering and
 * lead-capture paths can be exercised end to end.
 *
 * Run: npm run mock
 */

import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);

const STEPS = [
  { id: "capture", percent: 8, message: "Captured the page context." },
  { id: "resolve", percent: 22, message: "Resolved the product title, image and listed price." },
  { id: "image", percent: 38, message: "Prepared a clean product image for visual search." },
  { id: "market", percent: 55, message: "Checked the marketplace price and sales signal." },
  { id: "supply", percent: 72, message: "Searched 1688 and filtered listing noise." },
  { id: "verify", percent: 88, message: "Checked registry, scale and risk signals." },
  { id: "price", percent: 100, message: "Built an editable landed-cost model." },
];

const FACTORIES = [
  {
    id: "mock-factory-a",
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
      { label: "Manufacturing scope", value: "Registry scope includes manufacturing and assembly", source: "Mock registry" },
      { label: "Insured employees", value: "128 insured employees in the 2024 annual report", source: "Mock social insurance filing" },
      { label: "Quality system", value: "ISO 9001 certificate on file", source: "Mock certificate registry" },
      { label: "B2B repeat rate", value: "44% repeat purchase rate on the 1688 listing", source: "Mock 1688 listing" },
    ],
    confidence: "demo",
    confidenceReason: "Mock server sample data. Replace with real registry and audit evidence before launch.",
  },
  {
    id: "mock-factory-b",
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
      { label: "Manufacturing scope", value: "Registry scope includes electronic product manufacturing", source: "Mock registry" },
      { label: "Insured employees", value: "96 insured employees in the 2024 annual report", source: "Mock social insurance filing" },
      { label: "Export experience", value: "Customs registration and export records found", source: "Mock customs registry" },
    ],
    confidence: "demo",
    confidenceReason: "Mock server sample data. Replace with real registry and audit evidence before launch.",
  },
  {
    id: "mock-factory-c",
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
      { label: "Manufacturing scope", value: "Registry scope includes molds, injection molding and assembly", source: "Mock registry" },
      { label: "Insured employees", value: "64 insured employees in the 2024 annual report", source: "Mock social insurance filing" },
      { label: "Factory footprint", value: "Production address listed separately from registered address", source: "Mock registry filing" },
    ],
    confidence: "demo",
    confidenceReason: "Mock server sample data. Replace with real registry and audit evidence before launch.",
  },
];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round1(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function waterfall(retailUsd) {
  const assumptions = {
    fobUsd: 3.1,
    shippingPerUnitUsd: 2.2,
    dutyRatePct: 25,
    platformFeePct: 6,
    affiliatePct: 20,
    paymentPct: 3,
    fulfillmentPerUnitUsd: 4.5,
    returnRatePct: 8,
    adPct: 20,
  };

  const fob = assumptions.fobUsd;
  const shipping = assumptions.shippingPerUnitUsd;
  const duty = fob * (assumptions.dutyRatePct / 100);
  const landed = fob + shipping + duty;
  const platformFee = retailUsd * (assumptions.platformFeePct / 100);
  const affiliate = retailUsd * (assumptions.affiliatePct / 100);
  const payment = retailUsd * (assumptions.paymentPct / 100);
  const fulfillment = assumptions.fulfillmentPerUnitUsd;
  const returns = retailUsd * (assumptions.returnRatePct / 100);
  const contribution =
    retailUsd - landed - platformFee - affiliate - payment - fulfillment - returns;
  const ad = retailUsd * (assumptions.adPct / 100);
  const net = contribution - ad;

  return {
    assumptions,
    waterfall: {
      retailUsd: round2(retailUsd),
      fobUsd: round2(fob),
      shippingUsd: round2(shipping),
      dutyUsd: round2(duty),
      landedUsd: round2(landed),
      platformFeeUsd: round2(platformFee),
      affiliateUsd: round2(affiliate),
      paymentUsd: round2(payment),
      fulfillmentUsd: round2(fulfillment),
      returnsUsd: round2(returns),
      contributionUsd: round2(contribution),
      contributionMarginPct: round1((contribution / retailUsd) * 100),
      adUsd: round2(ad),
      netUsd: round2(net),
      netMarginPct: round1((net / retailUsd) * 100),
      grossMarginPct: round1(((retailUsd - fob) / retailUsd) * 100),
    },
  };
}

function makeResult(context, scanId) {
  const pagePrice = context?.price;
  const isUsd = pagePrice?.currency?.toUpperCase() === "USD";
  const retailUsd =
    isUsd && Number(pagePrice?.amount) > 0 ? Number(pagePrice.amount) : 59.9;
  const model = waterfall(retailUsd);

  return {
    scanId,
    dataSource: "mock",
    generatedAt: new Date().toISOString(),
    product: {
      title: context?.title || "Portable Neck Fan — Ultra Cooling",
      ...(context?.imageUrl ? { imageUrl: context.imageUrl } : {}),
      sourceUrl: context?.url || "https://example.com/product",
      platform: context?.platform || "generic",
      retailUsd,
      retailSource: isUsd
        ? "Listed on the page (mock scan)"
        : "Mock retail price — no USD price was found on the page",
    },
    priceRange: {
      fobMinUsd: 2.4,
      fobMaxUsd: 4.1,
      basis: "Mock range from a sample dataset at 100–2,000 pc tiers. Not a live quote.",
      confidence: "demo",
    },
    waterfall: model.waterfall,
    assumptions: model.assumptions,
    factories: FACTORIES,
    funnel: {
      scanned: 58,
      excludedByReason: [
        { reason: "Keyword / accessory listing", count: 9 },
        { reason: "Price outlier", count: 13 },
        { reason: "Outside the industry cluster", count: 21 },
        { reason: "B2B structure mismatch", count: 12 },
      ],
      verified: 3,
      note: "Mock funnel. The real pipeline must count each exclusion reason separately.",
    },
    qualityWarning:
      "Mock data: confirm the exact SKU, certifications, MOQ and current quote before ordering.",
    sources: [
      { label: "Local mock server sample dataset", asOf: "Not a live query" },
    ],
    disclaimers: [
      "This report was generated by the local mock server. It is not a real supplier quote.",
      "Factory names and signal values are fictional sample data.",
      "The cost waterfall is a model with editable assumptions, not accounting or tax advice.",
      "Verify every supplier claim independently before sending payment.",
    ],
  };
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

function sseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
}

function writeEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleStream(req, res) {
  let parsed;
  try {
    const body = await readBody(req);
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { ok: false, error: "Invalid JSON body." });
    return;
  }

  const context = parsed?.context ?? {};
  const scanId = parsed?.scanId || randomUUID();
  const result = makeResult(context, scanId);

  sseHeaders(res);
  res.write(": margin-xray mock stream\n\n");

  let index = 0;
  let closed = false;
  res.on("close", () => {
    closed = true;
  });

  const tick = () => {
    if (closed) return;
    if (index < STEPS.length) {
      const step = STEPS[index];
      writeEvent(res, "progress", {
        scanId,
        stepId: step.id,
        percent: step.percent,
        message: step.message,
      });
      index += 1;
      setTimeout(tick, 280);
      return;
    }

    writeEvent(res, "complete", result);
    res.end();
  };

  setTimeout(tick, 250);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      service: "margin-xray-mock",
      version: "0.1.0",
      now: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/xray/stream") {
    void handleStream(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/v1/leads") {
    void (async () => {
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body);
        const lead = parsed?.lead ?? {};
        const email = typeof lead.email === "string" ? lead.email : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          json(res, 400, { ok: false, error: "A valid lead email is required." });
          return;
        }
        console.log(
          `[lead] ${new Date().toISOString()} ${email} · ${
            parsed?.result?.product?.title ?? "unknown product"
          }`,
        );
        json(res, 200, { ok: true, id: randomUUID() });
      } catch {
        json(res, 400, { ok: false, error: "Invalid JSON body." });
      }
    })();
    return;
  }

  json(res, 404, {
    ok: false,
    error: "Not found. Try GET /health or POST /api/v1/xray/stream.",
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("  Margin X-Ray mock API");
  console.log(`  http://localhost:${PORT}`);
  console.log("");
  console.log("  GET  /health");
  console.log("  POST /api/v1/xray/stream   (SSE)");
  console.log("  POST /api/v1/leads");
  console.log("");
  console.log("  This server returns sample data, clearly labeled as mock.");
  console.log("  Press Ctrl+C to stop.");
  console.log("");
});
