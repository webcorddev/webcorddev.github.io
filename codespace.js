/* Webcord codespaces — a multi-file code editor with a live, browser-like preview.
   Loaded after app.js and shares its globals ($, api, icon, openModal, shikiPre, fileKind, …). */
'use strict';

Object.assign(ICONS, {
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  terminal: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
});

const CS_VIS = {
  private: { label: 'Private', icon: 'lock', desc: 'Only you can see and edit it.' },
  shared: { label: 'Shared', icon: 'users', desc: 'You and the people you add. It appears in their Web section.' },
  public: { label: 'Public', icon: 'globe', desc: 'Listed in the Web section for everyone. Anyone logged in can edit.' },
};
const visBadge = (v) => `<span class="vis vis-${v}">${icon(CS_VIS[v].icon, 13)}${CS_VIS[v].label}</span>`;
const csChip = (name) => { const k = fileKind(name); return `<span class="chip tone-${k.tone}">${esc(k.badge)}</span>`; };
const ago = (ts) => {
  const s = Math.max(1, ((Date.now() - ts) / 1000) | 0); if (s < 60) return 'just now';
  const m = (s / 60) | 0; if (m < 60) return `${m}m ago`;
  const h = (m / 60) | 0; if (h < 24) return `${h}h ago`;
  const d = (h / 24) | 0; return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString();
};
const CS_MAX_FILES = 40, CS_MAX_CHARS = 200000;
function csValidPath(p) {
  return p.length <= 100 && /^[A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+){0,3}$/.test(p) && !p.split('/').some((x) => x === '.' || x === '..');
}
/* Same path rules as the runner, so the address bar and navigation behave like a real server. */
function csResolve(base, ref) {
  ref = String(ref).split('#')[0].split('?')[0].trim();
  if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.slice(0, 2) === '//') return null;
  const parts = ref[0] === '/' ? [] : base.split('/').slice(0, -1).filter(Boolean);
  for (const seg of ref.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') parts.pop(); else parts.push(seg); }
  return parts.join('/');
}

/* ======================================================================
   Web section → Codespaces list
   ====================================================================== */
const CSL = { scope: 'public', q: '', items: [], offset: 0, hasMore: false, seq: 0 };
try { CSL.scope = localStorage.getItem('webcord.csScope') || 'public'; } catch { /* storage unavailable */ }

function csRenderList() {
  const root = $('#cs-list-root'); if (!root) return;
  const chips = [['public', 'Public'], ['shared', 'Shared with me'], ['mine', 'My codespaces']];
  root.innerHTML = `<div class="toolbar cs-toolbar"><div class="chips" role="tablist" aria-label="Filter codespaces">${chips.map(([k, l]) => `<button type="button" role="tab" class="chip-btn" aria-selected="${CSL.scope === k}" data-action="cs-scope" data-scope="${k}">${l}</button>`).join('')}</div>
    <div class="search">${icon('search')}<input class="input" id="cs-search" type="search" placeholder="Search codespaces" aria-label="Search codespaces" value="${esc(CSL.q)}"></div></div><div id="cs-results"></div>`;
  $('#cs-search').addEventListener('input', debounce((e) => { CSL.q = e.target.value.trim(); csLoadList(true); }, 300));
  csLoadList(true);
}
function csCard(c) {
  const exts = []; for (const p of c.paths || []) { const e = fileExt(p); if (!exts.includes(e)) exts.push(e); }
  return `<a class="card cs-card" href="#/code/${esc(c.id)}">
    <div class="cs-card-top">${visBadge(c.visibility)}<small>${esc(ago(c.updated_at))}</small></div>
    <h3>${esc(c.title)}</h3><p>${c.description ? esc(c.description) : '<span class="muted">No description</span>'}</p>
    <div class="cs-card-chips">${exts.slice(0, 6).map((e) => csChip('x.' + e)).join('')}<small>${(c.paths || []).length} file${(c.paths || []).length === 1 ? '' : 's'}</small></div>
    <div class="proj-foot"><span class="creator">${avatar(c.owner, 26)}<span>${esc(c.owner.display_name)}</span></span><span class="btn sm">${icon('code', 14)} Open</span></div></a>`;
}
async function csLoadList(reset) {
  const box = $('#cs-results'); if (!box) return;
  if (reset) { CSL.offset = 0; CSL.items = []; box.innerHTML = '<div class="loading-row"><span class="spinner"></span>Loading codespaces…</div>'; }
  const seq = ++CSL.seq;
  try {
    const r = await api(`/codespaces?scope=${CSL.scope}&limit=24&offset=${CSL.offset}${CSL.q ? '&q=' + encodeURIComponent(CSL.q) : ''}`);
    if (seq !== CSL.seq || !$('#cs-results')) return;
    CSL.items = CSL.items.concat(r.codespaces); CSL.offset = CSL.items.length; CSL.hasMore = r.has_more;
    if (!CSL.items.length) {
      const msg = CSL.q ? ['No codespaces match your search', 'Try a different keyword.']
        : CSL.scope === 'mine' ? ['You don’t have any codespaces yet', 'Create one to write and run code right in your browser.']
          : CSL.scope === 'shared' ? ['Nothing has been shared with you yet', 'When someone adds you to a codespace it shows up here.']
            : ['No public codespaces yet', 'Be the first to create one that anyone can edit.'];
      box.innerHTML = `<div class="empty"><div class="em-ico">${icon('code', 24)}</div><h3>${msg[0]}</h3><p>${msg[1]}</p><button class="btn primary" data-action="new-codespace">${icon('plus', 16)} New codespace</button></div>`;
      return;
    }
    box.innerHTML = `<div class="grid">${CSL.items.map(csCard).join('')}</div>${CSL.hasMore ? '<div style="text-align:center;margin-top:22px"><button class="btn" data-action="cs-more">Load more</button></div>' : ''}`;
  } catch (e) {
    if (seq !== CSL.seq) return;
    box.innerHTML = `<div class="empty"><h3>Couldn’t load codespaces</h3><p>${esc(e.message)}</p><button class="btn primary" data-action="cs-retry">Try again</button></div>`;
  }
}

