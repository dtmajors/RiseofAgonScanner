#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  NEXUS ANALYTICS  —  Single-file, zero dependencies
//  Run:  node nexus-analytics.js
//  Then: browser opens automatically at http://localhost:3337
// ═══════════════════════════════════════════════════════════════

const http  = require("http");
const https = require("https");
const { exec } = require("child_process");

const PORT = 3337;

function openBrowser(url) {
  const cmd = process.platform === "win32"  ? `start "" "${url}"` :
              process.platform === "darwin" ? `open "${url}"` :
                                              `xdg-open "${url}"`;
  exec(cmd);
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        if (res.headers.location) return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode >= 400) { reject(new Error("HTTP " + res.statusCode)); res.resume(); return; }
      let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("Timeout")));
  });
}

function strip(s) { return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

const MONTHS = {january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
  july:"07",august:"08",september:"09",october:"10",november:"11",december:"12"};
function parseDisplayDate(s) {
  const m = s.match(/(\w+)\s+(\d+),\s+(\d{4})/i);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2].padStart(2,"0")}`;
}

function parseActorCell(tdInner) {
  const clanMatch = tdInner.match(/class="clanname-minimal"[^>]*>([\s\S]*?)<\/span>/i);
  const clan = clanMatch ? strip(clanMatch[1]) : "";
  const nameRaw = tdInner.replace(/<span[\s\S]*?<\/span>/gi, "");
  const name = strip(nameRaw);
  return { name, clan };
}

function parsePage(html, dateFrom, dateTo, pageNum) {
  const rows = []; let foundInRange = false, foundEarlier = false;
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return { rows, foundInRange, foundEarlier };
  const tbody = tbodyMatch[1];
  const trRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  while ((trM = trRx.exec(tbody)) !== null) {
    const trHTML = trM[1];
    const tdRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const tdInners = []; let td;
    while ((td = tdRx.exec(trHTML)) !== null) tdInners.push(td[1]);
    if (tdInners.length < 3) continue;
    const timeText = strip(tdInners[0]);
    const rowDate = parseDisplayDate(timeText);
    if (!rowDate) continue;
    const inRange = rowDate >= dateFrom && rowDate <= dateTo;
    if (inRange) foundInRange = true;
    if (rowDate < dateFrom) foundEarlier = true;
    if (!inRange) continue;
    const actor  = parseActorCell(tdInners[1]);
    const victim = parseActorCell(tdInners[2]);
    const isClanmate = /class="clanmate"/.test(trM[0]);
    rows.push({
      time: timeText, date: rowDate,
      type: isClanmate ? "clanmate" : "gank",
      actor: actor.name, actorClan: actor.clan,
      target: victim.name, targetClan: victim.clan,
      page: pageNum,
    });
  }
  return { rows, foundInRange, foundEarlier };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const activeScans = new Map();

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Nexus Analytics</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0c0e13;--bg2:#111318;--bg3:#181c24;--bg4:#1e2330;
  --border:#252b3a;--border2:#2f3850;
  --green:#3de89a;--green-dim:#1d5e42;--amber:#f0a030;--red:#e05555;--blue:#4a9eff;
  --text:#bfc8da;--text2:#7a8499;--text3:#404860;
  --mono:'Share Tech Mono',monospace;--sans:'Barlow',sans-serif;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;overflow:hidden}
.app{display:grid;grid-template-columns:290px 1fr;height:100vh}

/* SIDEBAR */
.sidebar{background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto}
.sidebar-top{padding:20px 20px 0;display:flex;flex-direction:column;gap:14px}
.brand{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:4px}
.brand h1{font-family:var(--mono);font-size:13px;letter-spacing:3px;color:var(--green);text-transform:uppercase}
.brand span{font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase}
.divider{height:1px;background:var(--border);margin:2px 0}
.field{display:flex;flex-direction:column;gap:5px}
.label{font-size:9px;letter-spacing:1.5px;color:var(--text3);text-transform:uppercase}
input[type=date],input[type=text],input[type=number]{
  background:var(--bg3);border:1px solid var(--border);color:var(--text);
  padding:8px 10px;border-radius:3px;font-family:var(--mono);font-size:11px;
  outline:none;width:100%;transition:border-color .15s;
}
input:focus{border-color:var(--green-dim)}
input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{padding:10px 14px;border:none;border-radius:3px;font-family:var(--mono);font-size:11px;letter-spacing:1px;cursor:pointer;transition:all .15s;text-align:center}
.btn-scan{background:var(--green);color:#0c0e13;font-weight:600}
.btn-scan:hover{filter:brightness(1.1)}
.btn-scan.scanning{background:var(--red);color:#fff}
.btn-clear{background:var(--bg3);color:var(--text2);border:1px solid var(--border)}
.btn-clear:hover{border-color:var(--border2);color:var(--text)}
.progress-wrap{display:flex;flex-direction:column;gap:4px}
.progress-track{height:2px;background:var(--bg3);border-radius:1px;overflow:hidden}
.progress-bar{height:100%;background:var(--green);width:0%;transition:width .3s;border-radius:1px}
.progress-label{font-family:var(--mono);font-size:9px;color:var(--text3)}
.log-wrap{background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:10px;height:100px;overflow-y:auto}
.log-line{font-family:var(--mono);font-size:10px;color:var(--text3);line-height:1.7}
.log-line.ok{color:var(--green)}.log-line.err{color:var(--red)}.log-line.warn{color:var(--amber)}
.sidebar-bottom{padding:14px 20px 20px;margin-top:auto;display:flex;flex-direction:column;gap:8px}
.btn-export{background:transparent;border:1px solid var(--border);color:var(--text2);padding:9px;border-radius:3px;font-family:var(--mono);font-size:10px;letter-spacing:1px;cursor:pointer;transition:all .15s}
.btn-export:hover{border-color:var(--green-dim);color:var(--green)}
.btn-export:disabled{opacity:.3;cursor:not-allowed}

/* MAIN */
.main{display:flex;flex-direction:column;overflow:hidden;position:relative}
.console-wrap{background:var(--bg2);border-bottom:1px solid var(--border);height:220px;flex-shrink:0;display:flex;flex-direction:column}
.console-header{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0}
.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.d-r{background:#e05555}.d-a{background:#f0a030}.d-g{background:#3de89a}
.console-title{font-size:11px;color:var(--text3);margin-left:4px;font-family:var(--mono)}
.console-body{flex:1;overflow-y:auto;padding:12px 16px;font-family:var(--mono);font-size:11px;line-height:1.8}
.cl{color:var(--text2)}.cl.g{color:var(--green)}.cl.a{color:var(--amber)}.cl.r{color:var(--red)}.cl.dim{color:var(--text3)}

/* STATS BAR */
.stats-bar{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2)}
.stat{padding:12px 16px;border-right:1px solid var(--border)}.stat:last-child{border-right:none}
.stat-label{font-size:9px;letter-spacing:1.5px;color:var(--text3);text-transform:uppercase;margin-bottom:5px}
.stat-val{font-family:var(--mono);font-size:20px;color:var(--text);transition:color .3s}
.stat-val.active{color:var(--green)}

/* TABLE */
.table-area{flex:1;display:flex;flex-direction:column;overflow:hidden}
.table-toolbar{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0}
.table-toolbar input{width:240px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:3px;font-family:var(--mono);font-size:11px;outline:none}
.table-toolbar input:focus{border-color:var(--green-dim)}
.row-count{font-family:var(--mono);font-size:10px;color:var(--text3);margin-left:auto}
.table-scroll{flex:1;overflow:auto}
table{width:100%;border-collapse:collapse;font-size:11px}
thead tr{position:sticky;top:0;z-index:2}
th{background:var(--bg2);border-bottom:1px solid var(--border2);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);padding:8px 12px;text-align:left;font-weight:500;white-space:nowrap}
td{padding:7px 12px;border-bottom:1px solid var(--border);font-family:var(--mono);white-space:nowrap;color:var(--text2)}
tr:hover td{background:var(--bg3)}
.type-pill{display:inline-block;padding:2px 8px;border-radius:2px;font-size:9px;letter-spacing:1px;font-family:var(--mono);text-transform:uppercase}
.t-gank{background:#2a0d0d;color:#e05555;border:1px solid #4a1a1a}
.t-clanmate{background:#1a1a2a;color:#4a9eff;border:1px solid #1a2a4a}
.t-kill{background:#0d2a1a;color:#3de89a;border:1px solid #1a4a30}
.t-death{background:#2a1d0d;color:#f0a030;border:1px solid #4a3010}
.t-event{background:#222;color:#555;border:1px solid #333}
.td-name{color:var(--text)}

/* CLICKABLE LINKS in table */
.pl{cursor:pointer;color:var(--text);border-bottom:1px dotted var(--text3);transition:color .15s,border-color .15s;white-space:nowrap}
.pl:hover{color:var(--green);border-color:var(--green)}
.cl-link{cursor:pointer;color:var(--text2);border-bottom:1px dotted var(--text3);transition:color .15s,border-color .15s;font-size:10px;white-space:nowrap}
.cl-link:hover{color:var(--blue);border-color:var(--blue)}

.empty-state{text-align:center;padding:60px 20px;color:var(--text3);font-family:var(--mono);font-size:11px}
.empty-state div{margin-top:8px;font-size:9px;letter-spacing:1px}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}

/* ── PROFILE PANEL (shared by player + clan) ── */
.profile-overlay{position:absolute;inset:0;background:rgba(6,8,12,.7);backdrop-filter:blur(3px);z-index:20;display:none;align-items:flex-start;justify-content:flex-end}
.profile-overlay.open{display:flex}
.profile-panel{width:480px;height:100%;background:var(--bg2);border-left:1px solid var(--border2);display:flex;flex-direction:column;overflow:hidden;animation:slideIn .18s ease}
@keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}

/* header */
.ph{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0;gap:12px}
.ph-left{display:flex;flex-direction:column;gap:3px;min-width:0}
.ph-badge{font-size:8px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:4px}
.ph-badge.player{color:var(--green);border:1px solid var(--green-dim);display:inline-block;padding:1px 6px;border-radius:2px}
.ph-badge.clan{color:var(--blue);border:1px solid #1a3a5a;display:inline-block;padding:1px 6px;border-radius:2px}
.ph-name{font-family:var(--mono);font-size:16px;color:var(--text);letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ph-sub{font-size:10px;color:var(--text3);margin-top:2px;cursor:pointer;transition:color .15s}
.ph-sub:hover{color:var(--blue)}
.ph-close{background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:0 4px;line-height:1;transition:color .15s;flex-shrink:0}
.ph-close:hover{color:var(--text)}

/* kd grid */
.pk-grid{display:grid;gap:0;border-bottom:1px solid var(--border);flex-shrink:0}
.pk-grid.cols4{grid-template-columns:repeat(4,1fr)}
.pk-grid.cols5{grid-template-columns:repeat(5,1fr)}
.pk-cell{padding:12px 10px;border-right:1px solid var(--border);text-align:center}
.pk-cell:last-child{border-right:none}
.pk-cell-label{font-size:8px;letter-spacing:1.5px;color:var(--text3);text-transform:uppercase;margin-bottom:6px}
.pk-cell-val{font-family:var(--mono);font-size:17px;color:var(--text)}
.pk-cell-val.green{color:var(--green)}.pk-cell-val.red{color:var(--red)}.pk-cell-val.amber{color:var(--amber)}.pk-cell-val.blue{color:var(--blue)}

/* body */
.pb{flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:16px}
.ps-title{font-size:9px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between}
.ps-title span{color:var(--text2);font-family:var(--mono)}
.plist{display:flex;flex-direction:column;gap:2px}
.pli{display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:3px;cursor:pointer;transition:background .1s}
.pli:hover{background:var(--bg3)}
.pli-left{display:flex;align-items:baseline;gap:6px;min-width:0}
.pli-name{color:var(--text);font-family:var(--mono);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pli-name:hover{color:var(--green)}
.pli-clan-tag{color:var(--text3);font-size:9px;white-space:nowrap}
.pli-clan-tag:hover{color:var(--blue)}
.pli-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.pli-bar-wrap{width:60px;height:3px;background:var(--bg3);border-radius:2px;overflow:hidden}
.pli-bar{height:100%;border-radius:2px;transition:width .3s}
.pli-bar.kills{background:var(--red)}
.pli-bar.deaths{background:var(--green)}
.pli-bar.ganks{background:var(--amber)}
.pli-count{font-family:var(--mono);font-size:10px;min-width:28px;text-align:right;color:var(--text2)}
.empty-p{color:var(--text3);font-family:var(--mono);font-size:11px;padding:10px 8px}
</style>
</head>
<body>
<div class="app">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-top">
      <div class="brand"><h1>Nexus Analytics</h1><span>scan mode</span></div>
      <div class="divider"></div>
      <div class="field">
        <div class="label">Date Range</div>
        <div class="row2">
          <div class="field"><div class="label" style="font-size:8px">From</div><input type="date" id="dateFrom"/></div>
          <div class="field"><div class="label" style="font-size:8px">To</div><input type="date" id="dateTo"/></div>
        </div>
      </div>
      <div class="field">
        <div class="label">Search (player or clan)</div>
        <input type="text" id="searchInput" placeholder="player or clan"/>
      </div>
      <div class="field">
        <div class="label">Page Pattern</div>
        <input type="text" id="patternInput" value="https://www.riseofagon.com/agonmetrics/pvp/global/ganks/{page}/"/>
        <div class="row2" style="margin-top:6px">
          <input type="number" id="pageFrom" value="1" min="1" placeholder="from"/>
          <input type="number" id="pageTo" value="3000" min="1" placeholder="to"/>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-scan" id="scanBtn" onclick="toggleScan()">Scan</button>
        <button class="btn btn-clear" onclick="clearAll()">Clear</button>
      </div>
      <div class="progress-wrap">
        <div class="progress-track"><div class="progress-bar" id="progressBar"></div></div>
        <div class="progress-label" id="progressLabel"></div>
      </div>
      <div class="field">
        <div class="label">Scan Log</div>
        <div class="log-wrap" id="logBox"><div class="log-line">no activity</div></div>
      </div>
    </div>
    <div class="sidebar-bottom">
      <button class="btn-export" id="exportBtn" onclick="exportCSV()" disabled>Export Summary (CSV)</button>
    </div>
  </div>

  <!-- MAIN -->
  <div class="main">
    <div class="console-wrap">
      <div class="console-header">
        <div class="dot d-r"></div><div class="dot d-a"></div><div class="dot d-g"></div>
        <span class="console-title">Console</span>
      </div>
      <div class="console-body" id="consoleBody">
        <div class="cl g">[ Nexus Analytics Engine v1.6 ]</div>
        <div class="cl dim">--------------------------------------</div>
        <div class="cl">Status: idle</div>
      </div>
    </div>

    <div class="stats-bar">
      <div class="stat"><div class="stat-label">Ganks</div><div class="stat-val" id="s-ganks">0</div></div>
      <div class="stat"><div class="stat-label">Kills</div><div class="stat-val" id="s-kills">0</div></div>
      <div class="stat"><div class="stat-label">Players</div><div class="stat-val" id="s-players">0</div></div>
      <div class="stat"><div class="stat-label">Killers</div><div class="stat-val" id="s-killers">0</div></div>
      <div class="stat"><div class="stat-label">Clans</div><div class="stat-val" id="s-clans">0</div></div>
    </div>

    <div class="table-area">
      <div class="table-toolbar">
        <input type="text" id="tableFilter" placeholder="Filter rows by player, clan..." oninput="renderTable()"/>
        <span class="row-count" id="rowCount">0 rows</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Time</th><th>Type</th><th>Player</th><th>Clan</th>
            <th>Victim</th><th>Clan</th>
          </tr></thead>
          <tbody id="tableBody">
            <tr><td colspan="6"><div class="empty-state">no rows<div>run a scan to load data</div></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Profile overlay (player + clan share this panel) -->
    <div class="profile-overlay" id="profileOverlay" onclick="overlayClick(event)">
      <div class="profile-panel" id="profilePanel">
        <div class="ph">
          <div class="ph-left">
            <div class="ph-badge" id="ph-badge">Player</div>
            <div class="ph-name" id="ph-name"></div>
            <div class="ph-sub" id="ph-sub" onclick="phSubClick()"></div>
          </div>
          <button class="ph-close" onclick="closeProfile()">✕</button>
        </div>
        <div class="pk-grid" id="pk-grid"></div>
        <div class="pb" id="pb"></div>
      </div>
    </div>

  </div>
</div>

<script>
let allRows=[], scanning=false, currentScanId=null, currentES=null;
let stats={ganks:0,kills:0,players:new Set(),killers:new Set(),clans:new Set()};
let phSubTarget=null; // for clicking clan name on player profile

function todayStr(){return new Date().toISOString().split("T")[0]}
document.getElementById("dateTo").value=todayStr();
document.getElementById("dateFrom").value=todayStr();

// ── CONSOLE / LOG ────────────────────────────────────────────────
function clog(msg,cls=""){
  const b=document.getElementById("consoleBody");
  const d=document.createElement("div");d.className="cl "+cls;d.textContent=msg;
  b.appendChild(d);b.scrollTop=b.scrollHeight;
}
function slog(msg,cls=""){
  const b=document.getElementById("logBox");
  if(b.textContent.trim()==="no activity")b.innerHTML="";
  const d=document.createElement("div");d.className="log-line "+cls;d.textContent=msg;
  b.appendChild(d);b.scrollTop=b.scrollHeight;
}

// ── STATS UI ────────────────────────────────────────────────────
function updateStatsUI(){
  ["ganks","kills","players","killers","clans"].forEach(k=>{
    const el=document.getElementById("s-"+k);
    el.textContent=(stats[k] instanceof Set?stats[k].size:stats[k]);
    el.classList.add("active");setTimeout(()=>el.classList.remove("active"),600);
  });
}

// ── HTML ESCAPE ─────────────────────────────────────────────────
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function unesc(s){const d=document.createElement("div");d.innerHTML=s;return d.textContent}

// ── TABLE ───────────────────────────────────────────────────────
function renderTable(){
  const f=document.getElementById("tableFilter").value.toLowerCase();
  const rows=f?allRows.filter(r=>[r.actor,r.actorClan,r.target,r.targetClan].some(v=>v&&v.toLowerCase().includes(f))):allRows;
  document.getElementById("rowCount").textContent=rows.length.toLocaleString()+" rows";
  const tbody=document.getElementById("tableBody");
  if(!rows.length){
    tbody.innerHTML='<tr><td colspan="6"><div class="empty-state">no rows<div>no matching data</div></div></td></tr>';
    return;
  }
  tbody.innerHTML=rows.slice(0,5000).map(r=>{
    const tc=r.type==="gank"?"t-gank":r.type==="clanmate"?"t-clanmate":r.type==="kill"?"t-kill":r.type==="death"?"t-death":"t-event";
    const tl=r.type==="clanmate"?"Killer":r.type;
    const ac=esc(r.actorClan), vc=esc(r.targetClan);
    const an=esc(r.actor), vn=esc(r.target);
    return '<tr>'
      +'<td>'+esc(r.time)+'</td>'
      +'<td><span class="type-pill '+tc+'">'+tl+'</span></td>'
      +'<td class="td-name"><span class="pl" data-player="'+an+'">'+an+'</span></td>'
      +'<td>'+(ac?'<span class="cl-link" data-clan="'+ac+'">'+ac+'</span>':'-')+'</td>'
      +'<td class="td-name"><span class="pl" data-player="'+vn+'">'+vn+'</span></td>'
      +'<td>'+(vc?'<span class="cl-link" data-clan="'+vc+'">'+vc+'</span>':'-')+'</td>'
      +'</tr>';
  }).join("");
}

// ── TABLE CLICK DELEGATION ───────────────────────────────────────
document.getElementById("tableBody").addEventListener("click",function(e){
  const pl=e.target.closest(".pl");
  if(pl){openPlayerProfile(unesc(pl.dataset.player));return;}
  const cl=e.target.closest(".cl-link");
  if(cl){openClanProfile(unesc(cl.dataset.clan));return;}
});

// ── PROFILE PANEL ───────────────────────────────────────────────
function closeProfile(){document.getElementById("profileOverlay").classList.remove("open");}
function overlayClick(e){if(e.target===document.getElementById("profileOverlay"))closeProfile();}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeProfile();});
function phSubClick(){if(phSubTarget)openClanProfile(phSubTarget);}

function showProfile(){document.getElementById("profileOverlay").classList.add("open");}

// Render the stat grid
function renderGrid(cols,stats){
  const g=document.getElementById("pk-grid");
  g.className="pk-grid cols"+cols;
  g.innerHTML=stats.map(s=>'<div class="pk-cell"><div class="pk-cell-label">'+s.label+'</div><div class="pk-cell-val '+( s.cls||"")+'">'+s.val+'</div></div>').join("");
}

// Render a list section into the profile body
function renderSection(title,count,items,barClass,onNameClick,onTagClick){
  const sec=document.createElement("div");
  const maxCount=items.length?items[0].count:1;
  sec.innerHTML='<div class="ps-title">'+esc(title)+' <span>'+count+' unique</span></div>'
    +'<div class="plist" id="plist-'+barClass+'"></div>';
  const list=sec.querySelector(".plist");
  if(!items.length){
    list.innerHTML='<div class="empty-p">none in this scan</div>';
  } else {
    list.innerHTML=items.slice(0,50).map(i=>{
      const pct=Math.round((i.count/maxCount)*100);
      const nameHtml=onNameClick
        ?'<span class="pli-name" data-pname="'+esc(i.name)+'">'+esc(i.name)+'</span>'
        :'<span class="pli-name">'+esc(i.name)+'</span>';
      const tagHtml=i.clan&&onTagClick
        ?'<span class="pli-clan-tag" data-pctag="'+esc(i.clan)+'">'+esc(i.clan)+'</span>'
        :(i.clan?'<span class="pli-clan-tag">'+esc(i.clan)+'</span>':'');
      const memberHtml=i.members!==undefined
        ?'<span class="pli-clan-tag">'+i.members+' mbr</span>'
        :'';
      return '<div class="pli">'
        +'<div class="pli-left">'+nameHtml+(tagHtml||memberHtml)+'</div>'
        +'<div class="pli-right">'
        +'<div class="pli-bar-wrap"><div class="pli-bar '+barClass+'" style="width:'+pct+'%"></div></div>'
        +'<span class="pli-count">'+i.count+'x</span>'
        +'</div></div>';
    }).join("");
    // click delegation
    list.addEventListener("click",function(e){
      const pn=e.target.closest("[data-pname]");
      if(pn&&onNameClick){onNameClick(unesc(pn.dataset.pname));return;}
      const pt=e.target.closest("[data-pctag]");
      if(pt&&onTagClick){onTagClick(unesc(pt.dataset.pctag));return;}
    });
  }
  return sec;
}

// ── OPEN PLAYER PROFILE ─────────────────────────────────────────
function openPlayerProfile(name){
  const kills=allRows.filter(r=>r.actor===name);
  const deaths=allRows.filter(r=>r.target===name);

  // Most common clan
  const cc={};
  [...kills.map(r=>r.actorClan),...deaths.map(r=>r.targetClan)].filter(Boolean)
    .forEach(c=>{cc[c]=(cc[c]||0)+1;});
  const clan=Object.entries(cc).sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
  const days=new Set([...kills.map(r=>r.date),...deaths.map(r=>r.date)]).size;
  const kd=deaths.length===0?(kills.length>0?"∞":"—"):(kills.length/deaths.length).toFixed(2);

  // Who they killed
  const km={};
  kills.forEach(r=>{if(!km[r.target])km[r.target]={name:r.target,clan:r.targetClan,count:0};km[r.target].count++;});
  const killedList=Object.values(km).sort((a,b)=>b.count-a.count);

  // Who killed them
  const dm={};
  deaths.forEach(r=>{if(!dm[r.actor])dm[r.actor]={name:r.actor,clan:r.actorClan,count:0};dm[r.actor].count++;});
  const killedByList=Object.values(dm).sort((a,b)=>b.count-a.count);

  // Header
  document.getElementById("ph-badge").textContent="Player";
  document.getElementById("ph-badge").className="ph-badge player";
  document.getElementById("ph-name").textContent=name;
  const sub=document.getElementById("ph-sub");
  if(clan){sub.textContent=clan;sub.style.display="";phSubTarget=clan;}
  else{sub.textContent="";sub.style.display="none";phSubTarget=null;}

  // Stats grid
  renderGrid(4,[
    {label:"Kills",val:kills.length,cls:"red"},
    {label:"Deaths",val:deaths.length,cls:"green"},
    {label:"K/D",val:kd,cls:"amber"},
    {label:"Active Days",val:days,cls:""},
  ]);

  // Body
  const pb=document.getElementById("pb");
  pb.innerHTML="";
  pb.appendChild(renderSection("Killed",killedList.length,killedList,"kills",
    n=>openPlayerProfile(n), c=>openClanProfile(c)));
  pb.appendChild(renderSection("Killed By",killedByList.length,killedByList,"deaths",
    n=>openPlayerProfile(n), c=>openClanProfile(c)));

  showProfile();
}

// ── OPEN CLAN PROFILE ───────────────────────────────────────────
function openClanProfile(clanName){
  // All rows where this clan appears
  const asKiller=allRows.filter(r=>r.actorClan===clanName);
  const asVictim=allRows.filter(r=>r.targetClan===clanName);

  // Members (unique players in this clan)
  const members=new Set([...asKiller.map(r=>r.actor),...asVictim.map(r=>r.target)]);
  const days=new Set([...asKiller.map(r=>r.date),...asVictim.map(r=>r.date)]).size;
  const kd=asVictim.size===0?(asKiller.length>0?"∞":"—"):(asKiller.length/asVictim.length).toFixed(2);

  // Top killers in clan
  const km={};
  asKiller.forEach(r=>{if(!km[r.actor])km[r.actor]={name:r.actor,clan:"",count:0};km[r.actor].count++;});
  const topKillers=Object.values(km).sort((a,b)=>b.count-a.count);

  // Enemy clans killed
  const ekm={};
  asKiller.forEach(r=>{
    if(!r.targetClan)return;
    if(!ekm[r.targetClan])ekm[r.targetClan]={name:r.targetClan,clan:"",count:0};
    ekm[r.targetClan].count++;
  });
  const enemyKilled=Object.values(ekm).sort((a,b)=>b.count-a.count);

  // Clans that killed this clan
  const dkm={};
  asVictim.forEach(r=>{
    if(!r.actorClan)return;
    if(!dkm[r.actorClan])dkm[r.actorClan]={name:r.actorClan,clan:"",count:0};
    dkm[r.actorClan].count++;
  });
  const clansKilledBy=Object.values(dkm).sort((a,b)=>b.count-a.count);

  // Header
  document.getElementById("ph-badge").textContent="Clan";
  document.getElementById("ph-badge").className="ph-badge clan";
  document.getElementById("ph-name").textContent=clanName;
  const sub=document.getElementById("ph-sub");
  sub.textContent=members.size+" members";
  sub.style.display="";
  phSubTarget=null; // clicking sub on clan does nothing

  // Stats grid
  renderGrid(5,[
    {label:"Kills",val:asKiller.length,cls:"red"},
    {label:"Deaths",val:asVictim.length,cls:"green"},
    {label:"K/D",val:kd,cls:"amber"},
    {label:"Members",val:members.size,cls:"blue"},
    {label:"Active Days",val:days,cls:""},
  ]);

  // Body
  const pb=document.getElementById("pb");
  pb.innerHTML="";
  pb.appendChild(renderSection("Top Killers",topKillers.length,topKillers,"kills",
    n=>openPlayerProfile(n), null));
  pb.appendChild(renderSection("Enemies Killed",enemyKilled.length,enemyKilled,"ganks",
    c=>openClanProfile(c), null));
  pb.appendChild(renderSection("Killed By (Clans)",clansKilledBy.length,clansKilledBy,"deaths",
    c=>openClanProfile(c), null));

  showProfile();
}

// ── SCAN ────────────────────────────────────────────────────────
function toggleScan(){scanning?stopScan():startScan();}
function startScan(){
  const dateFrom=document.getElementById("dateFrom").value;
  const dateTo=document.getElementById("dateTo").value;
  const filter=document.getElementById("searchInput").value;
  const pattern=document.getElementById("patternInput").value;
  const pageFrom=document.getElementById("pageFrom").value;
  const pageTo=document.getElementById("pageTo").value;
  if(!dateFrom||!dateTo){alert("Please select both dates.");return;}
  if(dateFrom>dateTo){alert("From date must be before or equal to To date.");return;}
  scanning=true;allRows=[];
  stats={ganks:0,kills:0,players:new Set(),killers:new Set(),clans:new Set()};
  document.getElementById("scanBtn").textContent="Stop";
  document.getElementById("scanBtn").classList.add("scanning");
  document.getElementById("exportBtn").disabled=true;
  document.getElementById("consoleBody").innerHTML="";
  document.getElementById("logBox").innerHTML="";
  document.getElementById("progressBar").style.width="0%";
  closeProfile();
  renderTable();
  currentScanId=Date.now().toString();
  clog("[ Nexus Analytics Engine v1.6 ]","g");
  clog("--------------------------------------","dim");
  clog("Pattern : "+pattern);
  clog("Pages   : "+pageFrom+" – "+pageTo);
  clog("Dates   : "+dateFrom+" to "+dateTo);
  clog("Filter  : "+(filter||"none"));
  clog("");clog("Scanning...","a");clog("");
  const params=new URLSearchParams({dateFrom,dateTo,filter,pageFrom,pageTo,pattern,scanId:currentScanId});
  currentES=new EventSource("/api/scan?"+params);
  currentES.onmessage=(e)=>{
    const msg=JSON.parse(e.data);
    if(msg.type==="page"){
      const pct=Math.round(((msg.page-parseInt(pageFrom))/(parseInt(pageTo)-parseInt(pageFrom)+1))*100);
      document.getElementById("progressBar").style.width=Math.min(pct,99)+"%";
      document.getElementById("progressLabel").textContent="Page "+msg.page+" / "+msg.total;
      slog("Page "+msg.page+"...");
    } else if(msg.type==="rows"){
      allRows.push(...msg.rows);
      stats.ganks=allRows.length;
      stats.kills=allRows.filter(r=>r.type!=="clanmate").length;
      msg.rows.forEach(r=>{
        if(r.actor)stats.players.add(r.actor);
        if(r.target)stats.players.add(r.target);
        if(r.actor)stats.killers.add(r.actor);
        if(r.actorClan)stats.clans.add(r.actorClan);
        if(r.targetClan)stats.clans.add(r.targetClan);
      });
      updateStatsUI();renderTable();
      clog("  Page "+msg.page+": "+msg.pageRows+" row"+(msg.pageRows!==1?"s":"")+" found","g");
      slog("  +"+msg.pageRows+" rows","ok");
    } else if(msg.type==="empty"){
      clog("  Page "+msg.page+": (empty)","dim");
    } else if(msg.type==="error"){
      clog("  Page "+msg.page+": error — "+msg.message,"r");
      slog("  Error p"+msg.page,"err");
    } else if(msg.type==="pastDate"){
      clog("  Page "+msg.page+": past date range — stopping","a");
    } else if(msg.type==="stopEmpty"){
      clog("  Too many empty pages — stopping","a");
    } else if(msg.type==="aborted"){
      clog("  Scan aborted.","a");
      if(currentES){currentES.close();currentES=null;}
      finishScan();
    } else if(msg.type==="complete"){
      clog("");clog("--------------------------------------","dim");
      clog("[ ANALYSIS COMPLETE ]","g");
      clog("--------------------------------------","dim");
      clog("Total Rows     : "+msg.total);
      clog("Total Kills    : "+msg.kills);
      clog("Unique Players : "+msg.players);
      clog("Unique Killers : "+msg.killers);
      clog("Unique Victims : "+msg.victims);
      clog("Unique Clans   : "+msg.clans);
      clog("Status: complete","g");
      document.getElementById("progressBar").style.width="100%";
      document.getElementById("progressLabel").textContent="Complete";
      if(allRows.length>0)document.getElementById("exportBtn").disabled=false;
      if(currentES){currentES.close();currentES=null;}
      finishScan();
    }
  };
  currentES.onerror=()=>{if(scanning){clog("  Connection error.","r");finishScan();}};
}
function stopScan(){
  if(currentScanId)fetch("/api/stop",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scanId:currentScanId})});
  if(currentES){currentES.close();currentES=null;}
  finishScan();
}
function finishScan(){
  scanning=false;currentScanId=null;
  document.getElementById("scanBtn").textContent="Scan";
  document.getElementById("scanBtn").classList.remove("scanning");
}
function clearAll(){
  stopScan();allRows=[];
  stats={ganks:0,kills:0,players:new Set(),killers:new Set(),clans:new Set()};
  document.getElementById("consoleBody").innerHTML='<div class="cl g">[ Nexus Analytics Engine v1.6 ]</div><div class="cl dim">--------------------------------------</div><div class="cl">Status: idle</div>';
  document.getElementById("logBox").innerHTML='<div class="log-line">no activity</div>';
  document.getElementById("progressBar").style.width="0%";
  document.getElementById("progressLabel").textContent="";
  document.getElementById("exportBtn").disabled=true;
  ["ganks","kills","players","killers","clans"].forEach(k=>document.getElementById("s-"+k).textContent="0");
  closeProfile();
  renderTable();
}
function exportCSV(){
  const dateFrom=document.getElementById("dateFrom").value;
  const dateTo=document.getElementById("dateTo").value;
  const label=dateFrom===dateTo?dateFrom:dateFrom+"_to_"+dateTo;
  fetch("/api/export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:allRows,label})})
    .then(r=>r.blob()).then(blob=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="nexus-ganks-"+label+".csv";a.click();});
}
</script>
</body>
</html>`;


