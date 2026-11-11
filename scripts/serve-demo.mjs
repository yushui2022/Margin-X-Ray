#!/usr/bin/env node
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT || 4173);

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
    let filePath = safePath(req.url || "/");

    if (req.url === "/" || req.url === "") {
      res.writeHead(302, { Location: "/demo/" });
      res.end();
      return;
    }

    try {
      let info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, "index.html");
        info = await stat(filePath);
      }
      if (!info.isFile()) throw new Error("Not a file");

      res.writeHead(200, {
        "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": "no-store",
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found. Run `npm run build` first, then open /demo/.");
    }
  })();
});

server.listen(port, () => {
  console.log(`\n  Margin X-Ray demo: http://localhost:${port}/demo/\n`);
  console.log("  Static preview of the HUD. No extension or API required.\n");
});
