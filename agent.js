/* Webcord codespace Agent — a chat panel in the editor that edits the open codespace with an AI model (Google Gemini, via the Worker).
   Loaded after codespace.js and uses its globals (E, saveFile, renderFiles, …). The model only ever sees what it reads with its tools;
   every change goes through the normal editor state + save path, so it syncs and shows up like a hand edit. */
'use strict';

Object.assign(ICONS, {
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 3l.6 1.4L7 5l-1.4.6L5 7l-.6-1.4L3 5l1.4-.6z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  eraser: '<path d="M20 20H9l-5.3-5.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L12 20"/><path d="M8 11l6 6"/>',
});

const AG_MAX_STEPS = 14;                 // model turns per request
const AG_BUDGET_CHARS = 11000;           // keep the conversation small: free-tier quotas are small
const AG_READ_LINES = 250;
const AG_STUB = '(older tool output removed to save space — call read_file again if you need it)';
const AG_IDEAS = ['Explain what this project does', 'Add a dark-mode toggle', 'Find and fix bugs in the open file', 'Create a CSS file and link it from index.html'];

const agSt = (X) => X.agent || (X.agent = { open: false, running: false, abort: null, turns: [], history: [], undo: null, model: '', status: '' });
const agNum = (lines, from) => lines.map((l, i) => `${from + i}| ${l}`).join('\n');

/* ---------- file text <-> lines (a trailing newline is not a line) ---------- */
function agSplit(content) {
  const nl = content === '' || content.endsWith('\n');
  const body = content === '' ? '' : nl ? content.slice(0, -1) : content;
  return { lines: content === '' ? [] : body.split('\n'), nl };
}
const agJoin = (lines, nl) => lines.join('\n') + (nl && lines.length ? '\n' : '');

/* ---------- tools (run in the browser against the open editor) ---------- */
const agInt = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' && v !== undefined ? Math.floor(Number(v)) : NaN);
function agFileList(X) { return [...X.files.keys()].sort().join(', ') || '(none)'; }
function agGetFile(X, rawPath) {
  const path = csNorm(rawPath), f = X.files.get(path);
  if (!f) return { err: `Error: "${path}" does not exist. Existing files: ${agFileList(X)}` };
  if (assetOf(f)) return { err: `Error: "${path}" is a binary file and cannot be read or edited.` };
  return { path, f };
}
function agRemember(X, path) {                // first change to a file in this run → remember how it looked, for Undo
  const u = agSt(X).undo; if (u && !u.has(path)) u.set(path, X.files.has(path) ? X.files.get(path).content : null);
}
/* Put new text into a file: update the editor if it's on screen, mark it dirty and save right away. */
async function agWrite(X, path, content) {
  const f = X.files.get(path);
  f.content = content; f.dirty = f.content !== f.saved; f.error = '';
  if (X.active === path) {
    const { ta } = edEl();
    if (ta) { const s = ta.selectionStart, e = ta.selectionEnd, st = ta.scrollTop; ta.value = content; paintEditor(false); try { ta.setSelectionRange(Math.min(s, content.length), Math.min(e, content.length)); } catch { /* */ } ta.scrollTop = st; syncScroll(); }
  }
  renderFiles(); renderTabs();
  clearTimeout(X.timers.get(path));
  for (let i = 0; i < 20 && f.saving; i++) await new Promise((r) => setTimeout(r, 150));
  await saveFile(X, path);
  if (f.conflict) return 'Error: someone else changed this file at the same time, so the change was not saved.';
  if (f.error) return `Error: could not save (${f.error}).`;
  return '';
}

