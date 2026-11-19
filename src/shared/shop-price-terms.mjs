// Only explicit, comparable specification fields can establish different terms.
// Phrases in titles such as "premium" or "heirloom" carry no monetary value.
function warrantyMonths(text) {
  if (typeof text !== "string") return null;
  const value = text.trim().toLowerCase();
  if (/^(?:no warranty|none|no)$/.test(value)) return 0;
  const match = /^(\d{1,3})[ -]*(months?|years?)(?: (?:manufacturer(?:'s)? )?warranty)?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * (match[2].startsWith("year") ? 12 : 1);
}

function primaryMaterial(text) {
  if (typeof text !== "string") return null;
  const value = text.trim().toLowerCase().replace(/-/g," ");
  if (/^(?:solid (?:wood|oak|ash|walnut|pine|beech|maple)|100% solid wood)$/.test(value)) return "solid wood";
  if (/^(?:mdf|medium density fib(?:er|re)board|particle ?board|chipboard)$/.test(value)) return "composite wood";
  if (/^(?:(?:full grain|top grain|genuine|real) leather|100% leather)$/.test(value)) return "leather";
  if (/^(?:(?:faux|vegan|pu|synthetic) leather|leatherette)$/.test(value)) return "synthetic leather";
  return null;
}

export function shopTermDifference(source, peer) {
  const a = primaryMaterial(source?.material), b = primaryMaterial(peer?.material);
  if ((a === "solid wood" && b === "composite wood") || (b === "solid wood" && a === "composite wood") ||
      (a === "leather" && b === "synthetic leather") || (b === "leather" && a === "synthetic leather"))
    return "The original lists " + source.material + " and the other shop lists " + peer.material + ".";
  const left = warrantyMonths(source?.warranty), right = warrantyMonths(peer?.warranty);
  if (left !== null && right !== null && left !== right)
    return "The original lists " + left + " months of warranty coverage and the other shop lists " + right + ".";
  return null;
}
