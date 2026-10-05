const APP_ORIGIN = "https://neon-runner-game.github.io";
const LOCAL_ORIGINS = new Set([APP_ORIGIN, "http://localhost:8787", "http://127.0.0.1:8787"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(origin) {
  if (!LOCAL_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(origin) }
  });
}
function validUUID(value) { return typeof value === "string" && UUID_RE.test(value); }

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") {
    if (!LOCAL_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (origin && !LOCAL_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, "");
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ ok: true, database: Boolean(env.DB) }, 200, origin);
  }
  if (url.pathname === "/event" && request.method === "POST") {
    if (!env.DB) return json({ error: "analytics_unavailable" }, 503, origin);
    if (!origin || !LOCAL_ORIGINS.has(origin)) return json({ error: "origin_required" }, 403, "");
    if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
      return json({ error: "json_required" }, 415, origin);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
    const { event, visitorId, runId } = body || {};
    if (!validUUID(visitorId) || !validUUID(runId)) return json({ error: "invalid_identifier" }, 400, origin);
    const now = Math.floor(Date.now() / 1000);
    try {
      if (event === "game_started") {
        const result = await env.DB.prepare(`
          INSERT OR IGNORE INTO analytics_events
            (event_id, visitor_id, run_id, event_type, occurred_at, duration_seconds, score)
          VALUES (?, ?, ?, 'game_started', ?, NULL, NULL)
        `).bind(`start:${runId}`, visitorId, runId, now).run();
        return json({ accepted: (result.meta?.changes || 0) > 0 }, 202, origin);
      }
      if (event === "game_over") {
        const duration = body.durationSeconds;
        const score = body.score;
        if (!Number.isInteger(duration) || duration < 0 || duration > 86400 ||
            !Number.isInteger(score) || score < 0 || score > 1000000000) {
          return json({ error: "invalid_result" }, 400, origin);
        }
        const result = await env.DB.prepare(`
          INSERT INTO analytics_events
            (event_id, visitor_id, run_id, event_type, occurred_at, duration_seconds, score)
          SELECT ?, ?, ?, 'game_over', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM analytics_events
            WHERE event_id = ? AND event_type = 'game_started' AND visitor_id = ?
          )
          ON CONFLICT(event_id) DO UPDATE SET
            occurred_at = excluded.occurred_at,
            duration_seconds = excluded.duration_seconds,
            score = excluded.score
        `).bind(`finish:${runId}`, visitorId, runId, now, duration, score, `start:${runId}`, visitorId).run();
        if (!(result.meta?.changes || 0)) return json({ error: "run_not_found" }, 409, origin);
        return json({ accepted: true }, 202, origin);
      }
      return json({ error: "event_not_allowed" }, 400, origin);
    } catch {
      return json({ error: "analytics_unavailable" }, 503, origin);
    }
  }
  if (url.pathname === "/privacy/delete" && request.method === "POST") {
    if (!env.DB || !origin || !LOCAL_ORIGINS.has(origin)) return json({ error: "analytics_unavailable" }, 503, origin);
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400, origin); }
    if (!validUUID(body?.visitorId)) return json({ error: "invalid_identifier" }, 400, origin);
    try {
      const result = await env.DB.prepare("DELETE FROM analytics_events WHERE visitor_id = ?")
        .bind(body.visitorId).run();
      return json({ deleted: result.meta?.changes || 0 }, 200, origin);
    } catch {
      return json({ error: "analytics_unavailable" }, 503, origin);
    }
  }
  if (url.pathname === "/admin/stats" && request.method === "GET") {
    if (!env.DB || !env.ADMIN_TOKEN) return json({ error: "analytics_not_configured" }, 503, origin);
    if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
      return json({ error: "unauthorized" }, 401, origin);
    }
    try {
      const stats = await env.DB.prepare(`
        WITH starts AS (
          SELECT visitor_id, occurred_at FROM analytics_events WHERE event_type = 'game_started'
        ), visitors AS (
          SELECT visitor_id, COUNT(*) AS start_count FROM starts GROUP BY visitor_id
        ), finished AS (
          SELECT duration_seconds, score FROM analytics_events WHERE event_type = 'game_over'
        )
        SELECT
          (SELECT COUNT(*) FROM starts) AS totalStarts,
          (SELECT COUNT(DISTINCT visitor_id) FROM starts) AS uniquePlayers,
          (SELECT COUNT(*) FROM starts WHERE occurred_at >= unixepoch('now', 'start of day')) AS todayStarts,
          (SELECT COUNT(*) FROM starts WHERE occurred_at >= unixepoch('now', '-7 days')) AS starts7Days,
          (SELECT COUNT(*) FROM starts WHERE occurred_at >= unixepoch('now', '-30 days')) AS starts30Days,
          (SELECT COUNT(*) FROM visitors WHERE start_count = 1) AS newVisitors,
          (SELECT COUNT(*) FROM visitors WHERE start_count > 1) AS returningVisitors,
          (SELECT AVG(duration_seconds) FROM finished) AS averageDurationSeconds,
          (SELECT MAX(duration_seconds) FROM finished) AS longestDurationSeconds,
          (SELECT COUNT(*) FROM finished) AS endedGames,
          (SELECT COUNT(*) FROM finished) AS gameOvers,
          (SELECT MAX(score) FROM finished) AS highestScore,
          (SELECT AVG(score) FROM finished) AS averageScore
      `).first();
      const numbers = {};
      for (const [key, value] of Object.entries(stats || {})) numbers[key] = value == null ? null : Number(value);
      return json({ ...numbers, timezone: "UTC" }, 200, origin);
    } catch {
      return json({ error: "analytics_unavailable" }, 503, origin);
    }
  }
  return json({ error: "not_found" }, 404, origin);
}

export default { fetch: handleRequest };
