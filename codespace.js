/* Webcord codespaces — the "Codespaces" tab of the Web section + the editor page (#/codespace/<id>).
   Loaded after app.js and uses its helpers ($, esc, icon, api, openModal, toast, setMain, S, route, Shiki …).
   Code runs in a sandboxed iframe (runner.html) — see the comment at the top of that file. */
'use strict';

Object.assign(ICONS, {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  fileplus: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  terminal: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  arrowleft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowright: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chevdown: '<path d="M6 9l6 6 6-6"/>',
  fork: '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9M12 12v3"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
});

const CS = { scope: 'all', q: '', items: [], offset: 0, hasMore: false, seq: 0, cache: new Map() };
let E = null;                                           // the open editor session (null when no editor is on screen)

const VIS = {
  private: { label: 'Private', icon: 'lock', hint: 'Only you can see and edit it.' },
  shared: { label: 'Shared', icon: 'users', hint: 'You and the people you add. It shows up in their Web tab.' },
  public: { label: 'Public', icon: 'globe', hint: 'Everyone on Webcord can see and edit it.' },
};
const visBadge = (v) => `<span class="vis vis-${esc(v)}">${icon((VIS[v] || VIS.private).icon, 12)}${(VIS[v] || VIS.private).label}</span>`;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/* Same rules as the server (backend/worker.js → vCsPath). */
const CS_EXTS = new Set([...TEXT_EXTS, 'svg', 'readme', 'license', ...ASSET_EXTS]);
function csPathError(v) {
  const s = String(v || '').trim().replace(/^\/+/, '');
  if (!s || s.length > 100 || s.endsWith('/')) return 'Enter a file name (up to 100 characters).';
  const parts = s.split('/');
  if (parts.length > 5) return 'Folders can be nested up to 4 levels deep.';
  for (const p of parts) if (!/^[A-Za-z0-9_.-]+$/.test(p) || p === '.' || p === '..') return 'Use letters, numbers, dots, dashes and underscores in names (no spaces).';
  if (!CS_EXTS.has(fileExt(parts[parts.length - 1]))) return 'That file type isn’t supported. Use text/code files, images, audio, video, PDFs or .zip.';
  return '';
}
const csNorm = (v) => String(v || '').trim().replace(/^\/+/, '');
const MAX_FILE_CHARS = 200000;

/* Binary files (audio, zip, images, PDFs …) live on Cloudinary; the codespace stores a tiny pointer: ASSET_PREFIX + {"url","size"} (same format as the server). */
const ASSET_PREFIX = 'webcord-asset:';
function assetOf(f) {
  if (!f || typeof f.content !== 'string' || !f.content.startsWith(ASSET_PREFIX)) return null;
  try { const o = JSON.parse(f.content.slice(ASSET_PREFIX.length)); return o && typeof o.url === 'string' ? o : null; } catch { return null; }
}
function uniquePath(path) {
  if (!E.files.has(path)) return path;
  const i = path.lastIndexOf('.'), slash = path.lastIndexOf('/');
  const stem = i > slash + 1 ? path.slice(0, i) : path, ext = i > slash + 1 ? path.slice(i) : '';
  for (let n = 2; n < 1000; n++) if (!E.files.has(`${stem}-${n}${ext}`)) return `${stem}-${n}${ext}`;
  return path;
}

/* ======================================================================
   Web → Codespaces tab
   ====================================================================== */
function renderCodespaceList() {
  setMain(`<div class="page">
    <div class="page-head"><div><h1>Web</h1><p>Write and run code together — codespaces you own, share, or find from the community.</p></div>
      <button class="btn primary" data-cs="new">${icon('plus', 17)} New codespace</button></div>
    <div class="toolbar"><div class="search">${icon('search')}<input class="input" id="cs-search" type="search" placeholder="Search codespaces" aria-label="Search codespaces" value="${esc(CS.q)}"></div>
      <div class="chips" role="group" aria-label="Filter codespaces">${[['all', 'All'], ['mine', 'Mine'], ['shared', 'Shared with me'], ['public', 'Public']].concat(isAdmin() ? [['moderate', 'Moderate (admin)']] : [])
        .map(([k, l]) => `<button type="button" class="chip" data-cs="scope" data-scope="${k}" aria-pressed="${CS.scope === k}">${l}</button>`).join('')}</div></div>
    <div id="cs-results"></div></div>`);
  $('#cs-search').addEventListener('input', debounce((e) => { CS.q = e.target.value.trim(); loadCodespaces(true); }, 300));
  loadCodespaces(true);
}

function csCard(cs) {
  CS.cache.set(cs.id, cs);
  const [a, b] = gradFor(cs.name);
  const names = cs.file_names.slice(0, 4);
  const mine = cs.role === 'owner';
  const roleTag = mine ? '' : cs.visibility === 'public' ? '' : `<span class="role-tag">${cs.role === 'view' ? 'View only' : 'Can edit'}</span>`;
  const canOpen = !!cs.role;                              // admins can see (and delete) private codespaces they can't open
  const canDelete = mine || isAdmin();
  return `<article class="card cs-card" data-csid="${esc(cs.id)}">
    <${canOpen ? `a class="cs-card-main" href="#/codespace/${encodeURIComponent(cs.id)}" aria-label="Open ${esc(cs.name)}"` : 'div class="cs-card-main"'}>
      <div class="cs-thumb" style="--a:${a};--b:${b}"><div class="cs-win"><div class="cs-win-bar"><i></i><i></i><i></i></div>
        ${names.length ? names.map((n) => { const k = fileKind(n); return `<div class="cs-win-row"><span class="cs-ext tone-${k.tone}">${esc(k.badge)}</span><span>${esc(n)}</span></div>`; }).join('') : '<div class="cs-win-row"><span class="dim">No files yet</span></div>'}
        ${cs.file_count > names.length ? `<div class="cs-win-row more">+ ${cs.file_count - names.length} more</div>` : ''}</div></div>
      <div class="proj-body"><div class="cs-card-top"><h3>${esc(cs.name)}</h3>${visBadge(cs.visibility)}</div>
        <p>${cs.description ? esc(cs.description) : '<span class="muted-p">No description</span>'}</p>
        <div class="cs-meta"><span>${icon('file', 13)} ${cs.file_count} file${cs.file_count === 1 ? '' : 's'}</span>${cs.visibility === 'shared' && cs.member_count ? `<span>${icon('users', 13)} ${cs.member_count + 1}</span>` : ''}<span>Updated ${esc(ago(cs.updated_at))}</span>${roleTag}</div></div></${canOpen ? 'a' : 'div'}>
    <div class="proj-foot"><a class="creator" href="#/u/${encodeURIComponent(cs.owner.username)}">${avatar(cs.owner, 26)}<span>${nameHtml(cs.owner, { tag: false })}</span></a>
      <span class="proj-actions">${canDelete ? `<button class="btn icon sm ghost" data-cs="delete-cs" data-id="${esc(cs.id)}" aria-label="Delete ${esc(cs.name)}">${icon('trash', 16)}</button>` : ''}${canOpen ? `<a class="btn sm" href="#/codespace/${encodeURIComponent(cs.id)}">${icon('code', 14)} Open</a>` : '<span class="role-tag">Private</span>'}</span></div></article>`;
}

async function loadCodespaces(reset) {
  const box = $('#cs-results'); if (!box) return;
  if (reset) { CS.offset = 0; CS.items = []; box.innerHTML = '<div class="loading-row"><span class="spinner"></span>Loading codespaces…</div>'; }
  const my = ++CS.seq;
  try {
    const r = await api(`/codespaces?limit=24&offset=${CS.offset}&scope=${CS.scope}${CS.q ? '&q=' + encodeURIComponent(CS.q) : ''}`);
    if (my !== CS.seq || !$('#cs-results')) return;
    CS.items = CS.items.concat(r.codespaces); CS.offset = CS.items.length; CS.hasMore = r.has_more;
    if (!CS.items.length) {
      const msg = CS.q ? ['No codespaces match your search', 'Try a different keyword.']
        : CS.scope === 'shared' ? ['Nothing shared with you yet', 'When someone adds you to their codespace it will appear here.']
        : CS.scope === 'public' ? ['No public codespaces yet', 'Make one public and anyone on Webcord can jump in and edit.']
        : ['No codespaces yet', 'Create one to write HTML, CSS, JavaScript or Python and run it right here.'];
      box.innerHTML = `<div class="empty"><div class="em-ico">${icon('code', 24)}</div><h3>${msg[0]}</h3><p>${msg[1]}</p>${CS.q ? '' : `<button class="btn primary" data-cs="new">${icon('plus', 16)} New codespace</button>`}</div>`;
      return;
    }
    box.innerHTML = `<div class="grid">${CS.items.map(csCard).join('')}</div>${CS.hasMore ? '<div style="text-align:center;margin-top:22px"><button class="btn" data-cs="more">Load more</button></div>' : ''}`;
  } catch (e) {
    if (my !== CS.seq) return;
    box.innerHTML = `<div class="empty"><h3>Couldn’t load codespaces</h3><p>${esc(e.message)}</p><button class="btn primary" data-cs="retry-list">Try again</button></div>`;
  }
}

