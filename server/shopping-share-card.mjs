import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { shopOnionVerdict, shopOnionVersionForReport } from "../src/shared/shop-onion.mjs";

const assets = new URL("../assets/", import.meta.url);
const font = fileURLToPath(new URL("fonts/fraunces-card.ttf", assets));
const faces = ["fresh", "spotted", "bruised", "spoiled", "rotten", "unrated"].map(name =>
  readFileSync(new URL("mascot/index-" + name + ".svg", assets), "utf8")
    .replace("<svg ", '<svg x="885" y="204" width="166" height="182" '));
const xml = value => String(value).replace(/[&<>"']/g, ch =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[ch]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
const pct = n => new Intl.NumberFormat("en-US", { maximumFractionDigits:1 }).format(Math.abs(n));
const money = (n,currency) => new Intl.NumberFormat("en-US", {style:"currency",currency}).format(n);
const line = (x,y,size,content,attrs="") =>
  '<text x="' + x + '" y="' + y + '" font-size="' + size + '" ' + attrs + '>' + xml(content) + '</text>';

// All artwork and type are local. User-supplied strings enter escaped text nodes only.
function footerLines(text, width = 64, maxLines = 2) {
  const words = String(text).replace(/\s+/g," ").trim().split(" ");
  const rows = [""];
  for (const word of words) {
    if (!rows.at(-1)) rows[rows.length - 1] = word.slice(0,width);
    else if ((rows.at(-1) + " " + word).length <= width) rows[rows.length - 1] += " " + word;
    else if (rows.length < maxLines) rows.push(word.slice(0,width));
    else { rows[rows.length - 1] = rows.at(-1).replace(/[,;:. ]+$/,"") + "…"; break; }
  }
  return rows;
}

export function renderShoppingShareCard(report) {
  const result = report.shopOnion ?? shopOnionVerdict(report,{version:shopOnionVersionForReport(report)});
  const rated = result.score !== null && Number.isFinite(result.premiumPct);
  const subject = report.video?.handle ? "@" + report.video.handle : "TikTok Shop listing";
  const first = result.items[0];
  const single = result.scoredCount === 1 && first;
  const lead = !rated ? "Awaiting a match" : result.premiumPct === 0 ? "Same price" :
    pct(result.premiumPct) + "% " + (result.premiumPct > 0 ? "higher" : "lower");
  const basis = result.basis === "similar" ? "Similar-item estimate" : result.basis === "exact" ? "Verified same item" : "Shop comparisons";
  const detail = single ? money(first.sourcePrice,first.currency) + " original    /    " + money(first.peerPrice,first.currency) + " peer price" :
    rated ? "Median across " + result.scoredCount + " priced products" : "More comparable prices needed";
  const subtitle = !rated ? "No price score yet" : single ? basis + "  ·  " + first.peerCount + (first.peerCount===1?" other shop":" other shops") : "Prices of sampled products";
  const scope = report.kind === "profile" ? result.scoredCount + " of " + result.linkedCount + " linked products scored" : report.commerce?.[first?.productIndex ?? 0]?.name?.split(/\s+[–—]\s+/)[0] || "TikTok Shop item prices";
  const footer = footerLines(scope);
  const observed = report.commerce?.[first?.productIndex ?? 0]?.observedAt ?? report.video?.observedAt;
  const date = typeof observed === "string" && /^\d{4}-\d{2}-\d{2}/.test(observed) ? observed.slice(0,10) : "";
  const tone = rated ? Math.min(4,Math.floor(result.score/20)) : 5;

  const decision = result.decision;
  const decisionSubject = subject + (date ? "   ·   " + date : "");
  const confidence = decision?.confidence === "insufficient" ? "Insufficient evidence" : decision ?
    decision.confidence.charAt(0).toUpperCase() + decision.confidence.slice(1) + " confidence" : "";
  const allowance = decision?.context ? decision.context.categoryLabel + " · " +
    pct(decision.context.allowancePct) + "% editorial allowance. " : "";
  const guidance = decision ? footerLines(allowance + decision.reason,74,3) : [];
  const content = decision ? [
    line(68,158,22,decisionSubject,'fill="#664c60"'),
    line(68,197,26,footerLines(scope,43,1)[0]),
    line(68,278,lead.length > 13 ? 65 : 76,lead),
    line(70,321,29,(rated ? basis + "  ·  " : "") + confidence,'fill="#664c60"'),
    line(70,371,detail.length > 39 ? 28 : 32,detail),
    line(70,428,33,decision.label),
    line(70,471,28,decision.action,'fill="#664c60"'),
    '<path d="M68 500H1132" stroke="#ae98a2" stroke-width="2" stroke-dasharray="6 6"/>',
    ...guidance.map((row,i) => line(68,532 + i * 27,23,row)),
  ].join("") :
    line(68,205,31,subject) + line(68,323,lead.length > 13 ? 69 : 85,lead) +
    line(70,387,32,subtitle,'fill="#664c60"') + line(70,459,detail.length > 39 ? 30 : 37,detail) +
    '<path d="M68 523H1132" stroke="#ae98a2" stroke-width="2" stroke-dasharray="6 6"/>' +
    footer.map((row,i) => line(68,footer.length === 1 ? 573 : 555 + i * 30,24,row)).join("") + line(1132,573,23,date,'text-anchor="end" fill="#695d66"');

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">' +
    '<rect width="1200" height="630" fill="#302232"/><rect x="26" y="25" width="1148" height="580" rx="14" fill="#fcf5e8"/>' +
    '<g font-family="Fraunces" fill="#342434">' +
    line(68,96,37,"Onion Head") + line(1130,93,25,"TikTok Shop price check",'text-anchor="end" fill="#654c60"') +
    '<path d="M68 123H1132" stroke="#ae98a2" stroke-width="2"/>' +
    '<rect x="804" y="152" width="328" height="344" rx="18" fill="#eadde5"/>' +
    line(968,195,23,"Rotten Onion Score",'text-anchor="middle"') + faces[tone] +
    line(968,460,68,rated ? result.score + "/100" : "Unrated",'text-anchor="middle"') +
    (rated && result.version === "shop-onion-v3" ? line(968,485,19,"50 = near the peer price",'text-anchor="middle"') : "") +
    content +
    "</g></svg>";
  return new Resvg(svg,{font:{fontFiles:[font], loadSystemFonts:false, defaultFontFamily:"Fraunces"}}).render().asPng();
}