function newCodespaceModal() {
  const tpl = [['web', 'Website', 'HTML + CSS + JS'], ['javascript', 'JavaScript', 'Modules + console'], ['python', 'Python', 'Runs in your browser'], ['blank', 'Blank', 'Just an index.html']];
  openModal({
    title: 'New codespace',
    html: `<form id="cs-new" novalidate>
      ${fieldHtml({ id: 'cs-n-title', label: 'Name', placeholder: 'My cool project', maxlength: 60 })}
      ${fieldHtml({ id: 'cs-n-desc', label: 'Description (optional)', placeholder: 'What is it about?', maxlength: 200, required: false })}
      <div class="field"><label>Start from</label><div class="opt-grid">${tpl.map(([k, t, d], i) => `<label class="opt"><input type="radio" name="tpl" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div></div>
      <div class="field"><label>Who can see it?</label><div class="opt-list">${Object.entries(CS_VIS).map(([k, v], i) => `<label class="opt"><input type="radio" name="vis" value="${k}" ${i === 0 ? 'checked' : ''}><span class="opt-ico">${icon(v.icon, 18)}</span><span><b>${v.label}</b><small>${v.desc}</small></span></label>`).join('')}</div></div>
      <p class="err" id="cs-n-error" role="alert"></p>
      <div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Create codespace</button></div></form>`,
    onOpen: (d, close) => {
      const form = $('#cs-new', d); $('#cs-n-title', d).focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); clearErrs(form); $('#cs-n-error', d).textContent = '';
        const title = $('#cs-n-title', d).value.trim();
        if (!title) return setErr('cs-n-title', 'Give your codespace a name.');
        const btn = $('button[type=submit]', form); busy(btn, true, 'Creating…');
        try {
          const r = await api('/codespaces', { method: 'POST', body: { title, description: $('#cs-n-desc', d).value.trim(), template: form.tpl.value, visibility: form.vis.value } });
          close(); go('#/code/' + r.id);
        } catch (err) { busy(btn, false); if (!applyServerErrors({ title: 'cs-n-title', description: 'cs-n-desc' }, err)) $('#cs-n-error', d).textContent = err.message; }
      });
    },
  });
}

/* ======================================================================
   Editor page
   ====================================================================== */
const CS = {};
function csReset() {
  return Object.assign(CS, {
    id: null, meta: null, files: new Map(), open: [], active: null, since: 0, dirty: new Set(), removed: new Set(),
    saveT: null, saving: false, pollT: null, polling: false, hlT: null, hlTok: 0, status: 'saved',
    webFrame: null, pyFrame: null, pyReady: false, pyQueue: null, webPayload: null, hist: [], hi: -1, scriptEntry: null,
    logs: [], errs: 0, view: 'preview', device: 'desktop', loadT: null,
  });
}
csReset();

const csSnapshot = () => { const o = {}; CS.files.forEach((f, p) => { o[p] = f.content; }); return o; };
const csPathSort = (a, b) => {
  const da = a.includes('/') ? a.slice(0, a.lastIndexOf('/')) : '', db = b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : '';
  return da === db ? a.localeCompare(b) : da.localeCompare(db);
};
const csBeforeUnload = (e) => { if (CS.dirty.size || CS.removed.size) { e.preventDefault(); e.returnValue = ''; } };

function csLeave() {
  if (!CS.id) return;
  clearInterval(CS.pollT); clearTimeout(CS.saveT); clearTimeout(CS.hlT); clearTimeout(CS.loadT);
  if (CS.dirty.size || CS.removed.size) saveNow(true); // fire and forget: the payload is built before this function returns
  window.removeEventListener('beforeunload', csBeforeUnload);
  csReset();
}

async function renderCodespace(id, token) {
  if (!id) return go('#/web/code');
  if (CS.id === id && $('#cs')) return;
  csLeave();
  setMain('<div class="loading-row"><span class="spinner"></span>Opening codespace…</div>', true);
  let r;
  try { r = await api('/codespaces/' + encodeURIComponent(id)); } catch (e) {
    if (token !== S.token) return;
    setMain(`<div class="page"><div class="empty"><h3>${e.status === 404 ? 'Codespace not found' : 'Couldn’t open this codespace'}</h3><p>${e.status === 404 ? 'It may have been deleted, or it isn’t shared with you.' : esc(e.message)}</p><a class="btn primary" href="#/web/code">Back to codespaces</a></div></div>`);
    return;
  }
  if (token !== S.token) return;
  csReset();
  CS.id = r.codespace.id; CS.meta = r.codespace; CS.since = r.now;
  for (const f of r.files) CS.files.set(f.path, { content: f.content });
  const paths = [...CS.files.keys()].sort(csPathSort);
  CS.active = paths.includes('index.html') ? 'index.html' : paths.find((p) => /\.html?$/.test(p)) || paths[0] || null;
  CS.open = CS.active ? [CS.active] : [];
  csMount();
  window.addEventListener('beforeunload', csBeforeUnload);
  CS.pollT = setInterval(csPoll, 4000);
}

function csMount() {
  const m = CS.meta;
  setMain(`<div class="cs" id="cs" data-pane="code">
    <header class="cs-head">
      <a class="btn icon ghost" href="#/web/code" aria-label="Back to codespaces" title="Back to codespaces">${icon('chevleft', 20)}</a>
      <div class="cs-titlebox"><button type="button" class="cs-title" id="cs-title" data-action="cs-details" title="${m.is_owner ? 'Rename or delete' : 'Details'}">${esc(m.title)}</button><span id="cs-vis">${visBadge(m.visibility)}</span></div>
      <span class="cs-status" id="cs-status" data-s="saved"><i></i><span>Saved</span></span>
      <span class="spacer"></span>
      <span class="cs-people" id="cs-people"></span>
      <button type="button" class="btn sm" id="cs-share" data-action="cs-share">${icon('users', 15)} <span>${m.is_owner ? 'Share' : 'People'}</span></button>
      <button type="button" class="btn primary sm" id="cs-run" data-action="cs-run" title="Run (Ctrl+Enter)">${icon('play', 13)} Run</button>
    </header>
    <div class="seg cs-seg" role="tablist"><button type="button" role="tab" data-action="cs-seg" data-pane="code" aria-selected="true">${icon('code', 15)} Code</button><button type="button" role="tab" data-action="cs-seg" data-pane="preview" aria-selected="false">${icon('window', 15)} Preview</button></div>
    <div class="cs-body" id="cs-body">
      <section class="cs-left">
        <aside class="cs-files" id="cs-files" aria-label="Files"></aside>
        <div class="cs-main"><div class="cs-tabs" id="cs-tabs"></div><div class="cs-editor" id="cs-editor"></div></div>
      </section>
      <div class="cs-resizer" id="cs-resizer" role="separator" aria-orientation="vertical" aria-label="Resize panels"></div>
      <section class="cs-right">
        <div class="cs-rhead">
          <div class="cs-rtabs" role="tablist"><button type="button" role="tab" data-action="cs-view" data-view="preview" aria-selected="true">${icon('window', 15)} Preview</button><button type="button" role="tab" data-action="cs-view" data-view="console" aria-selected="false">${icon('terminal', 15)} Console <span class="cs-badge" id="cs-badge" hidden></span></button></div>
          <span class="spacer"></span><button type="button" class="btn sm ghost" id="cs-stop" data-action="cs-stop" hidden>${icon('stop', 12)} Stop</button>
        </div>
        <div class="cs-pane" id="cs-pane-preview"><div class="cs-browser">
          <div class="cs-tabstrip"><span class="cs-faketab"><i></i><span id="cs-ptitle">New tab</span></span></div>
          <div class="cs-bar">
            <button type="button" class="btn icon sm ghost" id="cs-nb" data-action="cs-back" aria-label="Back" disabled>${icon('chevleft', 17)}</button>
            <button type="button" class="btn icon sm ghost" id="cs-nf" data-action="cs-forward" aria-label="Forward" disabled>${icon('chevright', 17)}</button>
            <button type="button" class="btn icon sm ghost" data-action="cs-reload" aria-label="Reload" title="Reload">${icon('refresh', 15)}</button>
            <div class="cs-url" id="cs-url" title="Preview address">${icon('lock', 13)}<span class="h">codespace.local</span><span id="cs-url-path">/</span></div>
            <button type="button" class="btn icon sm ghost" data-action="cs-device" data-device="desktop" aria-label="Desktop size" aria-pressed="true">${icon('monitor', 16)}</button>
            <button type="button" class="btn icon sm ghost" data-action="cs-device" data-device="mobile" aria-label="Phone size" aria-pressed="false">${icon('phone', 16)}</button>
          </div>
          <div class="cs-loadbar" id="cs-loadbar"></div>
          <div class="cs-frame-host" id="cs-frame-host" data-device="desktop"><div class="cs-empty" id="cs-pempty"><div class="em-ico">${icon('play', 22)}</div><h3>Nothing running yet</h3><p>Press <b>Run</b> to preview your page or run your code.</p></div></div>
        </div></div>
        <div class="cs-pane" id="cs-pane-console" hidden>
          <div class="cs-console-head"><span>Console</span><button type="button" class="btn sm ghost" data-action="cs-clear">Clear</button></div>
          <div class="cs-log" id="cs-log" role="log" aria-live="polite"></div>
          <form class="cs-repl" id="cs-repl" autocomplete="off"><span>›</span><input id="cs-repl-in" placeholder="Run JavaScript in the page…" spellcheck="false" autocapitalize="off" aria-label="Console input"></form>
        </div>
      </section>
    </div></div>`, true);
  csMountEditor(); csRenderHead(); csRenderFiles(); csRenderTabs(); csLoadActive();
  $('#cs-resizer').addEventListener('pointerdown', csStartResize);
  $('#cs-repl').addEventListener('submit', csRepl);
  $('#cs').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
  });
  CS.logs.forEach((l) => csAppendLog(l)); csUpdateBadge();
}

function csRenderHead() {
  const m = CS.meta; if (!m || !$('#cs')) return;
  $('#cs-title').textContent = m.title; $('#cs-vis').innerHTML = visBadge(m.visibility);
  document.title = `${m.title} — Webcord`;
  const people = [m.owner, ...(m.members || [])].slice(0, 5);
  $('#cs-people').innerHTML = people.map((u) => `<span class="cs-person" title="${esc(u.display_name)} (@${esc(u.username)})">${avatar(u, 26)}</span>`).join('') + ((m.members || []).length + 1 > 5 ? `<span class="cs-more">+${(m.members || []).length + 1 - 5}</span>` : '');
}
function csSetStatus(s) {
  CS.status = s; const el = $('#cs-status'); if (!el) return;
  el.dataset.s = s; $('span', el).textContent = { saved: 'Saved', saving: 'Saving…', dirty: 'Unsaved changes', error: 'Couldn’t save — retrying' }[s];
}

/* ---------- files + tabs ---------- */
function csRenderFiles() {
  const box = $('#cs-files'); if (!box) return;
  const paths = [...CS.files.keys()].sort(csPathSort);
  let html = `<div class="cs-files-head"><span>Files</span><span><button type="button" class="btn icon sm ghost" data-action="cs-import" aria-label="Import files from your device" title="Import files">${icon('upload', 15)}</button><button type="button" class="btn icon sm ghost" data-action="cs-new-file" aria-label="New file" title="New file">${icon('plus', 16)}</button></span></div><div class="cs-flist">`;
  let lastDir = '';
  for (const p of paths) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    if (dir !== lastDir) {
      const prev = lastDir.split('/').filter(Boolean), cur = dir.split('/').filter(Boolean); let i = 0;
      while (i < prev.length && i < cur.length && prev[i] === cur[i]) i++;
      for (let j = i; j < cur.length; j++) html += `<div class="cs-dir" style="--d:${j}">${icon('folder', 14)}<span>${esc(cur[j])}</span></div>`;
      lastDir = dir;
    }
    const depth = dir ? dir.split('/').length : 0, name = p.slice(p.lastIndexOf('/') + 1);
    html += `<div class="cs-f${p === CS.active ? ' active' : ''}" style="--d:${depth}"><button type="button" class="cs-f-main" data-action="cs-open" data-path="${esc(p)}" title="${esc(p)}">${csChip(name)}<span class="n">${esc(name)}</span>${CS.dirty.has(p) ? '<i class="dirty"></i>' : ''}</button><span class="cs-f-act"><button type="button" class="btn icon sm ghost" data-action="cs-rename" data-path="${esc(p)}" aria-label="Rename ${esc(p)}">${icon('edit', 13)}</button><button type="button" class="btn icon sm ghost" data-action="cs-delete" data-path="${esc(p)}" aria-label="Delete ${esc(p)}">${icon('trash', 13)}</button></span></div>`;
  }
  if (!paths.length) html += '<p class="muted-p">No files yet. Add one with +.</p>';
  box.innerHTML = html + '</div><input type="file" id="cs-import" class="sr-only" tabindex="-1" multiple>';
  $('#cs-import', box).setAttribute('accept', FILE_ACCEPT.replace(IMAGE_ACCEPT + ',', ''));
  $('#cs-import', box).addEventListener('change', csImport);
}
function csRenderTabs() {
  const box = $('#cs-tabs'); if (!box) return;
  box.innerHTML = `<button type="button" class="btn icon sm ghost cs-files-toggle" data-action="cs-files-toggle" aria-label="Show files">${icon('folder', 17)}</button>` +
    CS.open.map((p) => `<div class="cs-tab${p === CS.active ? ' active' : ''}" role="tab" aria-selected="${p === CS.active}"><button type="button" class="cs-tab-main" data-action="cs-open" data-path="${esc(p)}" title="${esc(p)}">${csChip(p)}<span class="n">${esc(p.slice(p.lastIndexOf('/') + 1))}</span>${CS.dirty.has(p) ? '<i class="dirty"></i>' : ''}</button><button type="button" class="cs-tab-x" data-action="cs-close" data-path="${esc(p)}" aria-label="Close ${esc(p)}">${icon('x', 13)}</button></div>`).join('');
}
function csOpenFile(p) {
  if (!CS.files.has(p)) return;
  if (!CS.open.includes(p)) CS.open.push(p);
  CS.active = p; $('#cs')?.classList.remove('files-open');
  csRenderTabs(); csRenderFiles(); csLoadActive();
  $('#cs-ed-ta')?.focus({ preventScroll: true });
}
function csCloseTab(p) {
  const i = CS.open.indexOf(p); if (i < 0) return;
  CS.open.splice(i, 1);
  if (CS.active === p) CS.active = CS.open[Math.min(i, CS.open.length - 1)] || null;
  csRenderTabs(); csRenderFiles(); csLoadActive();
}
function csFileModal({ title, label, value = '', okLabel, onSubmit }) {
  openModal({
    title,
    html: `<form id="cs-fname" novalidate>${fieldHtml({ id: 'cs-f-name', label, value, placeholder: 'script.js', hint: 'Letters, numbers, dots, dashes and underscores. Use folders like <code>css/main.css</code>.', maxlength: 100 })}<div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">${okLabel}</button></div></form>`,
    onOpen: (d, close) => {
      const inp = $('#cs-f-name', d); inp.focus(); inp.setSelectionRange(0, value.includes('.') ? value.lastIndexOf('.') : value.length);
      $('#cs-fname', d).addEventListener('submit', (e) => {
        e.preventDefault();
        const name = inp.value.trim().replace(/^\/+/, '');
        const err = !name ? 'Enter a file name.' : !csValidPath(name) ? 'That isn’t a valid file name.' : name !== value && CS.files.has(name) ? 'A file with that name already exists.' : '';
        if (err) return setErr('cs-f-name', err);
        close(); onSubmit(name);
      });
    },
  });
}
function csMarkDirty(p) { CS.dirty.add(p); csSetStatus('dirty'); csScheduleSave(); }
function csNewFile() {
  if (CS.files.size >= CS_MAX_FILES) return toast(`A codespace can have at most ${CS_MAX_FILES} files.`, 'error');
  csFileModal({ title: 'New file', label: 'File name', okLabel: 'Create', onSubmit: (name) => {
    CS.files.set(name, { content: '' }); CS.removed.delete(name); csMarkDirty(name); csOpenFile(name);
  } });
}
function csRenameFile(p) {
  csFileModal({ title: 'Rename file', label: 'New name', value: p, okLabel: 'Rename', onSubmit: (name) => {
    if (name === p) return;
    const f = CS.files.get(p); if (!f) return;
    CS.files.delete(p); CS.files.set(name, f); CS.removed.add(p); CS.removed.delete(name); CS.dirty.delete(p); CS.dirty.add(name);
    CS.open = CS.open.map((x) => (x === p ? name : x)); if (CS.active === p) CS.active = name;
    csSetStatus('dirty'); csScheduleSave(); csRenderFiles(); csRenderTabs();
  } });
}
async function csDeleteFile(p) {
  if (!(await confirmDialog(`Delete ${p}? Everyone with access to this codespace will lose it.`, 'Delete'))) return;
  CS.files.delete(p); CS.removed.add(p); CS.dirty.delete(p); csSetStatus('dirty'); csScheduleSave();
  csCloseTab(p); csRenderFiles();
}
async function csImport(e) {
  const list = [...e.target.files]; e.target.value = '';
  for (const file of list) {
    const name = file.name.replace(/[^A-Za-z0-9_.\-]/g, '_').slice(0, 100);
    if (!csValidPath(name) || !isTextFile({ name })) { toast(`${file.name}: only text and code files can be imported.`, 'error'); continue; }
    if (file.size > CS_MAX_CHARS) { toast(`${file.name} is too large (limit 200 KB).`, 'error'); continue; }
    if (CS.files.size >= CS_MAX_FILES && !CS.files.has(name)) { toast(`A codespace can have at most ${CS_MAX_FILES} files.`, 'error'); break; }
    const text = (await file.text()).replace(/\r\n/g, '\n');
    CS.files.set(name, { content: text }); CS.removed.delete(name); csMarkDirty(name); csOpenFile(name);
  }
}