function newCodespaceModal() {
  const tpls = [['web', 'Website', 'HTML + CSS + JS, with two linked pages', 'html'], ['python', 'Python', 'main.py + a module it imports', 'py'], ['javascript', 'JavaScript', 'ES modules with console output', 'js'], ['blank', 'Blank', 'Start from an empty README', 'md']];
  const opt = (name, val, title, hint, checked, ic) => `<label class="opt"><input type="radio" name="${name}" value="${val}" ${checked ? 'checked' : ''}><span class="opt-in">${ic}<b>${title}</b><small>${hint}</small></span></label>`;
  openModal({
    title: 'New codespace', wide: true,
    html: `<form id="cs-form" novalidate><div class="form-error" id="csf-error" role="alert"></div>
      ${fieldHtml({ id: 'csf-name', label: 'Name', placeholder: 'my-landing-page', maxlength: 60 })}
      ${fieldHtml({ id: 'csf-desc', label: 'Description (optional)', textarea: true, rows: 2, required: false, maxlength: 300, placeholder: 'What are you building?' })}
      <div class="field"><label>Start from</label><div class="opts">${tpls.map(([v, t, h, e], i) => { const k = fileKind('x.' + e); return opt('csf-tpl', v, t, h, i === 0, `<span class="cs-ext tone-${k.tone}">${esc(k.badge)}</span>`); }).join('')}</div></div>
      <div class="field"><label>Who can access it?</label><div class="opts three">${Object.entries(VIS).map(([v, m], i) => opt('csf-vis', v, m.label, m.hint, i === 0, icon(m.icon, 18))).join('')}</div></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Create codespace</button></div></form>`,
    onOpen: (d, close) => {
      $('#csf-name', d).focus();
      $('#cs-form', d).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget, btn = $('button[type=submit]', form);
        clearErrs(form); $('#csf-error', d).textContent = '';
        const body = { name: $('#csf-name', d).value.trim(), description: $('#csf-desc', d).value.trim(), template: form.elements['csf-tpl'].value, visibility: form.elements['csf-vis'].value };
        if (body.name.length < 2 || body.name.length > 60) return setErr('csf-name', 'Name must be 2–60 characters.');
        busy(btn, true, 'Creating…');
        try {
          const r = await api('/codespaces', { method: 'POST', body });
          close(); toast('Codespace created.', 'success');
          go('#/codespace/' + encodeURIComponent(r.codespace.id));
        } catch (err) {
          busy(btn, false);
          if (!applyServerErrors({ name: 'csf-name', description: 'csf-desc' }, err)) $('#csf-error', d).textContent = err.message;
        }
      });
    },
  });
}

