async function loadRules() {
  const res = await fetch("/sse-lang/check/rules.json", { cache: "no-store" });
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



// SSE-Lang v0.1.1 (Input Syntax) — Tokenize + Parse
//   assign := ident (":"|"=") value ";"
//   enumPath := ident ("." ident)*
// The parser returns a Map<canonicalField, normalizedValue>.

function isLikelySSELang(text) {
  const t = (text || "").trim();
  if (!t) return false;
  // Heuristics: semicolons, CHECK/EVAL, hash-symbols, enum dots
  if (t.includes(";")) return true;
  if (/\b(CHECK|EVAL)\b/i.test(t)) return true;
  if (/#\w+/.test(t)) return true;
  if (/[A-Za-z_]\w*\.[A-Za-z_]\w*/.test(t)) return true;
  return false;
}

function tokenizeSSE(text) {
  const src = text || "";
  let i = 0, line = 1, col = 1;

  const tokens = [];
  const push = (type, value=null, loc=null) => tokens.push({ type, value, loc });

  const locNow = () => ({ line, col, index: i });

  const err = (msg) => {
    const context = src.slice(Math.max(0, i - 20), Math.min(src.length, i + 20));
    const caretPos = Math.min(20, i);
    throw new Error(`SSE-Lang parse error: ${msg} at ${line}:${col}\n...${context}\n${" ".repeat(3+caretPos)}^`);
  };

  const isAlpha = (c) => /[A-Za-z_]/.test(c);
  const isAlnum = (c) => /[A-Za-z0-9_\-]/.test(c);
  const isDigit = (c) => /[0-9]/.test(c);

  while (i < src.length) {
    const c = src[i];

    // whitespace
    if (c === " " || c === "\t" || c === "\r") { i++; col++; continue; }
    if (c === "\n") { i++; line++; col = 1; continue; }

    // comments: //... or #!... (not to confuse with #symbol; we use #symbol only if followed by ident and not "#!")
    if (c === "/" && src[i+1] === "/") {
      i += 2; col += 2;
      while (i < src.length && src[i] !== "\n") { i++; col++; }
      continue;
    }

    // punctuation
    if (c === ":") { push("COLON", ":", locNow()); i++; col++; continue; }
    if (c === "=") { push("EQUAL", "=", locNow()); i++; col++; continue; }
    if (c === ";") { push("SEMI", ";", locNow()); i++; col++; continue; }
    if (c === ".") { push("DOT", ".", locNow()); i++; col++; continue; }

    // string
    if (c === '"') {
      const start = locNow();
      i++; col++;
      let s = "";
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\n") err("Unterminated string literal");
        // minimal escaping for \" and \\ 
        if (src[i] === "\\" && i+1 < src.length) {
          const n = src[i+1];
          if (n === '"' || n === "\\") { s += n; i += 2; col += 2; continue; }
        }
        s += src[i]; i++; col++;
      }
      if (src[i] !== '"') err("Unterminated string literal");
      i++; col++;
      push("STRING", s, start);
      continue;
    }

    // symbol: #ident  (reserve "#!" for potential future directives; treat as error now)
    if (c === "#") {
      const start = locNow();
      if (src[i+1] === "!") err("Directive syntax '#!' not supported in v0.1.1 input");
      i++; col++;
      if (!isAlnum(src[i])) err("Expected symbol after '#'");
      let name = "";
      while (i < src.length && isAlnum(src[i])) { name += src[i]; i++; col++; }
      push("SYMBOL", name, start);
      continue;
    }

    // number: -?\d+(\.\d+)?
    if (c === "-" || isDigit(c)) {
      const start = locNow();
      let j = i;
      if (src[j] === "-") j++;
      if (!isDigit(src[j])) {
        // it's just '-' alone, not allowed
        err("Unexpected '-'");
      }
      while (j < src.length && isDigit(src[j])) j++;
      if (src[j] === "." && isDigit(src[j+1] || "")) {
        j++;
        while (j < src.length && isDigit(src[j])) j++;
      }
      const raw = src.slice(i, j);
      i = j; col += (j - start.index);
      push("NUMBER", raw, start);
      continue;
    }

    // identifier / keywords
    if (isAlpha(c)) {
      const start = locNow();
      let name = "";
      while (i < src.length && isAlnum(src[i])) { name += src[i]; i++; col++; }
      const upper = name.toUpperCase();
      if (upper === "CHECK") push("KW_CHECK", upper, start);
      else if (upper === "EVAL") push("KW_EVAL", upper, start);
      else push("IDENT", name, start);
      continue;
    }

    err(`Unexpected character '${c}'`);
  }

  push("EOF", null, locNow());
  return tokens;
}

function parseSSELangProgram(text, ruleset) {
  const toks = tokenizeSSE(text);
  let k = 0;

  const peek = () => toks[k];
  const next = () => toks[k++];
  const expect = (type) => {
    const t = next();
    if (t.type !== type) {
      throw new Error(`SSE-Lang parse error: expected ${type} but got ${t.type} at ${t.loc?.line}:${t.loc?.col}`);
    }
    return t;
  };

  // alias mapping
  const aliasToCanonical = new Map();
  const aliases = ruleset.aliases || {};
  for (const [canon, alist] of Object.entries(aliases)) {
    aliasToCanonical.set(canon.toLowerCase(), canon);
    for (const a of (alist || [])) aliasToCanonical.set(String(a).toLowerCase(), canon);
  }
  const canonKey = (key) => aliasToCanonical.get(String(key).toLowerCase()) || key;

  const map = new Map();
  let seenQuery = false;

  const parseEnumPath = (firstIdent) => {
    const parts = [firstIdent];
    while (peek().type === "DOT") {
      next(); // DOT
      const id = expect("IDENT").value;
      parts.push(id);
    }
    return parts;
  };

  const parseValue = () => {
    const t = peek();
    if (t.type === "NUMBER") {
      next();
      const raw = t.value;
      const v = raw.includes(".") ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
      if (Number.isNaN(v)) throw new Error(`Invalid number: ${raw}`);
      return v;
    }
    if (t.type === "STRING") { next(); return String(t.value); }
    if (t.type === "SYMBOL") { next(); return String(t.value).toLowerCase(); } // #3D -> "3d"
    if (t.type === "IDENT") {
      const first = next().value;
      const parts = parseEnumPath(first);
      // enum normalization: take last segment by default (reliability.partial -> "partial")
      return String(parts[parts.length - 1]).toLowerCase();
    }
    throw new Error(`SSE-Lang parse error: expected value at ${t.loc?.line}:${t.loc?.col}`);
  };

  const parseAssign = () => {
    const keyTok = expect("IDENT");
    const opTok = next();
    if (opTok.type !== "COLON" && opTok.type !== "EQUAL") {
      throw new Error(`SSE-Lang parse error: expected ':' or '=' at ${opTok.loc?.line}:${opTok.loc?.col}`);
    }
    const val = parseValue();
    expect("SEMI");
    const key = canonKey(keyTok.value);
    // Also normalize strings/symbols to lower-case to match v0.1 comparer
    const normVal = (typeof val === "string") ? val.toLowerCase().replace(/`/g, "") : val;
    map.set(key, normVal);
  };

  const parseQuery = () => {
    const t = next();
    if (t.type !== "KW_CHECK" && t.type !== "KW_EVAL") {
      throw new Error(`SSE-Lang parse error: expected CHECK/EVAL at ${t.loc?.line}:${t.loc?.col}`);
    }
    expect("SEMI");
    seenQuery = true;
  };

  while (peek().type !== "EOF") {
    const t = peek();
    if (t.type === "IDENT") parseAssign();
    else if (t.type === "KW_CHECK" || t.type === "KW_EVAL") parseQuery();
    else {
      throw new Error(`SSE-Lang parse error: unexpected token ${t.type} at ${t.loc?.line}:${t.loc?.col}`);
    }
  }

  // For v0.1 demo we don't require CHECK; but if present, we treat as explicit.
  return { map, seenQuery };
}


// v0.2 demo: Derived Semantics (Computed Fields)
// - Derives ModerateOrWorseCount from all Rating.* fields using an ordinal scale.
// -----------------------------

const RATING_SCALE = ["excellent","good","fair","moderate","poor","major","critical"];

function ratingRank(level) {
  const x = String(level || "").toLowerCase().trim();
  return RATING_SCALE.indexOf(x);
}

function deriveInput(map, ruleset) {
  const derivations = [];
  const counted = [];
  let totalRatings = 0;

  for (const [k, v] of map.entries()) {
    const key = String(k);
    if (!key.toLowerCase().startsWith("rating.")) continue;
    totalRatings += 1;

    const level = String(v).toLowerCase().trim();
    const r = ratingRank(level);
    if (r === -1) {
      derivations.push({
        name: "RatingParseWarning",
        value: `Ignored Rating field '${key}' with unrecognized level '${level}'`
      });
      continue;
    }

    // Count moderate-or-worse: level >= moderate
    if (r >= ratingRank("moderate")) {
      counted.push({ field: key, level });
    }
  }

  // Derive ModerateOrWorseCount only if any Rating.* provided
  if (totalRatings > 0) {
    const count = counted.length;
    // Canonicalize derived key via aliases if possible (match existing rules fields)
    const aliasToCanonical = new Map();
    const aliases = ruleset.aliases || {};
    for (const [canon, alist] of Object.entries(aliases)) {
      aliasToCanonical.set(String(canon).toLowerCase(), canon);
      for (const a of (alist || [])) aliasToCanonical.set(String(a).toLowerCase(), canon);
    }

    const derivedKey = aliasToCanonical.get("moderateorworsecount") ||
                       aliasToCanonical.get("count of attributes rated moderate or worse") ||
                       "ModerateOrWorseCount";

    map.set(derivedKey, count);

    derivations.push({
      name: "ModerateOrWorseCount",
      value: count,
      from: counted
    });

    // Optional: AnyCriticalFlag
    const anyCritical = counted.some(x => x.level === "critical");
    derivations.push({
      name: "AnyCriticalFlag",
      value: anyCritical
    });
  }

  return { map, derivations };
}

function parseSSELangOrLegacy(text, ruleset) {
  if (isLikelySSELang(text)) {
    const { map } = parseSSELangProgram(text, ruleset);
    return map;
  }
  // fallback: legacy key-value lines
  return parseKeyValueLines(text, ruleset);
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
  const triggeredHard = [];
  const triggeredSoft = [];

  for (const rule of (ruleset.rules || [])) {
    const m = ruleMatches(ruleset, rule, inputMap);
    if (m.matched) {
      triggered.push(rule);
      const level = String(rule.level || ruleset.defaults?.level || "hard").toLowerCase();
      if (level === "soft") triggeredSoft.push(rule);
      else triggeredHard.push(rule);
    }
  }

  // Hard priority: any hard infeasible => NO
  const hardInfeasible = triggeredHard.find(r => (r.then?.judgement || "").toLowerCase() === "infeasible");
  if (hardInfeasible) return { ruleset, verdict: "NO", judgement: "Infeasible", rule: hardInfeasible, triggered, triggeredHard, triggeredSoft };

  // If any hard non-infeasible judgement exists, return that (first)
  const hardOther = triggeredHard.find(r => (r.then?.judgement || "").toLowerCase() !== "infeasible");
  if (hardOther) return { ruleset, verdict: "YES*", judgement: hardOther.then.judgement, rule: hardOther, triggered, triggeredHard, triggeredSoft };

  // Soft/advisory: does not change feasibility verdict, but reports flags
  if (triggeredSoft.length) {
    // pick first advisory as primary for display
    const primary = triggeredSoft[0];
    return {
      ruleset,
      verdict: "YES (ADVISORY)",
      judgement: primary.then?.judgement || "Advisory flags present",
      rule: primary,
      triggered,
      triggeredHard,
      triggeredSoft
    };
  }

  // Default
  return { ruleset, verdict: "YES", judgement: "No hard infeasibility triggered", rule: null, triggered, triggeredHard, triggeredSoft };
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
    triggered: result.triggered.map(r => r.id),
    derivations: Array.isArray(result.derivations) ? result.derivations.map(d => ({
      name: d.name,
      value: d.value,
      from: Array.isArray(d.from) ? d.from.map(x => ({ field: x.field, level: x.level })) : undefined
    })) : []
  };
  const traceId = `SSE-${simpleHash(stableStringify(tracePayload))}`;

  let html = `<div><b>Judgement:</b> ${escapeHtml(result.judgement)}</div>`;
  html += `<div style="margin-top:10px"><b>Trace ID:</b> <code>${escapeHtml(traceId)}</code></div>`;
  // Advisory summary
  if (Array.isArray(result.triggeredSoft) && result.triggeredSoft.length) {
    html += `<div style="margin-top:10px"><b>Advisory flags:</b> ${result.triggeredSoft.length} soft rule(s) triggered.</div>`;
  }

  if (Array.isArray(result.derivations) && result.derivations.length) {
    let dhtml = "";
    for (const d of result.derivations) {
      if (d.name === "ModerateOrWorseCount" && Array.isArray(d.from)) {
        const items = d.from.map(x => `<li><code>${escapeHtml(x.field)}</code> = ${escapeHtml(x.level)}</li>`).join("");
        dhtml += `<div style="margin-top:8px"><b>${escapeHtml(d.name)}</b> = <code>${escapeHtml(String(d.value))}</code> (from ${d.from.length} field(s))</div>`;
        dhtml += `<ul>${items}</ul>`;
      } else {
        dhtml += `<div style="margin-top:8px"><b>${escapeHtml(d.name)}</b>: ${escapeHtml(String(d.value))}</div>`;
      }
    }
    html += `<details style="margin-top:10px"><summary style="cursor:pointer; font-weight:700">Derivations (v0.2 demo)</summary>${dhtml}</details>`;
  }
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
  const hardSet = new Set((result.triggeredHard || []).map(x => x.id));
  const softSet = new Set((result.triggeredSoft || []).map(x => x.id));
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
    let map = parseSSELangOrLegacy(input, ruleset);
    const derived = deriveInput(map, ruleset);
    map = derived.map;
    const result = decide(ruleset, map);
    result.derivations = derived.derivations;
    renderResult(result);
  });

  // Load example
  const example = `IonPathDimensionality: #3D;
PathContinuity: flexible;
DataReliability: reliability.partial;

Rating.Stability: rating.moderate;
Rating.Interface: rating.good;
Rating.Synthesis: rating.major;
CHECK;`;
  document.getElementById("input").value = example;
}
main().catch(err => {
  document.getElementById("details").textContent = "Error: " + err.message;
});
