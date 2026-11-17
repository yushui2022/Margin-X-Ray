import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Anonymous browser choices, never a claim of unique or authenticated people.
export function createCreatorFeedback({ databasePath, handles, version }) {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS creator_votes (
      handle TEXT NOT NULL, version TEXT NOT NULL, voter TEXT NOT NULL,
      vote TEXT NOT NULL CHECK(vote IN ('up', 'down')),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(handle, version, voter)
    );`);
  const totals = db.prepare("SELECT vote, COUNT(*) AS count FROM creator_votes WHERE handle=? AND version=? GROUP BY vote");
  const choice = db.prepare("SELECT vote FROM creator_votes WHERE handle=? AND version=? AND voter=?");
  const put = db.prepare(`INSERT INTO creator_votes(handle, version, voter, vote) VALUES(?,?,?,?)
    ON CONFLICT(handle, version, voter) DO UPDATE SET vote=excluded.vote, updated_at=CURRENT_TIMESTAMP`);
  const remove = db.prepare("DELETE FROM creator_votes WHERE handle=? AND version=? AND voter=?");
  const reply = (res, status, data) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(data));
  };
  const snapshot = (handle, voter) => {
    const rows = totals.all(handle, version);
    return { handle, version, up: Number(rows.find(row => row.vote === "up")?.count ?? 0), down: Number(rows.find(row => row.vote === "down")?.count ?? 0), yourVote: choice.get(handle, version, voter)?.vote ?? null };
  };
  return {
    close: () => db.close(),
    async handle(req, res) {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/api/creator-feedback") return false;
      try {
        if (!["GET", "POST"].includes(req.method)) { reply(res, 405, { error: "Method not allowed" }); return true; }
        if (req.headers["sec-fetch-site"] === "cross-site" || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) {
          reply(res, 403, { error: "Use the same-origin feedback endpoint" }); return true;
        }
        const handle = url.searchParams.get("handle");
        if (!handles.has(handle)) { reply(res, 404, { error: "Unknown creator" }); return true; }
        if (url.searchParams.get("version") !== version) { reply(res, 409, { error: "Score version changed. Reload this report." }); return true; }
        let browserID = /(?:^|;\s*)onion_voter=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie ?? "")?.[1];
        if (!browserID) {
          if (req.method === "POST") { reply(res, 409, { error: "Load feedback first and allow cookies to vote." }); return true; }
          browserID = randomUUID();
          res.setHeader("Set-Cookie", `onion_voter=${browserID}; HttpOnly; SameSite=Strict; Path=/api/creator-feedback; Max-Age=31536000${req.socket.encrypted ? "; Secure" : ""}`);
        }
        const voter = createHash("sha256").update(browserID).digest("hex");
        if (req.method === "POST") {
          if (!req.headers["content-type"]?.startsWith("application/json")) { reply(res, 415, { error: "JSON required" }); return true; }
          let body = "";
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size <= 4096) body += chunk.toString();
          }
          if (size > 4096) { reply(res, 413, { error: "Request too large" }); return true; }
          let data;
          try { data = JSON.parse(body); } catch { reply(res, 400, { error: "Invalid JSON" }); return true; }
          if (!data || !["up", "down", null].includes(data.vote)) { reply(res, 400, { error: "Choose up, down or null to remove your vote" }); return true; }
          // One synchronous SQLite statement makes retries idempotent and switching atomic.
          if (data.vote === null) remove.run(handle, version, voter);
          else put.run(handle, version, voter, data.vote);
        }
        reply(res, 200, snapshot(handle, voter));
      } catch (error) {
        console.error("Creator feedback failed:", error.message);
        if (!res.headersSent) reply(res, 503, { error: "Feedback is temporarily unavailable" });
      }
      return true;
    },
  };
}