async function deleteCodespace(id) {
  const cs = CS.cache.get(id) || (E && E.meta);
  if (!(await confirmDialog(`Delete “${cs?.name || 'this codespace'}” and all of its files? This can’t be undone.`))) return false;
  try {
    await api(`/codespaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Codespace deleted.', 'success'); CS.cache.delete(id);
    return true;
  } catch (e) { toast(e.message, 'error'); return false; }
}

/* ======================================================================
   Editor page
   ====================================================================== */
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-pointer-lock';
const RUNNER_URL = 'runner.html';
const kindOf = (p) => { const x = fileExt(p); return x === 'html' || x === 'htm' ? 'html' : x === 'py' ? 'py' : x === 'js' || x === 'mjs' ? 'js' : x === 'md' || x === 'markdown' ? 'md' : x === 'svg' ? 'svg' : ASSET_EXTS.has(x) ? 'asset' : 'text'; };
const canEdit = () => !!E && E.role !== 'view';

async function renderCodespace(id, token) {
  csLeave();
  document.title = 'Codespace — Webcord';
  setMain('<div class="page"><div class="loading-row"><span class="spinner"></span>Opening codespace…</div></div>', true);
  let r;
  try { r = await api('/codespaces/' + encodeURIComponent(id)); } catch (e) {
    if (token !== S.token) return;
    setMain(`<div class="page"><div class="empty"><div class="em-ico">${icon('lock', 24)}</div><h3>${e.status === 404 ? 'Codespace not found' : 'Couldn’t open this codespace'}</h3><p>${esc(e.message)}</p><a class="btn primary" href="#/web/codespaces">Back to codespaces</a></div></div>`);
    return;
  }
  if (token !== S.token) return;
  startEditor(r);
}

function startEditor(r) {
  const files = new Map(r.files.map((f) => [f.path, { content: f.content, saved: f.content, rev: f.rev, dirty: false, saving: false, conflict: null, by: f.by, error: '' }]));
  const X = E = {
    id: r.codespace.id, meta: r.codespace, role: r.role, members: r.members || [], files, rev: r.codespace.rev,
    open: [], active: null, collapsed: new Set(), scroll: new Map(), timers: new Map(),
    pollTimer: null, dead: false, offline: false, shiki: null, hlSeq: 0, hlTimer: 0, autoTimer: 0,
    runSeq: 0, hist: [], hi: -1, frame: null, payload: null, sent: false, entry: null, logs: [], errors: 0, consoleOpen: false,
    auto: lsGet('webcord.cs.auto') === '1', pane: 'code',
  };
  document.title = `${X.meta.name} — Webcord`;
  const left = parseFloat(lsGet('webcord.cs.split')) || 50;
  const m = setMain(`<div class="cs-app" id="cs">
    <header class="cs-bar">
      <a class="btn icon ghost" href="#/web/codespaces" aria-label="Back to codespaces" title="Back to codespaces">${icon('chevleft', 20)}</a>
      <div class="cs-title"><div class="cs-name"><b id="cs-name" title="${esc(X.meta.name)}">${esc(X.meta.name)}</b>${X.role === 'owner' ? `<button class="btn icon sm ghost" data-cs="rename-cs" aria-label="Rename codespace" title="Rename">${icon('edit', 14)}</button>` : ''}<span id="cs-vis">${visBadge(X.meta.visibility)}</span></div>
        <small id="cs-save" class="cs-save"></small></div>
      <div class="cs-bar-actions">
        ${canEdit() ? `<button type="button" class="btn sm agent-btn" id="cs-agent-btn" data-cs="agent" aria-pressed="false" title="Ask the AI agent to edit your code">${icon('sparkles', 15)}<span class="hide-sm"> Agent</span></button>` : ''}
        <label class="cs-auto" title="Re-run the preview automatically while you type"><input type="checkbox" id="cs-auto" ${X.auto ? 'checked' : ''}><span>Auto-run</span></label>
        ${X.role === 'owner' ? '' : `<button class="btn sm" data-cs="fork" title="Make your own copy">${icon('fork', 15)}<span class="hide-sm"> Duplicate</span></button>`}
        <button class="btn sm" data-cs="zip" title="Download every file as a .zip">${icon('download', 15)}<span class="hide-sm"> Download</span></button>
        <button class="btn sm" data-cs="share">${icon('share', 15)}<span class="hide-sm"> ${X.role === 'owner' ? 'Share' : 'Details'}</span></button>
        <button class="btn primary sm" data-cs="run" title="Runs the open file. For CSS or JS inside a website it runs the page. (Ctrl/⌘ + Enter)">${icon('play', 15)} Run</button>
      </div>
    </header>
    <input type="file" id="cs-upload" multiple hidden tabindex="-1" aria-hidden="true">
    <div class="cs-panes" role="tablist" aria-label="Editor panes"><button role="tab" data-cs="pane" data-pane="code" aria-selected="true">${icon('code', 15)} Code</button><button role="tab" data-cs="pane" data-pane="preview" aria-selected="false">${icon('eye', 15)} Preview</button></div>
    <div class="cs-body" id="cs-body" data-pane="code" style="--left:${Math.min(75, Math.max(25, left))}%">
      <section class="cs-left" id="cs-left">
        <aside class="cs-files" id="cs-files" aria-label="Files"><div class="cs-files-head"><span>Files</span><span class="cs-files-acts">${canEdit() ? `<button class="btn icon sm ghost" data-cs="new-file" aria-label="New file" title="New file">${icon('fileplus', 16)}</button><button class="btn icon sm ghost" data-cs="upload" aria-label="Upload files" title="Upload files">${icon('upload', 16)}</button>` : ''}</span></div><div class="cs-tree" id="cs-tree" role="tree"></div></aside>
        <div class="cs-editor">
          <div class="cs-tabs-row"><button class="btn icon sm ghost cs-files-toggle" data-cs="toggle-files" aria-label="Toggle file list" title="Toggle file list">${icon('panel', 16)}</button><div class="cs-tabs" id="cs-tabs" role="tablist"></div></div>
          <div class="cs-conflict" id="cs-conflict" hidden></div>
          <div class="ed" id="ed" hidden>
            <div class="ed-ln" aria-hidden="true"><div id="ed-ln-in"></div></div>
            <div class="ed-main"><pre class="ed-hl" aria-hidden="true"><code id="ed-code"></code></pre><textarea class="ed-ta" id="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Code editor"></textarea></div>
          </div>
          <div class="ed-asset" id="ed-asset" hidden></div>
          <div class="ed-empty" id="ed-empty"><div>${icon('file', 28)}<p>Select a file to start editing.</p></div></div>
        </div>
      </section>
      <div class="cs-gutter" id="cs-gutter" role="separator" aria-orientation="vertical" aria-label="Resize panes" tabindex="0"></div>
      <section class="cs-right" aria-label="Preview">
        <div class="pv-bar">
          <button class="btn icon sm ghost" data-cs="pv-back" id="pv-back" aria-label="Back" disabled>${icon('arrowleft', 16)}</button>
          <button class="btn icon sm ghost" data-cs="pv-fwd" id="pv-fwd" aria-label="Forward" disabled>${icon('arrowright', 16)}</button>
          <button class="btn icon sm ghost" data-cs="run" aria-label="Reload preview" title="Reload (re-run)">${icon('refresh', 16)}</button>
          <input class="pv-url" id="pv-url" type="text" spellcheck="false" autocomplete="off" placeholder="index.html" aria-label="Preview address">
          <button class="btn sm ghost pv-console-btn" data-cs="toggle-console" id="pv-console-btn" aria-pressed="false">${icon('terminal', 15)}<span class="hide-sm"> Console</span> <span class="count" id="pv-count" hidden></span></button>
        </div>
        <div class="pv-stage" id="pv-stage"><div class="pv-empty"><div class="em-ico">${icon('play', 22)}</div><h3>Preview</h3><p>Press <b>Run</b> to see your website or code output here.</p></div></div>
        <div class="pv-console" id="pv-console" hidden><div class="pv-console-head"><b>Console</b><button class="btn sm ghost" data-cs="clear-console">Clear</button></div><div class="pv-logs" id="pv-logs" role="log" aria-live="polite"></div></div>
      </section>
      ${canEdit() ? agPanelHtml() : ''}
    </div></div>`, true);
  renderFiles(); renderTabs(); updateSaveStatus(); updateHistoryButtons();
  const first = ['index.html', 'main.py', 'main.js', 'README.md'].find((p) => files.has(p)) || [...files.keys()].sort()[0];
  if (first) openFile(first);
  bindEditor(m);
  if (canEdit()) agBind();
  pollLoop(X);
  const pick = pickEntry();
  if (pick && kindOf(pick) === 'html') runPreview(pick, { quiet: true });
}

function csLeave() {
  const X = E; if (!X) return;
  X.dead = true; E = null;
  try { X.agent?.abort?.abort(); } catch { /* */ }
  clearTimeout(X.pollTimer); clearTimeout(X.hlTimer); clearTimeout(X.autoTimer);
  X.timers.forEach((t) => clearTimeout(t));
  for (const p of X.files.keys()) saveFile(X, p);       // flush anything still unsaved (the request keeps going after we leave)
  try { X.frame?.remove(); } catch { /* */ }
}
window.addEventListener('beforeunload', (e) => {
  if (E && [...E.files.values()].some((f) => f.dirty || f.saving)) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- file tree + tabs ---------- */
function treeModel() {
  const root = { dirs: new Map(), files: [] };
  for (const p of [...E.files.keys()].sort((a, b) => a.localeCompare(b))) {
    const parts = p.split('/'); let n = root;
    for (let i = 0; i < parts.length - 1; i++) { if (!n.dirs.has(parts[i])) n.dirs.set(parts[i], { dirs: new Map(), files: [] }); n = n.dirs.get(parts[i]); }
    n.files.push({ name: parts[parts.length - 1], path: p });
  }
  return root;
}
function renderFiles() {
  const box = $('#cs-tree'); if (!box || !E) return;
  const edit = canEdit();
  const walk = (n, depth, prefix) => {
    let h = '';
    for (const [name, sub] of [...n.dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
      const path = prefix + name, closed = E.collapsed.has(path);
      h += `<div class="ft-row ft-dir" style="--d:${depth}" data-cs="toggle-folder" data-path="${esc(path)}" role="treeitem" aria-expanded="${!closed}" tabindex="0"><span class="ft-chev${closed ? ' closed' : ''}">${icon('chevdown', 13)}</span>${icon('folder', 15)}<span class="ft-name">${esc(name)}</span></div>`;
      if (!closed) h += walk(sub, depth + 1, path + '/');
    }
    for (const f of n.files) {
      const k = fileKind(f.name), st = E.files.get(f.path);
      h += `<div class="ft-row${E.active === f.path ? ' active' : ''}" style="--d:${depth}" data-cs="open-file" data-path="${esc(f.path)}" role="treeitem" tabindex="0" title="${esc(f.path)}"><span class="cs-ext tone-${k.tone}">${esc(k.badge)}</span><span class="ft-name">${esc(f.name)}</span>${st.dirty || st.saving ? '<i class="dot" title="Unsaved"></i>' : ''}${st.conflict ? '<i class="dot warn" title="Changed by someone else"></i>' : ''}
        ${edit ? `<span class="ft-act"><button class="btn icon sm ghost" data-cs="rename-file" data-path="${esc(f.path)}" aria-label="Rename ${esc(f.name)}">${icon('edit', 13)}</button><button class="btn icon sm ghost" data-cs="delete-file" data-path="${esc(f.path)}" aria-label="Delete ${esc(f.name)}">${icon('trash', 13)}</button></span>` : ''}</div>`;
    }
    return h;
  };
  box.innerHTML = E.files.size ? walk(treeModel(), 0, '') : '<p class="muted-p" style="padding:10px 12px">No files yet.</p>';
}
function renderTabs() {
  const box = $('#cs-tabs'); if (!box || !E) return;
  box.innerHTML = E.open.map((p) => {
    const k = fileKind(p), st = E.files.get(p), name = p.split('/').pop();
    return `<div class="cs-tab${E.active === p ? ' active' : ''}" role="tab" aria-selected="${E.active === p}" data-cs="open-file" data-path="${esc(p)}" title="${esc(p)}" tabindex="0"><span class="cs-ext tone-${k.tone}">${esc(k.badge)}</span><span class="t-name">${esc(name)}</span>${st && (st.dirty || st.saving) ? '<i class="dot"></i>' : ''}<button type="button" class="t-x" data-cs="close-tab" data-path="${esc(p)}" aria-label="Close ${esc(name)}">${icon('x', 12)}</button></div>`;
  }).join('');
  box.querySelector('.cs-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function openFile(path) {
  if (!E || !E.files.has(path)) return;
  rememberScroll();
  if (!E.open.includes(path)) E.open.push(path);
  E.active = path;
  loadActiveIntoEditor(); renderTabs(); renderFiles(); showConflict();
  if (window.innerWidth <= 860) $('#cs-left')?.classList.remove('files-open');
}
function closeTab(path) {
  if (!E) return;
  const i = E.open.indexOf(path); if (i < 0) return;
  E.open.splice(i, 1);
  if (E.active === path) { E.active = E.open[Math.min(i, E.open.length - 1)] || null; loadActiveIntoEditor(); }
  renderTabs(); renderFiles(); showConflict();
}

/* ---------- the code editor (a transparent <textarea> on top of a syntax-highlighted <pre>) ---------- */
const edEl = () => ({ ta: $('#ed-ta'), code: $('#ed-code'), ln: $('#ed-ln-in'), ed: $('#ed'), empty: $('#ed-empty'), asset: $('#ed-asset') });
function rememberScroll() { const { ta } = edEl(); if (E && E.active && ta) E.scroll.set(E.active, [ta.scrollTop, ta.scrollLeft, ta.selectionStart, ta.selectionEnd]); }
function loadActiveIntoEditor() {
  const { ta, ed, empty, asset } = edEl(); if (!ta) return;
  const f = E.active && E.files.get(E.active);
  const as = assetOf(f);
  ed.hidden = !f || !!as; empty.hidden = !!f;
  if (asset) { asset.hidden = !as; if (as) renderAsset(asset, E.active, as); }
  if (!f || as) return;
  ta.value = f.content; ta.readOnly = !canEdit();
  paintEditor(true);
  const s = E.scroll.get(E.active) || [0, 0, 0, 0];
  ta.scrollTop = s[0]; ta.scrollLeft = s[1]; syncScroll();
  try { ta.setSelectionRange(s[2], s[3]); } catch { /* */ }
  if (window.innerWidth > 860 && canEdit()) ta.focus({ preventScroll: true });
}
function renderAsset(box, path, as) {
  const name = path.split('/').pop(), k = fileKind(name), kind = attKindOfName(name);
  const preview = kind === 'image' ? `<img src="${esc(as.url)}" alt="${esc(name)}">`
    : kind === 'audio' ? `<audio controls preload="none" src="${esc(as.url)}"></audio>`
    : kind === 'video' ? `<video controls preload="metadata" playsinline src="${esc(as.url)}"></video>`
    : fileIcon(name, 64);
  box.innerHTML = `${preview}<div class="as-name">${esc(path)}</div><div class="as-meta">${esc(k.label)}${as.size ? ` · ${fmtSize(as.size)}` : ''}</div>
    <div class="as-acts"><button type="button" class="btn primary sm" data-cs="download-asset" data-path="${esc(path)}">${icon('download', 15)} Download</button>${k.ext === 'pdf' ? `<a class="btn sm" href="${esc(as.url)}" target="_blank" rel="noopener">${icon('eye', 15)} Open</a>` : ''}</div>`;
}
function syncScroll() {
  const { ta, code, ln } = edEl(); if (!ta) return;
  code.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  ln.style.transform = `translateY(${-ta.scrollTop}px)`;
}
function codeInner(html) { const t = document.createElement('template'); t.innerHTML = html; return t.content.querySelector('code')?.innerHTML ?? ''; }
function paintEditor(forceAsync) {
  const { ta, code, ln } = edEl(); if (!ta || !E || !E.active) return;
  const text = ta.value, lang = hlLang(fileExt(E.active)), seq = ++E.hlSeq;
  const lines = text.split('\n').length;
  if (ln.dataset.n !== String(lines)) { ln.dataset.n = String(lines); ln.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n'); }
  if (!wantsHl(text, lang)) { code.textContent = text + '\n'; return; }
  const sh = E.shiki;
  if (sh && lang in sh.known && sh.hl.getLoadedLanguages().includes(lang) && text.length < 25000) {
    try { code.innerHTML = codeInner(sh.hl.codeToHtml(text, { lang, theme: SHIKI_THEME })) + '\n'; return; } catch { /* fall back */ }
  }
  code.textContent = text + '\n';
  clearTimeout(E.hlTimer);
  const X = E;
  const go2 = async () => {
    try {
      const s = await getShiki(); X.shiki = s;
      if (!(lang in s.known)) return;
      await s.hl.loadLanguage(lang);
      if (X.dead || seq !== X.hlSeq) return;
      const el = edEl().code; if (!el) return;
      el.innerHTML = codeInner(s.hl.codeToHtml(edEl().ta.value, { lang, theme: SHIKI_THEME })) + '\n';
    } catch { /* highlighting is optional */ }
  };
  if (forceAsync || text.length < 25000) go2(); else E.hlTimer = setTimeout(go2, 250);
}
function insertText(text) {
  const { ta } = edEl();
  ta.focus();
  if (!document.execCommand || !document.execCommand('insertText', false, text)) {
    const s = ta.selectionStart; ta.setRangeText(text, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
const indentUnit = () => (E && fileExt(E.active) === 'py' ? '    ' : '  ');
function indentSelection(back) {
  const { ta } = edEl(); const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, unit = indentUnit();
  if (s === e && !back) return insertText(unit);
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  let le = v.indexOf('\n', e); if (le < 0) le = v.length;
  if (e > s && v[e - 1] === '\n') le = e - 1;
  const block = v.slice(ls, le).split('\n');
  const out = block.map((l) => (back ? (l.startsWith(unit) ? l.slice(unit.length) : l.replace(/^ {1,3}|^\t/, '')) : (l.length ? unit + l : l)));
  const text = out.join('\n');
  ta.setSelectionRange(ls, le); insertText(text);
  if (s === e) { const c = Math.max(ls, s + text.length - (le - ls)); ta.setSelectionRange(c, c); } else ta.setSelectionRange(ls, ls + text.length);
}
function autoIndent(ev) {
  const { ta } = edEl(); if (ta.readOnly) return;
  const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  const ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s), trimmed = line.trimEnd();
  const indent = /^[ \t]*/.exec(line)[0], unit = indentUnit(), py = fileExt(E.active) === 'py';
  const last = trimmed.slice(-1), pairs = { '{': '}', '[': ']', '(': ')' };
  let ins = '\n' + indent, caret = null;
  if (pairs[last] || (py && last === ':')) {
    ins += unit;
    if (pairs[last] && v[e] === pairs[last]) { caret = s + 1 + indent.length + unit.length; ins += '\n' + indent; }
  }
  ev.preventDefault(); insertText(ins);
  if (caret != null) ta.setSelectionRange(caret, caret);
}
function onEdit() {
  const { ta } = edEl(); const f = E && E.files.get(E.active); if (!f || ta.readOnly) return;
  f.content = ta.value; f.dirty = f.content !== f.saved; f.error = '';
  paintEditor(false); syncScroll();
  scheduleSave(E, E.active);
  updateSaveStatus(); markDirtyDots();
  if (E.auto) { clearTimeout(E.autoTimer); E.autoTimer = setTimeout(() => runPreview(undefined, { auto: true }), 900); }
}
function markDirtyDots() { renderTabs(); renderFiles(); }

function bindEditor(root) {
  const { ta } = edEl();
  ta.addEventListener('input', onEdit);
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); if (!ta.readOnly) indentSelection(e.shiftKey); return; }
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey && !e.isComposing) { autoIndent(e); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); runPreview(); }
  });
  // uploading: a real (hidden) file input + drag-and-drop onto the file list or the editor
  const up = $('#cs-upload');
  if (up) {
    up.accept = [...CS_EXTS].map((x) => '.' + x).join(',');
    up.addEventListener('change', () => { const list = [...up.files]; up.value = ''; if (list.length) uploadFiles(list); });
  }
  ['#cs-files', '.cs-editor'].forEach((sel) => {
    const el = $(sel, root); if (!el) return;
    el.addEventListener('dragover', (e) => { if (canEdit() && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (e) => { el.classList.remove('drop'); if (!canEdit() || !e.dataTransfer?.files?.length) return; e.preventDefault(); uploadFiles([...e.dataTransfer.files]); });
  });
  $('#cs-auto').addEventListener('change', (e) => { E.auto = e.target.checked; lsSet('webcord.cs.auto', E.auto ? '1' : '0'); if (E.auto) runPreview(undefined, { auto: true }); });
  $('#pv-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); navigateTo(e.target.value); } });
  root.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('.ft-row, .cs-tab');
    if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); row.click(); }
  });
  // draggable divider between code and preview
  const g = $('#cs-gutter'), body = $('#cs-body');
  g.addEventListener('pointerdown', (e) => {
    e.preventDefault(); g.setPointerCapture(e.pointerId); body.classList.add('dragging');
    const move = (ev) => { const r = body.getBoundingClientRect(); const pct = Math.min(75, Math.max(25, ((ev.clientX - r.left) / r.width) * 100)); body.style.setProperty('--left', pct + '%'); };
    const up = () => { g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); body.classList.remove('dragging'); lsSet('webcord.cs.split', String(parseFloat(body.style.getPropertyValue('--left')))); };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  });
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = parseFloat(body.style.getPropertyValue('--left')) || 50;
    const next = Math.min(75, Math.max(25, cur + (e.key === 'ArrowLeft' ? -3 : 3)));
    body.style.setProperty('--left', next + '%'); lsSet('webcord.cs.split', String(next));
  });
}

/* ---------- saving ---------- */
function scheduleSave(X, path, delay = 700) {
  clearTimeout(X.timers.get(path));
  X.timers.set(path, setTimeout(() => saveFile(X, path), delay));
}
function saveAll() { if (E) for (const p of E.files.keys()) saveFile(E, p); }
async function saveFile(X, path) {
  const f = X.files.get(path);
  if (!f || !f.dirty || f.saving || f.conflict) return;
  if (f.content.length > MAX_FILE_CHARS) { f.error = `Files can be at most ${MAX_FILE_CHARS.toLocaleString()} characters.`; if (E === X) updateSaveStatus(); return; }
  clearTimeout(X.timers.get(path));
  f.saving = true; const sent = f.content;
  if (E === X) updateSaveStatus();
  try {
    const r = await api(`/codespaces/${encodeURIComponent(X.id)}/files`, { method: 'PUT', body: { path, content: sent, base_rev: f.rev }, quiet: true });
    f.rev = r.file.rev; f.saved = sent; f.offline = false; X.offline = false; f.error = '';
    f.dirty = f.content !== f.saved;
    if (f.dirty) scheduleSave(X, path, 50);
  } catch (e) {
    if (e.status === 401) sessionExpired();
    else if (e.status === 0) { X.offline = true; scheduleSave(X, path, 4000); }
    else if (e.status === 409) conflictFrom(X, path, f, e.data && e.data.current);
    else if (e.status === 404 || e.status === 403) { f.error = e.message; if (E === X) { toast(e.message, 'error'); if (e.status === 404) go('#/web/codespaces'); } }
    else f.error = e.message;
  } finally {
    f.saving = false;
    if (E === X) { updateSaveStatus(); markDirtyDots(); }
  }
}
/* The server rejected our save because someone else changed the file first; the 409 body carries their version. */
function conflictFrom(X, path, f, cur) {
  if (!cur) { f.rev = null; scheduleSave(X, path, 50); return; }          // it was deleted by someone else — re-create it
  if (cur.content === f.content) { f.rev = cur.rev; f.saved = cur.content; f.dirty = false; return; }
  f.conflict = { content: cur.content, rev: cur.rev, by: cur.by };
  if (E === X && X.active === path) showConflict();
}
function showConflict() {
  const box = $('#cs-conflict'); if (!box || !E) return;
  const f = E.active && E.files.get(E.active);
  if (!f || !f.conflict) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<span>${icon('users', 15)} <b>${esc(f.conflict.by || 'Someone')}</b> changed this file while you were editing it.</span>
    <span class="cs-conflict-acts"><button class="btn sm" data-cs="conflict-theirs">Use their version</button><button class="btn sm primary" data-cs="conflict-mine">Keep mine</button></span>`;
}
function resolveConflict(mine) {
  const f = E && E.files.get(E.active); if (!f || !f.conflict) return;
  const c = f.conflict; f.conflict = null; f.rev = c.rev;
  if (mine) { f.saved = c.content; f.dirty = f.content !== f.saved; saveFile(E, E.active); }
  else { f.content = c.content; f.saved = c.content; f.dirty = false; loadActiveIntoEditor(); }
  showConflict(); updateSaveStatus(); markDirtyDots();
}
function updateSaveStatus() {
  const el = $('#cs-save'); if (!el || !E) return;
  const fs = [...E.files.values()];
  let t, cls = '';
  if (E.role === 'view') t = 'View only';
  else if (fs.some((f) => f.conflict)) { t = 'Conflict — choose a version'; cls = 'warn'; }
  else if (fs.some((f) => f.error)) { t = 'Couldn’t save: ' + fs.find((f) => f.error).error; cls = 'err'; }
  else if (E.offline) { t = 'Offline — will retry'; cls = 'warn'; }
  else if (fs.some((f) => f.saving)) t = 'Saving…';
  else if (fs.some((f) => f.dirty)) t = 'Unsaved changes';
  else { t = 'All changes saved'; cls = 'ok'; }
  el.textContent = t; el.className = 'cs-save ' + cls;
}

/* ---------- live sync with other people editing the same codespace ---------- */
function pollLoop(X) {
  const tick = async () => {
    if (X.dead) return;
    let wait = document.hidden ? 15000 : 3000;
    if ([...X.files.values()].some((f) => f.saving)) wait = 400;
    else {
      try {
        const r = await api(`/codespaces/${encodeURIComponent(X.id)}/sync?since=${X.rev}`, { quiet: true });
        if (X.dead) return;
        X.offline = false;
        applyRemote(X, r);
        X.rev = r.rev;
        wait = r.has_more ? 0 : wait;
      } catch (e) {
        if (X.dead) return;
        if (e.status === 401) return sessionExpired();
        if (e.status === 404) { toast('This codespace is no longer available to you.', 'error'); go('#/web/codespaces'); return; }
        X.offline = e.status === 0; wait = 6000;
      }
      if (E === X) updateSaveStatus();
    }
    X.pollTimer = setTimeout(tick, wait);
  };
  X.pollTimer = setTimeout(tick, 2500);
}
function applyRemote(X, r) {
  let treeChanged = false;
  if (r.meta) {
    if (r.meta.name !== X.meta.name) { X.meta.name = r.meta.name; const n = $('#cs-name'); if (n) { n.textContent = r.meta.name; n.title = r.meta.name; } document.title = `${r.meta.name} — Webcord`; }
    if (r.meta.visibility !== X.meta.visibility) { X.meta.visibility = r.meta.visibility; const v = $('#cs-vis'); if (v) v.innerHTML = visBadge(r.meta.visibility); }
    X.meta.description = r.meta.description;
  }
  if (r.role && r.role !== X.role) {
    X.role = r.role; const { ta } = edEl(); if (ta) ta.readOnly = !canEdit();
    toast(r.role === 'view' ? 'Your access changed to view-only.' : 'You can now edit this codespace.', '');
    treeChanged = true; updateSaveStatus();
  }
  for (const rf of r.files) {
    const f = X.files.get(rf.path);
    if (rf.deleted) {
      if (!f) continue;
      if (f.dirty) { f.rev = null; continue; }                       // I'm editing it: keep my copy, it will be re-created on save
      X.files.delete(rf.path); X.open = X.open.filter((p) => p !== rf.path); treeChanged = true;
      if (X.active === rf.path) { X.active = X.open[X.open.length - 1] || null; loadActiveIntoEditor(); }
      continue;
    }
    if (!f) { X.files.set(rf.path, { content: rf.content, saved: rf.content, rev: rf.rev, dirty: false, saving: false, conflict: null, by: rf.by, error: '' }); treeChanged = true; continue; }
    if (f.rev === rf.rev) continue;
    if (f.dirty) {
      if (rf.content === f.content) { f.rev = rf.rev; f.saved = rf.content; f.dirty = false; }
      else f.conflict = { content: rf.content, rev: rf.rev, by: rf.by };
      treeChanged = true; continue;
    }
    f.content = rf.content; f.saved = rf.content; f.rev = rf.rev; f.by = rf.by;
    if (X.active === rf.path) {
      const { ta } = edEl(); const s = ta.selectionStart, e = ta.selectionEnd, st = ta.scrollTop, sl = ta.scrollLeft;
      ta.value = rf.content; paintEditor(false);
      ta.setSelectionRange(Math.min(s, rf.content.length), Math.min(e, rf.content.length)); ta.scrollTop = st; ta.scrollLeft = sl; syncScroll();
    }
  }
  if (treeChanged) { renderFiles(); renderTabs(); }
  showConflict();
}

/* ---------- file operations ---------- */
function starterFor(path) {
  if (kindOf(path) === 'html') return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${esc(path.split('/').pop().replace(/\.\w+$/, ''))}</title>\n</head>\n<body>\n  \n</body>\n</html>\n`;
  return '';
}
function newFileModal() {
  if (!canEdit()) return;
  openModal({
    title: 'New file',
    html: `<form id="nf-form" novalidate>${fieldHtml({ id: 'nf-path', label: 'File name', placeholder: 'script.js', maxlength: 100, hint: 'Use a slash to put it in a folder, e.g. <code>js/app.js</code>.' })}
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Create file</button></div></form>`,
    onOpen: (d, close) => {
      $('#nf-path', d).focus();
      $('#nf-form', d).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const X = E, path = csNorm($('#nf-path', d).value), btn = $('button[type=submit]', d);
        const err = csPathError(path) || (X.files.has(path) ? 'A file with that name already exists.' : '');
        if (err) return setErr('nf-path', err);
        busy(btn, true, 'Creating…');
        try {
          const content = starterFor(path);
          const r = await api(`/codespaces/${encodeURIComponent(X.id)}/files`, { method: 'PUT', body: { path, content, create: true } });
          if (E !== X) return close();
          X.files.set(path, { content, saved: content, rev: r.file.rev, dirty: false, saving: false, conflict: null, by: S.user.username, error: '' });
          close(); renderFiles(); openFile(path);
        } catch (e) { busy(btn, false); setErr('nf-path', e.message); }
      });
    },
  });
}
function renameFileModal(path) {
  if (!canEdit() || !E.files.has(path)) return;
  openModal({
    title: 'Rename file',
    html: `<form id="rn-form" novalidate>${fieldHtml({ id: 'rn-path', label: 'New name', value: path, maxlength: 100, hint: 'Change the folder part to move the file.' })}
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Rename</button></div></form>`,
    onOpen: (d, close) => {
      const inp = $('#rn-path', d); inp.focus(); inp.setSelectionRange(path.lastIndexOf('/') + 1, path.length - (fileExt(path).length ? fileExt(path).length + 1 : 0));
      $('#rn-form', d).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const X = E, to = csNorm(inp.value), btn = $('button[type=submit]', d);
        if (to === path) return close();
        const err = csPathError(to) || (X.files.has(to) ? 'A file with that name already exists.' : '');
        if (err) return setErr('rn-path', err);
        busy(btn, true, 'Renaming…');
        try {
          const f = X.files.get(path);
          f.conflict = null;
          if (f.dirty) { f.saving = false; await saveFile(X, path); }
          if (f.dirty) throw new Error('Couldn’t save your latest changes first. Try again.');
          await api(`/codespaces/${encodeURIComponent(X.id)}/files/rename`, { method: 'POST', body: { from: path, to } });
          if (E !== X) return close();
          X.files.delete(path); f.rev = null; X.files.set(to, f);
          X.open = X.open.map((p) => (p === path ? to : p)); if (X.active === path) X.active = to;
          if (X.scroll.has(path)) { X.scroll.set(to, X.scroll.get(path)); X.scroll.delete(path); }
          close(); renderFiles(); renderTabs(); loadActiveIntoEditor();
        } catch (e) { busy(btn, false); setErr('rn-path', e.message); }
      });
    },
  });
}
async function deleteFile(path) {
  const X = E; if (!canEdit() || !X.files.has(path)) return;
  if (!(await confirmDialog(`Delete “${path}”? This can’t be undone.`))) return;
  try {
    clearTimeout(X.timers.get(path));
    await api(`/codespaces/${encodeURIComponent(X.id)}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    if (E !== X) return;
    X.files.delete(path); X.scroll.delete(path); closeTab(path); renderFiles();
  } catch (e) { toast(e.message, 'error'); }
}
async function uploadFiles(list) {
  const X = E; if (!X || !canEdit()) return;
  let added = 0, firstPath = null;
  for (const file of list) {
    if (E !== X) return;
    const wanted = file.name.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
    const err = csPathError(wanted);
    if (err) { toast(`${file.name}: ${err}`, 'error'); continue; }
    const path = uniquePath(wanted);
    const isAsset = ASSET_EXTS.has(fileExt(path));
    try {
      let content;
      if (isAsset) {
        const chk = checkUpload(file);
        if (chk.error) { toast(chk.error, 'error'); continue; }
        toast(`Uploading ${path}…`);
        const url = await uploadToCloudinary(chk.file, resourceFor(chk.kind));
        content = ASSET_PREFIX + JSON.stringify({ url, size: chk.file.size });
      } else {
        if (file.size > MAX_FILE_CHARS * 3) { toast(`${file.name} is too large.`, 'error'); continue; }
        content = (await file.text()).replace(/\r\n/g, '\n');
      }
      const r = await api(`/codespaces/${encodeURIComponent(X.id)}/files`, { method: 'PUT', body: { path, content, create: true } });
      if (E !== X) return;
      X.files.set(path, { content, saved: content, rev: r.file.rev, dirty: false, saving: false, conflict: null, by: S.user.username, error: '' });
      added++; firstPath = firstPath || path;
      renderFiles();
    } catch (e) { toast(`${file.name}: ${e.message}`, 'error'); }
  }
  if (added && E === X) { renderFiles(); openFile(firstPath); toast(`Uploaded ${added} file${added === 1 ? '' : 's'}.`, 'success'); }
}

/* ---------- download everything as a .zip (no library: a "stored" zip is easy to write) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(entries) {                       // entries: [{ name, data: Uint8Array }] → Blob
  const enc = new TextEncoder(), parts = [], central = [];
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, e.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((n, b) => n + (b.byteLength ?? b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
async function downloadZip() {
  const X = E; if (!X || !X.files.size) return toast('There are no files to download yet.', 'error');
  const enc = new TextEncoder(), entries = [], missed = [];
  for (const [path, f] of X.files) {
    const as = assetOf(f);
    if (!as) { entries.push({ name: path, data: enc.encode(f.content) }); continue; }
    try { const res = await fetch(as.url); if (!res.ok) throw new Error('bad status'); entries.push({ name: path, data: new Uint8Array(await res.arrayBuffer()) }); }
    catch { missed.push(path); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(makeZip(entries));
  a.download = (String(X.meta?.name || 'codespace').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'codespace') + '.zip';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast(missed.length ? `Downloaded, but ${missed.length} uploaded file${missed.length === 1 ? '' : 's'} couldn’t be included: ${missed.join(', ')}` : 'Downloaded all files.', missed.length ? 'error' : 'success');
}

/* ---------- running + preview ---------- */
function filesObject() { const o = {}; for (const [p, f] of E.files) if (!assetOf(f)) o[p] = f.content; return o; }
function pickEntry() {
  const paths = [...E.files.keys()];
  const htmls = paths.filter((p) => kindOf(p) === 'html');
  const lastHtml = E.entry && E.files.has(E.entry) && kindOf(E.entry) === 'html' ? E.entry : E.files.has('index.html') ? 'index.html' : htmls[0];
  const a = E.active && kindOf(E.active) !== 'asset' ? E.active : null;
  const k = a ? kindOf(a) : null;
  if (k === 'html' || k === 'py' || k === 'md' || k === 'svg') return a;
  if (k === 'js') return htmls.length ? lastHtml : a;
  if (htmls.length) return lastHtml;
  return ['main.py', 'main.js', 'index.js', 'app.js', 'README.md'].find((p) => E.files.has(p)) || a || paths.find((p) => kindOf(p) !== 'asset') || null;
}
function runPreview(entry, opts = {}) {
  if (!E) return;
  let target = entry;
  if (!target) {
    target = (opts.auto && E.entry && E.files.has(E.entry) && kindOf(E.entry) === 'html' && (!E.active || kindOf(E.active) !== 'html' || E.active === E.entry)) ? E.entry : pickEntry();
    if (opts.auto && target && ['py', 'js'].includes(kindOf(target))) return;      // don't re-execute programs on every keystroke
  }
  if (!target || !E.files.has(target)) { return startFrame({ kind: 'message', title: 'Nothing to run', text: 'Add an index.html, main.py or main.js file and press Run.' }, ''); }
  if (!opts.noHistory && E.hist[E.hi] !== target) { E.hist = E.hist.slice(0, E.hi + 1); E.hist.push(target); E.hi = E.hist.length - 1; }
  E.entry = kindOf(target) === 'html' ? target : E.entry;
  startFrame({ kind: kindOf(target), entry: target, files: filesObject() }, target);
  if (!opts.quiet && !opts.auto && window.innerWidth <= 860) setPane('preview');
}
function startFrame(payload, label) {
  const stage = $('#pv-stage'); if (!stage) return;
  stage.innerHTML = '';
  clearLogs();
  const runId = ++E.runSeq;
  const f = document.createElement('iframe');
  f.className = 'pv-frame'; f.title = 'Live preview'; f.setAttribute('sandbox', SANDBOX); f.referrerPolicy = 'no-referrer';
  E.frame = f; E.payload = Object.assign({ src: 'cs-host', type: 'run', runId }, payload); E.sent = false;
  f.src = RUNNER_URL;
  stage.appendChild(f);
  const url = $('#pv-url'); if (url) { url.value = label || ''; url.title = label || ''; }
  updateHistoryButtons();
}
function navigateTo(raw) {
  const want = csNorm(String(raw || '').split('#')[0].split('?')[0]);
  const hit = [...E.files.keys()].find((p) => p === want) || [...E.files.keys()].find((p) => p.toLowerCase() === want.toLowerCase())
    || (want === '' ? null : [...E.files.keys()].find((p) => p === want + '/index.html'));
  if (hit) return runPreview(hit);
  if (!E.hist.length || E.hist[E.hi] !== want) { E.hist = E.hist.slice(0, E.hi + 1); E.hist.push(want); E.hi = E.hist.length - 1; }
  startFrame({ kind: 'message', title: '404', text: `Cannot find “${want || '/'}” in this codespace.` }, want);
}
function historyGo(d) {
  const i = E.hi + d; if (i < 0 || i >= E.hist.length) return;
  E.hi = i; const p = E.hist[i];
  if (E.files.has(p)) runPreview(p, { noHistory: true }); else startFrame({ kind: 'message', title: '404', text: `Cannot find “${p}” in this codespace.` }, p);
}
function updateHistoryButtons() {
  const b = $('#pv-back'), f = $('#pv-fwd'); if (!b || !E) return;
  b.disabled = E.hi <= 0; f.disabled = E.hi >= E.hist.length - 1;
}
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!E || !d || d.src !== 'cs-runner' || !E.frame || e.source !== E.frame.contentWindow) return;
  if (d.type === 'ready') {
    if (E.payload && !E.sent) { E.sent = true; E.frame.contentWindow.postMessage(E.payload, '*'); }
    return;
  }
  if (!E.payload || d.runId !== E.payload.runId) return;
  if (d.type === 'console') addLog(d.level, d.text);
  else if (d.type === 'clear') clearLogs();
  else if (d.type === 'loaded') { const u = $('#pv-url'); if (u && d.title) u.title = d.title; }
  else if (d.type === 'navigate') {
    if (d.path) runPreview(d.path);
    else navigateTo(d.href);
  }
});

