// ═══ Pi-hole Manager - Renderer ═══
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.join(__dirname, '..'), 'config.json');

let config = {};
let servers = [];
let current = 0;
let timers = [];
let queryData = [];
let advOpen = false;

function loadConfig() {
  try { if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch(e) {}
  return { servers: [], refresh_interval: 5, query_log_refresh: 3 };
}
function saveConfigFile(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch(e) { alert('Errore salvataggio: ' + e.message); }
}

// ═══ THEME ═══
function setTheme(name) {
  document.body.className = 'theme-' + name;
  config.theme = name;
  saveConfigFile(config);
  // update theme selector
  const sel = document.getElementById('themeSelect');
  if (sel) sel.value = name;
}

function loadTheme() {
  const theme = config.theme || 'default-darker';
  document.body.className = 'theme-' + theme;
  const sel = document.getElementById('themeSelect');
  if (sel) sel.value = theme;
}

// ═══ INIT ═══
config = loadConfig();
loadTheme();
const srv = config.servers || [];
if (srv.length < 2 || !srv[0].host || !srv[1].host) { setTimeout(showSettings, 100); }
else { initServers(); }

function initServers() {
  const srv = config.servers || [];
  servers = srv.map(s => new PiHoleAPI({ host: s.host, port: s.port || 80, password: s.password || '', useHttps: s.use_https || false }));

  // populate selector
  const sel = document.getElementById('serverSelect');
  sel.innerHTML = '';
  srv.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.name || `Server ${i+1}`; sel.appendChild(o); });
  sel.onchange = () => { current = +sel.value; fetchAll(); };

  // login & start
  servers.forEach(s => s.login());
  startPolling();
  fetchAll();
}

// ═══ NAVIGATION ═══
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.page) return;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + btn.dataset.page);
    if (page) page.classList.add('active');
    // auto-fetch log when navigating to logs page
    if (btn.dataset.page === 'logs') fetchPiholeLogs();
  });
});

function toggleAdvanced() {
  advOpen = !advOpen;
  document.getElementById('advSection').classList.toggle('show', advOpen);
  document.getElementById('advToggle').innerHTML = (advOpen ? '&#9660;' : '&#9654;') + ' Avanzate';
}

// ═══ POLLING ═══
function startPolling() {
  timers.forEach(clearInterval);
  timers = [];
  const ri = (config.refresh_interval || 5) * 1000;
  const qi = (config.query_log_refresh || 3) * 1000;
  timers.push(setInterval(fetchDashboard, ri));
  timers.push(setInterval(fetchQueryLog, qi));
  timers.push(setInterval(fetchStats, 15000));
}

function api() { return servers[current]; }

async function fetchAll() {
  fetchDashboard(); fetchQueryLog(); fetchStats(); fetchAdvanced();
}

async function fetchDashboard() {
  if (!api()) return;
  const [summary, blocking, history, version] = await Promise.all([
    api().getSummary(), api().getBlocking(), api().getHistory(), api().getVersion()
  ]);
  if (!summary.error) renderSummary(summary);
  if (!blocking.error) renderBlocking(blocking);
  if (!history.error) renderChart(history);
  if (!version.error) renderVersion(version);
}

async function fetchQueryLog() {
  if (!api()) return;
  const data = await api().getQueries(200);
  if (!data.error) { queryData = data.queries || []; renderQueries(); }
}

async function fetchStats() {
  if (!api()) return;
  const [td, tb, tc, up] = await Promise.all([
    api().getTopDomains(25, false), api().getTopDomains(25, true),
    api().getTopClients(15), api().getUpstreams()
  ]);
  if (!td.error) renderDomainTable('topDomainsBody', td.domains || [], 'text-green');
  if (!tb.error) renderDomainTable('topBlockedBody', tb.domains || [], 'text-red');
  if (!tc.error) renderClientsTable(tc.clients || []);
  if (!up.error) renderUpstreams(up.upstreams || []);
}

async function fetchAdvanced() {
  if (!api()) return;
  const [lists, groups, cfg, domains] = await Promise.all([
    api().getLists(), api().getGroups(), api().getConfig(), api().getDomains()
  ]);
  if (!lists.error) renderAdlists(lists.lists || []);
  if (!groups.error) renderGroups(groups.groups || []);
  if (!cfg.error) renderDnsConfig(cfg.config?.dns || {});
  if (!domains.error) renderDomainLists(domains.domains || []);
}