async function agTool(X, name, args, turn) {
  if (!canEdit()) return 'Error: this codespace is view-only.';
  const act = { kind: name, path: csNorm(args.path), status: 'run', label: '' };
  turn.acts.push(act); agRender();
  const fin = (status, label, out) => { act.status = status; act.label = label; agRender(); return out; };
  try {
    if (name === 'read_file') {
      const g = agGetFile(X, args.path); if (g.err) return fin('err', `Couldn’t read ${act.path}`, g.err);
      const { lines } = agSplit(g.f.content), total = lines.length;
      if (!total) return fin('ok', `Read ${g.path}`, `${g.path} is empty (0 lines).`);
      const s = Math.min(Math.max(1, agInt(args.start_line) || 1), total);
      const e = Math.min(total, Math.max(s, agInt(args.end_line) || s + AG_READ_LINES - 1), s + AG_READ_LINES - 1);
      let text = agNum(lines.slice(s - 1, e), s);
      if (text.length > 12000) text = text.slice(0, 12000) + '\n…(cut)';
      return fin('ok', `Read ${g.path}${e - s + 1 < total ? ` (lines ${s}–${e})` : ''}`, `${g.path} — lines ${s}-${e} of ${total}\n${text}${e < total ? `\n(more: call read_file with start_line=${e + 1})` : ''}`);
    }
    if (name === 'edit_lines') {
      const g = agGetFile(X, args.path); if (g.err) return fin('err', `Couldn’t edit ${act.path}`, g.err);
      if (g.f.conflict) return fin('err', `${g.path} has a conflict`, 'Error: this file has an unresolved conflict with someone else’s change. Ask the user to resolve it first.');
      const { lines, nl } = agSplit(g.f.content), total = lines.length;
      const s = agInt(args.start_line), e = agInt(args.end_line);
      if (!Number.isInteger(s) || !Number.isInteger(e)) return fin('err', `Bad line numbers for ${g.path}`, 'Error: start_line and end_line must be integers.');
      if (s < 1 || s > total + 1 || e < s - 1 || e > total) return fin('err', `Bad line range for ${g.path}`, `Error: invalid range ${s}-${e}. ${g.path} has ${total} lines (valid: start_line 1..${total + 1}, end_line from start_line-1 up to ${total}). Read the file again.`);
      let nc = typeof args.new_content === 'string' ? args.new_content.replace(/\r\n/g, '\n') : '';
      let add = nc === '' ? [] : nc.replace(/\n$/, '').split('\n');
      if (add.length && add.every((l) => /^\d+\| ?/.test(l))) add = add.map((l) => l.replace(/^\d+\| ?/, ''));   // the model echoed our line-number prefix
      const out = lines.slice(0, s - 1).concat(add, lines.slice(e));
      const content = agJoin(out, nl || total === 0);
      if (content.length > MAX_FILE_CHARS) return fin('err', `${g.path} would be too large`, `Error: the file would exceed ${MAX_FILE_CHARS} characters.`);
      agRemember(X, g.path);
      const bad = await agWrite(X, g.path, content); if (bad) return fin('err', `Couldn’t save ${g.path}`, bad);
      const from = Math.max(1, s - 2), to = Math.min(out.length, s + add.length + 1);
      const label = e < s ? `Inserted ${add.length} line${add.length === 1 ? '' : 's'} in ${g.path} at line ${s}` : add.length ? `Edited ${g.path} (lines ${s}–${e})` : `Removed lines ${s}–${e} from ${g.path}`;
      return fin('ok', label, `OK. ${g.path} now has ${out.length} lines. Current lines ${from}-${to}:\n${agNum(out.slice(from - 1, to), from)}`);
    }
    if (name === 'create_file') {
      const path = csNorm(args.path), bad = csPathError(path);
      if (bad) return fin('err', `Can’t create ${path || 'file'}`, `Error: ${bad}`);
      if (ASSET_EXTS.has(fileExt(path))) return fin('err', `Can’t create ${path}`, 'Error: only text/code files can be created.');
      let content = typeof args.content === 'string' ? args.content.replace(/\r\n/g, '\n') : '';
      if (content.length > MAX_FILE_CHARS) return fin('err', `${path} is too large`, `Error: the file would exceed ${MAX_FILE_CHARS} characters.`);
      if (content && !content.endsWith('\n')) content += '\n';
      const ex = X.files.get(path);
      if (ex) {
        if (!args.overwrite) return fin('err', `${path} already exists`, `Error: "${path}" already exists. Use edit_lines to change it, or pass overwrite=true to replace it completely.`);
        if (assetOf(ex)) return fin('err', `${path} is binary`, `Error: "${path}" is a binary file.`);
        agRemember(X, path);
        const b = await agWrite(X, path, content); if (b) return fin('err', `Couldn’t save ${path}`, b);
        return fin('ok', `Rewrote ${path}`, `OK. ${path} was replaced (${agSplit(content).lines.length} lines).`);
      }
      if (X.files.size >= 60) return fin('err', 'Too many files', 'Error: a codespace can hold at most 60 files.');
      const r = await api(`/codespaces/${encodeURIComponent(X.id)}/files`, { method: 'PUT', body: { path, content, create: true }, quiet: true });
      if (E !== X) return 'Error: the editor was closed.';
      agRemember(X, path);                     // must run BEFORE the file is added below, so Undo knows it didn't exist
      X.files.set(path, { content, saved: content, rev: r.file.rev, dirty: false, saving: false, conflict: null, by: S.user.username, error: '' });
      renderFiles();
      return fin('ok', `Created ${path}`, `OK. Created ${path} (${agSplit(content).lines.length} lines).`);
    }
    return fin('err', `Unknown tool ${name}`, `Error: unknown tool "${name}".`);
  } catch (e) {
    return fin('err', `${act.path || name}: ${e.message}`, `Error: ${e.message}`);
  }
}