// ── HTTP SERVER ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/scan") {
    const dateFrom  = url.searchParams.get("dateFrom") || "";
    const dateTo    = url.searchParams.get("dateTo")   || dateFrom;
    const filter    = (url.searchParams.get("filter") || "").toLowerCase();
    const pageFrom  = parseInt(url.searchParams.get("pageFrom")) || 1;
    const pageTo    = parseInt(url.searchParams.get("pageTo"))   || 3000;
    const pattern   = url.searchParams.get("pattern") || "https://www.riseofagon.com/agonmetrics/pvp/global/ganks/{page}/";
    const scanId    = url.searchParams.get("scanId") || "default";

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const send = (type, data) => {
      try { res.write("data: " + JSON.stringify({ type, ...data }) + "\n\n"); } catch (_) {}
    };

    activeScans.set(scanId, { abort: false });

    const allRows = [];
    let dataFound = false, consecutiveEmpty = 0;
    const STOP_EMPTY = 40;

    for (let page = pageFrom; page <= pageTo; page++) {
      const scan = activeScans.get(scanId);
      if (!scan || scan.abort) { send("aborted", { page }); break; }
      send("page", { page, total: pageTo });
      try {
        const pageUrl = pattern.replace("{page}", String(page));
        const html = await fetchPage(pageUrl);
        const { rows, foundInRange, foundEarlier } = parsePage(html, dateFrom, dateTo, page);
        if (rows.length > 0) {
          dataFound = true; consecutiveEmpty = 0;
          const filtered = filter
            ? rows.filter(r => [r.actor, r.actorClan, r.target, r.targetClan].some(v => v && v.toLowerCase().includes(filter)))
            : rows;
          allRows.push(...filtered);
          send("rows", { rows: filtered, pageRows: rows.length, filteredRows: filtered.length, page });
        } else if (foundEarlier && !foundInRange && dataFound) {
          send("pastDate", { page }); break;
        } else {
          consecutiveEmpty++;
          send("empty", { page });
          if (dataFound && consecutiveEmpty >= STOP_EMPTY) { send("stopEmpty", { page }); break; }
        }
      } catch (err) {
        consecutiveEmpty++;
        send("error", { page, message: err.message });
      }
      await sleep(400);
    }

    const kills   = allRows.filter(r => r.type === "kill").length;
    const players = new Set([...allRows.map(r => r.actor), ...allRows.map(r => r.target)]).size;
    const killers = new Set(allRows.map(r => r.actor)).size;
    const victims = new Set(allRows.map(r => r.target)).size;
    const clans   = new Set([...allRows.map(r => r.actorClan), ...allRows.map(r => r.targetClan)].filter(Boolean)).size;
    send("complete", { total: allRows.length, kills, players, killers, victims, clans });
    activeScans.delete(scanId);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stop") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try { const { scanId } = JSON.parse(body); const s = activeScans.get(scanId); if (s) s.abort = true; } catch (_) {}
      res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/export") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { rows, label } = JSON.parse(body);
        const header = "Date,Time,Type,Player,Player Clan,Victim,Victim Clan\n";
        const csv = header + rows.map(r =>
          [r.date, r.time, r.type === "clanmate" ? "Killer" : r.type, r.actor, r.actorClan, r.target, r.targetClan]
            .map(v => `"${String(v || "").replace(/"/g, '""')}"`)
            .join(",")
        ).join("\n");
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="nexus-ganks-${label}.csv"`,
        });
        res.end(csv);
      } catch (e) {
        res.writeHead(500); res.end("error");
      }
    });
    return;
  }

  res.writeHead(404); res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log("\n  ╔════════════════════════════════════════╗");
  console.log(`  ║  Nexus Analytics  →  ${url}  ║`);
  console.log("  ╚════════════════════════════════════════╝");
  console.log("\n  Browser opening automatically...");
  console.log("  Press Ctrl+C to quit.\n");
  setTimeout(() => openBrowser(url), 800);
});
