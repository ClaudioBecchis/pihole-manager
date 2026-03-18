// Pi-hole v6 REST API Client
class PiHoleAPI {
  constructor({ host, port = 80, password = '', useHttps = false }) {
    const scheme = useHttps ? 'https' : 'http';
    this.baseUrl = `${scheme}://${host}:${port}/api`;
    this.password = password;
    this.sid = null;
  }

  async _request(method, endpoint, body = null, params = null) {
    let url = `${this.baseUrl}/${endpoint}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    try {
      const r = await fetch(url, opts);
      if (!r.ok) return { error: `HTTP ${r.status}: ${r.statusText}` };
      const text = await r.text();
      try { return JSON.parse(text); } catch { return { raw: text }; }
    } catch (e) { return { error: e.message }; }
  }

  _get(ep, params) { return this._request('GET', ep, null, params); }
  _post(ep, body) { return this._request('POST', ep, body); }
  _patch(ep, body) { return this._request('PATCH', ep, body); }
  _put(ep, body) { return this._request('PUT', ep, body); }
  _delete(ep) { return this._request('DELETE', ep); }

  // Auth
  async login() {
    if (!this.password) {
      const d = await this._get('auth');
      return d?.session?.valid ? { ok: true, msg: 'No password' } : { ok: false, msg: 'Password required' };
    }
    const d = await this._post('auth', { password: this.password });
    if (d?.session?.valid) { this.sid = d.session.sid; return { ok: true, msg: 'OK' }; }
    return { ok: false, msg: d?.session?.message || 'Login failed' };
  }

  // Stats
  getSummary() { return this._get('stats/summary'); }
  getHistory() { return this._get('history'); }
  getTopDomains(count = 25, blocked = false) { const p = { count }; if (blocked) p.blocked = 'true'; return this._get('stats/top_domains', p); }
  getTopClients(count = 15) { return this._get('stats/top_clients', { count }); }
  getUpstreams() { return this._get('stats/upstreams'); }
  getQueries(length = 200) { return this._get('queries', { length }); }
  getVersion() { return this._get('info/version'); }
  getBlocking() { return this._get('dns/blocking'); }

  // Domains
  getDomains() { return this._get('domains'); }
  addDomain(domain, type = 'deny', kind = 'exact') { return this._post('domains', { domain, type, kind, comment: '', groups: [0], enabled: true }); }
  removeDomain(domain, type = 'deny', kind = 'exact') { return this._delete(`domains/${type}/${kind}/${domain}`); }

  // Lists
  getLists() { return this._get('lists'); }
  addList(address, type = 'block') { return this._post('lists', { address, type, comment: '', groups: [0], enabled: true }); }
  removeList(id) { return this._delete(`lists/${id}`); }
  toggleList(id, enabled) { return this._patch(`lists/${id}`, { enabled }); }

  // Groups
  getGroups() { return this._get('groups'); }
  addGroup(name) { return this._post('groups', { name, comment: '', enabled: true }); }
  removeGroup(name) { return this._delete(`groups/${name}`); }

  // Config
  getConfig() { return this._get('config'); }
  patchConfig(section, data) { return this._patch(`config/${section}`, { config: { [section]: data } }); }

  // Blocking
  enableBlocking() { return this._post('dns/blocking', { blocking: true }); }
  disableBlocking(timer = null) { const b = { blocking: false }; if (timer > 0) b.timer = timer; return this._post('dns/blocking', b); }

  // Actions
  updateGravity() { return this._post('action/gravity'); }
  restartDns() { return this._post('action/restartdns'); }
  flushLogs() { return this._delete('logs/queries'); }

  // Test
  async testConnection() {
    const s = await this.getSummary();
    if (s.error) return { ok: false, message: s.error };
    if (!s.queries) return { ok: false, message: 'Invalid API response' };
    const v = await this.getVersion();
    const core = v?.version?.core?.local?.version || '?';
    const ftl = v?.version?.ftl?.local?.version || '?';
    return { ok: true, message: `Core ${core}, FTL ${ftl}` };
  }
}

// exported as global for browser usage