// ═══ RENDER: Dashboard ═══
function fmt(n) { return Number(n||0).toLocaleString('it-IT'); }

function renderSummary(d) {
  const q = d.queries || {}; const c = d.clients || {}; const g = d.gravity || {};
  document.getElementById('cardTotal').textContent = fmt(q.total);
  document.getElementById('cardBlocked').textContent = fmt(q.blocked);
  document.getElementById('cardPercent').textContent = (q.percent_blocked||0).toFixed(1) + '%';
  document.getElementById('cardDomains').textContent = fmt(g.domains_being_blocked);
  document.getElementById('cardClients').textContent = fmt(c.active);
  document.getElementById('cardUnique').textContent = fmt(q.unique_domains);
  document.getElementById('cardForwarded').textContent = fmt(q.forwarded);
  document.getElementById('cardCached').textContent = fmt(q.cached);
}

function renderBlocking(d) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const st = document.getElementById('blockingStatus');
  if (d.blocking === 'enabled') {
    dot.className = 'status-dot online'; txt.textContent = 'Pi-hole Attivo'; txt.style.color = 'var(--green)';
    if (st) { st.textContent = 'Stato: BLOCCO ATTIVO'; st.style.color = 'var(--green)'; }
  } else {
    dot.className = 'status-dot disabled'; txt.textContent = 'Pi-hole Disabilitato'; txt.style.color = 'var(--red)';
    if (st) { st.textContent = 'Stato: BLOCCO DISABILITATO'; st.style.color = 'var(--red)'; }
  }
}

function renderVersion(d) {
  const v = d.version || {};
  const c = v.core?.local?.version || '?';
  const w = v.web?.local?.version || '?';
  const f = v.ftl?.local?.version || '?';
  document.getElementById('statusVersion').textContent = `Core ${c} | Web ${w} | FTL ${f}`;
}

// ═══ RENDER: Chart ═══
function renderChart(d) {
  const canvas = document.getElementById('chartCanvas');
  const ctx = canvas.getContext('2d');
  const hist = d.history || [];
  if (!hist.length) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);

  const totals = hist.map(h => h.total || 0);
  const blocked = hist.map(h => h.blocked || 0);
  const maxVal = Math.max(...totals, 1);
  const barW = Math.max(1, (W - 60) / hist.length - 1);
  const chartH = H - 30;

  // grid
  ctx.strokeStyle = '#1e2530'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) { const y = 10 + (chartH / 4) * i; ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(W, y); ctx.stroke(); }

  // bars
  hist.forEach((h, i) => {
    const x = 50 + i * (barW + 1);
    const ht = (h.total / maxVal) * chartH;
    const hb = (h.blocked / maxVal) * chartH;
    ctx.fillStyle = 'rgba(129,161,193,0.6)';
    ctx.fillRect(x, 10 + chartH - ht, barW, ht);
    ctx.fillStyle = 'rgba(191,97,106,0.7)';
    ctx.fillRect(x, 10 + chartH - hb, barW, hb);
  });

  // labels
  ctx.fillStyle = '#6e7a8a'; ctx.font = '10px Segoe UI';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) { const v = Math.round(maxVal * (4-i) / 4); ctx.fillText(v.toLocaleString(), 45, 14 + (chartH/4)*i); }
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(hist.length / 12));
  for (let i = 0; i < hist.length; i += step) {
    const d = new Date(hist[i].timestamp * 1000);
    const x = 50 + i * (barW + 1) + barW/2;
    ctx.fillText(d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0'), x, H - 4);
  }
}

// ═══ RENDER: Queries ═══
const BLOCKED = new Set(['GRAVITY','REGEX','DENYLIST','EXTERNAL_BLOCKED_IP','EXTERNAL_BLOCKED_NULL','EXTERNAL_BLOCKED_NXRA','GRAVITY_CNAME','REGEX_CNAME','DENYLIST_CNAME']);

