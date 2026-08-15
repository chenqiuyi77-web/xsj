/* =========================================================================
 * GitHub 云同步脚本（独立注入，不修改原应用，与 Firebase 逻辑并存）
 * 功能：
 *   1. 把应用的 localStorage 数据打包成 JSON 快照，上传到你的 GitHub 仓库；
 *   2. 在设置页「云同步」行下方插入可展开的配置面板：直接填 token/owner/repo，
 *      保存后即可备份/恢复（配置存本地，下次自动读取）；
 *   3. 删除设置页里的「访问验证」入口（登录墙此前已禁用）。
 *
 * ⚠️ 安全提示：
 *   - token 保存在本机浏览器 localStorage 里，只在本设备生效；
 *   - 请使用「细粒度 Personal Access Token」，仅授予那一个仓库的 Contents 读写权限；
 *   - 仓库建议设为 private。
 * ========================================================================= */
(function () {
  'use strict';

  /* 默认配置（页面上可覆盖；保存后写入 localStorage） */
  var CONFIG = {
    token: '',                          // GitHub 细粒度 PAT
    owner: '',                          // GitHub 用户名或组织名
    repo: '',                           // 仓库名（需已存在）
    branch: 'main',
    path: 'kaka-chat/backup.json',
    commitMessage: 'chore: sync Kaka Chat data',
    autoSyncIntervalMs: 5 * 60 * 1000,
    syncOnLeave: true,
    excludeKeyPatterns: ['firebase', 'auth', 'cloud-sync']
  };

  var CFG_KEY = '__github_sync_config';
  var HASH_KEY = '__github_sync_last_hash';
  var status = { lastSyncedAt: null, lastError: '', syncing: false };
  var statusEl = null;

  function log() {
    var args = ['[GitHubSync]'].concat(Array.prototype.slice.call(arguments));
    (console.info || console.log).apply(console, args);
  }
  function enabled() { return !!(CONFIG.token && CONFIG.owner && CONFIG.repo); }

  /* ---- 配置持久化（存本机，带 __ 前缀不会被同步到仓库） ---- */
  function loadConfig() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      ['token', 'owner', 'repo', 'branch', 'path'].forEach(function (k) {
        if (typeof saved[k] === 'string' && saved[k]) CONFIG[k] = saved[k];
      });
    } catch (e) {}
  }
  function saveConfig() {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        token: CONFIG.token, owner: CONFIG.owner, repo: CONFIG.repo,
        branch: CONFIG.branch, path: CONFIG.path
      }));
    } catch (e) {}
  }

  /* ---- 快照 / base64 / API ---- */
  function isExcluded(key) {
    if (!key) return true;
    if (key.charAt(0) === '_' && key.charAt(1) === '_') return true;
    for (var i = 0; i < CONFIG.excludeKeyPatterns.length; i++) {
      if (key.toLowerCase().indexOf(CONFIG.excludeKeyPatterns[i]) !== -1) return true;
    }
    return false;
  }
  function snapshot() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (isExcluded(key)) continue;
      try { data[key] = localStorage.getItem(key); } catch (e) {}
    }
    return data;
  }
  function encodeB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function decodeB64(b64) { return decodeURIComponent(escape(atob(b64))); }
  function apiUrl() {
    return 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo + '/contents/' + CONFIG.path;
  }
  function apiHeaders() {
    return {
      'Authorization': 'token ' + CONFIG.token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }
  function fetchRemote() {
    return fetch(apiUrl() + '?ref=' + encodeURIComponent(CONFIG.branch), { headers: apiHeaders() })
      .then(function (r) {
        if (r.status === 404) return null;
        if (r.status === 401) throw new Error('token 无效或无权限（401）');
        if (!r.ok) throw new Error('读取远端失败 HTTP ' + r.status);
        return r.json();
      });
  }
  function simpleHash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function setStatus(patch) {
    if (patch) Object.keys(patch).forEach(function (k) { status[k] = patch[k]; });
    renderStatus();
  }

  /* ---- 备份 / 恢复 ---- */
  function push() {
    if (!enabled()) return Promise.reject(new Error('请先填写 token/owner/repo 并保存'));
    setStatus({ syncing: true, lastError: '' });
    var payload = { savedAt: new Date().toISOString(), app: 'Kaka Chat', data: snapshot() };
    var json = JSON.stringify(payload);
    var hash = simpleHash(json);
    if (hash === localStorage.getItem(HASH_KEY)) {
      setStatus({ syncing: false, lastSyncedAt: Date.now() });
      log('无变化，跳过提交');
      return Promise.resolve('noop');
    }
    return fetchRemote().then(function (remote) {
      var body = { message: CONFIG.commitMessage, content: encodeB64(json), branch: CONFIG.branch };
      if (remote && remote.sha) body.sha = remote.sha;
      return fetch(apiUrl(), { method: 'PUT', headers: apiHeaders(), body: JSON.stringify(body) })
        .then(function (r) {
          if (!r.ok) {
            return r.json().then(function (j) { throw new Error(j && j.message ? j.message : ('HTTP ' + r.status)); });
          }
          try { localStorage.setItem(HASH_KEY, hash); } catch (e) {}
          setStatus({ syncing: false, lastSyncedAt: Date.now() });
          log('已备份 ' + Object.keys(payload.data).length + ' 个键');
          return 'ok';
        });
    }).catch(function (e) {
      setStatus({ syncing: false, lastError: e.message });
      throw e;
    });
  }

  function pull() {
    if (!enabled()) return Promise.reject(new Error('请先填写 token/owner/repo 并保存'));
    setStatus({ syncing: true, lastError: '' });
    return fetchRemote().then(function (remote) {
      if (!remote || !remote.content) { setStatus({ syncing: false, lastError: '远端暂无备份' }); return 'noop'; }
      var json = decodeB64(String(remote.content).replace(/\s+/g, ''));
      var obj = JSON.parse(json);
      var data = obj && obj.data ? obj.data : {};
      var n = 0;
      Object.keys(data).forEach(function (k) {
        if (isExcluded(k)) return;
        try { localStorage.setItem(k, data[k]); n++; } catch (e) {}
      });
      setStatus({ syncing: false, lastSyncedAt: Date.now(), lastError: '' });
      log('已恢复 ' + n + ' 个键（保存于 ' + (obj.savedAt || '未知时间') + '）');
      return 'ok';
    }).catch(function (e) {
      setStatus({ syncing: false, lastError: e.message });
      throw e;
    });
  }

  /* ==================== 设置页 UI 注入 ==================== */
  function injectStyle() {
    if (document.getElementById('gh-sync-style')) return;
    var st = document.createElement('style');
    st.id = 'gh-sync-style';
    st.textContent =
      '.gh-sync-row{border-bottom:1px solid var(--border-color)}' +
      '.gh-sync-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:11px 16px 8px}' +
      '.gh-sync-title{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}' +
      '.gh-sync-title .t{font-size:15px;color:var(--text-primary);font-weight:500}' +
      '.gh-sync-status{font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.gh-sync-actions{display:flex;gap:6px;flex-shrink:0}' +
      '.gh-sync-actions button,.gh-sync-config button{border:none;border-radius:8px;padding:6px 11px;font-size:13px;font-weight:600;cursor:pointer}' +
      '.gh-sync-actions [data-gh-toggle],.gh-sync-actions [data-gh-pull]{color:var(--text-primary);background:rgba(127,127,127,.16)}' +
      '.gh-sync-actions [data-gh-push],.gh-sync-config [data-gh-save]{color:#fff;background:var(--primary-color, #007aff)}' +
      '.gh-sync-config{display:flex;flex-direction:column;gap:9px;padding:2px 16px 14px}' +
      '.gh-sync-config label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)}' +
      '.gh-sync-config input{padding:9px 11px;border-radius:9px;border:1px solid var(--border-color);background:var(--card-bg, #fff);color:var(--text-primary);font-size:14px;width:100%;box-sizing:border-box}' +
      '.gh-sync-config [data-gh-save]{align-self:flex-end}';
    document.head.appendChild(st);
  }

  function findRow(text) {
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.textContent.indexOf(text) === -1) continue;
      if (b.querySelector('.ph-caret-right')) return b;
    }
    return null;
  }

  function renderStatus() {
    if (!statusEl) return;
    if (!enabled()) { statusEl.textContent = '未配置：点「配置」填写 token/owner/repo'; return; }
    if (status.syncing) { statusEl.textContent = '同步中…'; return; }
    if (status.lastError) { statusEl.textContent = '失败：' + status.lastError; return; }
    if (status.lastSyncedAt) {
      var d = new Date(status.lastSyncedAt);
      statusEl.textContent = '上次同步 ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      return;
    }
    statusEl.textContent = '已配置，尚未同步';
  }

  function buildSyncRow() {
    var row = document.createElement('div');
    row.className = 'gh-sync-row';
    row.setAttribute('data-gh-sync-row', '1');
    row.innerHTML =
      '<div class="gh-sync-head">' +
        '<div class="gh-sync-title"><span class="t">GitHub 云同步</span><span class="gh-sync-status"></span></div>' +
        '<div class="gh-sync-actions">' +
          '<button type="button" data-gh-toggle>配置</button>' +
          '<button type="button" data-gh-pull>恢复</button>' +
          '<button type="button" data-gh-push>备份</button>' +
        '</div>' +
      '</div>' +
      '<div class="gh-sync-config" style="display:none">' +
        '<label>Token<input data-gh-token type="password" placeholder="ghp_..."></label>' +
        '<label>Owner（用户名/组织）<input data-gh-owner type="text" placeholder="your-name"></label>' +
        '<label>Repo（仓库名）<input data-gh-repo type="text" placeholder="your-repo"></label>' +
        '<button type="button" data-gh-save>保存配置</button>' +
      '</div>';

    statusEl = row.querySelector('.gh-sync-status');
    var toggleBtn = row.querySelector('[data-gh-toggle]');
    var panel = row.querySelector('.gh-sync-config');
    var tokenInput = row.querySelector('[data-gh-token]');
    var ownerInput = row.querySelector('[data-gh-owner]');
    var repoInput = row.querySelector('[data-gh-repo]');

    function refreshInputs() {
      tokenInput.value = CONFIG.token || '';
      ownerInput.value = CONFIG.owner || '';
      repoInput.value = CONFIG.repo || '';
    }
    toggleBtn.addEventListener('click', function () {
      var hidden = panel.style.display === 'none';
      panel.style.display = hidden ? 'flex' : 'none';
      if (hidden) refreshInputs();
    });
    row.querySelector('[data-gh-save]').addEventListener('click', function () {
      CONFIG.token = (tokenInput.value || '').trim();
      CONFIG.owner = (ownerInput.value || '').trim();
      CONFIG.repo = (repoInput.value || '').trim();
      saveConfig();
      renderStatus();
    });
    row.querySelector('[data-gh-push]').addEventListener('click', function () { push().catch(function () {}); });
    row.querySelector('[data-gh-pull]').addEventListener('click', function () { pull().catch(function () {}); });

    renderStatus();
    return row;
  }

  function scanSettings() {
    injectStyle();

    var accessRow = findRow('访问验证');
    if (accessRow && accessRow.parentNode) accessRow.parentNode.removeChild(accessRow);

    var cloudRow = findRow('云同步');
    if (cloudRow && cloudRow.parentNode) {
      var existing = cloudRow.parentNode.querySelector('[data-gh-sync-row]');
      if (!existing) cloudRow.insertAdjacentElement('afterend', buildSyncRow());
      statusEl = cloudRow.parentNode.querySelector('.gh-sync-status');
    }
    renderStatus();
  }

  /* ==================== 自动同步 / 启动 ==================== */
  function schedule() {
    if (CONFIG.autoSyncIntervalMs > 0) {
      setInterval(function () {
        if (enabled()) push().catch(function (e) { log('自动备份失败：' + e.message); });
      }, CONFIG.autoSyncIntervalMs);
    }
    if (CONFIG.syncOnLeave) {
      window.addEventListener('beforeunload', function () { if (enabled()) push(); });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && enabled()) push();
      });
    }
  }

  function init() {
    loadConfig();
    setInterval(scanSettings, 600);
    if (!enabled()) log('未配置：请到「设置 → 云同步」下方填写 token/owner/repo');
    setTimeout(function () {
      if (enabled()) push().catch(function (e) { log('首次备份失败：' + e.message); });
    }, 2500);
    schedule();
  }

  window.KakaGithubSync = { push: push, pull: pull, snapshot: snapshot, config: CONFIG, status: status };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
