async function loadRules() {
  const res = await fetch("./rules.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load rules.json");
  return await res.json();
}

function normalizeKey(s) {
  return (s || "").trim();
}

function parseKeyValueLines(text, ruleset) {
  const map = new Map();
  const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Build reverse alias lookup
  const aliasToCanonical = new Map();
  const aliases = ruleset.aliases || {};
  for (const [canon, alist] of Object.entries(aliases)) {
    aliasToCanonical.set(canon.toLowerCase(), canon);
    for (const a of (alist || [])) aliasToCanonical.set(String(a).toLowerCase(), canon);
  }

  for (const line of lines) {
    // Accept "Key: value" or "Key = value"
    let m = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (!m) continue;
    let key = normalizeKey(m[1]);
    let val = normalizeKey(m[2]);

    const canon = aliasToCanonical.get(key.toLowerCase()) || key;
    // strip backticks
    val = val.replace(/`/g, "");

    // number?
    if (/^-?\d+(\.\d+)?$/.test(val)) {
      val = val.includes(".") ? Number.parseFloat(val) : Number.parseInt(val, 10);
    } else {
      val = val.toLowerCase();
    }
    map.set(canon, val);
  }
  return map;
}

function ordinalIndex(ruleset, field, value) {
  const scale = (ruleset.ordinal_scales || {})[field];
  if (!scale) return null;
  const v = String(value).toLowerCase();
  const idx = scale.map(x => String(x).toLowerCase()).indexOf(v);
  return idx >= 0 ? idx : null;
}

function compareValue(ruleset, field, op, lhs, rhs) {
  // Handle ordinals if defined
  const li = ordinalIndex(ruleset, field, lhs);
  const ri = ordinalIndex(ruleset, field, rhs);
  if (li !== null && ri !== null) {
    switch (op) {
      case ">=": return li >= ri;
      case "<=": return li <= ri;
      case ">":  return li > ri;
      case "<":  return li < ri;
      case "=":  return li === ri;
      case "!=": return li !== ri;
      default: return false;
    }
  }

  // Numbers
  if (typeof lhs === "number" && typeof rhs === "number") {
    switch (op) {
      case ">=": return lhs >= rhs;
      case "<=": return lhs <= rhs;
      case ">":  return lhs > rhs;
      case "<":  return lhs < rhs;
      case "=":  return lhs === rhs;
      case "!=": return lhs !== rhs;
      default: return false;
    }
  }

  // Strings
  const ls = String(lhs).toLowerCase();
  const rs = String(rhs).toLowerCase();
  switch (op) {
    case "=":  return ls === rs;
    case "!=": return ls !== rs;
    default: return false;
  }
}

function ruleMatches(ruleset, rule, inputMap) {
  for (const c of (rule.if || [])) {
    if (c.raw && (!c.field || !c.op)) {
      // Not machine-parsed condition: cannot evaluate => treat as not matched
      return { matched: false, reason: "Unparsed condition" };
    }
    const field = c.field;
    const op = c.op;
    const rhs = c.value;

    if (!inputMap.has(field)) return { matched: false, reason: `Missing field: ${field}` };

    const lhs = inputMap.get(field);

    if (!compareValue(ruleset, field, op, lhs, rhs)) {
      return { matched: false, reason: `Condition failed: ${field} ${op} ${rhs}` };
    }
  }
  return { matched: true };
}

function decide(ruleset, inputMap) {
  const triggered = [];

  for (const rule of (ruleset.rules || [])) {
    const m = ruleMatches(ruleset, rule, inputMap);
    if (m.matched) triggered.push(rule);
  }

  // Priority: any Infeasible => NO
  const infeasible = triggered.find(r => (r.then?.judgement || "").toLowerCase() === "infeasible");
  if (infeasible) return { ruleset, verdict: "NO", judgement: "Infeasible", rule: infeasible, triggered };

  // Otherwise, if any non-infeasible judgement exists, return that (first)
  const other = triggered.find(r => (r.then?.judgement || "").toLowerCase() !== "infeasible");
  if (other) return { ruleset, verdict: "YES*", judgement: other.then.judgement, rule: other, triggered };

  // Default: Yes (no hard no-go triggered)
  return { ruleset, verdict: "YES", judgement: "No hard infeasibility triggered", rule: null, triggered };
}

function stableStringify(obj) {
  // Deterministic JSON stringify for trace
  const seen = new WeakSet();
  const recur = (x) => {
    if (x && typeof x === "object") {
      if (seen.has(x)) return null;
      seen.add(x);
      if (Array.isArray(x)) return x.map(recur);
      const keys = Object.keys(x).sort();
      const out = {};
      for (const k of keys) out[k] = recur(x[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(recur(obj));
}

function simpleHash(str) {
  // lightweight non-crypto hash for trace id (presentation only)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResult(result) {
  const verdictEl = document.getElementById("verdict");
  const detailEl = document.getElementById("details");
  const listEl = document.getElementById("triggered");

  verdictEl.textContent = result.verdict;
  verdictEl.dataset.state = result.verdict.startsWith("NO") ? "no" : "yes";

  // Build a lightweight, citable trace identifier
  const now = new Date().toISOString();
  const tracePayload = {
    when: now,
    ruleset: { spec: result.ruleset?.spec, version: result.ruleset?.version, source: result.ruleset?.source },
    verdict: result.verdict,
    judgement: result.judgement,
    primary_rule: result.rule ? { id: result.rule.id, cit: result.rule.cit || "", level: result.rule.level || "" } : null,
    triggered: result.triggered.map(r => r.id)
  };
  const traceId = `SSE-${simpleHash(stableStringify(tracePayload))}`;

  let html = `<div><b>Judgement:</b> ${escapeHtml(result.judgement)}</div>`;
  html += `<div style="margin-top:10px"><b>Trace ID:</b> <code>${escapeHtml(traceId)}</code></div>`;
  if (result.rule) {
    html += `<div style="margin-top:6px"><b>Primary Rule:</b> ${escapeHtml(result.rule.id)} — ${escapeHtml(result.rule.name)}</div>`;
    html += `<div><b>Group:</b> ${escapeHtml(result.rule.group || "")}</div>`;
    if (result.rule.cit) html += `<div><b>Citation:</b> ${escapeHtml(result.rule.cit)}</div>`;
    if (result.rule.level) html += `<div><b>Rule level:</b> ${escapeHtml(result.rule.level)}</div>`;
    if (result.rule.status) html += `<div><b>Status:</b> ${escapeHtml(result.rule.status)}</div>`;
    if (result.rule.rationale) {
      html += `<div style="margin-top:6px"><b>Rationale:</b> ${escapeHtml(result.rule.rationale)}</div>`;
    }
  } else {
    html += `<div style="margin-top:6px; opacity:0.85">Tip: add more fields to trigger specific rules.</div>`;
  }
  detailEl.innerHTML = html;

  listEl.innerHTML = "";
  for (const r of result.triggered) {
    const li = document.createElement("li");
    li.textContent = `${r.id} — ${r.name} (${r.then?.judgement || ""})`;
    listEl.appendChild(li);
  }
}

async function main() {
  const ruleset = await loadRules();

  const btn = document.getElementById("checkBtn");
  btn.addEventListener("click", () => {
    const input = document.getElementById("input").value;
    const map = parseKeyValueLines(input, ruleset);
    const result = decide(ruleset, map);
    renderResult(result);
  });

  // Load example
  const example = `Ion Path Dimensionality: 3D
Path Continuity: flexible
Data Reliability: partial
Count of attributes rated moderate or worse: 2`;
  document.getElementById("input").value = example;
}
main().catch(err => {
  document.getElementById("details").textContent = "Error: " + err.message;
});
