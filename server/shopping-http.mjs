export class ShoppingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(value));
}

export function requireShoppingPost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    throw new ShoppingError(405, "Submit the shopping check to begin.");
  }
  if (req.headers["sec-fetch-site"] === "cross-site" || (req.headers.origin && URL.parse(req.headers.origin)?.host !== req.headers.host)) {
    throw new ShoppingError(403, "Start the comparison from this site.");
  }
}

export async function readLimitedBody(req, limit, tooLargeMessage) {
  const tooLarge = () => new ShoppingError(413, tooLargeMessage);
  if (Number(req.headers["content-length"]) > limit) { req.resume(); throw tooLarge(); }
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) { req.resume(); throw tooLarge(); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readShoppingRequest(req, res) {
  requireShoppingPost(req, res);
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") throw new ShoppingError(415, "Send a JSON request.");
  const body = await readLimitedBody(req, 4096, "The shopping request is too long.");
  try { return JSON.parse(body.toString("utf8")); }
  catch { throw new ShoppingError(400, "Invalid JSON."); }
}