/* ---------- the editor: a textarea with a Shiki-highlighted layer underneath ---------- */
function csMountEditor() {
  $('#cs-editor').innerHTML = `<div class="ed" id="ed"><pre class="ed-gutter" id="ed-gutter" aria-hidden="true"></pre><div class="ed-scroll"><pre class="ed-hl" id="ed-hl" aria-hidden="true"><code id="ed-code"></code></pre><textarea class="ed-ta" id="cs-ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Code editor"></textarea></div></div>
    <div class="ed-empty" id="ed-empty" hidden><div class="em-ico">${icon('file', 22)}</div><h3>No file open</h3><p>Pick a file on the left, or create a new one.</p><button class="btn primary sm" data-action="cs-new-file">${icon('plus', 15)} New file</button></div>`;
  const ta = $('#cs-ed-ta');
  ta.addEventListener('input', csOnInput);
  ta.addEventListener('scroll', csSyncScroll);
  ta.addEventListener('keydown', csKeydown);
}
function csSyncScroll() {
  const ta = $('#cs-ed-ta'), hl = $('#ed-hl'), g = $('#ed-gutter'); if (!ta) return;
  hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; g.scrollTop = ta.scrollTop;
}
function csLoadActive() {
  const ta = $('#cs-ed-ta'); if (!ta) return;
  const f = CS.files.get(CS.active);
  $('#ed').hidden = !f; $('#ed-empty').hidden = !!f;
  if (!f) return;
  ta.value = f.content; ta.scrollTop = 0; ta.scrollLeft = 0; $('#ed-gutter')._n = -1; csPaint();
}
function csPaint() {
  const ta = $('#cs-ed-ta'); if (!ta || !CS.active) return;
  const code = ta.value, n = code.split('\n').length, g = $('#ed-gutter');
  if (g._n !== n) { g._n = n; g.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  const lang = fileKind(CS.active).lang, use = wantsHl(code, lang);
  $('#ed').classList.toggle('plain', !use);
  const el = $('#ed-code');
  if (!use) { el.textContent = ''; return; }
  el.textContent = code + '\n'; // same metrics as the textarea until the highlighted version arrives
  clearTimeout(CS.hlT);
  const tok = ++CS.hlTok;
  CS.hlT = setTimeout(async () => {
    try {
      const html = await shikiPre(code + '\n', lang, false);
      if (!html || tok !== CS.hlTok || $('#cs-ed-ta')?.value !== code) return;
      const t = document.createElement('template'); t.innerHTML = html;
      const inner = t.content.querySelector('pre code')?.innerHTML;
      if (inner != null) $('#ed-code').innerHTML = inner;
    } catch { /* highlighting is optional */ }
  }, code.length > 20000 ? 200 : 20);
  csSyncScroll();
}
function csOnInput() {
  const f = CS.files.get(CS.active); if (!f) return;
  f.content = $('#cs-ed-ta').value;
  const was = CS.dirty.has(CS.active);
  csMarkDirty(CS.active); csPaint();
  if (!was) { csRenderTabs(); csRenderFiles(); }
}
function csInsert(ta, text) {
  ta.focus();
  if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
}
function csKeydown(e) {
  const ta = e.target, mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter') { e.preventDefault(); return runCode(); }
  if (e.isComposing || mod || e.altKey) return;
  const unit = fileExt(CS.active) === 'py' ? '    ' : '  ';
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = ta.selectionStart, en = ta.selectionEnd;
    if (!e.shiftKey && s === en) return csInsert(ta, unit);
    const v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', en); if (le < 0) le = v.length;
    const block = v.slice(ls, le).split('\n').map((l) => (e.shiftKey ? l.replace(new RegExp('^(?: {1,' + unit.length + '}|\\t)'), '') : unit + l)).join('\n');
    ta.setSelectionRange(ls, le); csInsert(ta, block); ta.setSelectionRange(ls, ls + block.length);
  } else if (e.key === 'Enter' && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
    const v = ta.value, s = ta.selectionStart, ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s);
    const ind = line.match(/^[ \t]*/)[0], last = line.trimEnd().slice(-1), py = unit.length === 4;
    const extra = '{(['.includes(last) && last ? unit : py && last === ':' ? unit : '';
    e.preventDefault();
    if (extra && ((last === '{' && v[s] === '}') || (last === '(' && v[s] === ')') || (last === '[' && v[s] === ']'))) {
      csInsert(ta, '\n' + ind + extra + '\n' + ind); const pos = s + 1 + ind.length + extra.length; ta.setSelectionRange(pos, pos);
    } else csInsert(ta, '\n' + ind + extra);
  }
}