function renderQueries() {
  const search = document.getElementById('qSearch').value.toLowerCase();
  const statusF = document.getElementById('qStatus').value;
  const typeF = document.getElementById('qType').value;
  let filtered = queryData.filter(q => {
    if (search && !(q.domain||'').toLowerCase().includes(search) && !(q.client?.name||'').toLowerCase().includes(search) && !(q.client?.ip||'').toLowerCase().includes(search)) return false;
    if (statusF === 'Bloccate' && !BLOCKED.has(q.status)) return false;
    if (statusF === 'Permesse' && BLOCKED.has(q.status)) return false;
    if (typeF !== 'Tutti' && q.type !== typeF) return false;
    return true;
  });
  document.getElementById('qCount').textContent = filtered.length + ' query';
  const body = document.getElementById('queryBody');
  body.innerHTML = filtered.slice(0, 500).map(q => {
    const bl = BLOCKED.has(q.status);
    const cls = bl ? 'text-red' : 'text-green';
    const t = new Date((q.time||0)*1000);
    const time = t.getHours().toString().padStart(2,'0')+':'+t.getMinutes().toString().padStart(2,'0')+':'+t.getSeconds().toString().padStart(2,'0');
    const client = q.client?.name || q.client?.ip || '?';
    const statusLabel = bl ? 'Bloccato' : 'OK';
    return `<tr><td class="text-dim">${time}</td><td class="text-dim">${q.type||'?'}</td><td class="${cls}" title="${q.domain}">${(q.domain||'?').substring(0,55)}</td><td class="text-dim" title="${q.client?.ip||''}">${client.substring(0,25)}</td><td><span class="badge ${bl?'badge-red':'badge-green'}">${statusLabel}</span></td></tr>`;
  }).join('');
}

// ═══ RENDER: Top tables ═══
function renderDomainTable(id, domains, cls) {
  document.getElementById(id).innerHTML = domains.slice(0,25).map((d,i) =>
    `<tr><td class="text-dim">${i+1}</td><td class="${cls}" title="${d.domain}">${(d.domain||'?').substring(0,45)}</td><td class="text-right">${fmt(d.count)}</td></tr>`
  ).join('');
}

function renderClientsTable(clients) {
  document.getElementById('topClientsBody').innerHTML = clients.slice(0,15).map((c,i) =>
    `<tr><td class="text-dim">${i+1}</td><td class="text-accent">${c.name||'-'}</td><td class="text-dim">${c.ip||'?'}</td><td class="text-right">${fmt(c.count)}</td></tr>`
  ).join('');
}

function renderUpstreams(ups) {
  document.getElementById('upstreamsBody').innerHTML = ups.filter(u=>u.count>0).map(u =>
    `<tr><td class="text-accent">${u.name||u.ip||'?'}</td><td class="text-right">${fmt(u.count)}</td></tr>`
  ).join('');
}

// ═══ RENDER: Manage ═══
function renderDomainLists(domains) {
  const allow = domains.filter(d => d.type === 'allow');
  const deny = domains.filter(d => d.type === 'deny');
  document.getElementById('allowList').innerHTML = allow.map(d =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)"><span class="text-green">${d.domain}</span><button class="btn-red btn-sm" onclick="removeDomain('${d.domain}','allow')">X</button></div>`
  ).join('') || '<div class="text-dim" style="padding:8px">Nessun dominio</div>';
  document.getElementById('denyList').innerHTML = deny.map(d =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)"><span class="text-red">${d.domain}</span><button class="btn-red btn-sm" onclick="removeDomain('${d.domain}','deny')">X</button></div>`
  ).join('') || '<div class="text-dim" style="padding:8px">Nessun dominio</div>';
}

// ═══ RENDER: Adlists ═══
function renderAdlists(lists) {
  const statusMap = { 0: 'N/A', 1: 'OK', 2: 'OK', 3: 'Err' };
  document.getElementById('adlistsBody').innerHTML = lists.map(l => {
    const checked = l.enabled ? 'checked' : '';
    const urlCls = l.enabled ? 'text-accent' : 'text-dim';
    const typeCls = l.type === 'block' ? 'text-red' : 'text-green';
    return `<tr>
      <td><label class="toggle"><input type="checkbox" ${checked} onchange="toggleAdlist(${l.id},this.checked)"><span class="slider"></span></label></td>
      <td class="${typeCls}">${l.type}</td>
      <td class="${urlCls}" title="${l.address}" style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.address}</td>
      <td class="text-right text-accent">${fmt(l.number)}</td>
      <td class="${l.status>0?'text-green':'text-dim'}">${statusMap[l.status]||l.status}</td>
      <td><button class="btn-red btn-sm" onclick="removeAdlist(${l.id})">Elimina</button></td>
    </tr>`;
  }).join('');
  const active = lists.filter(l => l.enabled);
  const totalD = active.reduce((s,l) => s + (l.number||0), 0);
  document.getElementById('adlistsCount').textContent = `${lists.length} liste | ${fmt(totalD)} domini attivi`;
}

