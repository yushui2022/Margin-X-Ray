import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SHOP_ONION_VERSION, shopOnionVerdict, shopOnionVersionForReport } from "../src/shared/shop-onion.mjs";
import { freezeShoppingSnapshot, serveShoppingShare } from "./shopping-share.mjs";
import { shoppingMethodVersion } from "./shopping-check.mjs";
import { requireShoppingPost, readLimitedBody, readShoppingRequest, sendJson, ShoppingError } from "./shopping-http.mjs";

const route = "/api/shopping-jobs";
const minute = 60_000;
const day = 24 * 60 * minute;
const jobId = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

function inputJson(value) {
  return JSON.stringify(value, (_key, entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right, "en")));
  });
}

function safeFailure(error, aborted) {
  if (aborted) return { error: "This shopping check timed out. Try again.", retryable: true };
  if (error instanceof ShoppingError && [400, 404, 409, 422].includes(error.status)) {
    return { error: error.message, retryable: error.status === 404 };
  }
  return {
    error: "The shopping check was interrupted or its source is temporarily unavailable. Try again.",
    retryable: true,
  };
}

function needsEarlyRefresh(report) {
  return (
    report?.status === "unavailable" ||
    report?.commerce?.some((item) => item.detailStatus === "unavailable") ||
    report?.steps?.some((step) => step.status === "unavailable") ||
    report?.checks?.some((check) => check.status === "unavailable" ||
      ["unavailable","time_limit"].includes(check.followUp?.status))
  );
}