/* ---------- saving + live collaboration ---------- */
function csScheduleSave() { clearTimeout(CS.saveT); CS.saveT = setTimeout(() => saveNow(), 900); }
async function saveNow(force = false) {
  clearTimeout(CS.saveT);
  if (!CS.id || (CS.saving && !force) || (!CS.dirty.size && !CS.removed.size)) return;
  const id = CS.id, sent = {}, upsert = {};
  for (const p of CS.dirty) { const f = CS.files.get(p); if (f) { upsert[p] = f.content; sent[p] = f.content; } }
  const remove = [...CS.removed];
  CS.saving = true; csSetStatus('saving');
  try {
    await api(`/codespaces/${id}/files`, { method: 'PUT', body: { upsert, remove } });
    if (CS.id !== id) return;
    for (const p of Object.keys(sent)) { if (CS.files.get(p)?.content === sent[p]) CS.dirty.delete(p); }
    for (const p of remove) CS.removed.delete(p);
    csSetStatus(CS.dirty.size || CS.removed.size ? 'dirty' : 'saved');
    csRenderTabs(); csRenderFiles();
  } catch (e) {
    if (CS.id !== id) return;
    csSetStatus('error'); toast(e.message, 'error');
    CS.saveT = setTimeout(() => saveNow(), 6000);
  } finally { if (CS.id === id) { CS.saving = false; if ((CS.dirty.size || CS.removed.size) && CS.status !== 'error') csScheduleSave(); } }
}
async function csPoll() {
  if (!CS.id || CS.polling || document.hidden) return;
  const id = CS.id; CS.polling = true;
  try {
    const r = await api(`/codespaces/${id}/changes?since=${CS.since}`, { quiet: true });
    if (CS.id !== id) return;
    CS.since = Math.max(CS.since, r.now);
    CS.meta = r.codespace; csRenderHead();
    csApplyRemote(r.files);
  } catch (e) {
    if (CS.id === id && e.status === 404) { toast('This codespace is no longer available to you.', 'error'); csLeave(); go('#/web/code'); }
  } finally { if (CS.id === id) CS.polling = false; }
}
function csApplyRemote(files) {
  let structure = false, activeChanged = false;
  for (const f of files) {
    if (CS.dirty.has(f.path) || CS.removed.has(f.path)) continue; // your unsaved version wins until it is saved
    const cur = CS.files.get(f.path);
    if (f.deleted) {
      if (cur) { CS.files.delete(f.path); CS.open = CS.open.filter((x) => x !== f.path); if (CS.active === f.path) { CS.active = CS.open[0] || null; activeChanged = true; } structure = true; }
    } else if (!cur) { CS.files.set(f.path, { content: f.content }); structure = true; }
    else if (cur.content !== f.content) { cur.content = f.content; if (CS.active === f.path) activeChanged = true; }
  }
  if (structure) { csRenderFiles(); csRenderTabs(); }
  if (activeChanged) {
    const ta = $('#cs-ed-ta'), f = CS.files.get(CS.active);
    if (!f) return csLoadActive();
    if (ta && ta.value !== f.content) { const s = ta.selectionStart, e = ta.selectionEnd, st = ta.scrollTop; ta.value = f.content; ta.setSelectionRange(Math.min(s, f.content.length), Math.min(e, f.content.length)); ta.scrollTop = st; csPaint(); }
  }
}