/* console panel */
const LOG_ICON = { error: '✕', warn: '!', info: 'i', debug: '·', log: '›' };
function addLog(level, text) {
  const box = $('#pv-logs'); if (!box || !E) return;
  level = LOG_ICON[level] ? level : 'log';
  E.logs.push({ level, text });
  if (E.logs.length > 400) { E.logs.shift(); box.firstChild?.remove(); }
  const row = document.createElement('div'); row.className = 'cl cl-' + level;
  row.innerHTML = `<span class="cl-ico" aria-hidden="true">${LOG_ICON[level]}</span><pre></pre>`; row.lastChild.textContent = String(text).slice(0, 5000);
  const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.appendChild(row); if (stick) box.scrollTop = box.scrollHeight;
  if (level === 'error') { E.errors++; setConsole(true); }
  updateConsoleCount();
}
function clearLogs() { if (!E) return; E.logs = []; E.errors = 0; const b = $('#pv-logs'); if (b) b.innerHTML = ''; updateConsoleCount(); }
function updateConsoleCount() {
  const c = $('#pv-count'); if (!c || !E) return;
  c.hidden = !E.logs.length; c.textContent = E.logs.length > 99 ? '99+' : E.logs.length; c.classList.toggle('err', E.errors > 0);
}
function setConsole(open) {
  if (!E) return; E.consoleOpen = open;
  const p = $('#pv-console'), b = $('#pv-console-btn'); if (p) p.hidden = !open; if (b) b.setAttribute('aria-pressed', String(open));
}
function setPane(p) {
  const body = $('#cs-body'); if (!body) return; body.dataset.pane = p; if (E) E.pane = p;
  $$('.cs-panes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === p)));
}

/* ---------- sharing + settings ---------- */
function renameCodespaceModal() {
  const X = E; if (X.role !== 'owner') return;
  openModal({
    title: 'Rename codespace',
    html: `<form id="rc-form" novalidate><div class="form-error" id="rc-error" role="alert"></div>
      ${fieldHtml({ id: 'rc-name', label: 'Name', value: X.meta.name, maxlength: 60 })}
      ${fieldHtml({ id: 'rc-desc', label: 'Description', textarea: true, rows: 2, required: false, value: X.meta.description || '', maxlength: 300 })}
      <div class="modal-actions"><button class="btn danger" type="button" data-del style="margin-right:auto">${icon('trash', 15)} Delete</button><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`,
    onOpen: (d, close) => {
      $('#rc-name', d).focus();
      $('[data-del]', d).addEventListener('click', async () => { close(); if (await deleteCodespace(X.id)) { X.files.forEach((f) => { f.dirty = false; }); go('#/web/codespaces'); } });
      $('#rc-form', d).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const btn = $('button[type=submit]', d), body = { name: $('#rc-name', d).value.trim(), description: $('#rc-desc', d).value.trim() };
        clearErrs(ev.currentTarget);
        if (body.name.length < 2 || body.name.length > 60) return setErr('rc-name', 'Name must be 2–60 characters.');
        busy(btn, true, 'Saving…');
        try {
          const r = await api(`/codespaces/${encodeURIComponent(X.id)}`, { method: 'PATCH', body });
          if (E === X) { X.meta = r.codespace; const n = $('#cs-name'); n.textContent = X.meta.name; n.title = X.meta.name; document.title = `${X.meta.name} — Webcord`; }
          close();
        } catch (e) { busy(btn, false); if (!applyServerErrors({ name: 'rc-name', description: 'rc-desc' }, e)) $('#rc-error', d).textContent = e.message; }
      });
    },
  });
}

