#!/usr/bin/env node
import http from "node:http";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { createCreatorFeedback } from "../server/creator-feedback.mjs";

const root = resolve(fileURLToPath(new URL("../web", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const profiles = JSON.parse(readFileSync(new URL("../assets/creators/sources.json", import.meta.url), "utf8"));
const rubric = JSON.parse(readFileSync(new URL("../research/creator-score-rubric.json", import.meta.url), "utf8"));
const feedback = createCreatorFeedback({
  databasePath: process.env.CREATOR_FEEDBACK_DB || fileURLToPath(new URL("../data/creator-feedback.sqlite", import.meta.url)),
  handles: new Set(profiles.map(profile => profile.handle)), version: rubric.version,
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  return join(root, normalized);
}

const server = http.createServer((req, res) => {
  void (async () => {
    if (await feedback.handle(req, res)) return;
    let filePath = safePath(req.url || "/");

    try {
      let info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, "index.html");
        info = await stat(filePath);
      }
      if (!info.isFile()) throw new Error("Not a file");

      const gzip = /\b(?:js|css|html)$/.test(extname(filePath)) && /\bgzip\b(?!\s*;\s*q=0(?:\.0*)?\s*(?:,|$))/.test(req.headers["accept-encoding"] || "");
      res.writeHead(200, {
        "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        ...(gzip ? { "Content-Encoding": "gzip" } : { "Content-Length": info.size }),
        "Vary": "Accept-Encoding",
        "Cache-Control": "no-store",
      });
      const file = createReadStream(filePath);
      (gzip ? file.pipe(createGzip()) : file).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found. Run `npm run build` first, then open /demo/.");
    }
  })();
});
server.on("close", () => feedback.close());

server.listen(port, () => {
  console.log(`\n  Onion Head agent web: http://localhost:${port}/\n`);
  console.log("  Agent scan frontend. Point it at http://localhost:8787 or your API.\n");
  console.log("  The extension itself is built to dist/; this page is the web frontend.\n");
});