/* ---------- one model turn (the Worker adds the system prompt and talks to Gemini) ---------- */
function agCompact(msgs) {
  const out = msgs.map((m) => ({ ...m }));
  const size = () => out.reduce((n, m) => n + (m.content ? m.content.length : 0) + (m.tool_calls ? JSON.stringify(m.tool_calls.map((t) => t.function)).length : 0), 0);
  for (let i = 0; i < out.length - 2 && size() > AG_BUDGET_CHARS; i++) if (out[i].role === 'tool' && out[i].content.length > 200) out[i].content = AG_STUB;
  return out;
}
const agSleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
});
async function agCall(X, msgs, signal) {
  const ctx = { active: X.active || '', files: [...X.files].map(([path, f]) => (assetOf(f) ? { path, binary: true } : { path, lines: agSplit(f.content).lines.length })) };
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await api(`/codespaces/${encodeURIComponent(X.id)}/agent`, { method: 'POST', body: { messages: agCompact(msgs), context: ctx }, quiet: true });
    } catch (e) {
      const wait = e.status === 429 ? Number(e.data?.retry_after) || 10 : 0;
      if (!wait || wait > 65 || attempt >= 4) throw e;
      for (let s = wait; s > 0; s--) { agSt(X).status = `The free AI quota is busy — retrying in ${s}s…`; agRender(); await agSleep(1000, signal); }
      agSt(X).status = '';
    }
  }
}

async function agRun(text) {
  const X = E; if (!X || !canEdit()) return;
  const st = agSt(X); if (st.running || !text.trim()) return;
  st.turns.push({ role: 'user', text });
  const turn = { role: 'assistant', text: '', acts: [], error: '' };
  st.turns.push(turn);
  st.running = true; st.abort = new AbortController(); st.undo = new Map(); st.status = ''; agRender(); agSync();
  const run = [{ role: 'user', content: text }];
  let touched = false;
  try {
    for (let step = 0; step < AG_MAX_STEPS; step++) {
      if (X.dead || E !== X) return;
      const r = await agCall(X, [...st.history, ...run], st.abort.signal);
      if (X.dead || E !== X) return;
      st.model = r.model || st.model;
      const m = r.message || {};
      run.push({ role: 'assistant', content: m.content || '', ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) });
      if (!m.tool_calls || !m.tool_calls.length) { turn.text = (m.content || '').trim() || (touched ? 'Done.' : ''); break; }
      if (m.content && m.content.trim()) turn.text = m.content.trim();
      for (const tc of m.tool_calls) {
        let args; try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = null; }
        let result;
        if (!args || typeof args !== 'object') result = 'Error: the tool arguments were not valid JSON.';
        else { result = await agTool(X, tc.function.name, args, turn); if (tc.function.name !== 'read_file' && result.startsWith('OK')) touched = true; }
        run.push({ role: 'tool', tool_call_id: tc.id, content: result });
        if (st.abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      }
      if (step === AG_MAX_STEPS - 1) turn.text = (turn.text ? turn.text + '\n\n' : '') + 'I stopped here because this took many steps. Tell me to continue if something is missing.';
    }
    if (!turn.text) turn.text = 'I couldn’t come up with an answer. Try rephrasing your request.';
    st.history.push({ role: 'user', content: text }, { role: 'assistant', content: turn.text.slice(0, 1500) });
    while (st.history.length > 10) st.history.shift();
  } catch (e) {
    if (e && e.name === 'AbortError') turn.error = 'Stopped.';
    else turn.error = e && e.message ? e.message : 'Something went wrong.';
    if (turn.acts.some((a) => a.status === 'ok' && a.kind !== 'read_file')) {      // keep what was done; tell the model so "continue" works
      turn.error += ' Your earlier edits were kept — send “continue” to finish.';
      st.history.push({ role: 'user', content: text }, { role: 'assistant', content: `I was interrupted by an error. Done so far: ${turn.acts.filter((a) => a.status === 'ok').map((a) => a.label).join('; ')}. Remaining work is not finished.`.slice(0, 1500) });
      while (st.history.length > 10) st.history.shift();
    }
    if (turn.error && e && e.status === 401) sessionExpired();
  } finally {
    st.running = false; st.abort = null; st.status = '';
    if (E === X) { agRender(); agSync(); if (X.auto && st.undo && st.undo.size) runPreview(undefined, { auto: true }); }
  }
}