function shareModal() {
  const X = E, owner = X.role === 'owner';
  const link = `${location.origin}${location.pathname}#/codespace/${encodeURIComponent(X.id)}`;
  let dlg = null, closeModal = () => {};
  const paint = () => {
    const body = dlg && $('#sh-body', dlg); if (!body) return;
    const m = X.meta;
    const visOpts = owner
      ? `<div class="opts three">${Object.entries(VIS).map(([v, o]) => `<label class="opt"><input type="radio" name="sh-vis" value="${v}" ${m.visibility === v ? 'checked' : ''}><span class="opt-in">${icon(o.icon, 18)}<b>${o.label}</b><small>${o.hint}</small></span></label>`).join('')}</div>`
      : `<p class="vis-line">${visBadge(m.visibility)} <span>${esc((VIS[m.visibility] || VIS.private).hint)}</span></p>`;
    const people = [{ user: m.owner, role: 'owner' }].concat(X.members);
    const showPeople = m.visibility !== 'public' && (owner || m.visibility === 'shared');
    body.innerHTML = `
      <div class="sh-sec"><h3>Who can access</h3>${visOpts}${owner && m.visibility === 'public' ? '<p class="hint">Anyone on Webcord can open this codespace and edit it. It appears in everyone’s Web tab.</p>' : ''}${owner && m.visibility === 'private' ? '<p class="hint">Switching to Private removes everyone you shared it with.</p>' : ''}</div>
      ${showPeople ? `<div class="sh-sec"><h3>People</h3>
        ${owner ? `<form class="sh-add" id="sh-add" autocomplete="off" novalidate><div class="sh-add-row"><div class="sh-find"><input class="input" id="sh-user" placeholder="Add by username" aria-label="Username to add" maxlength="20" autocapitalize="none" spellcheck="false"><div class="sh-suggest" id="sh-suggest" hidden></div></div>
          <select class="select" id="sh-role" aria-label="Permission"><option value="edit">Can edit</option><option value="view">Can view</option></select><button class="btn primary" type="submit">Add</button></div><p class="err" id="sh-err" role="alert"></p></form>` : ''}
        <ul class="sh-people">${people.map((p) => `<li>${avatar(p.user, 32)}<div class="who"><b>${nameHtml(p.user, { tag: false })}</b><small>@${esc(p.user.username)}</small></div>
          ${p.role === 'owner' ? '<span class="role-tag">Owner</span>' : owner
            ? `<select class="select sm" data-sh-role="${esc(p.user.username)}" aria-label="Permission for ${esc(p.user.username)}"><option value="edit" ${p.role === 'edit' ? 'selected' : ''}>Can edit</option><option value="view" ${p.role === 'view' ? 'selected' : ''}>Can view</option></select><button class="btn icon sm ghost" data-sh-rm="${esc(p.user.username)}" aria-label="Remove ${esc(p.user.username)}">${icon('x', 16)}</button>`
            : p.user.id === S.user.id ? `<span class="role-tag">${p.role === 'view' ? 'Can view' : 'Can edit'}</span><button class="btn sm" data-sh-leave>Leave</button>` : `<span class="role-tag">${p.role === 'view' ? 'Can view' : 'Can edit'}</span>`}</li>`).join('')}</ul></div>` : ''}
      <div class="sh-sec"><h3>Link</h3><div class="sh-link"><input class="input" readonly value="${esc(link)}" aria-label="Codespace link" id="sh-link"><button class="btn" data-sh-copy>${icon('copy', 15)} Copy</button></div>
        <p class="hint">${m.visibility === 'private' ? 'Only you can open this link.' : m.visibility === 'public' ? 'Anyone signed in to Webcord can open this link.' : 'Only the people above can open this link.'}</p></div>`;
    bindShare(body);
  };
  const bindShare = (body) => {
    $$('input[name=sh-vis]', body).forEach((r) => r.addEventListener('change', async () => {
      const v = r.value;
      if (v === 'private' && X.members.length && !(await confirmDialog('Making this private removes everyone you shared it with. Continue?', 'Make private'))) return paint();
      try {
        const res = await api(`/codespaces/${encodeURIComponent(X.id)}`, { method: 'PATCH', body: { visibility: v } });
        X.meta = res.codespace; X.members = res.members; const b = $('#cs-vis'); if (b) b.innerHTML = visBadge(X.meta.visibility);
        if (v === 'shared') toast('Add the people you want to share it with.', '');
      } catch (e) { toast(e.message, 'error'); }
      paint();
    }));
    $('[data-sh-copy]', body)?.addEventListener('click', async (ev) => { const ok = await copyText(link); const b = ev.currentTarget; b.innerHTML = ok ? `${icon('check', 15)} Copied` : 'Press Ctrl+C'; setTimeout(() => { b.innerHTML = `${icon('copy', 15)} Copy`; }, 1500); });
    $('[data-sh-leave]', body)?.addEventListener('click', async () => {
      try { await api(`/codespaces/${encodeURIComponent(X.id)}/members/${encodeURIComponent(S.user.username)}`, { method: 'DELETE' }); closeModal(); toast('You left this codespace.', 'success'); go('#/web/codespaces'); } catch (e) { toast(e.message, 'error'); }
    });
    $$('[data-sh-rm]', body).forEach((b) => b.addEventListener('click', async () => {
      try { const r = await api(`/codespaces/${encodeURIComponent(X.id)}/members/${encodeURIComponent(b.dataset.shRm)}`, { method: 'DELETE' }); X.members = r.members; paint(); } catch (e) { toast(e.message, 'error'); }
    }));
    $$('[data-sh-role]', body).forEach((s) => s.addEventListener('change', async () => {
      try { const r = await api(`/codespaces/${encodeURIComponent(X.id)}/members`, { method: 'POST', body: { username: s.dataset.shRole, role: s.value } }); X.members = r.members; } catch (e) { toast(e.message, 'error'); paint(); }
    }));
    const form = $('#sh-add', body); if (!form) return;
    const input = $('#sh-user', body), box = $('#sh-suggest', body);
    const add = async (username) => {
      setErr2('');
      const name = username.trim().replace(/^@/, '');
      if (!name) return setErr2('Enter a username.');
      const btn = $('button[type=submit]', form); busy(btn, true);
      try {
        const r = await api(`/codespaces/${encodeURIComponent(X.id)}/members`, { method: 'POST', body: { username: name, role: $('#sh-role', body).value } });
        X.meta = r.codespace; X.members = r.members; const b = $('#cs-vis'); if (b) b.innerHTML = visBadge(X.meta.visibility);
        paint();
      } catch (e) { busy(btn, false); setErr2(e.fields?.username || e.message); }
    };
    const setErr2 = (m) => { const el = $('#sh-err', body); if (el) el.textContent = m; };
    form.addEventListener('submit', (e) => { e.preventDefault(); add(input.value); });
    let seq = 0;
    input.addEventListener('input', debounce(async () => {
      const q = input.value.trim().replace(/^@/, ''); const my = ++seq;
      if (!q) { box.hidden = true; return; }
      try {
        const r = await api('/users?q=' + encodeURIComponent(q), { quiet: true });
        if (my !== seq) return;
        const taken = new Set(X.members.map((m) => m.user.id).concat(X.meta.owner.id));
        const list = r.users.filter((u) => !taken.has(u.id));
        box.hidden = !list.length;
        box.innerHTML = list.map((u) => `<button type="button" data-pick="${esc(u.username)}">${avatar(u, 24)}<span><b>${nameHtml(u, { tag: false })}</b> <small>@${esc(u.username)}</small></span></button>`).join('');
      } catch { box.hidden = true; }
    }, 200));
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) { box.hidden = true; input.value = b.dataset.pick; add(b.dataset.pick); } });
  };
  openModal({ title: owner ? 'Share & access' : 'Details', wide: true, html: '<div id="sh-body"></div>', onOpen: (d, close) => { dlg = d; closeModal = close; paint(); } });
}

