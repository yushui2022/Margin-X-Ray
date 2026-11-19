import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { collectCreator } from "./creator-providers.mjs";
import { buildCreatorReport, explainCreatorReport } from "./creator-report.mjs";
import { checkRecallSources } from "./creator-source-checks.mjs";
import { findProductCandidates } from "./creator-product-traces.mjs";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const jobDeadline = 90_000;
const leaseTime = jobDeadline + 15_000;
const prefix = "/api/creator-research/";

function reply(res, code, data) {
  if (data.retryAfter) res.setHeader("Retry-After", String(data.retryAfter));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

function bounded(value, fallback, max) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= max ? n : fallback;
}

// Jobs and reports share a row. A refresh never clears the last successful report.
// A lease identifies the worker allowed to publish, including across process restarts.
export function createCreatorResearch({
  databasePath, collect = collectCreator, build = buildCreatorReport, explain = explainCreatorReport,
  checkSources = checkRecallSources, env = process.env, now = Date.now, cacheMs = DAY,
  cooldownMs = MINUTE, concurrency = 2, pollMs = 1200,
}) {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS research_jobs (
      handle TEXT PRIMARY KEY, state TEXT NOT NULL, stage TEXT, requested INTEGER NOT NULL,
      lease TEXT, expires INTEGER, report TEXT, saved INTEGER, error TEXT, retry_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS research_requests (client TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS research_requests_time ON research_requests(created);
    CREATE INDEX IF NOT EXISTS research_requests_client_time ON research_requests(client,created);`);
  const rowFor = db.prepare("SELECT * FROM research_jobs WHERE handle=?");
  const setStage = db.prepare("UPDATE research_jobs SET stage=? WHERE handle=? AND lease=?");
  const quota = bounded(env.CREATOR_RESEARCH_DAILY_LIMIT, 100, 100000);
  const perClient = bounded(env.CREATOR_RESEARCH_CLIENT_LIMIT, 10, 10000);
  const active = new Map();
  let closed = false;

  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function snapshot(row) {
    if (!row) return { status: "idle" };
    const info = { status: row.state };
    if (row.stage) info.stage = row.stage;
    if (row.report) {
      info.report = JSON.parse(row.report);
      const ttl = info.report.postsUnavailable ? Math.min(cacheMs, 5 * MINUTE) : cacheMs;
      info.freshUntil = new Date(row.saved + ttl).toISOString();
      info.stale = row.saved + ttl <= now();
    }
    if (row.error) info.error = row.error;
    if (row.retry_at > now()) info.retryAfter = Math.ceil((row.retry_at - now()) / 1000);
    return info;
  }

  function admit(handle, client) {
    return transaction(() => {
      const row = rowFor.get(handle);
      const info = snapshot(row);
      if (info.status === "running") return [202, info];
      if (info.status === "ready" && !info.stale) return [200, info];
      if (info.status === "failed" && info.retryAfter) return [429, info];

      const t = now();
      db.prepare("DELETE FROM research_requests WHERE created<=?").run(t - DAY);
      const limitReached = (clientKey, window, limit) => {
        const sql = "SELECT COUNT(*) AS n, MIN(created) AS oldest FROM research_requests WHERE created>?";
        const totals = clientKey
          ? db.prepare(sql + " AND client=?").get(t - window, clientKey)
          : db.prepare(sql).get(t - window);
        return totals.n >= limit ? Math.max(1, Math.ceil((totals.oldest + window - t) / 1000)) : 0;
      };
      const retryAfter = Math.max(limitReached(null, DAY, quota), limitReached(client, 10 * MINUTE, perClient));
      if (retryAfter) return [429, { ...info, error: "Research request limit reached. Try again later.", retryAfter }];
      const queued = db.prepare("SELECT COUNT(*) AS n FROM research_jobs WHERE state='running'").get().n;
      if (queued >= 24) return [503, { ...info, error: "Research queue is full. Try again shortly.", retryAfter: 10 }];
      db.prepare(`INSERT INTO research_jobs(handle,state,stage,requested) VALUES(?,'running','queued',?)
        ON CONFLICT(handle) DO UPDATE SET state='running',stage='queued',requested=excluded.requested,
        lease=NULL,expires=NULL,error=NULL,retry_at=NULL`).run(handle, t);
      db.prepare("INSERT INTO research_requests(client,created) VALUES(?,?)").run(client, t);
      return [202, snapshot(rowFor.get(handle))];
    });
  }

  function claim() {
    return transaction(() => {
      const t = now();
      const count = db.prepare("SELECT COUNT(*) AS n FROM research_jobs WHERE state='running' AND expires>?").get(t).n;
      if (count >= concurrency) return;
      const next = db.prepare(`SELECT handle FROM research_jobs WHERE state='running'
        AND (lease IS NULL OR expires<=?) ORDER BY requested,handle LIMIT 1`).get(t);
      if (!next) return;
      const lease = randomUUID();
      db.prepare("UPDATE research_jobs SET stage='collecting',lease=?,expires=? WHERE handle=?").run(lease, t + leaseTime, next.handle);
      return { handle: next.handle, lease };
    });
  }

  async function run({ handle, lease }, signal) {
    try {
      const sample = await collect(handle, { token: env.TIKHUB_TOKEN, signal });
      signal.throwIfAborted();
      if (sample.postsUnavailable && rowFor.get(handle)?.report) {
        const error = new Error("Post sample unavailable");
        error.code = "POSTS_UNAVAILABLE";
        throw error;
      }
      setStage.run("checking", handle, lease);
      const candidates = findProductCandidates(handle, sample);
      const sourceChecks = await checkSources(handle, sample.posts, { signal, candidates });
      signal.throwIfAborted();
      setStage.run("scoring", handle, lease);
      const report = build(handle, sample);
      if (sample.postsUnavailable) report.postsUnavailable = true;
      report.productCandidates = candidates;
      report.sourceChecks = sourceChecks;
      setStage.run("explaining", handle, lease);
      report.explanation = await explain(report, {
        apiKey: env.CREATOR_AI_API_KEY, baseUrl: env.CREATOR_AI_BASE_URL, model: env.CREATOR_AI_MODEL, signal,
      });
      signal.throwIfAborted();
      db.prepare(`UPDATE research_jobs SET state='ready',stage=NULL,lease=NULL,expires=NULL,
        report=?,saved=?,error=NULL,retry_at=NULL WHERE handle=? AND lease=?`).run(JSON.stringify(report), now(), handle, lease);
    } catch (error) {
      if (closed) return;
      const message = error?.code === "PROFILE_INACCESSIBLE"
        ? "The public profile is inaccessible. Check the handle or try again later."
        : error?.code === "POSTS_UNAVAILABLE" ? "The latest public posts could not be collected. Please try again."
        : signal.aborted ? "Research timed out. Please try again."
        : "Creator research is temporarily unavailable. Please try again.";
      db.prepare(`UPDATE research_jobs SET state='failed',stage=NULL,lease=NULL,expires=NULL,
        error=?,retry_at=? WHERE handle=? AND lease=?`).run(message, now() + cooldownMs, handle, lease);
    }
  }

  function pump() {
    if (closed) return;
    try {
      while (active.size < concurrency) {
        const job = claim();
        if (!job) break;
        const controller = new AbortController();
        active.set(job.lease, controller);
        const deadline = setTimeout(() => controller.abort(), jobDeadline);
        void run(job, controller.signal).finally(() => {
          clearTimeout(deadline);
          active.delete(job.lease);
          if (!closed) setImmediate(pump);
        }).catch(() => console.error("Creator research worker could not update storage."));
      }
    } catch {
      console.error("Creator research queue temporarily unavailable.");
    }
  }
  const timer = setInterval(pump, pollMs);
  timer.unref();
  setImmediate(pump);
  return {
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      for (const [lease, controller] of active) {
        controller.abort();
        db.prepare("UPDATE research_jobs SET stage='queued',lease=NULL,expires=NULL WHERE lease=?").run(lease);
      }
      db.close();
    },
    async handle(req, res) {
      const path = (req.url ?? "").split("?")[0];
      if (!path.startsWith(prefix)) return false;
      try {
        const handle = path.slice(prefix.length).toLowerCase();
        if (!/^[a-z0-9_][a-z0-9_.]{0,23}$/.test(handle) || handle.endsWith(".")) {
          reply(res, 400, { error: "Enter a valid TikTok handle." });
        } else if (req.method === "GET") {
          reply(res, 200, snapshot(rowFor.get(handle)));
        } else if (req.method !== "POST") {
          res.setHeader("Allow", "GET, POST");
          reply(res, 405, { error: "Method not allowed." });
        } else if (req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin && URL.parse(req.headers.origin)?.host !== req.headers.host)) {
          reply(res, 403, { error: "Start research from this site." });
        } else if (req.headers["transfer-encoding"] || Number(req.headers["content-length"] ?? 0) > 0) {
          req.resume();
          reply(res, 400, { error: "This endpoint takes a handle in the URL and an empty request body." });
        } else {
          const ip = req.socket.remoteAddress ?? "local";
          const client = createHash("sha256").update(ip).digest("hex");
          const [code, data] = admit(handle, client);
          reply(res, code, data);
          if (code === 202) setImmediate(pump);
        }
      } catch {
        if (!res.headersSent) reply(res, 503, { error: "Research storage is temporarily unavailable.", retryAfter: 5 });
      }
      return true;
    },
  };
}