/* ---------- undo ---------- */
async function agUndo() {
  const X = E; if (!X) return; const st = agSt(X);
  if (st.running || !st.undo || !st.undo.size) return;
  if (!(await confirmDialog('Undo every change the agent made in its last request?', 'Undo changes'))) return;
  const entries = [...st.undo]; st.undo = null; agSync();
  for (const [path, before] of entries) {
    try {
      if (before === null) {
        if (!X.files.has(path)) continue;
        clearTimeout(X.timers.get(path));
        await api(`/codespaces/${encodeURIComponent(X.id)}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE', quiet: true });
        if (E !== X) return;
        X.files.delete(path); X.scroll.delete(path); closeTab(path);
      } else if (X.files.has(path)) {
        const f = X.files.get(path); f.conflict = null;
        await agWrite(X, path, before);
      }
    } catch (e) { toast(`${path}: ${e.message}`, 'error'); }
  }
  if (E !== X) return;
  renderFiles(); renderTabs();
  st.turns.push({ role: 'note', text: 'Changes undone.' }); agRender();
  if (X.auto) runPreview(undefined, { auto: true });
}

/* ---------- panel ---------- */
function agPanelHtml() {
  return `<aside class="ag" id="ag" aria-label="AI agent" hidden>
    <div class="ag-head"><div class="ag-title">${icon('sparkles', 17)}<div><b>Agent</b><small id="ag-model">Free AI model via Google</small></div></div>
      <div class="ag-head-acts"><button type="button" class="btn icon sm ghost" data-ag="undo" id="ag-undo" title="Undo the agent’s last changes" aria-label="Undo the agent’s last changes" disabled>${icon('undo', 16)}</button>
      <button type="button" class="btn icon sm ghost" data-ag="clear" title="New chat" aria-label="New chat">${icon('eraser', 16)}</button>
      <button type="button" class="btn icon sm ghost" data-ag="close" title="Close" aria-label="Close agent">${icon('x', 17)}</button></div></div>
    <div class="ag-log" id="ag-log" role="log" aria-live="polite"></div>
    <form class="ag-form" id="ag-form" autocomplete="off"><textarea id="ag-input" rows="1" maxlength="4000" placeholder="Ask the agent to change your code…" aria-label="Message the agent"></textarea>
      <button type="submit" class="btn primary icon" id="ag-send" aria-label="Send">${icon('send', 17)}</button></form>
  </aside>`;
}
function agRender() {
  const X = E, log = $('#ag-log'); if (!X || !log) return;
  const st = agSt(X);
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  if (!st.turns.length) {
    log.innerHTML = `<div class="ag-empty"><div class="ag-spark">${icon('sparkles', 24)}</div><h3>Build with the agent</h3>
      <p>Describe a change and it will read your files, edit specific lines and create new files for you. You can undo what it did.</p>
      <div class="ag-ideas">${AG_IDEAS.map((t) => `<button type="button" class="chip" data-ag="idea" data-text="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  } else {
    const last = st.turns[st.turns.length - 1];
    log.innerHTML = st.turns.map((t) => {
      if (t.role === 'user') return `<div class="ag-msg user"><div class="ag-bubble">${esc(t.text)}</div></div>`;
      if (t.role === 'note') return `<div class="ag-note">${esc(t.text)}</div>`;
      const working = st.running && t === last;
      return `<div class="ag-msg bot"><div class="ag-ava">${icon('sparkles', 14)}</div><div class="ag-col">
        ${t.acts.length ? `<ul class="ag-acts">${t.acts.map((a) => `<li class="${a.status}">${a.status === 'run' ? '<span class="spinner"></span>' : icon(a.status === 'ok' ? 'check' : 'x', 13)}${a.status !== 'err' && a.path && X.files.has(a.path) && a.kind !== 'read_file'
          ? `<button type="button" data-cs="open-file" data-path="${esc(a.path)}" title="Open ${esc(a.path)}">${esc(a.label || (a.kind === 'read_file' ? 'Reading ' : a.kind === 'edit_lines' ? 'Editing ' : 'Creating ') + a.path)}</button>`
          : `<span>${esc(a.label || (a.kind === 'read_file' ? 'Reading ' : a.kind === 'edit_lines' ? 'Editing ' : 'Creating ') + a.path)}</span>`}</li>`).join('')}</ul>` : ''}
        ${t.text ? `<div class="ag-text msg-body">${renderMessage(t.text)}</div>` : ''}
        ${working ? `<div class="ag-think"><span class="spinner"></span>${esc(st.status || (t.acts.length ? 'Working…' : 'Thinking…'))}</div>` : ''}
        ${t.error ? `<div class="ag-err">${esc(t.error)}</div>` : ''}</div></div>`;
    }).join('');
  }
  if (near || st.running) log.scrollTop = log.scrollHeight;
}
function agSync() {
  const X = E; if (!X) return; const st = agSt(X);
  const send = $('#ag-send'), inp = $('#ag-input'), und = $('#ag-undo'), mod = $('#ag-model');
  if (send) { send.innerHTML = icon(st.running ? 'stop' : 'send', 17); send.setAttribute('aria-label', st.running ? 'Stop' : 'Send'); send.dataset.running = st.running ? '1' : ''; }
  if (inp) inp.disabled = false;
  if (und) und.disabled = st.running || !(st.undo && st.undo.size);
  if (mod) mod.textContent = st.model ? `${st.model.split('/').pop()} · Gemini` : 'Free AI model via Google';
  $('#cs-agent-btn')?.setAttribute('aria-pressed', String(st.open));
}
function agToggle(force) {
  const X = E, panel = $('#ag'); if (!X || !panel) return;
  const st = agSt(X); st.open = typeof force === 'boolean' ? force : !st.open;
  panel.hidden = !st.open; $('#cs-body')?.classList.toggle('agent-open', st.open);
  agSync();
  if (st.open) { agRender(); if (window.innerWidth > 860) $('#ag-input')?.focus(); }
}
function agBind() {                          // called by startEditor once the page markup exists
  const form = $('#ag-form'), inp = $('#ag-input'); if (!form) return;
  const fit = () => { inp.style.height = 'auto'; inp.style.height = Math.min(140, inp.scrollHeight) + 'px'; };
  const submit = () => {
    const X = E; if (!X) return; const st = agSt(X);
    if (st.running) { st.abort?.abort(); return; }
    const text = inp.value.trim(); if (!text) return;
    inp.value = ''; fit(); agRun(text);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  inp.addEventListener('input', fit);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } if (e.key === 'Escape') agToggle(false); });
  agRender(); agSync();
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-ag]'); if (!t || !E) return;
  switch (t.dataset.ag) {
    case 'close': agToggle(false); break;
    case 'undo': agUndo(); break;
    case 'clear': { const st = agSt(E); if (st.running) { toast('Stop the agent first.', ''); break; } st.turns = []; st.history = []; st.undo = null; agRender(); agSync(); break; }
    case 'idea': { const i = $('#ag-input'); if (i) { i.value = t.dataset.text; i.focus(); i.dispatchEvent(new Event('input')); } break; }
    default: break;
  }
});