// ═══ RENDER: DNS Config ═══
function renderDnsConfig(dns) {
  document.getElementById('upstreamEdit').value = (dns.upstreams||[]).join('\n');
  // hosts
  const hosts = dns.hosts || [];
  document.getElementById('hostsBody').innerHTML = hosts.map(h => {
    const parts = h.split(/\s+/); return `<tr><td class="text-dim">${parts[0]||''}</td><td class="text-accent">${parts.slice(1).join(' ')}</td><td><button class="btn-red btn-sm" onclick="removeHost('${h}')">X</button></td></tr>`;
  }).join('');
  // cnames
  const cnames = dns.cnameRecords || [];
  document.getElementById('cnameBody').innerHTML = cnames.map(c => {
    const parts = c.split(','); return `<tr><td class="text-accent">${parts[0]||''}</td><td class="text-dim">${parts[1]||''}</td><td><button class="btn-red btn-sm" onclick="removeCname('${c}')">X</button></td></tr>`;
  }).join('');
  // options
  const opts = [
    ['DNSSEC', dns.dnssec], ['Domain Needed', dns.domainNeeded], ['Bogus Private', dns.bogusPriv],
    ['Query Logging', dns.queryLogging], ['EDNS0 ECS', dns.EDNS0ECS], ['Block ESNI', dns.blockESNI],
  ];
  document.getElementById('dnsOptions').innerHTML = opts.map(([name, val]) =>
    `<label style="display:flex;align-items:center;gap:8px;color:var(--text)"><label class="toggle"><input type="checkbox" ${val?'checked':''} data-dns="${name}"><span class="slider"></span></label>${name}</label>`
  ).join('');
}

// ═══ RENDER: Groups ═══
function renderGroups(groups) {
  document.getElementById('groupsBody').innerHTML = groups.map(g =>
    `<tr><td class="text-dim">${g.id}</td><td class="text-accent">${g.name}</td><td class="text-dim">${g.comment||''}</td><td>${g.id!==0?`<button class="btn-red btn-sm" onclick="removeGroup('${g.name}')">X</button>`:''}</td></tr>`
  ).join('');
}

// ═══ ACTIONS ═══
function logAction(msg) {
  const ts = new Date().toLocaleTimeString();
  ['actionLog','sysLog'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML += `[${ts}] ${msg}\n`;
  });
}

async function doEnable() { if (!confirm('Abilitare il blocco?')) return; logAction('Abilita blocco...'); await api().enableBlocking(); fetchDashboard(); }
async function doDisable(sec) { if (!confirm('Disabilitare il blocco?')) return; logAction('Disabilita blocco...'); await api().disableBlocking(sec||null); fetchDashboard(); }
async function doDisableTimed() { const v = +document.getElementById('disableMins').value; const u = +document.getElementById('disableUnit').value; doDisable(v*u); }
let gravityRunning = false;

