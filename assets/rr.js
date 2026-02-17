(async function () {
  // ---------- helpers ----------
  const esc = (s) => String(s || "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  // 匿名打点：只带 item_id
  function hit(itemId){
    try{
      const payload = JSON.stringify({ item_id: itemId, ts: Date.now() });
      navigator.sendBeacon("/scriptorium/_hit", payload);
    }catch(e){}
  }
  // 让 onclick 可用
  window.__RR_HIT__ = hit;

  // ---------- load catalogue ----------
  const res = await fetch("/scriptorium/items.json", { cache: "no-store" });
  const data = await res.json().catch(() => ({ items: [] }));
  const items = Array.isArray(data.items) ? data.items : [];

  const cats = ["All"].concat([...new Set(items.map(x => x.category).filter(Boolean))].sort());
  const sel = document.getElementById("cat");
  const q = document.getElementById("q");
  const list = document.getElementById("list");

  sel.innerHTML = cats.map(c => `<option>${esc(c)}</option>`).join("");

  function render() {
    const term = (q.value || "").trim().toLowerCase();
    const c = sel.value;

    const filtered = items.filter(it => {
      if (c && c !== "All" && it.category !== c) return false;
      if (!term) return true;
      const hay = [it.id, it.title, it.category, (it.tags||[]).join(" "), it.note||""].join(" ").toLowerCase();
      return hay.includes(term);
    });

    list.innerHTML = filtered.map(card).join("");
  }

  function card(it) {
    const tags = (it.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");

    const open = it.open || (it.page ? `/scriptorium/items/${it.page}` : "");
    const dl = it.file ? `/scriptorium/files/${it.id}/${it.file}` : "";

    const openA = open
      ? `<a class="link" href="${open}" target="_blank" rel="noopener"
            onclick="window.__RR_HIT__('${esc(it.id)}')">Open</a>`
      : ``;

    const dlA = dl ? `<a class="link" href="${dl}" download>Download</a>` : ``;

    return `
      <article class="item">
        <div class="k">${esc(it.category || "Unsorted")}</div>
        <div class="t">${esc(it.title || it.id)}</div>
        <div class="tags">${tags}</div>
        <p class="n">${esc(it.note || "")}</p>
        <div class="links2">${openA}${dlA}</div>
      </article>
    `;
  }

  q.addEventListener("input", render);
  sel.addEventListener("change", render);
  render();

  // ---------- minimal stats (today) ----------
  try{
    const r = await fetch("/scriptorium/_stats?period=today", { cache:"no-store" });
    const s = await r.json();
    const n = Number(s.today_total || 0);
    const el = document.getElementById("rr-count");
    if (el) el.textContent = `· ${n} readings today`;

    const st = document.getElementById("rr-status");
if (st) st.textContent = document.cookie.includes("CF_Authorization=")
  ? "· private access enabled" : "· access not detected";


    // 可选：Top 5 公告板（默认隐藏，若有数据则显示）
    const top = Array.isArray(s.top) ? s.top : [];
    if (top.length) {
      const board = document.getElementById("rr-topboard");
      if (board) {
        board.style.display = "block";
        board.innerHTML =
          `<b>Top opened today</b><br>` +
          top.map((x,i)=>`${i+1}. <span class="mono">${esc(x.item_id)}</span> · ${Number(x.count||0)}`).join("<br>");
      }
    }
  }catch(e){
    // 静默失败，不影响阅读
  }
})();

