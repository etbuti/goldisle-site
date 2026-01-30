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
  if (infeasible) return { verdict: "NO", judgement: "Infeasible", rule: infeasible, triggered };

  // Otherwise, if any non-infeasible judgement exists, return that (first)
  const other = triggered.find(r => (r.then?.judgement || "").toLowerCase() !== "infeasible");
  if (other) return { verdict: "YES*", judgement: other.then.judgement, rule: other, triggered };

  // Default: Yes (no hard no-go triggered)
  return { verdict: "YES", judgement: "No hard infeasibility triggered", rule: null, triggered };
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

  let html = `<div><b>Judgement:</b> ${escapeHtml(result.judgement)}</div>`;
  if (result.rule) {
    html += `<div style="margin-top:6px"><b>Primary Rule:</b> ${escapeHtml(result.rule.id)} — ${escapeHtml(result.rule.name)}</div>`;
    html += `<div><b>Group:</b> ${escapeHtml(result.rule.group || "")}</div>`;
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