async function doGravity() {
  if (gravityRunning) return;
  if (!confirm('Aggiornare le liste (Gravity)?\nPotrebbe richiedere alcuni minuti.')) return;

  gravityRunning = true;
  const btn = document.getElementById('gravityBtn');
  const statusEl = document.getElementById('gravityStatus');

  // Show progress UI on both pages
  ['gravityLog', 'gravityLog2', 'gravityProgress', 'gravityProgress2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'block'; if (el.classList.contains('action-log')) el.innerHTML = ''; }
  });
  ['gravityBar', 'gravityBar2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.width = '5%';
  });

  if (btn) { btn.disabled = true; btn.textContent = 'Aggiornamento in corso...'; }
  if (statusEl) { statusEl.textContent = 'Avvio gravity update...'; statusEl.style.color = 'var(--accent)'; }

  gravLog('Avvio aggiornamento gravity...');
  logAction('Gravity update avviato');

  // Get list count before
  const listsBefore = await api().getLists();
  const countBefore = (listsBefore.lists || []).filter(l => l.enabled).length;
  gravLog(`Liste attive da aggiornare: ${countBefore}`);
  setGravityBar(10);

  // Start gravity
  const r = await api().updateGravity();

  if (r.error) {
    gravLog('ERRORE: ' + r.error);
    if (statusEl) { statusEl.textContent = 'Errore: ' + r.error; statusEl.style.color = 'var(--red)'; }
    logAction('Gravity ERRORE: ' + r.error);
    gravityDone(btn);
    return;
  }

  gravLog('Richiesta inviata al server, scaricamento liste in corso...');
  setGravityBar(20);

  // Poll gravity status
  let attempts = 0;
  const maxAttempts = 60; // max 5 minuti (ogni 5 sec)
  const pollInterval = setInterval(async () => {
    attempts++;
    const progress = Math.min(90, 20 + (attempts / maxAttempts) * 70);
    setGravityBar(progress);

    try {
      const summary = await api().getSummary();
      const gravity = summary.gravity || {};
      const domainsNow = gravity.domains_being_blocked || 0;
      const lastUpdate = gravity.last_update || 0;

      if (attempts % 3 === 0) {
        gravLog(`Controllo stato... (${attempts * 5}s) - Domini: ${domainsNow.toLocaleString('it-IT')}`);
      }

      // Check if gravity finished (last_update changed recently)
      const now = Math.floor(Date.now() / 1000);
      if (lastUpdate > 0 && (now - lastUpdate) < 15 && attempts > 2) {
        clearInterval(pollInterval);
        setGravityBar(100);
        gravLog('------------------------------------------');
        gravLog('Gravity update completato!');
        gravLog(`Domini in blocklist: ${domainsNow.toLocaleString('it-IT')}`);
        gravLog(`Ultimo aggiornamento: ${new Date(lastUpdate * 1000).toLocaleString('it-IT')}`);

        if (statusEl) { statusEl.textContent = `Completato - ${domainsNow.toLocaleString('it-IT')} domini`; statusEl.style.color = 'var(--green)'; }
        logAction(`Gravity completato: ${domainsNow.toLocaleString('it-IT')} domini`);
        gravityDone(btn);
        fetchAdvanced();
        fetchDashboard();
        return;
      }
    } catch (e) {
      gravLog('Errore polling: ' + e.message);
    }

    if (attempts >= maxAttempts) {
      clearInterval(pollInterval);
      gravLog('Timeout - l\'aggiornamento potrebbe essere ancora in corso sul server.');
      if (statusEl) { statusEl.textContent = 'Timeout - controlla sul server'; statusEl.style.color = 'var(--yellow)'; }
      logAction('Gravity timeout');
      gravityDone(btn);
      fetchAdvanced();
    }
  }, 5000);
}