async function forkCodespace() {
  const X = E;
  try {
    const r = await api(`/codespaces/${encodeURIComponent(X.id)}/fork`, { method: 'POST', body: {} });
    toast('Copied to your codespaces.', 'success'); go('#/codespace/' + encodeURIComponent(r.codespace.id));
  } catch (e) { toast(e.message, 'error'); }
}

/* ======================================================================
   Event delegation for everything marked data-cs="…"
   ====================================================================== */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-cs]'); if (!t) return;
  const a = t.dataset.cs;
  switch (a) {
    case 'new': newCodespaceModal(); break;
    case 'scope': CS.scope = t.dataset.scope; $$('.chip[data-cs=scope]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.scope === CS.scope))); loadCodespaces(true); break;
    case 'more': busy(t, true); await loadCodespaces(false); break;
    case 'retry-list': loadCodespaces(true); break;
    case 'delete-cs': e.preventDefault(); if (await deleteCodespace(t.dataset.id)) { CS.items = CS.items.filter((x) => x.id !== t.dataset.id); loadCodespaces(true); } break;
    default: break;
  }
  if (!E) return;
  switch (a) {
    case 'run': runPreview(); break;
    case 'zip': downloadZip(); break;
    case 'download-asset': { const f = E.files.get(t.dataset.path), as = assetOf(f); if (as) downloadAttachment({ url: as.url, name: t.dataset.path.split('/').pop() }); break; }
    case 'agent': agToggle(); break;
    case 'share': shareModal(); break;
    case 'rename-cs': renameCodespaceModal(); break;
    case 'fork': forkCodespace(); break;
    case 'open-file': openFile(t.dataset.path); break;
    case 'close-tab': closeTab(t.dataset.path); break;
    case 'toggle-folder': E.collapsed.has(t.dataset.path) ? E.collapsed.delete(t.dataset.path) : E.collapsed.add(t.dataset.path); renderFiles(); break;
    case 'new-file': newFileModal(); break;
    case 'rename-file': renameFileModal(t.dataset.path); break;
    case 'delete-file': deleteFile(t.dataset.path); break;
    case 'upload': $('#cs-upload')?.click(); break;
    case 'toggle-files': $('#cs-left').classList.toggle(window.innerWidth <= 860 ? 'files-open' : 'files-closed'); break;
    case 'pane': setPane(t.dataset.pane); break;
    case 'pv-back': historyGo(-1); break;
    case 'pv-fwd': historyGo(1); break;
    case 'toggle-console': setConsole(!E.consoleOpen); break;
    case 'clear-console': clearLogs(); break;
    case 'conflict-mine': resolveConflict(true); break;
    case 'conflict-theirs': resolveConflict(false); break;
    default: break;
  }
});
