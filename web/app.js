"use strict";
(() => {
  // src/shared/capture.ts
  var IMAGE_TYPES = /* @__PURE__ */ new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ]);
  function inferPlatformFromUrl(raw) {
    const url = toUrl(raw);
    if (!url) return "generic";
    const host = url.hostname.toLowerCase();
    if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
    if (/(^|\.)amazon\./.test(host)) return "amazon";
    if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return "youtube";
    if (/(^|\.)shopify\.com$/.test(host)) return "shopify";
    return "generic";
  }
  function looksLikeVideoUrl(raw) {
    const url = toUrl(raw);
    if (!url) return false;
    if (/(^|\.)tiktok\.com$/.test(url.hostname) && /\/video\/\d+/.test(url.pathname)) {
      return true;
    }
    if (/(^|\.)instagram\.com$/.test(url.hostname) && /\/(reel|reels|p)\//.test(url.pathname)) {
      return true;
    }
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname) ? /\/(shorts|watch|live)\b/.test(url.pathname) || url.hostname.endsWith("youtu.be") : false;
  }
  function guessTitleFromUrl(raw) {
    const url = toUrl(raw);
    if (!url) return "Pasted product link";
    const host = url.hostname.replace(/^www\./, "");
    if (/(^|\.)tiktok\.com$/.test(host)) {
      const handle = url.pathname.match(/^\/@([^/]+)\/video\//)?.[1];
      if (handle) return `TikTok video · @${handle}`;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const readable = last.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    if (readable && !/^\d+$/.test(readable) && readable.length <= 80) {
      return `${readable.slice(0, 80)} · ${host}`;
    }
    return `Product link · ${host}`;
  }
  function buildLinkContext(raw) {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http and https links are supported.");
    }
    const platform = inferPlatformFromUrl(url.toString());
    return {
      platform,
      pageType: looksLikeVideoUrl(url.toString()) ? "video" : "product",
      url: url.toString(),
      title: guessTitleFromUrl(url.toString()),
      extractedBy: "url-input",
      extractedAt: (/* @__PURE__ */ new Date()).toISOString(),
      warnings: [
        "Pasted link: the backend must resolve the page title, product image and current retail price. Demo mode uses sample metadata."
      ]
    };
  }
  function buildImageContext(dataUrl, fileName) {
    const cleanName = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    return {
      platform: "generic",
      pageType: "product",
      url: "https://local.margin-xray/upload",
      title: cleanName || "Uploaded product image",
      imageUrl: dataUrl,
      extractedBy: "image-upload",
      extractedAt: (/* @__PURE__ */ new Date()).toISOString(),
      warnings: [
        "Uploaded image: the backend must identify the product, category and retail price. Demo mode uses sample metadata."
      ]
    };
  }
  function isSupportedImageType(type) {
    return IMAGE_TYPES.has(type.toLowerCase());
  }
  function toUrl(raw) {
    try {
      const url = new URL(raw.trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }

  // src/shared/consumer.ts
  var FAIR_LOW_MARGIN_PCT = 15;
  var FAIR_HIGH_MARGIN_PCT = 25;
  function consumerVerdict(result2, waterfall, assumptions) {
    const retailUsd = positive(result2.product.retailUsd);
    const listingLow = positive(result2.priceRange?.fobMinUsd);
    const listingHigh = positive(result2.priceRange?.fobMaxUsd);
    const assumedFob = positive(assumptions?.fobUsd);
    const factorySource = listingLow && listingHigh ? "listing" : assumedFob ? "assumption" : "none";
    const factoryLowUsd = listingLow ?? assumedFob;
    const factoryHighUsd = listingHigh ?? assumedFob;
    const factoryMidUsd = factoryLowUsd && factoryHighUsd ? (factoryLowUsd + factoryHighUsd) / 2 : null;
    const landedUsd = positive(waterfall?.landedUsd) ?? (factoryMidUsd && assumptions ? factoryMidUsd + Math.max(0, assumptions.shippingPerUnitUsd) + factoryMidUsd * (Math.max(0, assumptions.dutyRatePct) / 100) : null);
    const fairLowUsd = landedUsd && assumptions ? fairRetail(landedUsd, assumptions, FAIR_LOW_MARGIN_PCT) : null;
    const fairHighUsd = landedUsd && assumptions ? fairRetail(landedUsd, assumptions, FAIR_HIGH_MARGIN_PCT) : null;
    const markupX = retailUsd && factoryMidUsd ? round1(retailUsd / factoryMidUsd) : null;
    const premiumX = retailUsd && fairHighUsd ? round2(retailUsd / fairHighUsd) : null;
    const matchCount = result2.supply ? result2.supply.priced : null;
    return {
      retailUsd,
      factoryLowUsd,
      factoryHighUsd,
      factoryMidUsd,
      factorySource,
      landedUsd,
      fairLowUsd,
      fairHighUsd,
      markupX,
      premiumX,
      fairness: fairnessOf(premiumX),
      matchCount,
      matchStrength: matchStrengthOf(matchCount)
    };
  }
  function fairnessOf(premiumX) {
    if (premiumX === null) return "unknown";
    if (premiumX <= 1.1) return "fair";
    if (premiumX <= 1.6) return "above";
    if (premiumX <= 3) return "well-above";
    return "extreme";
  }
  function matchStrengthOf(count) {
    if (count === null) return "unknown";
    if (count >= 20) return "high";
    if (count >= 3) return "medium";
    if (count >= 1) return "low";
    return "none";
  }
  function fairnessLabel(fairness) {
    switch (fairness) {
      case "fair":
        return "Within the fair range";
      case "above":
        return "Above the fair range";
      case "well-above":
        return "Well above the fair range";
      case "extreme":
        return "Extreme markup";
      default:
        return "Not enough data";
    }
  }
  function matchLabel(strength, count) {
    const n = count ?? 0;
    switch (strength) {
      case "high":
        return `${n} near-identical 1688 listings`;
      case "medium":
        return `${n} near-identical 1688 listings`;
      case "low":
        return `${n} near-identical 1688 listing${n === 1 ? "" : "s"}`;
      case "none":
        return "No near-identical listing found";
      default:
        return "No 1688 image search in this report";
    }
  }
  function fairRetail(landedUsd, assumptions, targetMarginPct) {
    const feesPct = Math.max(0, assumptions.platformFeePct) + Math.max(0, assumptions.paymentPct) + Math.max(0, assumptions.returnRatePct);
    const denominator = 1 - feesPct / 100 - targetMarginPct / 100;
    if (denominator <= 0.1) return null;
    const price = (landedUsd + Math.max(0, assumptions.fulfillmentPerUnitUsd)) / denominator;
    return price > 0 && Number.isFinite(price) ? round2(price) : null;
  }
  function positive(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  }
  function round1(value) {
    return Math.round((value + Number.EPSILON) * 10) / 10;
  }
  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // src/shared/pricing.ts
  function defaultAssumptions(retailUsd, fobUsd) {
    return {
      fobUsd: round22(Math.max(0, fobUsd)),
      shippingPerUnitUsd: 2.2,
      dutyRatePct: 25,
      platformFeePct: 6,
      affiliatePct: 20,
      paymentPct: 3,
      fulfillmentPerUnitUsd: 4.5,
      returnRatePct: 8,
      adPct: 20,
      ...retailUsd > 0 ? {} : {}
    };
  }
  function computeWaterfall(retailUsd, assumptions) {
    const retail = safeNumber(retailUsd);
    const fob = Math.max(0, safeNumber(assumptions.fobUsd));
    const shipping = Math.max(0, safeNumber(assumptions.shippingPerUnitUsd));
    const duty = fob * pct(assumptions.dutyRatePct);
    const landed = fob + shipping + duty;
    const platformFee = retail * pct(assumptions.platformFeePct);
    const affiliate = retail * pct(assumptions.affiliatePct);
    const payment = retail * pct(assumptions.paymentPct);
    const fulfillment = Math.max(0, safeNumber(assumptions.fulfillmentPerUnitUsd));
    const returns = retail * pct(assumptions.returnRatePct);
    const contribution = retail - landed - platformFee - affiliate - payment - fulfillment - returns;
    const ad = retail * pct(assumptions.adPct);
    const net = contribution - ad;
    return {
      retailUsd: round22(retail),
      fobUsd: round22(fob),
      shippingUsd: round22(shipping),
      dutyUsd: round22(duty),
      landedUsd: round22(landed),
      platformFeeUsd: round22(platformFee),
      affiliateUsd: round22(affiliate),
      paymentUsd: round22(payment),
      fulfillmentUsd: round22(fulfillment),
      returnsUsd: round22(returns),
      contributionUsd: round22(contribution),
      contributionMarginPct: retail > 0 ? round12(contribution / retail * 100) : 0,
      adUsd: round22(ad),
      netUsd: round22(net),
      netMarginPct: retail > 0 ? round12(net / retail * 100) : 0,
      grossMarginPct: retail > 0 ? round12((retail - fob) / retail * 100) : 0
    };
  }
  function assumptionsForResult(result2) {
    const retail = result2.product.retailUsd;
    if (retail === null || !Number.isFinite(retail) || retail <= 0) {
      return null;
    }
    if (result2.assumptions) {
      return { ...result2.assumptions, fobUsd: Math.max(0, result2.assumptions.fobUsd) };
    }
    if (result2.priceRange) {
      const mid = (result2.priceRange.fobMinUsd + result2.priceRange.fobMaxUsd) / 2;
      return defaultAssumptions(retail, mid);
    }
    return null;
  }
  function round22(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
  function round12(value) {
    return Math.round((value + Number.EPSILON) * 10) / 10;
  }
  function pct(value) {
    return Math.max(0, safeNumber(value)) / 100;
  }
  function safeNumber(value) {
    return Number.isFinite(value) ? value : 0;
  }

  // src/shared/sse.ts
  function parseSseBlock(block) {
    const lines = block.split(/\r?\n/);
    let event = "message";
    let id;
    let retry;
    const data = [];
    for (const line of lines) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") {
        event = value || "message";
      } else if (field === "data") {
        data.push(value);
      } else if (field === "id") {
        id = value;
      } else if (field === "retry") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) retry = parsed;
      }
    }
    if (!data.length) return null;
    return {
      event,
      data: data.join("\n"),
      ...id !== void 0 ? { id } : {},
      ...retry !== void 0 ? { retry } : {}
    };
  }
  async function consumeSse(stream, onEvent) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseSseBlock(block);
          if (event) await onEvent(event);
          boundary = buffer.indexOf("\n\n");
        }
      }
      buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (buffer.trim()) {
        const event = parseSseBlock(buffer);
        if (event) await onEvent(event);
      }
    } finally {
      reader.releaseLock();
    }
  }

  // src/shared/format.ts
  function formatUsd(amount, options = {}) {
    if (amount === null || amount === void 0 || !Number.isFinite(amount)) {
      return "—";
    }
    const digits = options.digits ?? 2;
    if (options.compact) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1
      }).format(amount);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(amount);
  }
  function formatMoney(amount, currency = "USD") {
    if (amount === null || amount === void 0 || !Number.isFinite(amount)) {
      return "—";
    }
    if (currency === "USD") return formatUsd(amount);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }
  function formatPct(value, digits = 1) {
    if (value === null || value === void 0 || !Number.isFinite(value)) {
      return "—";
    }
    return `${value.toFixed(digits)}%`;
  }
  function formatDateTime(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(void 0, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function safeImageUrl(url) {
    if (!url) return void 0;
    const trimmed = url.trim();
    if (!trimmed || trimmed.length > 2e6) return void 0;
    if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);/i.test(trimmed)) {
      return trimmed;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      return void 0;
    }
    return void 0;
  }
  function truncate(text, max = 120) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1).trimEnd()}…`;
  }

  // src/shared/version.ts
  var EXTENSION_VERSION = "0.2.0";

  // src/content/ui/poster.ts
  var WIDTH = 1080;
  var HEIGHT = 1350;
  var PAD = 72;
  var INK = "#1e1a17";
  var MUTED = "#6b6259";
  var LINE = "#e8dfd1";
  var ALERT = "#a63c25";
  async function renderPosterBlob(data) {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context2 = canvas.getContext("2d");
    if (!context2) return null;
    context2.fillStyle = "#faf6ee";
    context2.fillRect(0, 0, WIDTH, HEIGHT);
    context2.strokeStyle = LINE;
    context2.lineWidth = 2;
    context2.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
    drawHeader(context2, await loadImage(data.mascotUrl));
    const image = await loadImage(data.imageUrl);
    drawProduct(context2, data.title, image);
    drawBigNumber(context2, data);
    drawRows(context2, data);
    drawMatch(context2, data.matchLabel);
    drawFooter(context2, data.disclaimer, data.generatedAt);
    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      } catch {
        resolve(null);
      }
    });
  }
  function downloadPoster(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5e3);
  }
  function drawHeader(context2, mascot) {
    if (mascot) {
      drawImageContain(context2, mascot, PAD, 52, 56, 56);
    } else {
      drawOnionHead(context2, PAD + 22, 80, 21);
    }
    context2.textAlign = "left";
    context2.fillStyle = INK;
    context2.font = "700 30px 'PingFang SC', 'Helvetica Neue', Arial, sans-serif";
    context2.fillText("别做洋葱头", PAD + 58, 74);
    context2.fillStyle = MUTED;
    context2.font = "600 15px 'Helvetica Neue', Arial, sans-serif";
    context2.fillText("DON'T BE THE ONION HEAD", PAD + 58, 97);
    context2.textAlign = "right";
    context2.fillStyle = MUTED;
    context2.font = "600 14px 'Helvetica Neue', Arial, sans-serif";
    context2.fillText("SCAN BEFORE YOU BUY", WIDTH - PAD, 82);
    context2.textAlign = "left";
    context2.textBaseline = "alphabetic";
  }
  function drawOnionHead(context2, cx, cy, r) {
    context2.fillStyle = "#2f6f68";
    context2.beginPath();
    context2.ellipse(cx - 7, cy - r - 6, 5, 12, -0.5, 0, Math.PI * 2);
    context2.fill();
    context2.beginPath();
    context2.ellipse(cx + 7, cy - r - 6, 5, 12, 0.5, 0, Math.PI * 2);
    context2.fill();
    context2.fillStyle = "#e8b27f";
    context2.beginPath();
    context2.ellipse(cx, cy + 2, r * 0.92, r * 1.06, 0, 0, Math.PI * 2);
    context2.fill();
    context2.lineWidth = 4;
    context2.strokeStyle = INK;
    context2.stroke();
    context2.fillStyle = INK;
    context2.beginPath();
    context2.arc(cx - r * 0.3, cy, r * 0.13, 0, Math.PI * 2);
    context2.fill();
    context2.beginPath();
    context2.arc(cx + r * 0.3, cy, r * 0.13, 0, Math.PI * 2);
    context2.fill();
    context2.strokeStyle = INK;
    context2.lineWidth = 3;
    context2.beginPath();
    context2.arc(cx, cy + r * 0.16, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
    context2.stroke();
  }
  function drawProduct(context2, title, image) {
    const top = 150;
    const size = 132;
    if (image) {
      context2.save();
      roundRect(context2, PAD, top, size, size, 14);
      context2.clip();
      drawImageCover(context2, image, PAD, top, size, size);
      context2.restore();
      context2.strokeStyle = LINE;
      context2.lineWidth = 2;
      roundRect(context2, PAD, top, size, size, 14);
      context2.stroke();
    }
    const textLeft = image ? PAD + size + 26 : PAD;
    const maxWidth = WIDTH - PAD - textLeft;
    context2.fillStyle = MUTED;
    context2.font = "600 14px 'Helvetica Neue', Arial, sans-serif";
    context2.fillText("PRODUCT", textLeft, top + 16);
    context2.fillStyle = INK;
    context2.font = "700 30px Georgia, 'Times New Roman', serif";
    const lines = wrapText(context2, title, maxWidth, 2);
    lines.forEach((line, index) => {
      context2.fillText(line, textLeft, top + 52 + index * 38);
    });
    context2.strokeStyle = LINE;
    context2.lineWidth = 2;
    context2.beginPath();
    context2.moveTo(PAD, 322);
    context2.lineTo(WIDTH - PAD, 322);
    context2.stroke();
  }
  function drawBigNumber(context2, data) {
    const top = 400;
    context2.fillStyle = MUTED;
    context2.font = "600 15px 'Helvetica Neue', Arial, sans-serif";
    context2.fillText("RETAIL PRICE vs EST. FACTORY COST", PAD, top);
    if (data.markupX === null) {
      context2.fillStyle = INK;
      context2.font = "700 64px Georgia, 'Times New Roman', serif";
      context2.fillText("Not enough data", PAD, top + 92);
      return;
    }
    context2.fillStyle = data.markupX >= 5 ? ALERT : INK;
    context2.font = "800 150px Georgia, 'Times New Roman', serif";
    const big = `${data.markupX.toFixed(1)}×`;
    context2.fillText(big, PAD, top + 158);
    context2.fillStyle = INK;
    context2.font = "600 24px Georgia, 'Times New Roman', serif";
    context2.fillText(data.fairness, PAD, top + 198);
  }
  function drawRows(context2, data) {
    const rows = [
      ["You pay", money(data.retailUsd)],
      ["Est. factory cost", factoryLabel(data)],
      ["Fair price range", fairLabel(data)]
    ];
    let top = 690;
    for (const [label, value] of rows) {
      context2.fillStyle = MUTED;
      context2.font = "500 18px 'Helvetica Neue', Arial, sans-serif";
      context2.fillText(label, PAD, top);
      context2.textAlign = "right";
      context2.fillStyle = INK;
      context2.font = "700 30px 'PingFang SC', 'Helvetica Neue', Arial, sans-serif";
      context2.fillText(value, WIDTH - PAD, top + 2);
      context2.textAlign = "left";
      top += 54;
      context2.strokeStyle = LINE;
      context2.lineWidth = 2;
      context2.beginPath();
      context2.moveTo(PAD, top);
      context2.lineTo(WIDTH - PAD, top);
      context2.stroke();
      top += 44;
    }
  }
  function drawMatch(context2, label) {
    const top = 950;
    context2.fillStyle = "#f5eee2";
    roundRect(context2, PAD, top, WIDTH - PAD * 2, 62, 10);
    context2.fill();
    context2.fillStyle = MUTED;
    context2.font = "600 12px 'Helvetica Neue', Arial, sans-serif";
    context2.fillText("1688 IMAGE SEARCH", PAD + 22, top + 24);
    context2.fillStyle = INK;
    context2.font = "600 20px 'Helvetica Neue', Arial, sans-serif";
    context2.fillText(label, PAD + 22, top + 48);
  }
  function drawFooter(context2, disclaimer, generatedAt) {
    context2.strokeStyle = LINE;
    context2.lineWidth = 2;
    context2.beginPath();
    context2.moveTo(PAD, 1160);
    context2.lineTo(WIDTH - PAD, 1160);
    context2.stroke();
    context2.fillStyle = MUTED;
    context2.font = "500 14px 'Helvetica Neue', Arial, sans-serif";
    const lines = wrapText(
      context2,
      disclaimer,
      WIDTH - PAD * 2,
      3,
      22
    );
    lines.forEach((line, index) => context2.fillText(line, PAD, 1200 + index * 24));
    context2.fillStyle = "#9ca3af";
    context2.font = "500 13px 'Helvetica Neue', Arial, sans-serif";
    context2.fillText(`Generated ${generatedAt}`, PAD, 1310);
    context2.textAlign = "right";
    context2.fillText("别做洋葱头 · estimates only", WIDTH - PAD, 1310);
    context2.textAlign = "left";
  }
  function factoryLabel(data) {
    if (data.factoryLowUsd === null && data.factoryHighUsd === null) return "Not found";
    const low = data.factoryLowUsd ?? data.factoryHighUsd ?? 0;
    const high = data.factoryHighUsd ?? data.factoryLowUsd ?? 0;
    if (Math.abs(high - low) < 5e-3) return formatUsd(low);
    return `${formatUsd(low)}–${formatUsd(high)}`;
  }
  function fairLabel(data) {
    if (data.fairLowUsd === null || data.fairHighUsd === null) return "Not enough data";
    return `${formatUsd(data.fairLowUsd)}–${formatUsd(data.fairHighUsd)}`;
  }
  function money(value) {
    return value === null ? "Not found" : formatUsd(value);
  }
  function wrapText(context2, text, maxWidth, maxLines, lineHeight = 38) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (context2.measureText(next).width > maxWidth && current) {
        lines.push(current);
        current = word;
        if (lines.length === maxLines) break;
      } else {
        current = next;
      }
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (lines.length === maxLines) {
      const last = lines[maxLines - 1] ?? "";
      if (context2.measureText(last).width > maxWidth) {
        lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 2))}…`;
      }
    }
    return lines;
  }
  function drawImageCover(context2, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context2.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }
  function drawImageContain(context2, image, x, y, width, height) {
    const scale = Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context2.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }
  function roundRect(context2, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context2.beginPath();
    context2.moveTo(x + r, y);
    context2.arcTo(x + width, y, x + width, y + height, r);
    context2.arcTo(x + width, y + height, x, y + height, r);
    context2.arcTo(x, y + height, x, y, r);
    context2.arcTo(x, y, x + width, y, r);
    context2.closePath();
  }
  async function loadImage(url) {
    if (!url) return null;
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
  }

  // src/web/app.ts
  var DEFAULT_API = "http://localhost:8787";
  var STORAGE_KEY = "onion-head.apiBase";
  var AGENT_STEPS = [
    { id: "capture", label: "Read the source", hint: "Link, image or page" },
    { id: "resolve", label: "Resolve the product", hint: "Title, price and media" },
    { id: "image", label: "Extract a product image", hint: "Frame, cover or upload" },
    { id: "market", label: "Check market signals", hint: "Retail price and sales" },
    { id: "supply", label: "Search 1688 by image", hint: "Near-identical listings" },
    { id: "verify", label: "Verify suppliers", hint: "Registry and risk signals" },
    { id: "price", label: "Model the fair price", hint: "Landed cost and margin" }
  ];
  var els = {
    hero: byId("hero"),
    workspace: byId("workspace"),
    scanForm: byId("scanForm"),
    urlInput: byId("urlInput"),
    scanBtn: byId("scanBtn"),
    uploadBtn: byId("uploadBtn"),
    fileInput: byId("fileInput"),
    imageReady: byId("imageReady"),
    imageThumb: byId("imageThumb"),
    imageName: byId("imageName"),
    clearImage: byId("clearImage"),
    agentStatus: byId("agentStatus"),
    offlineNote: byId("offlineNote"),
    traceTitle: byId("traceTitle"),
    steps: byId("steps"),
    progress: byId("progress"),
    progressBar: byId("progressBar"),
    stopBtn: byId("stopBtn"),
    newScanBtn: byId("newScanBtn"),
    agentMeta: byId("agentMeta"),
    report: byId("report"),
    backendBtn: byId("backendBtn"),
    backendDialog: byId("backendDialog"),
    backendForm: byId("backendForm"),
    apiBaseInput: byId("apiBaseInput"),
    dialogStatus: byId("dialogStatus"),
    testBackend: byId("testBackend"),
    toast: byId("toast")
  };
  var apiBase = normalizeBase(localStorage.getItem(STORAGE_KEY) || DEFAULT_API);
  var imageInput = null;
  var controller = null;
  var timer = null;
  var startedAt = 0;
  var stepStates = AGENT_STEPS.map(() => "pending");
  var result = null;
  var context = null;
  boot();
  function boot() {
    renderSteps();
    els.apiBaseInput.value = apiBase;
    els.scanForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void submitScan();
    });
    els.uploadBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", () => {
      const file = els.fileInput.files?.[0];
      if (file) void loadImage2(file);
    });
    els.clearImage.addEventListener("click", () => {
      imageInput = null;
      els.fileInput.value = "";
      els.imageReady.hidden = true;
    });
    els.stopBtn.addEventListener("click", () => abortScan());
    els.newScanBtn.addEventListener("click", () => resetToHero());
    els.backendBtn.addEventListener("click", () => {
      els.apiBaseInput.value = apiBase;
      els.dialogStatus.textContent = "";
      els.dialogStatus.className = "dialog-status";
      els.backendDialog.showModal();
    });
    els.testBackend.addEventListener("click", () => void testBackend());
    els.backendForm.addEventListener("submit", () => {
      apiBase = normalizeBase(els.apiBaseInput.value || DEFAULT_API);
      localStorage.setItem(STORAGE_KEY, apiBase);
      els.backendDialog.close();
      void refreshHealth();
      toast("Backend saved.");
    });
    for (const button2 of document.querySelectorAll("[data-example]")) {
      button2.addEventListener("click", () => {
        els.urlInput.value = button2.dataset.example ?? "";
        els.urlInput.focus();
      });
    }
    void refreshHealth();
  }
  function byId(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id}`);
    return node;
  }
  function normalizeBase(value) {
    return value.trim().replace(/\/+$/, "");
  }
  async function refreshHealth() {
    setAgentStatus("checking", "Checking agent");
    const ok = await ping(apiBase);
    setAgentStatus(ok ? "online" : "offline", ok ? "Agent connected" : "Agent offline");
    els.offlineNote.hidden = ok;
  }
  function setAgentStatus(state, label) {
    els.agentStatus.className = `agent-status ${state}`;
    const text = els.agentStatus.querySelector("span");
    if (text) text.textContent = label;
  }
  async function ping(base) {
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 4e3);
    try {
      const response = await fetch(`${base}/health`, {
        signal: ctrl.signal,
        cache: "no-store"
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }
  async function testBackend() {
    const base = normalizeBase(els.apiBaseInput.value || DEFAULT_API);
    els.dialogStatus.textContent = "Testing…";
    els.dialogStatus.className = "dialog-status";
    const ok = await ping(base);
    els.dialogStatus.textContent = ok ? `Connected to ${base}` : `No response from ${base}`;
    els.dialogStatus.className = `dialog-status ${ok ? "ok" : "error"}`;
  }
  async function loadImage2(file) {
    if (!isSupportedImageType(file.type)) {
      toast("Use a JPG, PNG, WebP or GIF image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("Keep the image under 8 MB.");
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    imageInput = { dataUrl, fileName: file.name };
    els.imageThumb.src = dataUrl;
    els.imageName.textContent = truncate(file.name, 48);
    els.imageReady.hidden = false;
  }
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Could not read the image."));
      reader.readAsDataURL(file);
    });
  }
  async function submitScan() {
    let scanContext;
    try {
      if (imageInput) {
        scanContext = buildImageContext(imageInput.dataUrl, imageInput.fileName);
      } else {
        const raw = els.urlInput.value.trim();
        if (!raw) {
          toast("Paste a product link or choose an image first.");
          els.urlInput.focus();
          return;
        }
        scanContext = buildLinkContext(raw);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "That input was not readable.");
      return;
    }
    await runScan(scanContext);
  }
  async function runScan(scanContext) {
    abortScan();
    context = scanContext;
    result = null;
    controller = new AbortController();
    startedAt = Date.now();
    showWorkspace();
    resetSteps();
    els.traceTitle.textContent = "Starting the agent…";
    els.stopBtn.hidden = false;
    els.newScanBtn.hidden = true;
    setProgress(2);
    startTimer();
    const request = {
      scanId: crypto.randomUUID(),
      context: scanContext,
      client: {
        version: EXTENSION_VERSION,
        locale: navigator.language || "en-US",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      }
    };
    try {
      const response = await fetch(`${apiBase}/api/v1/xray/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json"
        },
        body: JSON.stringify(request),
        signal: controller.signal,
        cache: "no-store"
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `The agent returned HTTP ${response.status}${body ? `: ${body.replace(/\s+/g, " ").slice(0, 160)}` : ""}.`
        );
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const raw = await response.json();
        completeScan(raw);
        return;
      }
      if (!response.body) throw new Error("The agent returned no stream.");
      let received = false;
      await consumeSse(response.body, async (event) => {
        if (event.event === "progress") {
          try {
            const progress = JSON.parse(event.data);
            applyProgress(progress);
          } catch {
          }
          return;
        }
        if (event.event === "complete") {
          const raw = JSON.parse(event.data);
          received = true;
          completeScan(raw);
          return;
        }
        if (event.event === "error") {
          let message = "The agent returned an error.";
          try {
            const payload = JSON.parse(event.data);
            if (payload.message) message = payload.message;
          } catch {
          }
          throw new Error(message);
        }
      });
      if (!received) throw new Error("The agent stream ended without a result.");
    } catch (error) {
      failScan(error);
    }
  }
  function applyProgress(progress) {
    const index = AGENT_STEPS.findIndex((step) => step.id === progress.stepId);
    if (index >= 0) {
      for (let i = 0; i < index; i += 1) {
        if (stepStates[i] !== "failed") stepStates[i] = "done";
      }
      stepStates[index] = "active";
      renderSteps(progress.message);
      els.traceTitle.textContent = AGENT_STEPS[index].label;
    } else if (progress.message) {
      els.traceTitle.textContent = progress.message;
    }
    setProgress(progress.percent);
  }
  function completeScan(raw) {
    result = raw;
    stepStates = stepStates.map(() => "done");
    renderSteps();
    setProgress(100);
    els.traceTitle.textContent = "Scan complete";
    els.stopBtn.hidden = true;
    els.newScanBtn.hidden = false;
    els.agentMeta.textContent = `${elapsedSeconds()}s · ${sourceLabel(raw.dataSource)}`;
    stopTimer();
    if (context) renderReport(raw, context);
  }
  function failScan(error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "Scan stopped." : error instanceof Error ? error.message : "The scan failed.";
    const active = stepStates.indexOf("active");
    if (active >= 0) stepStates[active] = "failed";
    renderSteps();
    stopTimer();
    els.stopBtn.hidden = true;
    els.newScanBtn.hidden = false;
    els.traceTitle.textContent = error instanceof DOMException && error.name === "AbortError" ? "Stopped" : "Scan failed";
    els.agentMeta.textContent = `${elapsedSeconds()}s`;
    renderError(message);
  }
  function abortScan() {
    controller?.abort();
    controller = null;
    stopTimer();
  }
  function resetToHero() {
    abortScan();
    els.workspace.hidden = true;
    els.hero.hidden = false;
    els.report.replaceChildren();
    els.traceTitle.textContent = "Working…";
    els.agentMeta.textContent = "";
    els.stopBtn.hidden = true;
    els.newScanBtn.hidden = true;
    setProgress(0);
    resetSteps();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showWorkspace() {
    els.hero.hidden = true;
    els.workspace.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function resetSteps() {
    stepStates = AGENT_STEPS.map(() => "pending");
    renderSteps();
  }
  function renderSteps(detail) {
    els.steps.replaceChildren(
      ...AGENT_STEPS.map((step, index) => {
        const status = stepStates[index] ?? "pending";
        const item = el("li", { class: `step ${status}` });
        const marker = el("span", { class: "step-marker" });
        marker.innerHTML = status === "done" ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6.5"/></svg>' : status === "failed" ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' : "";
        const body = el("div", { class: "step-body" }, [
          el("strong", { text: step.label }),
          el("span", {
            class: "step-detail",
            text: status === "active" && detail ? detail : status === "done" ? "Done" : status === "failed" ? "Failed" : step.hint
          })
        ]);
        item.append(marker, body);
        return item;
      })
    );
  }
  function setProgress(percent) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    els.progressBar.style.width = `${value}%`;
    els.progress.setAttribute("aria-valuenow", String(value));
  }
  function startTimer() {
    stopTimer();
    timer = window.setInterval(() => {
      els.agentMeta.textContent = `${elapsedSeconds()}s · streaming`;
    }, 500);
  }
  function stopTimer() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }
  function elapsedSeconds() {
    return Math.max(1, Math.round((Date.now() - startedAt) / 1e3));
  }
  function sourceLabel(source) {
    if (source === "api") return "Live agent";
    if (source === "mock") return "Mock agent run";
    return "Demo dataset";
  }
  function renderReport(scan, scanContext) {
    const assumptions = assumptionsForResult(scan);
    const waterfall = scan.waterfall ?? (assumptions && scan.product.retailUsd ? computeWaterfall(scan.product.retailUsd, assumptions) : null);
    const verdict = consumerVerdict(scan, waterfall, assumptions);
    const nodes = [];
    if (scan.dataSource !== "api") {
      nodes.push(
        el("div", { class: "notice" }, [
          el("strong", { text: sourceLabel(scan.dataSource) }),
          el("span", {
            text: scan.dataSource === "mock" ? " — the local mock backend returned sample data. The flow is real; the supplier numbers are not." : " — sample dataset for interface review. Not a real price check."
          })
        ])
      );
    }
    nodes.push(renderProduct(scan, scanContext));
    const card = el("section", { class: "verdict" });
    card.append(
      el("div", { class: "verdict-head" }, [
        el("p", { class: "eyebrow", text: fairnessLabel(verdict.fairness) }),
        el("div", {
          class: `verdict-number ${verdict.fairness === "extreme" || verdict.fairness === "well-above" ? "warn" : verdict.fairness === "fair" ? "good" : ""}`.trim(),
          text: verdict.markupX === null ? "—" : `${verdict.markupX.toFixed(1)}×`
        }),
        el("p", {
          class: "verdict-sub",
          text: "retail price vs estimated factory cost"
        })
      ])
    );
    const factoryValue = verdict.factoryLowUsd !== null ? range(verdict.factoryLowUsd, verdict.factoryHighUsd ?? verdict.factoryLowUsd) : scan.supply?.cnyLabel ?? "—";
    const fairValue = verdict.fairLowUsd !== null && verdict.fairHighUsd !== null ? range(verdict.fairLowUsd, verdict.fairHighUsd) : scan.supply && !scan.supply.fxRate ? "Needs FX" : "—";
    card.append(
      el("div", { class: "kpis" }, [
        kpi("You pay", verdict.retailUsd === null ? "—" : formatUsd(verdict.retailUsd), "listed price"),
        kpi("Est. factory cost", factoryValue, verdict.factorySource === "listing" ? "1688 image search" : "model estimate"),
        kpi("Fair range", fairValue, "15–25% margin model", "good")
      ])
    );
    card.append(
      el("div", { class: "match" }, [
        el("span", {
          class: `badge ${verdict.matchStrength}`,
          text: verdict.matchStrength === "high" ? "High match" : verdict.matchStrength === "medium" ? "Match" : verdict.matchStrength === "low" ? "Few matches" : verdict.matchStrength === "none" ? "No match" : "Not checked"
        }),
        el("span", { text: matchLabel(verdict.matchStrength, verdict.matchCount) })
      ])
    );
    card.append(
      el("div", { class: "verdict-actions" }, [
        button("Download share card", "btn primary", () => void shareCard(scan, verdict)),
        button("Source listings", "btn secondary", () => {
          document.getElementById("listings")?.scrollIntoView({ behavior: "smooth", block: "start" });
        })
      ])
    );
    nodes.push(card);
    nodes.push(renderFair(scan, verdict, assumptions));
    if (waterfall) nodes.push(renderCosts(waterfall));
    nodes.push(renderListings(scan));
    nodes.push(renderSources(scan, scanContext));
    els.report.replaceChildren(...nodes);
  }
  function renderProduct(scan, scanContext) {
    const image = safeImageUrl(scan.product.imageUrl);
    const node = el("section", { class: "product" });
    if (image) {
      const img = el("img", { class: "product-img", attrs: { alt: "" } });
      img.src = image;
      node.append(img);
    } else {
      const placeholder = el("div", { class: "product-img placeholder" });
      placeholder.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>';
      node.append(placeholder);
    }
    const meta = el("div", { class: "product-meta" }, [
      el("p", {
        class: "product-platform",
        text: `${platformLabel(scanContext.platform)} · ${scanContext.pageType}`
      }),
      el("h2", { text: scan.product.title }),
      el("p", {
        class: "product-price",
        text: scan.product.retailUsd === null ? "No USD retail price found" : `${formatUsd(scan.product.retailUsd)}`
      }),
      el("p", { class: "product-source", text: truncate(scan.product.retailSource, 120) })
    ]);
    node.append(meta);
    return node;
  }
  function renderFair(scan, verdict, assumptions) {
    const card = el("section", { class: "card" }, [
      el("header", { class: "card-head" }, [
        el("h3", { text: "How the fair range is built" }),
        el("span", { text: "No paid-ads load" })
      ])
    ]);
    const rows = [
      ["Landed cost", verdict.landedUsd === null ? "Not enough data" : formatUsd(verdict.landedUsd)],
      [
        "Platform, payment & returns",
        assumptions ? `${formatPct(
          assumptions.platformFeePct + assumptions.paymentPct + assumptions.returnRatePct
        )} of retail` : "Not enough data"
      ],
      [
        "Fair price range",
        verdict.fairLowUsd !== null && verdict.fairHighUsd !== null ? range(verdict.fairLowUsd, verdict.fairHighUsd) : "Not enough data"
      ]
    ];
    for (const [label, value] of rows) {
      card.append(
        el("div", { class: "row" }, [
          el("span", { text: label }),
          el("strong", { text: value })
        ])
      );
    }
    card.append(
      el("p", {
        class: "fine-print",
        text: "The fair range covers landed cost and fulfillment plus platform, payment and returns fees, at a 15–25% net margin. It is a model, not a market survey."
      })
    );
    if (scan.supply && !scan.supply.fxRate) {
      card.append(
        el("div", { class: "inline-note" }, [
          "The 1688 listing is in CNY. Add a CNY per USD rate to convert it and fill the range."
        ])
      );
    }
    return card;
  }
  function renderCosts(waterfall) {
    const card = el("section", { class: "card" }, [
      el("header", { class: "card-head" }, [
        el("h3", { text: "Cost breakdown" }),
        el("span", { text: `Net ${formatUsd(waterfall.netUsd)} · ${formatPct(waterfall.netMarginPct)}` })
      ])
    ]);
    const rows = [
      ["Retail price", waterfall.retailUsd, ""],
      ["Factory cost", waterfall.fobUsd, pct2(waterfall.fobUsd, waterfall.retailUsd)],
      ["Freight", waterfall.shippingUsd, pct2(waterfall.shippingUsd, waterfall.retailUsd)],
      ["Duty", waterfall.dutyUsd, pct2(waterfall.dutyUsd, waterfall.retailUsd)],
      [
        "Platform, affiliate & payment",
        waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd,
        pct2(
          waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd,
          waterfall.retailUsd
        )
      ],
      [
        "Fulfillment & returns",
        waterfall.fulfillmentUsd + waterfall.returnsUsd,
        pct2(waterfall.fulfillmentUsd + waterfall.returnsUsd, waterfall.retailUsd)
      ],
      ["Ads", waterfall.adUsd, pct2(waterfall.adUsd, waterfall.retailUsd)],
      ["Net before tax", waterfall.netUsd, formatPct(waterfall.netMarginPct)]
    ];
    for (const [label, value, share] of rows) {
      card.append(
        el("div", { class: `row ${label === "Net before tax" ? "total" : ""}`.trim() }, [
          el("span", { text: label }),
          el("strong", { text: formatUsd(value) }),
          el("em", { text: share })
        ])
      );
    }
    card.append(
      el("p", {
        class: "fine-print",
        text: "Model estimate with visible assumptions. Freight, duty and fees are defaults, not a quote."
      })
    );
    return card;
  }
  function renderListings(scan) {
    const card = el("section", { class: "card", attrs: { id: "listings" } }, [
      el("header", { class: "card-head" }, [
        el("h3", { text: "1688 source listings" }),
        el("span", {
          text: scan.supply ? `${scan.supply.priced} priced · image search` : "No image search in this run"
        })
      ])
    ]);
    if (!scan.factories.length) {
      card.append(
        el("div", { class: "empty" }, [
          el("strong", { text: "No near-identical listing found" }),
          el("p", {
            text: "Try a sharper product image, or scan the product page instead of a wide video shot."
          })
        ])
      );
      return card;
    }
    for (const factory of scan.factories.slice(0, 3)) {
      const row = el("div", { class: "listing" });
      row.append(
        el("div", { class: "listing-main" }, [
          el("div", { class: "listing-name" }, [
            el("strong", { text: factory.maskedName }),
            confidenceBadge(factory.confidence)
          ]),
          el("p", { class: "listing-meta", text: factory.location }),
          el("p", {
            class: "listing-moq",
            text: factory.tiers.length > 1 ? `MOQ ${factory.tiers.map((tier) => tier.moq).join(" · ")}` : factory.tiers.length === 1 ? `MOQ ${factory.tiers[0]?.moq ?? 1}` : "MOQ not listed"
          })
        ]),
        el("div", { class: "listing-price" }, [
          el("strong", {
            text: factory.currency === "CNY" ? `${formatMoney(factory.fobMinUsd, "CNY")}–${formatMoney(factory.fobMaxUsd, "CNY")}` : range(factory.fobMinUsd, factory.fobMaxUsd)
          }),
          el("span", { text: factory.currency === "CNY" ? "CNY / unit" : "USD / unit" })
        ])
      );
      if (factory.signals.length) {
        const details = el("details", { class: "listing-details" });
        details.append(el("summary", { text: `Evidence (${factory.signals.length})` }));
        for (const signal of factory.signals) {
          details.append(
            el("div", { class: "signal" }, [
              el("strong", { text: `${signal.label}: ` }),
              el("span", { text: signal.value }),
              el("em", { text: signal.source })
            ])
          );
        }
        row.append(details);
      }
      card.append(row);
    }
    card.append(
      el("p", {
        class: "fine-print",
        text: scan.supply ? "1688 listing prices, in CNY unless a rate is saved. A shop name is not a factory verification." : "Sample listings for interface review."
      })
    );
    return card;
  }
  function renderSources(scan, scanContext) {
    const details = el("details", { class: "sources" });
    details.append(el("summary", { text: "Sources, assumptions & disclaimers" }));
    const list = el("div", { class: "sources-body" });
    list.append(
      el("p", {
        text: `${sourceLabel(scan.dataSource)} · generated ${formatDateTime(scan.generatedAt)}`
      })
    );
    if (scan.sources.length) {
      const ul = el("ul");
      for (const source of scan.sources) {
        ul.append(
          el("li", {
            text: `${source.label}${source.asOf ? ` · ${source.asOf}` : ""}`
          })
        );
      }
      list.append(el("p", { class: "sources-label", text: "Sources" }), ul);
    }
    if (scan.disclaimers.length) {
      const ul = el("ul");
      for (const line of scan.disclaimers) ul.append(el("li", { text: line }));
      list.append(el("p", { class: "sources-label", text: "Disclaimers" }), ul);
    }
    if (scanContext.warnings?.length) {
      const ul = el("ul");
      for (const line of scanContext.warnings) ul.append(el("li", { text: line }));
      list.append(el("p", { class: "sources-label", text: "Input notes" }), ul);
    }
    details.append(list);
    return details;
  }
  function renderError(message) {
    els.report.replaceChildren(
      el("section", { class: "error-card" }, [
        el("p", { class: "eyebrow", text: "Scan failed" }),
        el("h2", { text: "The agent could not finish." }),
        el("p", { text: message }),
        el("div", { class: "error-actions" }, [
          button("Try again", "btn primary", () => {
            if (!context) return;
            void runScan(context);
          }),
          button("Backend settings", "btn secondary", () => els.backendBtn.click())
        ]),
        el("p", {
          class: "fine-print",
          text: "If you are testing locally, start the mock agent with npm run mock and set the backend to http://localhost:8787."
        })
      ])
    );
  }
  function kpi(label, value, note, tone) {
    return el("div", { class: "kpi" }, [
      el("span", { class: "kpi-label", text: label }),
      el("strong", { class: `kpi-value ${tone ?? ""}`.trim(), text: value }),
      el("span", { class: "kpi-note", text: note })
    ]);
  }
  function confidenceBadge(confidence) {
    return el("span", {
      class: `confidence ${confidence}`,
      text: confidence === "high" ? "High" : confidence === "medium" ? "Medium" : confidence === "demo" ? "Demo" : "Low"
    });
  }
  function range(min, max) {
    if (Math.abs(max - min) < 5e-3) return formatUsd(min);
    return `${formatUsd(min)}–${formatUsd(max)}`;
  }
  function pct2(value, total) {
    if (!total) return "";
    return formatPct(value / total * 100);
  }
  function platformLabel(platform) {
    switch (platform) {
      case "tiktok":
        return "TikTok";
      case "shopify":
        return "Shopify";
      case "amazon":
        return "Amazon";
      case "instagram":
        return "Instagram";
      case "youtube":
        return "YouTube";
      default:
        return "Product";
    }
  }
  async function shareCard(scan, verdict) {
    const blob = await renderPosterBlob({
      title: scan.product.title,
      ...scan.product.imageUrl ? { imageUrl: scan.product.imageUrl } : {},
      mascotUrl: new URL("assets/mascot/onion-head.webp", window.location.href).href,
      retailUsd: verdict.retailUsd,
      factoryLowUsd: verdict.factoryLowUsd,
      factoryHighUsd: verdict.factoryHighUsd,
      fairLowUsd: verdict.fairLowUsd,
      fairHighUsd: verdict.fairHighUsd,
      markupX: verdict.markupX,
      fairness: fairnessLabel(verdict.fairness),
      matchLabel: matchLabel(verdict.matchStrength, verdict.matchCount),
      disclaimer: scan.dataSource !== "api" ? "Sample agent run. The factory range, markup and fair price are not a real price check." : "Estimated from 1688 image-search listing prices and a cost model. Not a legal finding of white-labeling.",
      generatedAt: new Date(scan.generatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    });
    if (!blob) {
      toast("Could not render the share card. The product image blocked the canvas.");
      return;
    }
    downloadPoster(blob, `onion-head-${Date.now()}.png`);
    toast("Share card downloaded.");
  }
  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    window.setTimeout(() => {
      els.toast.hidden = true;
    }, 3200);
  }
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    if (props.class) node.className = props.class;
    if (props.text !== void 0) node.textContent = props.text;
    if (props.attrs) {
      for (const [key, value] of Object.entries(props.attrs)) {
        node.setAttribute(key, value);
      }
    }
    for (const child of children) node.append(child);
    return node;
  }
  function button(text, className, onClick) {
    const node = el("button", { class: className, text, attrs: { type: "button" } });
    node.addEventListener("click", onClick);
    return node;
  }
})();
//# sourceMappingURL=app.js.map