function gravLog(msg) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}\n`;
  ['gravityLog', 'gravityLog2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML += line; el.scrollTop = el.scrollHeight; }
  });
}

function setGravityBar(pct) {
  ['gravityBar', 'gravityBar2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.width = pct + '%';
  });
}

function gravityDone(btn) {
  gravityRunning = false;
  if (btn) { btn.disabled = false; btn.textContent = 'Aggiorna Liste'; }
}
async function doRestartDns() {
  if (!confirm('Riavviare DNS?')) return;
  logAction('Restart DNS in corso...');
  const r = await api().restartDns();
  if (r.error) { logAction('DNS restart ERRORE: ' + r.error); }
  else { logAction('DNS riavviato con successo'); }
}

async function doFlush() {
  if (!confirm('Cancellare TUTTI i log delle query?')) return;
  logAction('Flush log in corso...');
  const r = await api().flushLogs();
  if (r.error) { logAction('Flush ERRORE: ' + r.error); }
  else { logAction('Log cancellati con successo'); }
}

async function addAllow() { const d = document.getElementById('allowInput').value.trim(); if (!d) return; await api().addDomain(d,'allow'); document.getElementById('allowInput').value=''; logAction(`Allow: +${d}`); fetchAdvanced(); }
async function addDeny() { const d = document.getElementById('denyInput').value.trim(); if (!d) return; await api().addDomain(d,'deny'); document.getElementById('denyInput').value=''; logAction(`Deny: +${d}`); fetchAdvanced(); }
async function removeDomain(domain, type) { if (!confirm(`Rimuovere ${domain}?`)) return; await api().removeDomain(domain,type); logAction(`${type}: -${domain}`); fetchAdvanced(); }

async function addAdlist() { const u = document.getElementById('adlistUrl').value.trim(); if (!u) return; const t = document.getElementById('adlistType').value; await api().addList(u,t); document.getElementById('adlistUrl').value=''; logAction(`Adlist: +${u}`); fetchAdvanced(); }
async function removeAdlist(id) { if (!confirm('Rimuovere questa lista?')) return; await api().removeList(id); logAction(`Adlist: -${id}`); fetchAdvanced(); }
async function toggleAdlist(id, en) {
  const r = await api().toggleList(id, en);
  if (r.error) { logAction(`Adlist ${id} ERRORE: ${r.error}`); }
  else { logAction(`Adlist ${id}: ${en ? 'ATTIVATA' : 'DISATTIVATA'}`); }
}

async function addHost() { const ip = document.getElementById('hostIp').value.trim(); const d = document.getElementById('hostDomain').value.trim(); if (!ip||!d) return; const r = await api()._put(`config/dns/hosts/${ip} ${d}`); document.getElementById('hostIp').value=''; document.getElementById('hostDomain').value=''; logAction(`Host: +${ip} ${d}`); fetchAdvanced(); }
async function removeHost(entry) { await api()._delete(`config/dns/hosts/${entry}`); logAction(`Host: -${entry}`); fetchAdvanced(); }
async function addCname() { const s = document.getElementById('cnameSrc').value.trim(); const t = document.getElementById('cnameTgt').value.trim(); if (!s||!t) return; await api()._put(`config/dns/cnameRecords/${s},${t}`); document.getElementById('cnameSrc').value=''; document.getElementById('cnameTgt').value=''; logAction(`CNAME: +${s}->${t}`); fetchAdvanced(); }
async function removeCname(entry) { await api()._delete(`config/dns/cnameRecords/${entry}`); logAction(`CNAME: -${entry}`); fetchAdvanced(); }

async function saveUpstreams() { const lines = document.getElementById('upstreamEdit').value.split('\n').map(s=>s.trim()).filter(Boolean); await api().patchConfig('dns',{upstreams:lines}); logAction('Upstream salvati'); }
async function saveDnsOptions() {
  const data = {}; const map = {'DNSSEC':'dnssec','Domain Needed':'domainNeeded','Bogus Private':'bogusPriv','Query Logging':'queryLogging','EDNS0 ECS':'EDNS0ECS','Block ESNI':'blockESNI'};
  document.querySelectorAll('#dnsOptions input[data-dns]').forEach(i => { const k = map[i.dataset.dns]; if (k) data[k] = i.checked; });
  await api().patchConfig('dns', data); logAction('Opzioni DNS salvate');
}

async function addGroup() { const n = document.getElementById('groupInput').value.trim(); if (!n) return; await api().addGroup(n); document.getElementById('groupInput').value=''; logAction(`Gruppo: +${n}`); fetchAdvanced(); }
async function removeGroup(name) { if (!confirm(`Eliminare gruppo "${name}"?`)) return; await api().removeGroup(name); logAction(`Gruppo: -${name}`); fetchAdvanced(); }

// ═══ SETTINGS ═══
let settingsIdx = 0;
const defaultSrv = { name: 'Pi-hole Server', host: '', port: 80, password: '', use_https: false };

function showSettings() {
  document.getElementById('settingsModal').style.display = 'flex';
  document.getElementById('cfgRefresh').value = config.refresh_interval || 5;
  document.getElementById('cfgQueryRefresh').value = config.query_log_refresh || 3;
  document.getElementById('settingsStatus').textContent = '';
  settingsTab(0);
}
function hideSettings() { document.getElementById('settingsModal').style.display = 'none'; }

function settingsTab(idx, btn) {
  settingsIdx = idx;
  if (btn) { document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
  const srv = (config.servers||[])[idx] || {...defaultSrv};
  document.getElementById('settingsTabContent').innerHTML = `
    <label>Nome Server</label><input type="text" id="cfgName" value="${srv.name||''}" placeholder="Pi-hole Primary">
    <label>Host / IP</label><input type="text" id="cfgHost" value="${srv.host||''}" placeholder="192.168.10.100">
    <label>Porta</label><input type="number" id="cfgPort" value="${srv.port||80}" style="width:80px">
    <label>Password (vuota se non impostata)</label><input type="password" id="cfgPass" value="${srv.password||''}" placeholder="Lascia vuoto se non serve">
  `;
}

async function testSettingsConnection() {
  const host = document.getElementById('cfgHost').value.trim();
  const port = +document.getElementById('cfgPort').value || 80;
  const pass = document.getElementById('cfgPass').value;
  const st = document.getElementById('settingsStatus');
  st.textContent = 'Connessione...'; st.style.color = 'var(--accent)';
  const client = new PiHoleAPI({ host, port, password: pass });
  const r = await client.testConnection();
  st.textContent = r.ok ? `OK: ${r.message}` : `ERRORE: ${r.message}`;
  st.style.color = r.ok ? 'var(--green)' : 'var(--red)';
}

async function saveSettings() {
  // save current tab
  if (!config.servers) config.servers = [{...defaultSrv},{...defaultSrv}];
  config.servers[settingsIdx] = {
    name: document.getElementById('cfgName').value.trim() || 'Pi-hole Server',
    host: document.getElementById('cfgHost').value.trim(),
    port: +document.getElementById('cfgPort').value || 80,
    password: document.getElementById('cfgPass').value,
    use_https: false,
  };
  // check if both have host
  if (settingsIdx === 0 && !config.servers[1]?.host) { settingsTab(1, document.querySelectorAll('.tab-btn')[1]); return; }
  config.refresh_interval = +document.getElementById('cfgRefresh').value || 5;
  config.query_log_refresh = +document.getElementById('cfgQueryRefresh').value || 3;
  saveConfigFile(config);
  hideSettings();
  initServers();
}

// ═══ PI-HOLE LOG ═══
let piholeLogData = [];

async function fetchPiholeLogs() {
  if (!api()) return;
  const container = document.getElementById('piholeLogContainer');
  container.innerHTML = '<div class="text-dim">Caricamento log...</div>';

  try {
    const data = await api()._get('logs/dnsmasq');
    if (data.error) {
      container.innerHTML = `<div class="text-red">Errore: ${data.error}</div>`;
      return;
    }
    piholeLogData = data.log || [];
    renderPiholeLogs();
  } catch (e) {
    container.innerHTML = `<div class="text-red">Errore: ${e.message}</div>`;
  }
}

function renderPiholeLogs() {
  const filter = document.getElementById('logFilter').value;
  const search = (document.getElementById('logSearch').value || '').toLowerCase();
  const container = document.getElementById('piholeLogContainer');

  let entries = piholeLogData;

  // Filter by type
  if (filter === 'blocked') {
    entries = entries.filter(e => e.message && (
      e.message.includes('blocked') || e.message.includes('gravity') ||
      e.message.includes('denied') || e.message.includes('regex')
    ));
  } else if (filter === 'errors') {
    entries = entries.filter(e => e.message && (
      e.message.includes('error') || e.message.includes('SERVFAIL') ||
      e.message.includes('REFUSED') || e.message.includes('failed') ||
      e.message.includes('NXDOMAIN') || e.message.includes('timeout') ||
      (e.prio && e.prio !== null)
    ));
  } else if (filter === 'forwarded') {
    entries = entries.filter(e => e.message && e.message.includes('forwarded'));
  }

  // Search filter
  if (search) {
    entries = entries.filter(e => e.message && e.message.toLowerCase().includes(search));
  }

  // Take last 500
  entries = entries.slice(-500);

  document.getElementById('logCount').textContent = entries.length + ' righe';

  if (entries.length === 0) {
    container.innerHTML = '<div class="text-dim" style="padding:20px">Nessuna riga trovata con questo filtro.</div>';
    return;
  }

  container.innerHTML = entries.map(e => {
    const ts = new Date(e.timestamp * 1000);
    const time = ts.getHours().toString().padStart(2, '0') + ':' +
                 ts.getMinutes().toString().padStart(2, '0') + ':' +
                 ts.getSeconds().toString().padStart(2, '0');
    const msg = e.message || '';

    let color = 'var(--text-dim)';
    if (msg.includes('blocked') || msg.includes('gravity')) color = 'var(--red)';
    else if (msg.includes('forwarded')) color = 'var(--accent2)';
    else if (msg.includes('cached')) color = 'var(--green)';
    else if (msg.includes('reply')) color = 'var(--accent)';
    else if (msg.includes('query')) color = 'var(--text)';
    else if (msg.includes('error') || msg.includes('SERVFAIL') || msg.includes('failed')) color = 'var(--red)';

    return `<div style="color:${color};padding:1px 0;border-bottom:1px solid var(--border)"><span style="color:var(--text-dim);margin-right:8px">${time}</span>${escapeHtml(msg)}</div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