// A request creates an immutable report ID. A later explicit retry gets a new ID.
// The request hash and lease are database-local and never sent to the browser.
export function createShoppingJobs({
  databasePath,
  publicBaseUrl,
  run,
  normalize,
  methodVersion = "",
  now = Date.now,
  concurrency = 2,
  queueLimit = 24,
  dailyLimit = 180,
  clientLimit = 24,
  cacheMs = 10 * minute,
  cooldownMs = 15_000,
  retentionMs = day,
  maxReports = 500,
  jobTimeoutMs = 100_000,
  pollMs = 1000,
  leaseGraceMs = 5000,
  maxAttempts = 3,
}) {
  if (typeof run !== "function" || typeof normalize !== "function")
    throw new TypeError("Shopping job runner and normalizer are required.");
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS shopping_jobs (
      id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, input TEXT NOT NULL,
      status TEXT NOT NULL, stage TEXT NOT NULL, created INTEGER NOT NULL, finished INTEGER,
      fresh_until INTEGER, report TEXT, error TEXT, retryable INTEGER,
      lease TEXT, expires INTEGER, owner_host TEXT, owner_pid INTEGER, attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS shopping_published (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shopping_reassessments (
      source_id TEXT NOT NULL, version TEXT NOT NULL, id TEXT UNIQUE NOT NULL, reviewed INTEGER NOT NULL, client TEXT NOT NULL,
      PRIMARY KEY(source_id,version));
    CREATE INDEX IF NOT EXISTS shopping_reassessments_time ON shopping_reassessments(reviewed);
    CREATE INDEX IF NOT EXISTS shopping_reassessments_client ON shopping_reassessments(client,reviewed);
    CREATE INDEX IF NOT EXISTS shopping_jobs_input ON shopping_jobs(request_hash,created DESC);
    CREATE INDEX IF NOT EXISTS shopping_jobs_state ON shopping_jobs(status,created);
    CREATE INDEX IF NOT EXISTS shopping_jobs_finished ON shopping_jobs(finished);
    CREATE TABLE IF NOT EXISTS shopping_admissions (client TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS shopping_admissions_time ON shopping_admissions(created);
    CREATE INDEX IF NOT EXISTS shopping_admissions_client ON shopping_admissions(client,created);`);
  const localHost = hostname();
  const idRow = db.prepare("SELECT * FROM shopping_jobs WHERE id=?");
  const shareRow = db.prepare("SELECT snapshot FROM shopping_published WHERE id=?");
  const cards = new Map();
  const readPublished = id => {
    const row = shareRow.get(id);
    return row ? JSON.parse(row.snapshot) : null;
  };
  const active = new Map();
  let closed = false;
  let nextMaintenance = 0;

  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function prune(t) {
    db.prepare("DELETE FROM shopping_admissions WHERE created <= ?").run(t - day);
    db.prepare("DELETE FROM shopping_jobs WHERE finished <= ?").run(t - retentionMs);
    db.prepare(
      `DELETE FROM shopping_jobs WHERE id IN (
      SELECT id FROM shopping_jobs WHERE finished IS NOT NULL ORDER BY finished DESC, rowid DESC LIMIT -1 OFFSET ?
    )`,
    ).run(maxReports);
    // Keep the review identity as long as either the source or derived report
    // is available. Recent entries also account for the local review limit.
    db.prepare(`DELETE FROM shopping_reassessments WHERE reviewed<=?
      AND source_id NOT IN (SELECT id FROM shopping_jobs UNION ALL SELECT id FROM shopping_published)
      AND id NOT IN (SELECT id FROM shopping_jobs UNION ALL SELECT id FROM shopping_published)`).run(t-day);
  }

  function snapshot(row) {
    const result = { id: row.id, status: row.status, stage: row.stage, input: JSON.parse(row.input) };
    if (row.report !== null) {
      result.report = JSON.parse(row.report);
      // Some early TikTok Shop jobs predate methodVersion. Their displayed
      // percentage-point rubric must survive reopening and first publication.
      if (result.report.scope === "tiktok-shop" && !result.report.methodVersion && !result.report.shopOnion?.version) {
        result.report.methodVersion = "tikhub-shop-v1";
      }
      if (needsEarlyRefresh(result.report)) result.retryAfterMs = Math.max(0, row.fresh_until - now());
    }
    if (row.error !== null) {
      result.error = row.error;
      result.retryable = Boolean(row.retryable);
      if (result.retryable) result.retryAfterMs = Math.max(0, row.fresh_until - now());
    }
    return result;
  }

  async function requireSavedAction(req, res) {
    requireShoppingPost(req, res);
    const body = await readLimitedBody(req, 256, "Only the saved report ID is needed.");
    if (body.length) {
      let value;
      try { value = JSON.parse(body.toString("utf8")); } catch { /* Reject non-JSON or an arbitrary report body. */ }
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length)
        throw new ShoppingError(400, "Use the saved report without additional data.");
    }
  }

  function publish(res, id) {
    transaction(() => {
      if (shareRow.get(id)) return;
      const row = idRow.get(id);
      if (!row || (row.finished !== null && row.finished <= now() - retentionMs))
        throw new ShoppingError(404,"This shopping job was not found or has expired.");
      if (row.status !== "ready" || row.report === null)
        throw new ShoppingError(409,"Only a completed price report can be shared.");
      const original = snapshot(row);
      const parentId = original.report.reassessment?.sourceJobId;
      const frozen = freezeShoppingSnapshot(original, now(), { includeSourceId:Boolean(parentId && shareRow.get(parentId)) });
      db.prepare("INSERT INTO shopping_published(id,snapshot) VALUES(?,?)").run(id,JSON.stringify(frozen));
    });
    sendJson(res,200,{url:"/r/" + id});
  }

  function savedJob(id, t) {
    const shared = readPublished(id);
    if (shared) return shared;
    const row = idRow.get(id);
    return row && (row.finished === null || row.finished > t-retentionMs) ? snapshot(row) : null;
  }

  function reassess(id, client) {
    return transaction(() => {
      const t = now();
      prune(t);
      const previous = db.prepare("SELECT id,reviewed FROM shopping_reassessments WHERE source_id=? AND version=?").get(id,SHOP_ONION_VERSION);
      if (previous) {
        const saved = savedJob(previous.id,t);
        if (saved) return saved;
      }
      const source = savedJob(id,t);
      if (!source) throw new ShoppingError(404,"This shopping job was not found or has expired.");
      if (source.status !== "ready" || !source.report) throw new ShoppingError(409,"Only a completed report can be reassessed.");
      const original = source.report, sourceVersion = shopOnionVersionForReport(original);
      if (!original.commerce?.some(product => product?.variants?.some(sku => typeof sku?.price === "number" &&
        Number.isFinite(sku.price) && sku.price>0 && ["USD","GBP"].includes(sku.currency))))
        throw new ShoppingError(422,"This report has no saved SKU price to reassess. Start a new price check.");
      if (sourceVersion === SHOP_ONION_VERSION) return source;

      // This work reads recorded observations only. A dedicated local admission
      // count keeps reviews independent of live provider quotas and cache keys.
      if (!previous) {
        const daily = db.prepare("SELECT count(*) AS n FROM shopping_reassessments WHERE reviewed>?").get(t-day).n;
        const recent = db.prepare("SELECT count(*) AS n FROM shopping_reassessments WHERE client=? AND reviewed>?").get(client,t-10*minute).n;
        if (daily >= dailyLimit || recent >= clientLimit) throw new ShoppingError(429,"Saved-report review limit reached. Try again later.");
      }
      const targetId = previous?.id ?? randomUUID(), reviewed = previous?.reviewed ?? t;
      const report = { ...original, methodVersion:shoppingMethodVersion, shopOnion:shopOnionVerdict(original,{version:SHOP_ONION_VERSION}),
        reassessment:{ sourceJobId:id, sourceVersion, reviewedAt:new Date(reviewed).toISOString() } };
      if (!previous) db.prepare("INSERT INTO shopping_reassessments(source_id,version,id,reviewed,client) VALUES(?,?,?,?,?)")
        .run(id,SHOP_ONION_VERSION,targetId,reviewed,client);
      db.prepare(`INSERT INTO shopping_jobs(id,request_hash,input,status,stage,report,created,finished,fresh_until)
        VALUES(?,?,?,'ready','ready',?,?,?,?)`).run(targetId,"review/"+SHOP_ONION_VERSION+"/"+id,inputJson(source.input),
          JSON.stringify(report),t,t,t+cacheMs);
      return snapshot(idRow.get(targetId));
    });
  }

  function admit(input, client) {
    const inputText = inputJson(input);
    const hash = createHash("sha256").update(JSON.stringify([methodVersion,inputText])).digest("hex");
    return transaction(() => {
      const t = now();
      prune(t);
      const prior = db
        .prepare(
          `SELECT * FROM shopping_jobs WHERE request_hash=?
        ORDER BY created DESC,rowid DESC LIMIT 1`,
        )
        .get(hash);
      if (prior && (prior.finished === null || prior.fresh_until > t)) return prior;
      const daily = db.prepare("SELECT COUNT(*) AS n FROM shopping_admissions WHERE created>?").get(t - day);
      const recent = db
        .prepare("SELECT COUNT(*) AS n FROM shopping_admissions WHERE client=? AND created>?")
        .get(client, t - 10 * minute);
      if (daily.n >= dailyLimit || recent.n >= clientLimit)
        throw new ShoppingError(429, "Shopping check limit reached. Try again later.");
      if (db.prepare("SELECT COUNT(*) AS n FROM shopping_jobs WHERE finished IS NULL").get().n >= queueLimit) {
        throw new ShoppingError(429, "The shopping queue is full. Try again shortly.");
      }
      const id = randomUUID();
      db.prepare(
        `INSERT INTO shopping_jobs(id,request_hash,input,status,stage,created) VALUES(?,?,?,'queued','queued',?)`,
      ).run(id, hash, inputText, t);
      db.prepare("INSERT INTO shopping_admissions(client,created) VALUES(?,?)").run(client, t);
      return idRow.get(id);
    });
  }

  function ownerGone(row) {
    // On a local restart an exited worker's PID can be recovered immediately.
    // Live or unknown foreign workers keep their lease until the bounded deadline.
    if (row.owner_host !== localHost || !Number.isSafeInteger(row.owner_pid) || row.owner_pid <= 0) return false;
    try {
      process.kill(row.owner_pid, 0);
      return false;
    } catch (err) {
      return err.code === "ESRCH";
    }
  }

  function reclaim(t) {
    for (const row of db
      .prepare("SELECT id,lease,expires,owner_host,owner_pid,attempts FROM shopping_jobs WHERE status='running'")
      .all()) {
      if (row.expires > t && !ownerGone(row)) continue;
      if (row.attempts >= maxAttempts) {
        db.prepare(
          `UPDATE shopping_jobs SET status='failed',stage='failed',finished=?,fresh_until=?,retryable=1,
          error='The worker was interrupted repeatedly. Try again.',lease=NULL,expires=NULL,owner_host=NULL,owner_pid=NULL
          WHERE id=? AND lease=?`,
        ).run(t, t + cooldownMs, row.id, row.lease);
      } else {
        db.prepare(
          `UPDATE shopping_jobs SET status='queued',stage='queued',lease=NULL,expires=NULL,owner_host=NULL,owner_pid=NULL
          WHERE id=? AND lease=?`,
        ).run(row.id, row.lease);
      }
    }
  }

  function claim() {
    return transaction(() => {
      const t = now();
      reclaim(t);
      if (db.prepare("SELECT COUNT(*) AS n FROM shopping_jobs WHERE status='running'").get().n >= concurrency)
        return null;
      const row = db
        .prepare("SELECT id,input FROM shopping_jobs WHERE status='queued' ORDER BY created,rowid LIMIT 1")
        .get();
      if (!row) return null;
      const lease = randomUUID();
      db.prepare(
        `UPDATE shopping_jobs SET status='running',stage='source',lease=?,expires=?,owner_host=?,owner_pid=?,attempts=attempts+1
        WHERE id=?`,
      ).run(lease, t + jobTimeoutMs + leaseGraceMs, localHost, process.pid, row.id);
      return { id: row.id, input: JSON.parse(row.input), lease };
    });
  }

  async function execute(job, controller) {
    const { signal } = controller;
    const deadline = setTimeout(() => controller.abort(), jobTimeoutMs);
    const abort = new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
    );
    const onStage = (stage) => {
      if (closed || signal.aborted || typeof stage !== "string" || !stage.trim()) return;
      db.prepare("UPDATE shopping_jobs SET stage=? WHERE id=? AND lease=?").run(
        stage.trim().slice(0, 120),
        job.id,
        job.lease,
      );
    };
    try {
      const work = Promise.resolve().then(() => {
        signal.throwIfAborted();
        return run(job.input, { signal, onStage });
      });
      const report = await Promise.race([work, abort]);
      if (closed) return;
      signal.throwIfAborted();
      if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Invalid report");
      const finished = now();
      const reuse = needsEarlyRefresh(report) ? Math.min(cacheMs, cooldownMs) : cacheMs;
      db.prepare(
        `UPDATE shopping_jobs SET status='ready',stage='ready',report=?,finished=?,fresh_until=?,
        lease=NULL,expires=NULL,owner_host=NULL,owner_pid=NULL WHERE id=? AND lease=?`,
      ).run(JSON.stringify(report), finished, finished + reuse, job.id, job.lease);
    } catch (error) {
      if (closed) return;
      const failure = safeFailure(error, signal.aborted),
        failed = now();
      db.prepare(
        `UPDATE shopping_jobs SET status='failed',stage='failed',error=?,retryable=?,finished=?,fresh_until=?,
        lease=NULL,expires=NULL,owner_host=NULL,owner_pid=NULL WHERE id=? AND lease=?`,
      ).run(
        failure.error,
        Number(failure.retryable),
        failed,
        failed + (failure.retryable ? cooldownMs : cacheMs),
        job.id,
        job.lease,
      );
    } finally {
      clearTimeout(deadline);
      active.delete(job.lease);
      if (!closed) setImmediate(pump);
    }
  }

  function pump() {
    if (closed) return;
    try {
      if (now() >= nextMaintenance) {
        transaction(() => prune(now()));
        nextMaintenance = now() + minute;
      }
      while (active.size < concurrency) {
        const job = claim();
        if (!job) break;
        const controller = new AbortController();
        active.set(job.lease, controller);
        void execute(job, controller).catch(() => console.error("Shopping worker could not update storage."));
      }
    } catch {
      console.error("Shopping queue temporarily unavailable.");
    }
  }

  const timer = setInterval(pump, pollMs);
  timer.unref();
  setImmediate(pump);

  return {
    async handle(req, res) {
      const path = (req.url ?? "").split("?")[0];
      if (path !== route && !path.startsWith(route + "/") && path !== "/r" && !path.startsWith("/r/")) return false;
      try {
        if (serveShoppingShare(req, res, readPublished, publicBaseUrl, cards)) return true;
        if (path === route) {
          const input = await normalize(await readShoppingRequest(req, res));
          const client = createHash("sha256")
            .update(req.socket.remoteAddress ?? "local")
            .digest("hex");
          const row = admit(input, client);
          sendJson(res, row.finished === null ? 202 : 200, snapshot(row));
          if (row.status === "queued") setImmediate(pump);
        } else if (path.endsWith("/share") || path.endsWith("/reassess")) {
          const [id,action,...extra] = path.slice(route.length + 1).toLowerCase().split("/");
          if (extra.length || !jobId.test(id)) throw new ShoppingError(404,"This saved report was not found.");
          await requireSavedAction(req,res);
          if (action === "share") publish(res,id);
          else {
            const client = createHash("sha256").update(req.socket.remoteAddress ?? "local").digest("hex");
            sendJson(res,200,reassess(id,client));
          }
        } else if (req.method !== "GET") {
          res.setHeader("Allow", "GET");
          throw new ShoppingError(405, "Read this shopping job with GET.");
        } else {
          const id = path.slice(route.length + 1).toLowerCase();
          const saved = jobId.test(id) && savedJob(id,now());
          if (!saved) throw new ShoppingError(404, "This shopping job was not found or has expired.");
          sendJson(res,200,saved);
        }
      } catch (error) {
        if (!res.headersSent) {
          const known = error instanceof ShoppingError;
          sendJson(res, known ? error.status : 503, {
            error: known ? error.message : "Shopping job storage is temporarily unavailable.",
          });
        }
      }
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      for (const [lease, controller] of active) {
        controller.abort();
        db.prepare(
          `UPDATE shopping_jobs SET status='queued',stage='queued',lease=NULL,expires=NULL,owner_host=NULL,owner_pid=NULL
          WHERE lease=?`,
        ).run(lease);
      }
      db.close();
    },
  };
}