/* ---------- running: browser-like preview, scripts and Python ---------- */
function csPickRun() {
  const paths = [...CS.files.keys()], a = CS.active, e = a ? fileExt(a) : '';
  const htmls = paths.filter((p) => /\.html?$/.test(p)), idx = htmls.includes('index.html') ? 'index.html' : htmls[0];
  if (e === 'py') return { kind: 'python', entry: a };
  if (/^html?$/.test(e)) return { kind: 'web', entry: a };
  if (/^m?js$/.test(e)) {
    const base = a.slice(a.lastIndexOf('/') + 1);
    const page = htmls.find((h) => CS.files.get(h).content.includes(a) || CS.files.get(h).content.includes(base));
    return page ? { kind: 'web', entry: page } : { kind: 'script', entry: a };
  }
  if (idx) return { kind: 'web', entry: idx };
  const py = paths.find((p) => p === 'main.py') || paths.find((p) => /\.py$/.test(p)); if (py) return { kind: 'python', entry: py };
  const js = paths.find((p) => p === 'main.js') || paths.find((p) => /\.m?js$/.test(p)); if (js) return { kind: 'script', entry: js };
  return null;
}
function runCode() {
  const pick = csPickRun();
  if (!pick) return toast('Nothing to run yet — add an index.html, a .js or a .py file.', 'error');
  saveNow();
  csClearLogs();
  if ($('#cs') && matchMedia('(max-width: 860px)').matches) $('#cs').dataset.pane = 'preview', csSyncSeg();
  if (pick.kind === 'python') return csRunPython(pick.entry);
  if (pick.kind === 'script') CS.scriptEntry = pick.entry;
  const entry = pick.kind === 'script' ? '__run__.html' : pick.entry;
  CS.hist = [entry]; CS.hi = 0;
  csStartWeb(entry, pick.kind === 'script' ? 'console' : 'preview');
}
function csFrame(src) {
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-downloads'); // no allow-same-origin: user code can't reach Webcord
  f.setAttribute('referrerpolicy', 'no-referrer'); f.src = src; return f;
}
function csKillWeb() { CS.webFrame?.remove(); CS.webFrame = null; CS.webPayload = null; clearTimeout(CS.loadT); $('#cs-loadbar')?.classList.remove('on'); }
function csStartWeb(entry, view) {
  csKillWeb();
  const files = csSnapshot();
  let payload;
  if (entry === '__run__.html') {
    const se = CS.scriptEntry, mod = /^\s*(import|export)\s/m.test(files[se] || '');
    files[entry] = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(se)}</title></head><body><script ${mod ? 'type="module" ' : ''}src="${esc(se)}"></script></body></html>`;
  }
  payload = entry in files ? { kind: 'web', entry, files } : { kind: 'web', notFound: entry, files: {} };
  const host = $('#cs-frame-host'); if (!host) return;
  $('#cs-pempty')?.remove();
  const f = csFrame('preview.html'); host.appendChild(f);
  CS.webFrame = f; CS.webPayload = payload;
  const shown = entry === '__run__.html' ? CS.scriptEntry : entry;
  $('#cs-url-path').textContent = shown === 'index.html' ? '/' : '/' + shown;
  $('#cs-ptitle').textContent = shown.slice(shown.lastIndexOf('/') + 1);
  $('#cs-stop').hidden = false; $('#cs-loadbar').classList.add('on');
  CS.loadT = setTimeout(() => $('#cs-loadbar')?.classList.remove('on'), 12000);
  csNavButtons(); csSetView(view);
}
function csNavButtons() { const b = $('#cs-nb'), f = $('#cs-nf'); if (b) b.disabled = CS.hi <= 0; if (f) f.disabled = CS.hi >= CS.hist.length - 1; }
function csNavigate(href) {
  const cur = CS.hist[CS.hi] === '__run__.html' ? CS.scriptEntry : CS.hist[CS.hi] || 'index.html';
  let path = csResolve(cur, href);
  if (path === null) return csStartWeb(CS.hist[CS.hi], CS.view);
  if (path === '') path = 'index.html';
  if (!CS.files.has(path) && CS.files.has(path.replace(/\/$/, '') + '/index.html')) path = path.replace(/\/$/, '') + '/index.html';
  if (path === cur && !/[?#]/.test(href)) return csStartWeb(CS.hist[CS.hi], 'preview');
  CS.hist = CS.hist.slice(0, CS.hi + 1); CS.hist.push(path); CS.hi++;
  csStartWeb(path, 'preview');
}
function csHistGo(d) {
  const i = CS.hi + d; if (i < 0 || i >= CS.hist.length) return;
  CS.hi = i; csStartWeb(CS.hist[i], CS.view);
}
function csRunPython(entry) {
  csKillWeb(); csSetView('console');
  csLog('info', `Running ${entry}…`);
  if (!CS.pyFrame) { CS.pyFrame = csFrame('preview.html'); CS.pyFrame.className = 'cs-pyframe'; CS.pyReady = false; $('#cs').appendChild(CS.pyFrame); }
  const payload = { kind: 'python', entry, files: csSnapshot() };
  if (CS.pyReady) CS.pyFrame.contentWindow.postMessage({ wc: 1, type: 'run', payload }, '*'); else CS.pyQueue = payload;
  $('#cs-stop').hidden = false;
}
function csStop() {
  csKillWeb(); if (CS.pyFrame) { CS.pyFrame.remove(); CS.pyFrame = null; CS.pyReady = false; CS.pyQueue = null; }
  $('#cs-stop').hidden = true; csLog('info', 'Stopped.');
  const host = $('#cs-frame-host');
  if (host && !$('#cs-pempty')) host.insertAdjacentHTML('beforeend', `<div class="cs-empty" id="cs-pempty"><div class="em-ico">${icon('play', 22)}</div><h3>Stopped</h3><p>Press <b>Run</b> to start again.</p></div>`);
}
window.addEventListener('message', (e) => {
  const d = e.data; if (!CS.id || !d || d.wc !== 1) return;
  const web = CS.webFrame && e.source === CS.webFrame.contentWindow, py = CS.pyFrame && e.source === CS.pyFrame.contentWindow;
  if (!web && !py) return; // only our own sandboxed frames are listened to
  switch (d.type) {
    case 'ready':
      if (web && CS.webPayload) { e.source.postMessage({ wc: 1, type: 'run', payload: CS.webPayload }, '*'); CS.webPayload = null; }
      else if (py) { CS.pyReady = true; if (CS.pyQueue) { e.source.postMessage({ wc: 1, type: 'run', payload: CS.pyQueue }, '*'); CS.pyQueue = null; } }
      break;
    case 'console': csLog(['log', 'info', 'warn', 'error', 'result'].includes(d.level) ? d.level : 'log', String(d.text ?? '').slice(0, 5000)); break;
    case 'clear': csClearLogs(); break;
    case 'title': if (web) { const t = String(d.title || '').trim(); const el = $('#cs-ptitle'); if (el) el.textContent = t || CS.hist[CS.hi]?.split('/').pop() || 'Preview'; } break;
    case 'loaded': if (web) { clearTimeout(CS.loadT); $('#cs-loadbar')?.classList.remove('on'); } break;
    case 'navigate': if (web) csNavigate(String(d.href || '')); break;
    case 'done': if (py) { const s = $('#cs-stop'); if (s) s.hidden = true; } break;
    default: break;
  }
});

/* ---------- console ---------- */
const csLogHtml = (l) => `<div class="cl cl-${l.level}"><pre>${esc(l.level === 'result' ? '← ' + l.text : l.text)}</pre><time>${new Date(l.t).toLocaleTimeString([], { hour12: false })}</time></div>`;
function csAppendLog(l) {
  const list = $('#cs-log'); if (!list) return;
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.insertAdjacentHTML('beforeend', csLogHtml(l));
  while (list.children.length > 500) list.firstChild.remove();
  if (near) list.scrollTop = list.scrollHeight;
}
function csLog(level, text) {
  const l = { level, text, t: Date.now() };
  CS.logs.push(l); if (CS.logs.length > 500) CS.logs.shift();
  if (level === 'error') CS.errs++;
  csAppendLog(l); csUpdateBadge();
  if (level === 'error' && CS.view === 'preview' && CS.webFrame) $('#cs-pane-preview')?.classList.add('has-err');
}
function csClearLogs() { CS.logs = []; CS.errs = 0; const l = $('#cs-log'); if (l) l.innerHTML = ''; csUpdateBadge(); $('#cs-pane-preview')?.classList.remove('has-err'); }
function csUpdateBadge() {
  const b = $('#cs-badge'); if (!b) return;
  b.hidden = !CS.logs.length; b.textContent = CS.errs ? CS.errs : CS.logs.length; b.classList.toggle('err', !!CS.errs);
}
function csRepl(e) {
  e.preventDefault();
  const inp = $('#cs-repl-in'), code = inp.value.trim(); if (!code) return;
  inp.value = '';
  csLog('info', '› ' + code);
  if (!CS.webFrame) return csLog('warn', 'Run your page first, then you can run JavaScript in it here.');
  CS.webFrame.contentWindow.postMessage({ wc: 1, type: 'eval', code }, '*');
}
function csSetView(v) {
  CS.view = v;
  $$('.cs-rtabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $('#cs-pane-preview').hidden = v !== 'preview'; $('#cs-pane-console').hidden = v !== 'console';
  if (v === 'console') { const l = $('#cs-log'); if (l) l.scrollTop = l.scrollHeight; $('#cs-pane-preview').classList.remove('has-err'); }
}
function csSyncSeg() { $$('.cs-seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pane === $('#cs').dataset.pane))); }

/* ---------- resizable split ---------- */
function csStartResize(e) {
  const body = $('#cs-body'), cs = $('#cs'); if (matchMedia('(max-width: 860px)').matches) return;
  e.preventDefault(); cs.classList.add('dragging'); e.target.setPointerCapture(e.pointerId);
  const move = (ev) => { const r = body.getBoundingClientRect(); const pct = Math.min(75, Math.max(25, ((ev.clientX - r.left) / r.width) * 100)); body.style.setProperty('--split', pct + '%'); };
  const up = () => { cs.classList.remove('dragging'); e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); e.target.removeEventListener('pointercancel', up); };
  e.target.addEventListener('pointermove', move); e.target.addEventListener('pointerup', up); e.target.addEventListener('pointercancel', up);
}

/* ---------- sharing / details ---------- */
function csShare() {
  const render = (d) => {
    const m = CS.meta, owner = m.is_owner, me = S.user.username;
    const body = $('#cs-share-body', d);
    const person = (u, role) => `<div class="person">${avatar(u, 32)}<span class="pn"><b>${esc(u.display_name)}</b><small>@${esc(u.username)}${role ? ' · ' + role : ''}</small></span>${!role && (owner || u.username === me) ? `<button type="button" class="btn sm ghost" data-rm="${esc(u.username)}">${u.username === me ? 'Leave' : 'Remove'}</button>` : ''}</div>`;
    body.innerHTML = `<div class="opt-list">${Object.entries(CS_VIS).map(([k, v]) => `<label class="opt${m.visibility === k ? ' on' : ''}"><input type="radio" name="vis" value="${k}" ${m.visibility === k ? 'checked' : ''} ${owner ? '' : 'disabled'}><span class="opt-ico">${icon(v.icon, 18)}</span><span><b>${v.label}</b><small>${v.desc}</small></span></label>`).join('')}</div>
      ${m.visibility === 'public' ? '<p class="note warn">Anyone logged in to Webcord can find and edit this codespace.</p>' : ''}
      <h4 class="sub-h">People with access</h4>
      <div class="people">${person(m.owner, 'Owner')}${(m.members || []).map((u) => person(u, '')).join('') || (m.visibility === 'shared' ? '<p class="muted-p">Nobody yet. Add people below.</p>' : '')}</div>
      ${owner ? `<div class="field" style="margin-top:14px"><label for="cs-user-q">Add people</label><input class="input" id="cs-user-q" placeholder="Search by username or name" autocomplete="off"><div id="cs-user-res" class="people-res"></div></div>` : ''}
      ${m.visibility === 'private' && !owner ? '' : ''}
      <div class="modal-actions"><button class="btn" type="button" data-copy>${icon('link', 15)} Copy link</button><button class="btn primary" type="button" data-close>Done</button></div>`;
  };
  openModal({
    title: CS.meta.is_owner ? 'Share codespace' : 'People', html: '<div id="cs-share-body"></div>',
    onOpen: (d, close) => {
      render(d);
      const patchMeta = (cs) => { CS.meta = { ...CS.meta, ...cs }; csRenderHead(); render(d); };
      d.addEventListener('change', async (e) => {
        if (e.target.name !== 'vis') return;
        try { const r = await api(`/codespaces/${CS.id}`, { method: 'PATCH', body: { visibility: e.target.value } }); patchMeta(r.codespace); } catch (err) { toast(err.message, 'error'); render(d); }
      });
      d.addEventListener('click', async (e) => {
        if (e.target.closest('[data-copy]')) { const ok = await copyText(location.href.split('#')[0] + '#/code/' + CS.id); toast(ok ? 'Link copied.' : 'Couldn’t copy the link.', ok ? '' : 'error'); return; }
        const rm = e.target.closest('[data-rm]');
        if (rm) {
          const u = rm.dataset.rm;
          try {
            await api(`/codespaces/${CS.id}/members/${encodeURIComponent(u)}`, { method: 'DELETE' });
            if (u === S.user.username && !CS.meta.is_owner) { close(); csLeave(); go('#/web/code'); return; }
            patchMeta({ members: CS.meta.members.filter((x) => x.username !== u) });
          } catch (err) { toast(err.message, 'error'); }
          return;
        }
        const add = e.target.closest('[data-add]');
        if (add) {
          try {
            const r = await api(`/codespaces/${CS.id}/members`, { method: 'POST', body: { username: add.dataset.add } });
            let extra = {};
            if (CS.meta.visibility === 'private') { const p = await api(`/codespaces/${CS.id}`, { method: 'PATCH', body: { visibility: 'shared' } }); extra = p.codespace; toast('Visibility changed to Shared.'); }
            patchMeta({ ...extra, members: r.members }); const q = $('#cs-user-q', d); if (q) { q.value = ''; q.focus(); }
          } catch (err) { toast(err.message, 'error'); }
        }
      });
      d.addEventListener('input', debounce(async (e) => {
        if (e.target.id !== 'cs-user-q') return;
        const res = $('#cs-user-res', d), v = e.target.value.trim(); if (!v) { res.innerHTML = ''; return; }
        try {
          const r = await api('/users?q=' + encodeURIComponent(v));
          const have = new Set([CS.meta.owner.username, ...(CS.meta.members || []).map((x) => x.username)]);
          const list = r.users.filter((u) => !have.has(u.username));
          res.innerHTML = list.length ? list.map((u) => `<button type="button" class="room-item" data-add="${esc(u.username)}">${avatar(u, 28)}<span class="rname">${esc(u.display_name)} <span class="muted">@${esc(u.username)}</span></span><span class="btn sm">${icon('plus', 14)} Add</span></button>`).join('') : '<p class="muted-p">No one found.</p>';
        } catch (err) { res.innerHTML = `<p class="muted-p">${esc(err.message)}</p>`; }
      }, 250));
    },
  });
}
function csDetails() {
  const m = CS.meta;
  if (!m.is_owner) return csShare();
  openModal({
    title: 'Codespace details',
    html: `<form id="cs-det" novalidate>${fieldHtml({ id: 'cs-d-title', label: 'Name', value: m.title, maxlength: 60 })}${fieldHtml({ id: 'cs-d-desc', label: 'Description', value: m.description || '', maxlength: 200, required: false })}<p class="err" id="cs-d-error" role="alert"></p>
      <div class="modal-actions" style="justify-content:space-between"><button class="btn danger" type="button" data-del>${icon('trash', 15)} Delete</button><span style="display:flex;gap:10px"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></span></div></form>`,
    onOpen: (d, close) => {
      $('#cs-det', d).addEventListener('submit', async (e) => {
        e.preventDefault(); clearErrs(e.target);
        const title = $('#cs-d-title', d).value.trim(); if (!title) return setErr('cs-d-title', 'Enter a name.');
        const btn = $('button[type=submit]', d); busy(btn, true, 'Saving…');
        try { const r = await api(`/codespaces/${CS.id}`, { method: 'PATCH', body: { title, description: $('#cs-d-desc', d).value.trim() } }); CS.meta = { ...CS.meta, ...r.codespace }; csRenderHead(); close(); }
        catch (err) { busy(btn, false); if (!applyServerErrors({ title: 'cs-d-title', description: 'cs-d-desc' }, err)) $('#cs-d-error', d).textContent = err.message; }
      });
      $('[data-del]', d).addEventListener('click', async () => {
        close();
        if (!(await confirmDialog('Delete this codespace and all of its files for everyone? This can’t be undone.', 'Delete codespace'))) return;
        try { await api(`/codespaces/${CS.id}`, { method: 'DELETE' }); CS.dirty.clear(); CS.removed.clear(); csLeave(); toast('Codespace deleted.'); go('#/web/code'); }
        catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

/* ---------- click actions (called from app.js's global click handler) ---------- */
function csAction(a, t) {
  switch (a) {
    case 'new-codespace': newCodespaceModal(); break;
    case 'cs-scope': CSL.scope = t.dataset.scope; try { localStorage.setItem('webcord.csScope', CSL.scope); } catch { /* */ } csRenderList(); break;
    case 'cs-more': busy(t, true); csLoadList(false); break;
    case 'cs-retry': csLoadList(true); break;
    case 'cs-run': runCode(); break;
    case 'cs-stop': csStop(); break;
    case 'cs-open': csOpenFile(t.dataset.path); break;
    case 'cs-close': csCloseTab(t.dataset.path); break;
    case 'cs-new-file': csNewFile(); break;
    case 'cs-rename': csRenameFile(t.dataset.path); break;
    case 'cs-delete': csDeleteFile(t.dataset.path); break;
    case 'cs-import': $('#cs-import')?.click(); break;
    case 'cs-share': csShare(); break;
    case 'cs-details': csDetails(); break;
    case 'cs-seg': $('#cs').dataset.pane = t.dataset.pane; csSyncSeg(); break;
    case 'cs-files-toggle': $('#cs').classList.toggle('files-open'); break;
    case 'cs-view': csSetView(t.dataset.view); break;
    case 'cs-back': csHistGo(-1); break;
    case 'cs-forward': csHistGo(1); break;
    case 'cs-reload': if (CS.hist[CS.hi]) csStartWeb(CS.hist[CS.hi], CS.view); else runCode(); break;
    case 'cs-clear': csClearLogs(); break;
    case 'cs-device':
      CS.device = t.dataset.device; $('#cs-frame-host').dataset.device = CS.device;
      $$('[data-action="cs-device"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === CS.device))); break;
    default: break;
  }
}
