export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // 1) 匿名打点：/scriptorium/_hit
    if (url.pathname.endsWith("/scriptorium/_hit")) {
      if (req.method !== "POST") return new Response("OK");

      let body = {};
      try { body = await req.json(); } catch {}

      const item = String(body.item_id || "").slice(0, 80);
      if (!item) return new Response("OK");

      // 只写 item_id，不写 cookie，不写任何身份字段
      env.AE.writeDataPoint({
        blobs: [item],     // blob1 = item_id
        doubles: [1],      // double1 = count
      });

      return new Response("OK");
    }

    // 2) 统计查询：/scriptorium/_stats?period=today|7d
    if (url.pathname.endsWith("/scriptorium/_stats")) {
      if (req.method !== "GET") return json({});

      const period = url.searchParams.get("period") || "today";
      const { sinceISO, untilISO } = timeRange(period);

      // AE SQL 聚合：Top 5 items
      const query = `
        SELECT
          sum(double1) AS total,
          blob1 AS item_id
        FROM scriptorium_hits
        WHERE timestamp >= toDateTime('${sinceISO}')
          AND timestamp <  toDateTime('${untilISO}')
        GROUP BY item_id
        ORDER BY total DESC
        LIMIT 5
      `.trim();

      const api = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
      const resp = await fetch(api, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "text/plain"
        },
        body: query
      });

      const out = await resp.json().catch(() => null);

      // 兼容结构
      const rows = out?.result?.rows || out?.result || [];
      const top = Array.isArray(rows) ? rows.map(r => ({
        item_id: r.item_id,
        count: Number(r.total || 0)
      })) : [];

      const today_total = top.reduce((a, b) => a + (b.count || 0), 0);

      return json({
        period,
        since: sinceISO,
        until: untilISO,
        today_total,
        top
      });
    }

    return new Response("Not found", { status: 404 });
  }
};

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function timeRange(period) {
  const now = new Date();

  if (period === "7d") {
    const until = now;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    return { sinceISO: since.toISOString(), untilISO: until.toISOString() };
  }

  // 默认 today：按 UTC 零点切日，避免时区误差
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const since = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const until = new Date(Date.UTC(y, m, d + 1, 0, 0, 0));
  return { sinceISO: since.toISOString(), untilISO: until.toISOString() };
}
