function utcNowISO() {
  return new Date().toISOString();
}

function makeRecordId() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const seq = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `GLO-MKT-QD-${year}-${seq}`;
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildStatementCN(goodsName, qty, place) {
  return `上述商户声明：于所示时间，自所示地点出货${goodsName}${qty}。`;
}

function buildStatementEN(goodsName, qty, place) {
  return `The above merchant declared that a shipment of ${qty} ${goodsName} was dispatched from the stated place on the stated date and time.`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function generateCertificateHtml(record) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${record.record_id} | Proof of Place of Dispatch</title>
  <style>
    body{margin:0;font-family:"Times New Roman",Georgia,serif;background:#f5f2eb;color:#1f1c17;}
    .wrap{max-width:1000px;margin:0 auto;padding:30px 18px 50px;}
    .sheet{background:#fffdf9;border:1px solid #ddd4c8;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.06);overflow:hidden;}
    .head{padding:34px 36px 20px;border-bottom:1px solid #ddd4c8;text-align:center;background:#fcf8f2;}
    .org{letter-spacing:.15em;font-size:12px;text-transform:uppercase;color:#9d793d;margin-bottom:10px;}
    h1{margin:0;font-size:34px;}
    .sub{color:#6c655d;margin-top:10px;line-height:1.8;}
    .body{display:grid;grid-template-columns:1.2fr .8fr;}
    .main{padding:30px 36px;border-right:1px solid #ddd4c8;}
    .side{padding:30px 24px;background:#fcfaf6;}
    .label{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#6c655d;margin-bottom:8px;}
    .value{font-size:18px;line-height:1.7;margin-bottom:18px;}
    .card{border:1px solid #ddd4c8;border-radius:14px;padding:16px;background:#fff;margin-bottom:16px;}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;word-break:break-all;line-height:1.6;}
    .seal{width:150px;height:150px;border:1px solid rgba(157,121,61,.35);border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;margin:0 auto 20px;color:#7d5f2a;background:radial-gradient(circle at center, rgba(157,121,61,.14), rgba(157,121,61,.03));}
    .foot{padding:16px 36px;border-top:1px solid #ddd4c8;background:#fbf8f2;color:#6c655d;font-size:12px;line-height:1.8;}
    @media (max-width: 820px){.body{grid-template-columns:1fr}.main{border-right:none;border-bottom:1px solid #ddd4c8}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="sheet">
      <div class="head">
        <div class="org">Goldisle Light Org (UK)</div>
        <h1>Proof of Place of Dispatch · 出货地证明</h1>
        <div class="sub">A lightweight record of merchant self-declaration, place of dispatch, timestamp, and node-issued signature.<br>商户自申报、出货地点、时间戳与节点签发记录的轻量证明。</div>
      </div>
      <div class="body">
        <div class="main">
          <div class="label">Merchant / 商户</div>
          <div class="value">${record.merchant.merchant_name}</div>

          <div class="label">Dispatch Place / 出货地</div>
          <div class="value">${record.dispatch.dispatch_place}</div>

          <div class="label">Declaration / 申报内容</div>
          <div class="card">${record.declaration.statement_text_en}<br><span style="color:#6c655d">${record.declaration.statement_text_cn}</span></div>

          <div class="label">Goods / 商品</div>
          <div class="value">${record.dispatch.goods_name} · ${record.dispatch.goods_quantity}</div>

          <div class="card"><strong>Record ID / 记录编号</strong><br>${record.record_id}</div>
          <div class="card"><strong>Issued Time / 出证时间</strong><br>${record.declaration.declared_at}</div>
          <div class="card mono"><strong>Statement Hash / 声明哈希</strong><br>${record.signing.statement_hash}</div>
          <div class="card mono"><strong>Node Signature / 节点签名</strong><br>${record.signing.node_signature}</div>
        </div>
        <div class="side">
          <div class="seal">Issued by<br>Goldisle Light Org (UK)</div>
          <div class="label">Issuer / 出证机构</div>
          <div class="value">Goldisle Light Org (UK)</div>
          <div class="label">Certifying Signatory / 出证人</div>
          <div class="value">Evan Bei</div>
          <div class="label">Node / 节点</div>
          <div class="value">${record.signing.node_id}</div>
          <div class="label">Important Notice / 重要说明</div>
          <div class="card">本证明记录的是商户自申报及节点系统签发事实。除非另行升级为更高等级审计流程，本证明并不独立验证货物数量、质量或外部事实真伪。<br><br>This certificate records a merchant self-declaration and the fact of issuance by the node system. Unless separately upgraded to a higher audit process, this certificate does not independently verify the physical quantity, quality, or external factual truth of the goods.</div>
        </div>
      </div>
      <div class="foot">Verification reference available through record ID, statement hash, and node signature. / 可通过记录编号、声明哈希与节点签名进行核验。</div>
    </div>
  </div>
</body>
</html>`;
}

async function generateRecord() {
  const merchantName = document.getElementById('merchantName').value.trim();
  const merchantId = document.getElementById('merchantId').value.trim();
  const keyId = document.getElementById('keyId').value.trim();
  const nodeId = document.getElementById('nodeId').value.trim();
  const goodsName = document.getElementById('goodsName').value.trim();
  const goodsQty = document.getElementById('goodsQty').value.trim();
  const dispatchPlace = document.getElementById('dispatchPlace').value.trim();
  const note = document.getElementById('note').value.trim();

  if (!goodsName || !goodsQty || !dispatchPlace) {
    alert('请先填写商品名称、数量和出货地。');
    return;
  }

  const declaredAt = utcNowISO();
  const recordId = makeRecordId();
  const statementCN = buildStatementCN(goodsName, goodsQty, dispatchPlace);
  const statementEN = buildStatementEN(goodsName, goodsQty, dispatchPlace);
  const statementHash = 'sha256:' + await sha256Hex(JSON.stringify({
    merchantName, merchantId, keyId, nodeId, goodsName, goodsQty, dispatchPlace, note, declaredAt
  }));

  const record = {
    record_id: recordId,
    evidence_type: 'proof_of_place_of_dispatch',
    level: 'lightweight_self_declared_record',
    merchant: {
      merchant_id: merchantId,
      merchant_name: merchantName,
      key_id: keyId
    },
    dispatch: {
      dispatch_place: dispatchPlace,
      goods_name: goodsName,
      goods_quantity: goodsQty,
      note: note
    },
    declaration: {
      declared_at: declaredAt,
      declared_by: 'merchant_self_declaration',
      statement_text_cn: statementCN,
      statement_text_en: statementEN
    },
    signing: {
      statement_hash: statementHash,
      merchant_signature: 'ed25519:merchant_signature_placeholder',
      node_id: nodeId,
      node_signature: 'ed25519:node_signature_placeholder'
    },
    issuer: {
      issuer_org: 'Goldisle Light Org (UK)',
      issuer_signatory: 'Evan Bei'
    },
    notice: {
      cn: '本证明记录的是商户自申报及节点系统签发事实。除非另行升级为更高等级审计流程，本证明并不独立验证货物数量、质量或外部事实真伪。',
      en: 'This certificate records a merchant self-declaration and the fact of issuance by the node system. Unless separately upgraded to a higher audit process, this certificate does not independently verify the physical quantity, quality, or external factual truth of the goods.'
    }
  };

  const jsonText = JSON.stringify(record, null, 2);
  const htmlText = generateCertificateHtml(record);

  document.getElementById('jsonOutput').value = jsonText;
  document.getElementById('resultMeta').innerHTML = `已生成记录：<strong>${recordId}</strong><br>可下载 JSON 与 HTML。`;

  window.__lastRecord = { recordId, jsonText, htmlText };
}

function loadExample() {
  document.getElementById('goodsName').value = '西瓜 / Watermelon';
  document.getElementById('goodsQty').value = '10';
  document.getElementById('note').value = '今日第一批出货';
}

function setupIssuePage() {
  const generateBtn = document.getElementById('generateBtn');
  const loadExampleBtn = document.getElementById('loadExampleBtn');
  const downloadJsonBtn = document.getElementById('downloadJsonBtn');
  const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');

  if (!generateBtn) return;

  generateBtn.addEventListener('click', generateRecord);
  loadExampleBtn.addEventListener('click', loadExample);

  downloadJsonBtn.addEventListener('click', () => {
    if (!window.__lastRecord) return alert('请先生成记录。');
    downloadFile(`${window.__lastRecord.recordId}.json`, window.__lastRecord.jsonText, 'application/json');
  });

  downloadHtmlBtn.addEventListener('click', () => {
    if (!window.__lastRecord) return alert('请先生成记录。');
    downloadFile(`${window.__lastRecord.recordId}.html`, window.__lastRecord.htmlText, 'text/html;charset=utf-8');
  });
}

window.addEventListener('DOMContentLoaded', setupIssuePage);
