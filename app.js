/* Webcord frontend — vanilla JS SPA (hosted on GitHub Pages). Talks to the Cloudflare Worker at API_BASE (see config.js). Light mode only. */
'use strict';

/* ======================================================================
   Utilities
   ====================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const app = document.getElementById('app');

const ICONS = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
};
const icon = (name, size) => `<svg class="ico" ${size ? `style="width:${size}px;height:${size}px"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

let logoN = 0;
function logo(size = 34, withText = true, href = '#/') {
  const id = 'lg' + ++logoN;
  return `<a class="logo" href="${href}" aria-label="Webcord home"><svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#9b5cf6"/></linearGradient></defs><path d="M14 6h36a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H34L18 60V48h-4A10 10 0 0 1 4 38V16A10 10 0 0 1 14 6z" fill="url(#${id})"/><path d="M26 20l-8 8 8 8M38 20l8 8-8 8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>${withText ? '<span>Webcord</span>' : ''}</a>`;
}

const fmtTime = (ts) => {
  const d = new Date(ts);
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${t}`;
};
const fmtFull = (ts) => new Date(ts).toLocaleString();
const fmtJoined = (ts) => new Date(ts).toLocaleDateString([], { month: 'long', year: 'numeric' });
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function gradFor(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return [`hsl(${h % 360} 72% 58%)`, `hsl(${(h + 48) % 360} 72% 52%)`];
}
function avatar(u, size = 36, cls = '') {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px`;
  if (u.avatar_url) return `<img class="avatar ${cls}" style="${st}" src="${esc(u.avatar_url)}" alt="" loading="lazy">`;
  const [a, b] = gradFor(u.username || 'x');
  return `<span class="avatar ${cls}" style="${st};background:linear-gradient(135deg,${a},${b})" aria-hidden="true">${esc((u.display_name || u.username || '?').trim().charAt(0).toUpperCase())}</span>`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); return ok;
  }
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, type === 'error' ? 5500 : 3200);
}

/* ======================================================================
   Syntax highlighting + safe Markdown
   ====================================================================== */
const KW = {
  js: 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false yield static get set interface type enum implements public private protected readonly as void delete',
  py: 'def class return if elif else for while in not and or is import from as with try except finally raise lambda None True False pass break continue yield global nonlocal async await self',
  c: 'int long short char float double void unsigned signed struct union enum typedef static const extern return if else for while do switch case break continue sizeof new delete class public private protected namespace using template typename fn let mut impl trait pub use mod match func package go defer chan interface map range var bool string true false null nil this final throws try catch finally throw import include def end',
  sql: 'select from where insert into values update set delete create table index drop alter add join left right inner outer on group by order limit offset having and or not null as distinct primary key foreign references default unique integer text real blob if exists like in is between case when then else end union all',
  sh: 'if then else elif fi for do done while case esac function in echo cd ls export source sudo npm npx git curl cat grep sed awk exit return',
  json: 'true false null',
};
function normLang(l) {
  l = (l || '').toLowerCase();
  if (/^(js|jsx|javascript|mjs|cjs|ts|tsx|typescript|node)$/.test(l)) return 'js';
  if (/^(py|python)$/.test(l)) return 'py';
  if (/^(html|xml|svg|vue)$/.test(l)) return 'html';
  if (/^(css|scss|less)$/.test(l)) return 'css';
  if (l === 'json') return 'json';
  if (/^(sql|sqlite|postgres|mysql)$/.test(l)) return 'sql';
  if (/^(sh|bash|shell|zsh|console)$/.test(l)) return 'sh';
  if (/^(c|cpp|c\+\+|cs|c#|java|go|golang|rust|rs|php|swift|kotlin|kt|dart|rb|ruby)$/.test(l)) return 'c';
  return '';
}
function hlHtml(code) {
  const re = /(<!--[\s\S]*?-->)|(<\/?)([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?>)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += `<span class="t-c">${esc(m[1])}</span>`;
    else {
      const attrs = m[4].replace(/([^\s=]+)(=)("[^"]*"|'[^']*'|[^\s]+)|([^\s=]+)/g, (_, a, eq, v, solo) =>
        solo ? `<span class="t-a">${esc(solo)}</span>` : `<span class="t-a">${esc(a)}</span>=<span class="t-s">${esc(v)}</span>`);
      out += `<span class="t-p">${esc(m[2])}</span><span class="t-t">${esc(m[3])}</span>${attrs}<span class="t-p">${esc(m[5])}</span>`;
    }
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function highlight(code, lang) {
  const g = normLang(lang);
  if (!g || code.length > 30000) return esc(code);
  if (g === 'html') return hlHtml(code);
  const dq = '"(?:\\\\.|[^"\\\\\\n])*"';
  const sq = "'(?:\\\\.|[^'\\\\\\n])*'";
  const bt = '`(?:\\\\.|[^`\\\\])*`';
  const comment = g === 'py' || g === 'sh' ? '#[^\\n]*' : g === 'sql' ? '--[^\\n]*|/\\*[\\s\\S]*?\\*/' : g === 'css' ? '/\\*[\\s\\S]*?\\*/' : '//[^\\n]*|/\\*[\\s\\S]*?\\*/';
  const rules = [];
  if (g === 'json') rules.push(['t-p', `${dq}(?=\\s*:)`]);
  rules.push(['t-c', comment], ['t-s', [dq, sq, g === 'js' ? bt : null].filter(Boolean).join('|')]);
  if (g === 'css') {
    rules.push(['t-k', '@[\\w-]+'], ['t-p', '[a-zA-Z-]+(?=\\s*:)'], ['t-n', '#[0-9a-fA-F]{3,8}\\b|\\b\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|s|ms|deg)?\\b']);
  } else {
    if (g === 'sh') rules.push(['t-p', '\\$\\{?[A-Za-z_]\\w*\\}?']);
    rules.push(['t-n', '\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b|\\b0x[0-9a-fA-F]+\\b']);
    rules.push(['t-k', `\\b(?:${KW[g].split(' ').join('|')})\\b`]);
    if (g !== 'json' && g !== 'sh') rules.push(['t-f', '\\b[A-Za-z_$][\\w$]*(?=\\()']);
  }
  const re = new RegExp(rules.map((r) => `(${r[1]})`).join('|'), g === 'sql' ? 'gi' : 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const i = m.findIndex((x, k) => k > 0 && x !== undefined);
    out += `<span class="${rules[i - 1][0]}">${esc(m[0])}</span>`;
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}
function codeBlock(code, lang) {
  const label = (lang || 'text').slice(0, 20);
  return `<div class="code"><div class="code-head"><span class="code-lang">${esc(label)}</span><button type="button" class="copy-btn" data-action="copy" aria-label="Copy code">${icon('copy', 13)}<span>Copy</span></button></div><pre tabindex="0"><code>${highlight(code, lang)}</code></pre></div>`;
}
function fmtText(t) {
  return t
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$2</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
}
const fmtInline = (s) => s.split(/(`[^`\n]+`)/).map((seg, i) => (i % 2 ? `<code class="inline">${esc(seg.slice(1, -1))}</code>` : fmtText(esc(seg)))).join('');
function inlineMd(text) {
  const lines = text.replace(/^\n+|\n+$/g, '').split('\n');
  const out = []; let list = null; let para = [];
  const flushP = () => { if (para.length) { out.push(`<p>${para.map(fmtInline).join('<br>')}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<ul>${list.map((li) => `<li>${fmtInline(li)}</li>`).join('')}</ul>`); list = null; } };
  for (const line of lines) {
    let m;
    if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) { flushP(); (list = list || []).push(m[1]); }
    else if ((m = /^>\s?(.*)$/.exec(line))) { flushP(); flushL(); out.push(`<blockquote>${fmtInline(m[1])}</blockquote>`); }
    else if (!line.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(line); }
  }
  flushP(); flushL();
  return out.join('');
}
function renderMessage(body) {
  const parts = []; let last = 0, m;
  const re = /```([\w+#.-]{0,20})[ \t]*\n?([\s\S]*?)```/g;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push(inlineMd(body.slice(last, m.index)));
    parts.push(codeBlock(m[2].replace(/\n$/, ''), m[1]));
    last = re.lastIndex;
  }
  if (last < body.length) parts.push(inlineMd(body.slice(last)));
  return parts.join('');
}

/* ======================================================================
   API client
   ====================================================================== */
class ApiError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields || {}; }
}
const TOKEN_KEY = 'webcord.token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { ...(opts.headers || {}) } };
  const tok = getToken(); if (tok) init.headers.Authorization = 'Bearer ' + tok;
  if (opts.raw !== undefined) init.body = opts.raw;
  else if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  let res;
  try { res = await fetch(API_BASE + '/api' + path, init); } catch { throw new ApiError(0, 'Network error — check your connection and try again.'); }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { /* non-JSON */ } }
  if (!res.ok) {
    if (res.status === 401 && S.user && !opts.quiet) sessionExpired();
    throw new ApiError(res.status, data?.error || `Request failed (${res.status}).`, data?.fields);
  }
  return data;
}

/* Upload an image straight from the browser to Cloudinary (unsigned preset) and return its https URL. */
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  let res;
  try { res = await fetch(CLOUDINARY_URL, { method: 'POST', body: fd }); } catch { throw new ApiError(0, 'Upload failed — check your connection and try again.'); }
  let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !data?.secure_url) throw new ApiError(res.status, data?.error?.message || 'Image upload failed.');
  return data.secure_url;
}

/* ======================================================================
   State
   ====================================================================== */
const S = {
  booted: false, user: null,
  rooms: [], dms: [], roomsLoaded: false, online: new Set(), unread: {},
  room: null, msgs: [], hasMore: false, nextBefore: null, drafts: {}, pending: null, sending: false,
  wsOpen: false, syncSeq: null, syncTimer: null, syncBusy: false, retry: 0,
  web: { q: '', items: [], offset: 0, hasMore: false, loading: false },
  proj: new Map(), token: 0,
};

/* ======================================================================
   Modal + forms helpers
   ====================================================================== */
function openModal({ title, html, onOpen }) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.setAttribute('aria-labelledby', 'modal-title');
  d.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="btn icon ghost" data-close aria-label="Close">${icon('x', 18)}</button></div><div class="modal-body">${html}</div>`;
  document.body.appendChild(d);
  const close = () => { try { d.close(); } catch { /* */ } d.remove(); };
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) close(); });
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.showModal();
  if (onOpen) onOpen(d, close);
  return { el: d, close };
}
function confirmDialog(message, label = 'Delete') {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: 'Are you sure?',
      html: `<p style="margin-top:0">${esc(message)}</p><div class="modal-actions"><button class="btn" data-close type="button">Cancel</button><button class="btn danger" data-ok type="button">${esc(label)}</button></div>`,
      onOpen: (d) => $('[data-ok]', d).addEventListener('click', () => { done = true; resolve(true); m.close(); }),
    });
    m.el.addEventListener('close', () => { if (!done) resolve(false); });
    const orig = m.close;
    m.close = () => { orig(); if (!done) { done = true; resolve(false); } };
  });
}

function fieldHtml({ id, label, type = 'text', autocomplete = 'off', placeholder = '', hint = '', pw = false, maxlength = '', value = '', required = true, textarea = false, rows = 3 }) {
  const common = `id="${id}" name="${id}" ${required ? 'required' : ''} ${maxlength ? `maxlength="${maxlength}"` : ''} placeholder="${esc(placeholder)}" aria-describedby="${id}-err${hint ? ` ${id}-hint` : ''}"`;
  const control = textarea
    ? `<textarea class="textarea" ${common} rows="${rows}">${esc(value)}</textarea>`
    : `<div class="input-wrap"><input class="input" ${common} type="${type}" autocomplete="${autocomplete}" value="${esc(value)}" ${type === 'text' || type === 'email' ? 'autocapitalize="none" spellcheck="false"' : ''}>${pw ? `<button type="button" class="toggle-pw" data-toggle-pw aria-label="Show password" aria-pressed="false">${icon('eye', 18)}</button>` : ''}</div>`;
  return `<div class="field"><label for="${id}">${esc(label)}</label>${control}${hint ? `<span class="hint" id="${id}-hint">${hint}</span>` : ''}<p class="err" id="${id}-err" role="alert"></p></div>`;
}
function setErr(id, msg) {
  const input = document.getElementById(id), err = document.getElementById(id + '-err');
  if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  if (err) err.textContent = msg || '';
}
function clearErrs(form) { $$('.input,.textarea', form).forEach((i) => setErr(i.id, '')); }
function applyServerErrors(map, e) {
  let any = false;
  for (const [k, msg] of Object.entries(e.fields || {})) { if (map[k]) { setErr(map[k], msg); any = true; } }
  return any;
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${label ? `<span>${esc(label)}</span>` : ''}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/* Client-side validators (the server re-validates everything). */
const V = {
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.length <= 254 ? '' : 'Enter a valid email address.'),
  username: (v) => (/^[A-Za-z0-9_]{3,20}$/.test(v.trim()) ? '' : 'Use 3–20 characters: letters, numbers and underscores.'),
  display: (v) => (v.trim().length >= 1 && v.trim().length <= 40 ? '' : 'Display name must be 1–40 characters.'),
  password: (v) => (v.length < 8 ? 'Password must be at least 8 characters.' : v.length > 128 ? 'Password is too long.' : !/[A-Za-z]/.test(v) || !/\d/.test(v) ? 'Use at least one letter and one number.' : ''),
  url: (v, req) => { const s = v.trim(); if (!s) return req ? 'A URL is required.' : ''; try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? '' : 'Only http(s) URLs are allowed.'; } catch { return 'Enter a valid URL, including https://'; } },
};

/* ======================================================================
   Router
   ====================================================================== */
const APP_SECTIONS = ['chat', 'web', 'profile', 'settings', 'u'];
function parseHash() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
}
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  if (!S.booted) return;
  const [sec, arg] = parseHash();
  closeDrawers();
  if (!S.user) {
    if (sec === 'signup') return renderAuth('signup');
    if (sec === 'login' || sec === 'auth' || APP_SECTIONS.includes(sec)) return renderAuth('login');
    return renderWelcome();
  }
  if (!sec || ['login', 'signup', 'auth'].includes(sec) || !APP_SECTIONS.includes(sec)) {
    history.replaceState(null, '', '#/chat');
    return route();
  }
  ensureShell();
  setActiveNav(sec === 'u' ? 'web' : sec);
  const token = ++S.token;
  if (sec === 'chat') return renderChat(arg, token);
  if (sec === 'web') return renderWeb();
  if (sec === 'profile') return renderProfile(S.user.username, true, token);
  if (sec === 'u') return renderProfile(arg, arg && arg.toLowerCase() === S.user.username.toLowerCase(), token);
  if (sec === 'settings') return renderSettings();
}
window.addEventListener('hashchange', route);

function closeDrawers() {
  $('#shell')?.classList.remove('nav-open');
  $('#chat')?.classList.remove('rooms-open');
}

/* ======================================================================
   Session
   ====================================================================== */
async function afterAuth(user, token) {
  if (token) setToken(token);
  S.user = user;
  try { localStorage.setItem('webcord.lastLogin', user.username); } catch { /* storage unavailable */ }
  startSync();
  history.replaceState(null, '', '#/chat');
  route();
}
function resetSessionState() {
  S.user = null; S.rooms = []; S.dms = []; S.roomsLoaded = false; S.room = null; S.msgs = []; S.unread = {}; S.drafts = {}; S.pending = null;
  S.web = { q: '', items: [], offset: 0, hasMore: false, loading: false };
  stopSync(); setToken('');
  S.wsOpen = false;
}
function sessionExpired() {
  if (!S.user) return;
  resetSessionState();
  history.replaceState(null, '', '#/login');
  toast('Your session has expired. Please log in again.', 'error');
  route();
}
async function logout() {
  try { await api('/auth/logout', { method: 'POST', body: {}, quiet: true }); } catch { /* token is dropped locally either way */ }
  resetSessionState();
  history.replaceState(null, '', location.pathname);
  toast('You have been logged out.', 'success');
  route();
}

/* ======================================================================
   Welcome page (signed out)
   ====================================================================== */
const SAMPLE_CODE = `const hype = (devs) =>
  devs.map((d) => d.ship("something cool"));

await webcord.share(hype(world));`;

function renderWelcome() {
  document.title = 'Webcord — Hype with devs worldwide';
  app.innerHTML = `
  <div class="wl">
    <header class="wl-nav"><div class="inner">
      ${logo(36)}
      <nav class="wl-links" aria-label="Sections">
        <button data-scroll="features">Features</button><button data-scroll="code">Code sharing</button><button data-scroll="showcase">Showcase</button>
      </nav>
      <div class="wl-cta"><a class="btn ghost" href="#/signup">Sign up</a><a class="btn primary" href="#/login">Log in</a></div>
    </div></header>

    <section class="hero"><div class="inner">
      <div>
        <span class="eyebrow"><i>New</i> Chat, code &amp; websites in one place</span>
        <h1>Hype with <span class="hl">devs</span> <span class="br">{</span>worldwide<span class="br">}</span></h1>
        <p class="lead">Webcord is the home for developers who like to build in public: talk in rooms, drop syntax-highlighted snippets people can copy in one click, share files, and get your websites in front of other devs.</p>
        <div class="actions">
          <a class="btn primary lg" href="#/signup">Get Started ${icon('send', 17)}</a>
          <button class="btn lg" data-scroll="features">Explore Webcord</button>
        </div>
        <div class="meta"><span>${icon('check', 16)} Free to join</span><span>${icon('check', 16)} Real-time chat</span><span>${icon('check', 16)} Built for code</span></div>
      </div>
      <div class="stage" aria-hidden="true">
        <div class="float-card float-file"><span class="file-ico">${icon('file', 18)}</span><span>design-tokens.json<br><small style="color:var(--muted);font-weight:500">2.4 KB · shared in #showcase</small></span></div>
        <div class="mock mock-chat">
          <div class="mock-top"><span class="hash">#</span> general <span class="live">live</span></div>
          <div class="mock-body">
            <div class="m-msg">${avatar({ username: 'ada', display_name: 'Ada' }, 34)}<div><div class="who">Ada <small>10:41</small></div><p>Anyone know a neat way to debounce this? It fires on every keystroke.</p></div></div>
            <div class="m-msg">${avatar({ username: 'linus', display_name: 'Linus' }, 34)}<div style="min-width:0;flex:1"><div class="who">Linus <small>10:42</small></div><p>Try this:</p>${codeBlock('const debounce = (fn, ms) => {\n  let t;\n  return (...a) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...a), ms);\n  };\n};', 'js')}</div></div>
          </div>
          <div class="mock-input"><span>Message #general</span><span style="color:var(--brand)">${icon('send', 18)}</span></div>
        </div>
        <div class="float-card float-proj"><div class="thumb-art" style="background:linear-gradient(135deg,#6d5dfc,#c084fc)"></div><div class="pad"><b>Your project here</b><span style="color:var(--muted)">Share it in Web and get discovered</span></div></div>
      </div>
    </div></section>

    <section class="section" id="features">
      <h2 class="reveal"><span class="br">&lt;</span>Everything devs actually use<span class="br">/&gt;</span></h2>
      <p class="sub reveal">No noise, no clutter. Four things, done properly.</p>
      <div class="features">
        ${[
          ['chat', 'Developer chat', 'Public rooms and direct messages with real-time delivery and full message history.', '#6d5dfc,#8b5cf6'],
          ['code', 'Code sharing', 'Fenced code blocks with syntax highlighting, language labels and a one-click Copy button.', '#ec4899,#f97316'],
          ['paperclip', 'File sharing', 'Drop images and files straight into a conversation. Access is limited to room members.', '#0ea5e9,#6366f1'],
          ['globe', 'Website discovery', 'Submit what you built, browse projects from other devs and jump to their profiles.', '#10b981,#06b6d4'],
        ].map(([ic, t, d, g]) => `<article class="feat reveal"><div class="fi" style="background:linear-gradient(135deg,${g.split(',')[0]},${g.split(',')[1]})">${icon(ic, 22)}</div><h3>${t}</h3><p>${d}</p></article>`).join('')}
      </div>
    </section>

    <div class="band"><section class="section" id="code">
      <div class="split">
        <div>
          <h2 class="reveal">Snippets that <span class="br">copy</span> in one click</h2>
          <p class="sub reveal" style="margin-bottom:18px">Wrap code in triple backticks and Webcord adds highlighting, a language label and a Copy button. Inline <code class="inline" style="font-family:var(--mono);background:var(--soft-2);padding:2px 6px;border-radius:6px">code</code>, lists, quotes and links work too.</p>
          <a class="btn primary" href="#/signup">Start sharing code</a>
        </div>
        <div class="mock reveal" aria-hidden="true">
          <div class="mock-top"><span class="hash">#</span> help</div>
          <div class="mock-body">
            <div class="m-msg">${avatar({ username: 'grace', display_name: 'Grace' }, 34)}<div style="min-width:0;flex:1"><div class="who">Grace <small>just now</small></div><p>Here's the config. Shout if it doesn't build:</p>${codeBlock('{\n  "name": "my-site",\n  "scripts": { "build": "vite build" },\n  "private": true\n}', 'json')}${codeBlock(SAMPLE_CODE, 'js')}</div></div>
          </div>
        </div>
      </div>
    </section></div>

    <section class="section" id="showcase">
      <h2 class="reveal">Discover sites built by <span class="br">devs</span></h2>
      <p class="sub reveal">The Web tab is a living gallery of projects from the community.</p>
      <span class="sample-note">Preview — sample cards, not real projects</span>
      <div class="gallery">
        ${[['Portfolio site', 'A fast, minimal developer portfolio.', '#6d5dfc,#c084fc'], ['Docs starter', 'Documentation theme with search.', '#0ea5e9,#6366f1'], ['Tiny dashboard', 'Self-hosted metrics in one page.', '#f97316,#ec4899']].map(([t, d, g]) => `
        <article class="card proj reveal" aria-hidden="true"><div class="thumb"><div class="thumb-fb" style="background:linear-gradient(135deg,${g.split(',')[0]},${g.split(',')[1]})">${t[0]}<small>https://example.dev</small></div></div><div class="proj-body"><h3>${t}</h3><p>${d}</p><div class="proj-foot"><span class="creator">${avatar({ username: t, display_name: t }, 24)}<span>sample</span></span><span class="btn sm">${icon('external', 14)} Visit</span></div></div></article>`).join('')}
      </div>
    </section>

    <div class="cta-band"><div class="cta-inner">
      <h2>Ready to hype with devs worldwide?</h2><p>Create your free account in under a minute.</p>
      <a class="btn lg" href="#/signup">Create your account</a>
    </div></div>

    <footer class="wl-foot"><div class="inner">
      <div>${logo(32)}<p>Hype with devs worldwide. Chat, share code and discover what developers are building.</p></div>
      <div><h4>Product</h4><ul><li><button data-scroll="features">Features</button></li><li><button data-scroll="code">Code sharing</button></li><li><button data-scroll="showcase">Showcase</button></li></ul></div>
      <div><h4>Account</h4><ul><li><a href="#/login">Log in</a></li><li><a href="#/signup">Sign up</a></li></ul></div>
      <div class="copy">© ${new Date().getFullYear()} Webcord. Made for developers.</div>
    </div></footer>
  </div>`;
  window.scrollTo(0, 0);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 }) : null;
  $$('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
}

/* ======================================================================
   Auth page
   ====================================================================== */
function renderAuth(mode = 'login') {
  document.title = `${mode === 'signup' ? 'Create account' : 'Log in'} — Webcord`;
  app.innerHTML = `
  <div class="auth">
    <section class="auth-form-side">
      <div class="auth-top">${logo(34)}<a class="btn ghost sm" href="#/">← Back</a></div>
      <div class="auth-card" id="auth-area"></div>
    </section>
    <aside class="auth-brand-side">
      ${logo(40).replace('class="logo"', 'class="logo" tabindex="-1"')}
      <h2>Hype with devs worldwide.</h2>
      <p>Join rooms, share snippets with highlighting and one-click copy, drop files, and show off the sites you build.</p>
      <div class="auth-mock" aria-hidden="true">
        <div class="m-msg">${avatar({ username: 'dev', display_name: 'Dev' }, 30)}<div style="min-width:0;flex:1"><div class="who">dev <small style="color:var(--muted)">now</small></div>${codeBlock('npm create webcord@latest', 'sh')}</div></div>
      </div>
      <ul class="auth-feats">
        ${['Real-time chat rooms and DMs', 'Syntax-highlighted code with one-click copy', 'File &amp; image sharing', 'A showcase for the websites you build'].map((t) => `<li><span class="tick">${icon('check', 15)}</span>${t}</li>`).join('')}
      </ul>
    </aside>
  </div>`;
  mountAuthForm(mode);
}

function mountAuthForm(mode) {
  const area = $('#auth-area');
  history.replaceState(null, '', `#/${mode}`);
  document.title = `${mode === 'signup' ? 'Create account' : 'Log in'} — Webcord`;
  const tabs = `<div class="tabs" role="tablist" aria-label="Authentication">
    <button role="tab" type="button" data-mode="login" aria-selected="${mode === 'login'}">Log in</button>
    <button role="tab" type="button" data-mode="signup" aria-selected="${mode === 'signup'}">Sign up</button></div>`;
  if (mode === 'login') {
    let last = ''; try { last = localStorage.getItem('webcord.lastLogin') || ''; } catch { /* */ }
    area.innerHTML = `${tabs}<h1>Welcome back</h1><p class="sub">Log in to jump back into the conversation.</p>
      <form id="login-form" novalidate><div class="form-error" id="login-error" role="alert"></div>
      ${fieldHtml({ id: 'li-id', label: 'Email or username', autocomplete: 'username', placeholder: 'you@example.com', value: last, maxlength: 254 })}
      ${fieldHtml({ id: 'li-pw', label: 'Password', type: 'password', autocomplete: 'current-password', placeholder: 'Your password', pw: true, maxlength: 128 })}
      <button class="btn primary lg full" type="submit">Log In</button></form>
      <p class="auth-switch">New to Webcord? <button type="button" data-mode="signup">Create an account</button></p>`;
    $('#login-form').addEventListener('submit', onLogin);
    $(last ? '#li-pw' : '#li-id').focus({ preventScroll: true });
  } else {
    area.innerHTML = `${tabs}<h1>Create your account</h1><p class="sub">It takes less than a minute.</p>
      <form id="signup-form" novalidate><div class="form-error" id="signup-error" role="alert"></div>
      ${fieldHtml({ id: 'su-email', label: 'Email address', type: 'email', autocomplete: 'email', placeholder: 'you@example.com', maxlength: 254 })}
      <div class="field" style="margin-bottom:0">${''}</div>
      ${fieldHtml({ id: 'su-username', label: 'Username', autocomplete: 'username', placeholder: 'ada_lovelace', maxlength: 20, hint: '3–20 characters: letters, numbers, underscores. Must be unique.' })}
      <p class="ok-text" id="su-username-ok" style="margin:-8px 0 12px"></p>
      ${fieldHtml({ id: 'su-display', label: 'Display name', autocomplete: 'nickname', placeholder: 'Ada Lovelace', maxlength: 40 })}
      ${fieldHtml({ id: 'su-pw', label: 'Password', type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters', pw: true, maxlength: 128 })}
      <div class="strength" aria-hidden="true" style="margin:-6px 0 14px"><i id="pw-strength"></i></div>
      ${fieldHtml({ id: 'su-pw2', label: 'Confirm password', type: 'password', autocomplete: 'new-password', placeholder: 'Repeat your password', pw: true, maxlength: 128 })}
      <button class="btn primary lg full" type="submit">Create Account</button></form>
      <p class="auth-switch">Already have an account? <button type="button" data-mode="login">Log in</button></p>`;
    const f = $('#signup-form');
    f.addEventListener('submit', onSignup);
    $('#su-pw').addEventListener('input', (e) => {
      const v = e.target.value; let s = 0;
      if (v.length >= 8) s++; if (v.length >= 12) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
      const bar = $('#pw-strength'); bar.style.width = `${(s / 4) * 100}%`; bar.style.background = ['#d93a4a', '#d93a4a', '#d98a0b', '#16a36a', '#16a36a'][s];
    });
    const check = debounce(async () => {
      const v = $('#su-username').value.trim(); const ok = $('#su-username-ok');
      ok.textContent = '';
      if (!v || V.username(v)) return;
      try {
        const r = await api('/username-available?u=' + encodeURIComponent(v), { quiet: true });
        if ($('#su-username').value.trim() !== v) return;
        if (r.available) { ok.textContent = '✓ ' + r.message; setErr('su-username', ''); } else setErr('su-username', r.message);
      } catch { /* the server re-validates on submit */ }
    }, 400);
    $('#su-username').addEventListener('input', () => { setErr('su-username', ''); check(); });
    $('#su-email').focus({ preventScroll: true });
  }
}

async function onLogin(e) {
  e.preventDefault();
  const form = e.currentTarget, btn = $('button[type=submit]', form), errBox = $('#login-error');
  clearErrs(form); errBox.textContent = '';
  const identifier = $('#li-id').value.trim(), password = $('#li-pw').value;
  let bad = false;
  if (!identifier) { setErr('li-id', 'Enter your email or username.'); bad = true; }
  if (!password) { setErr('li-pw', 'Enter your password.'); bad = true; }
  if (bad) return;
  busy(btn, true, 'Logging in…');
  try {
    const r = await api('/auth/login', { method: 'POST', body: { identifier, password }, quiet: true });
    btn.innerHTML = `${icon('check', 18)} Logged in`;
    toast(`Welcome back, ${r.user.display_name}!`, 'success');
    setTimeout(() => afterAuth(r.user, r.token), 350);
  } catch (err) {
    busy(btn, false);
    errBox.textContent = err.message;
    $('#li-pw').value = ''; $('#li-pw').focus();
  }
}

async function onSignup(e) {
  e.preventDefault();
  const form = e.currentTarget, btn = $('button[type=submit]', form), errBox = $('#signup-error');
  clearErrs(form); errBox.textContent = '';
  const v = { email: $('#su-email').value, username: $('#su-username').value, display: $('#su-display').value, pw: $('#su-pw').value, pw2: $('#su-pw2').value };
  const errs = { 'su-email': V.email(v.email), 'su-username': V.username(v.username), 'su-display': V.display(v.display), 'su-pw': V.password(v.pw), 'su-pw2': v.pw === v.pw2 ? '' : 'Passwords do not match.' };
  let first = null;
  for (const [id, m] of Object.entries(errs)) if (m) { setErr(id, m); first = first || id; }
  if (first) { document.getElementById(first).focus(); return; }
  busy(btn, true, 'Creating account…');
  try {
    const r = await api('/auth/register', { method: 'POST', body: { email: v.email.trim(), username: v.username.trim(), display_name: v.display.trim(), password: v.pw }, quiet: true });
    btn.innerHTML = `${icon('check', 18)} Account created`;
    toast(`Welcome to Webcord, ${r.user.display_name}!`, 'success');
    setTimeout(() => afterAuth(r.user, r.token), 450);
  } catch (err) {
    busy(btn, false);
    const shown = applyServerErrors({ email: 'su-email', username: 'su-username', display_name: 'su-display', password: 'su-pw' }, err);
    errBox.textContent = shown ? 'Please fix the highlighted fields.' : err.message;
  }
}

/* ======================================================================
   App shell
   ====================================================================== */
function ensureShell() {
  if ($('#shell')) return;
  app.innerHTML = `
  <div class="shell" id="shell">
    <header class="topbar"><button class="btn icon ghost" data-action="toggle-nav" aria-label="Open navigation">${icon('menu', 22)}</button>${logo(30)}</header>
    <aside class="sidebar" id="sidebar" aria-label="Main">
      <div style="padding:2px 8px">${logo(36)}</div>
      <nav class="nav" aria-label="Sections">
        <a href="#/chat" data-nav="chat">${icon('chat')}<span>Chat</span><span class="count" id="nav-unread" hidden></span></a>
        <a href="#/web" data-nav="web">${icon('globe')}<span>Web</span></a>
        <a href="#/profile" data-nav="profile">${icon('user')}<span>Profile</span></a>
        <a href="#/settings" data-nav="settings">${icon('settings')}<span>Settings</span></a>
      </nav>
      <div class="me-card" id="me-card"></div>
    </aside>
    <div class="backdrop" data-action="close-nav"></div>
    <main class="main" id="main" tabindex="-1"></main>
  </div>`;
  renderMeCard();
}
function renderMeCard() {
  const c = $('#me-card'); if (!c || !S.user) return;
  c.innerHTML = `<a class="me-link" href="#/profile" aria-label="Your profile">${avatar(S.user, 40)}<div class="meta"><div class="name">${esc(S.user.display_name)}</div><div class="handle">@${esc(S.user.username)}</div><span class="status ${S.wsOpen ? 'on' : ''}" id="me-status">${S.wsOpen ? 'Online' : 'Connecting…'}</span></div></a>
    <button class="btn icon ghost" data-action="logout" aria-label="Log out" title="Log out">${icon('logout', 18)}</button>`;
}
function updateStatus() {
  const s = $('#me-status'); if (!s) return;
  s.classList.toggle('on', S.wsOpen); s.textContent = S.wsOpen ? 'Online' : 'Connecting…';
}
function setActiveNav(sec) {
  $$('.nav a').forEach((a) => (a.dataset.nav === sec ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const titles = { chat: 'Chat', web: 'Web', profile: 'Profile', settings: 'Settings' };
  document.title = `${titles[sec] || 'Webcord'} — Webcord`;
}
function setMain(html, flush = false) {
  const m = $('#main'); m.className = 'main' + (flush ? ' flush' : ''); m.innerHTML = html; m.scrollTop = 0;
  return m;
}
function updateUnreadBadge() {
  const total = Object.values(S.unread).reduce((a, b) => a + b, 0);
  const el = $('#nav-unread'); if (!el) return;
  el.hidden = !total; el.textContent = total > 99 ? '99+' : total;
}

/* ======================================================================
   Realtime (simple polling of /api/sync)
   ====================================================================== */
const SYNC_VISIBLE_MS = 3000, SYNC_HIDDEN_MS = 15000;
function startSync() {
  if (!S.user || S.syncTimer) return;
  S.syncSeq = null; S.retry = 0;
  const loop = async () => {
    if (!S.user) { S.syncTimer = null; return; }
    await syncOnce();
    if (!S.user) { S.syncTimer = null; return; }
    S.syncTimer = setTimeout(loop, S.retry ? Math.min(30000, 3000 * 2 ** Math.min(S.retry, 4)) : (document.hidden ? SYNC_HIDDEN_MS : SYNC_VISIBLE_MS));
  };
  S.syncTimer = setTimeout(loop, 0);
}
function stopSync() { clearTimeout(S.syncTimer); S.syncTimer = null; S.syncSeq = null; S.syncBusy = false; }
async function syncOnce() {
  if (S.syncBusy || !S.user) return;
  S.syncBusy = true;
  try {
    const r = await api('/sync' + (S.syncSeq == null ? '' : '?since=' + S.syncSeq), { quiet: true });
    const wasOffline = !S.wsOpen;
    S.retry = 0; S.wsOpen = true; updateStatus();
    S.online = new Set(r.online || []); updatePresence();
    if (S.syncSeq != null) for (const m of r.messages) onRealtime({ event: 'message', data: { message: m } });
    S.syncSeq = r.seq;
    if (wasOffline && S.syncSeq != null && S.room && parseHash()[0] === 'chat') refreshActiveRoom();
  } catch (e) {
    if (e.status === 401) { S.syncBusy = false; return sessionExpired(); }
    S.retry++; S.wsOpen = false; updateStatus();
  } finally { S.syncBusy = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) { clearTimeout(S.syncTimer); S.syncTimer = null; startSync(); } });

function onRealtime({ event, data }) {
  if (event === 'message') {
    const m = data.message;
    const viewing = S.room && S.room.id === m.room_id && parseHash()[0] === 'chat' && !document.hidden;
    if (S.room && S.room.id === m.room_id && parseHash()[0] === 'chat') addMessage(m, { own: m.author.id === S.user.id });
    if (!viewing && m.author.id !== S.user.id) {
      S.unread[m.room_id] = (S.unread[m.room_id] || 0) + 1; updateUnreadBadge();
      if (!S.dms.some((d) => d.id === m.room_id) && !S.rooms.some((r) => r.id === m.room_id)) loadRooms().then(renderRoomList).catch(() => {});
      else renderRoomList();
    } else if (viewing && !S.dms.some((d) => d.id === m.room_id) && !S.rooms.some((r) => r.id === m.room_id)) {
      loadRooms().then(renderRoomList).catch(() => {});
    }
  }
}
function updatePresence() {
  $$('[data-uid]').forEach((el) => el.classList.toggle('on', S.online.has(el.dataset.uid)));
  if (S.room?.kind === 'dm') { const s = $('#peer-status'); if (s) s.textContent = S.online.has(S.room.peer.id) ? 'Online' : 'Offline'; }
}

/* ======================================================================
   Chat
   ====================================================================== */
async function loadRooms() {
  const r = await api('/rooms');
  S.rooms = r.rooms; S.dms = r.dms; S.roomsLoaded = true;
  for (const d of S.dms) if (d.peer.online) S.online.add(d.peer.id);
}
const findRoom = (id) => S.rooms.find((r) => r.id === id) || S.dms.find((d) => d.id === id);

function roomsHtml() {
  const badge = (id) => (S.unread[id] ? `<span class="badge">${S.unread[id]}</span>` : '');
  const pub = S.rooms.map((r) => `<a class="room-item ${S.room?.id === r.id ? 'active' : ''}" href="#/chat/${r.id}" ${S.room?.id === r.id ? 'aria-current="true"' : ''}><span class="hash">#</span><span class="rname">${esc(r.name)}</span>${badge(r.id)}</a>`).join('');
  const dms = S.dms.length
    ? S.dms.map((d) => `<a class="room-item ${S.room?.id === d.id ? 'active' : ''}" href="#/chat/${d.id}"><span class="av-wrap">${avatar(d.peer, 28)}<i class="dot ${S.online.has(d.peer.id) ? 'on' : ''}" data-uid="${d.peer.id}"></i></span><span class="rname">${esc(d.peer.display_name)}</span>${badge(d.id)}</a>`).join('')
    : '<p class="muted-p">No direct messages yet. Start one with the + button.</p>';
  return `<h3>Channels</h3>${pub}<h3>Direct messages <button class="btn icon sm ghost" data-action="new-dm" aria-label="New direct message">${icon('plus', 16)}</button></h3>${dms}`;
}
function renderRoomList() { const el = $('#rooms'); if (el) el.innerHTML = roomsHtml(); }

async function renderChat(roomId, token) {
  const main = $('#main');
  if (!$('#chat', main)) {
    main.className = 'main flush';
    main.innerHTML = `<div class="chat" id="chat"><aside class="rooms" id="rooms" aria-label="Conversations"></aside><section class="convo" id="convo"><div class="loading-row"><span class="spinner"></span>Loading…</div></section></div>`;
  }
  if (!S.roomsLoaded) {
    $('#rooms').innerHTML = '<div class="loading-row"><span class="spinner"></span></div>';
    try { await loadRooms(); } catch (e) {
      $('#convo').innerHTML = `<div class="empty" style="margin:24px"><h3>Couldn’t load conversations</h3><p>${esc(e.message)}</p><button class="btn primary" data-action="retry-chat">Try again</button></div>`;
      return;
    }
    if (token !== S.token) return;
  }
  let target = roomId && findRoom(roomId);
  if (roomId && !target && /^dm_/.test(roomId)) { try { await loadRooms(); } catch { /* */ } target = findRoom(roomId); }
  if (!target) { let last = null; try { last = localStorage.getItem('webcord.lastRoom'); } catch { /* */ } target = findRoom(last) || S.rooms[0]; }
  if (!target) { $('#convo').innerHTML = '<div class="empty" style="margin:24px"><h3>No rooms available</h3><p>Run the D1 migration to create the default channels.</p></div>'; renderRoomList(); return; }
  if (target.id !== roomId) history.replaceState(null, '', `#/chat/${target.id}`);
  try { localStorage.setItem('webcord.lastRoom', target.id); } catch { /* */ }
  await openRoom(target, token);
}

async function openRoom(room, token) {
  const same = S.room && S.room.id === room.id && $('#msgs');
  if (same) { S.unread[room.id] = 0; updateUnreadBadge(); renderRoomList(); return; }
  if (S.room) S.drafts[S.room.id] = $('#msg-input')?.value || '';
  S.room = room; S.msgs = []; S.hasMore = false; S.nextBefore = null; S.pending = null;
  S.unread[room.id] = 0; updateUnreadBadge(); renderRoomList();
  const isDm = room.kind === 'dm';
  const title = isDm ? room.peer.display_name : `# ${room.name}`;
  const sub = isDm ? `@${esc(room.peer.username)} · <span id="peer-status">${S.online.has(room.peer.id) ? 'Online' : 'Offline'}</span>` : esc(room.description || '');
  $('#convo').innerHTML = `
    <div class="convo-head">
      <button class="btn icon ghost rooms-toggle" data-action="toggle-rooms" aria-label="Show conversations">${icon('menu', 20)}</button>
      ${isDm ? `<span class="av-wrap">${avatar(room.peer, 36)}<i class="dot ${S.online.has(room.peer.id) ? 'on' : ''}" data-uid="${room.peer.id}"></i></span>` : ''}
      <div style="min-width:0"><h2>${esc(title)}</h2><p>${sub}</p></div>
    </div>
    <div class="msgs" id="msgs" role="log" aria-live="polite" aria-label="Messages"><div class="loading-row"><span class="spinner"></span>Loading messages…</div></div>
    <form class="composer" id="composer" autocomplete="off">
      <div class="composer-box">
        <div id="pending"></div>
        <textarea id="msg-input" rows="1" maxlength="8000" aria-label="Message" placeholder="Message ${isDm ? '@' + esc(room.peer.username) : '#' + esc(room.name)}"></textarea>
        <div class="composer-bar">
          <label class="btn icon ghost" for="file-input" title="Attach an image" aria-label="Attach an image">${icon('paperclip', 19)}</label>
          <input type="file" id="file-input" class="sr-only" tabindex="-1" accept="image/png,image/jpeg,image/gif,image/webp">
          <button type="button" class="btn icon ghost" data-action="insert-code" title="Insert code block" aria-label="Insert code block">${icon('code', 19)}</button>
          <span class="spacer"></span><span class="tip">Enter to send · Shift+Enter for a new line</span>
          <button class="btn primary sm" type="submit" id="send-btn">${icon('send', 15)} Send</button>
        </div>
      </div>
    </form>`;
  bindComposer();
  const draft = S.drafts[room.id]; if (draft) { $('#msg-input').value = draft; autoGrow($('#msg-input')); }
  try {
    const r = await api(`/rooms/${encodeURIComponent(room.id)}/messages?limit=50`);
    if (S.room?.id !== room.id) return;
    S.msgs = r.messages; S.hasMore = r.has_more; S.nextBefore = r.next_before;
    renderMsgs(true);
  } catch (e) {
    if (S.room?.id !== room.id) return;
    $('#msgs').innerHTML = `<div class="empty" style="margin:24px"><h3>Couldn’t load messages</h3><p>${esc(e.message)}</p><button class="btn primary" data-action="retry-room">Try again</button></div>`;
  }
  if (matchMedia('(min-width: 861px)').matches) $('#msg-input')?.focus();
}
async function refreshActiveRoom() {
  if (!S.room) return;
  try {
    const r = await api(`/rooms/${encodeURIComponent(S.room.id)}/messages?limit=50`, { quiet: true });
    const ids = new Set(S.msgs.map((m) => m.id));
    const fresh = r.messages.filter((m) => !ids.has(m.id));
    if (fresh.length) { S.msgs = r.messages.length >= 50 && fresh.length >= 50 ? r.messages : [...S.msgs, ...fresh].sort((a, b) => a.seq - b.seq); renderMsgs(true); }
  } catch { /* try again on next event */ }
}

function msgHtml(m, prev) {
  const grouped = prev && prev.author.id === m.author.id && m.created_at - prev.created_at < 5 * 60e3;
  const a = m.author;
  const att = m.attachment
    ? (m.attachment.is_image
      ? `<a href="${esc(m.attachment.url)}" target="_blank" rel="noopener"><img class="att-img" src="${esc(m.attachment.url)}" alt="${esc(m.attachment.name)}" loading="lazy" data-fb></a>`
      : `<a class="att-file" href="${esc(m.attachment.url)}" download="${esc(m.attachment.name)}"><span class="file-ico">${icon('file', 18)}</span><span style="min-width:0"><b>${esc(m.attachment.name)}</b><small>${fmtSize(m.attachment.size)} · Download</small></span></a>`)
    : '';
  return `<article class="msg ${grouped ? 'grouped' : ''}" data-id="${esc(m.id)}">${grouped ? '<span class="msg-gutter"></span>' : `<a class="msg-av" href="#/u/${encodeURIComponent(a.username)}" tabindex="-1" aria-hidden="true">${avatar(a, 38)}</a>`}<div class="msg-main">${grouped ? '' : `<header><a class="msg-name" href="#/u/${encodeURIComponent(a.username)}">${esc(a.display_name)}</a><span class="msg-user">@${esc(a.username)}</span><time datetime="${new Date(m.created_at).toISOString()}" title="${esc(fmtFull(m.created_at))}">${fmtTime(m.created_at)}</time></header>`}${m.body ? `<div class="msg-body">${renderMessage(m.body)}</div>` : ''}${att}</div></article>`;
}
function renderMsgs(scrollBottom) {
  const box = $('#msgs'); if (!box) return;
  if (!S.msgs.length) {
    box.innerHTML = `<div class="empty" style="margin:24px 8px"><div class="em-ico">${icon('chat', 24)}</div><h3>No messages yet</h3><p>Be the first to say something${S.room?.kind === 'dm' ? ` to ${esc(S.room.peer.display_name)}` : ''}. Use triple backticks for code.</p></div>`;
    return;
  }
  const prevH = box.scrollHeight;
  box.innerHTML = (S.hasMore ? `<div class="load-older"><button class="btn sm" data-action="load-older">Load older messages</button></div>` : '') +
    S.msgs.map((m, i) => msgHtml(m, S.msgs[i - 1])).join('');
  if (scrollBottom) box.scrollTop = box.scrollHeight; else box.scrollTop = box.scrollHeight - prevH;
}
function addMessage(m, { own = false } = {}) {
  if (m.room_id !== S.room?.id || S.msgs.some((x) => x.id === m.id)) return;
  const box = $('#msgs'); const prev = S.msgs[S.msgs.length - 1];
  S.msgs.push(m);
  if (!box) return;
  if (S.msgs.length === 1) { renderMsgs(true); return; }
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  box.insertAdjacentHTML('beforeend', msgHtml(m, prev));
  if (near || own) box.scrollTop = box.scrollHeight;
}
async function loadOlder(btn) {
  if (!S.hasMore || !S.nextBefore) return;
  busy(btn, true, 'Loading…');
  try {
    const roomId = S.room.id;
    const r = await api(`/rooms/${encodeURIComponent(roomId)}/messages?limit=50&before=${S.nextBefore}`);
    if (S.room?.id !== roomId) return;
    S.msgs = [...r.messages, ...S.msgs]; S.hasMore = r.has_more; S.nextBefore = r.next_before;
    renderMsgs(false);
  } catch (e) { busy(btn, false); toast(e.message, 'error'); }
}

function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; }
function renderPending() {
  const el = $('#pending'); if (!el) return;
  const p = S.pending;
  el.innerHTML = p ? `<div class="pending-att">${p.uploading ? '<span class="spinner"></span>' : icon('paperclip', 16)}<span class="n">${esc(p.name)}${p.size ? ` · ${fmtSize(p.size)}` : ''}${p.uploading ? ' — uploading…' : ''}</span><button type="button" data-action="remove-pending" aria-label="Remove attachment">${icon('x', 16)}</button></div>` : '';
}
function bindComposer() {
  const form = $('#composer'), ta = $('#msg-input');
  ta.addEventListener('input', () => autoGrow(ta));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
  $('#file-input').addEventListener('change', onFilePicked);
}
async function sendMessage() {
  const ta = $('#msg-input'); if (!ta || S.sending) return;
  const body = ta.value.trim();
  if (S.pending?.uploading) return toast('Wait for the upload to finish.', 'error');
  if (!body && !S.pending) return;
  S.sending = true;
  const btn = $('#send-btn'); btn.disabled = true;
  const roomId = S.room.id;
  try {
    const r = await api(`/rooms/${encodeURIComponent(roomId)}/messages`, { method: 'POST', body: { body, attachment: S.pending ? { url: S.pending.url, name: S.pending.name, size: S.pending.size } : undefined } });
    if (S.room?.id === roomId) { ta.value = ''; autoGrow(ta); S.pending = null; renderPending(); addMessage(r.message, { own: true }); }
    delete S.drafts[roomId];
    if (S.room?.kind === 'dm') { S.dms = [S.dms.find((d) => d.id === roomId), ...S.dms.filter((d) => d.id !== roomId)].filter(Boolean); renderRoomList(); }
  } catch (e) { toast(e.message, 'error'); }
  finally { S.sending = false; btn.disabled = false; ta.focus(); }
}
async function onFilePicked(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) return toast('Only images can be attached (PNG, JPEG, GIF or WebP). Share code with a code block instead.', 'error');
  if (file.size > 10 * 1024 * 1024) return toast('Images can be at most 10 MB.', 'error');
  if (!file.size) return toast('That file is empty.', 'error');
  const roomId = S.room.id;
  S.pending = { uploading: true, name: file.name, size: file.size }; renderPending();
  try {
    const url = await uploadImage(file);
    if (S.room?.id === roomId) { S.pending = { url, name: file.name, size: file.size }; renderPending(); }
  } catch (err) { S.pending = null; renderPending(); toast(err.message, 'error'); }
}
function insertCodeBlock() {
  const ta = $('#msg-input'); if (!ta) return;
  const s = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(s, en);
  const pre = s > 0 && ta.value[s - 1] !== '\n' ? '\n' : '';
  const ins = `${pre}\`\`\`js\n${sel}\n\`\`\``;
  ta.setRangeText(ins, s, en, 'end');
  const caret = s + pre.length + 6 + sel.length; // inside the block
  ta.focus(); ta.setSelectionRange(caret, caret); autoGrow(ta);
}

function openNewDm() {
  openModal({
    title: 'New direct message',
    html: `<div class="field"><label for="dm-q">Find a developer</label><input class="input" id="dm-q" placeholder="Search by username or name" autocomplete="off"></div><div id="dm-results" style="display:grid;gap:4px;min-height:60px"><p class="muted-p">Type to search.</p></div>`,
    onOpen: (d, close) => {
      const q = $('#dm-q', d), res = $('#dm-results', d);
      const run = debounce(async () => {
        const v = q.value.trim(); if (!v) { res.innerHTML = '<p class="muted-p">Type to search.</p>'; return; }
        try {
          const r = await api('/users?q=' + encodeURIComponent(v));
          res.innerHTML = r.users.length ? r.users.map((u) => `<button class="room-item" style="border:0;background:none;text-align:left;width:100%" data-user="${esc(u.username)}">${avatar(u, 32)}<span class="rname">${esc(u.display_name)} <span style="color:var(--muted);font-weight:500">@${esc(u.username)}</span></span></button>`).join('') : '<p class="muted-p">No developers found.</p>';
        } catch (e) { res.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      }, 250);
      q.addEventListener('input', run); q.focus();
      res.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-user]'); if (!b) return;
        await startDm(b.dataset.user); close();
      });
    },
  });
}
async function startDm(username) {
  try {
    const r = await api('/dms', { method: 'POST', body: { username } });
    if (!findRoom(r.room.id)) { S.dms.unshift(r.room); }
    for (const d of S.dms) if (d.id === r.room.id) d.peer = r.room.peer;
    go('#/chat/' + r.room.id);
  } catch (e) { toast(e.message, 'error'); }
}

/* ======================================================================
   Web (project showcase)
   ====================================================================== */
function projectCard(p) {
  S.proj.set(p.id, p);
  const mine = S.user && p.creator.id === S.user.id;
  const [a, b] = gradFor(p.title);
  let host = p.url; try { host = new URL(p.url).host; } catch { /* */ }
  return `<article class="card proj" data-pid="${esc(p.id)}">
    <div class="thumb"><div class="thumb-fb" style="background:linear-gradient(135deg,${a},${b})">${esc(p.title.charAt(0).toUpperCase())}<small>${esc(host)}</small></div>${p.preview_url ? `<img src="${esc(p.preview_url)}" alt="Preview of ${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer" data-fb>` : ''}</div>
    <div class="proj-body"><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="proj-url" title="${esc(p.url)}">${esc(p.url)}</div>
      <div class="proj-foot"><a class="creator" href="#/u/${encodeURIComponent(p.creator.username)}">${avatar(p.creator, 26)}<span>${esc(p.creator.display_name)}</span></a>
      <span class="proj-actions">${mine ? `<button class="btn icon sm ghost" data-action="edit-project" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.title)}">${icon('edit', 16)}</button><button class="btn icon sm ghost" data-action="delete-project" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.title)}">${icon('trash', 16)}</button>` : ''}
      <a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external', 14)} Visit</a></span></div></div></article>`;
}

function renderWeb() {
  setMain(`<div class="page">
    <div class="page-head"><div><h1>Web</h1><p>Websites built by developers in the Webcord community.</p></div><button class="btn primary" data-action="new-project">${icon('plus', 17)} Submit project</button></div>
    <div class="toolbar"><div class="search">${icon('search')}<input class="input" id="proj-search" type="search" placeholder="Search projects by title or description" aria-label="Search projects" value="${esc(S.web.q)}"></div></div>
    <div id="proj-results"></div></div>`);
  $('#proj-search').addEventListener('input', debounce((e) => { S.web.q = e.target.value.trim(); loadProjects(true); }, 300));
  loadProjects(true);
}
async function loadProjects(reset) {
  const box = $('#proj-results'); if (!box) return;
  const w = S.web;
  if (reset) { w.offset = 0; w.items = []; box.innerHTML = '<div class="loading-row"><span class="spinner"></span>Loading projects…</div>'; }
  const mySeq = (w.seq = (w.seq || 0) + 1);
  try {
    const r = await api(`/projects?limit=24&offset=${w.offset}${w.q ? '&q=' + encodeURIComponent(w.q) : ''}`);
    if (mySeq !== w.seq || !$('#proj-results')) return;
    w.items = w.items.concat(r.projects); w.offset = w.items.length; w.hasMore = r.has_more;
    if (!w.items.length) {
      box.innerHTML = `<div class="empty"><div class="em-ico">${icon('globe', 24)}</div><h3>${w.q ? 'No projects match your search' : 'No projects yet'}</h3><p>${w.q ? 'Try a different keyword.' : 'Be the first to share something you built.'}</p>${w.q ? '' : `<button class="btn primary" data-action="new-project">${icon('plus', 16)} Submit project</button>`}</div>`;
      return;
    }
    box.innerHTML = `<div class="grid">${w.items.map(projectCard).join('')}</div>${w.hasMore ? '<div style="text-align:center;margin-top:22px"><button class="btn" data-action="more-projects">Load more</button></div>' : ''}`;
  } catch (e) {
    if (mySeq !== w.seq) return;
    box.innerHTML = `<div class="empty"><h3>Couldn’t load projects</h3><p>${esc(e.message)}</p><button class="btn primary" data-action="retry-projects">Try again</button></div>`;
  }
}

function projectModal(existing) {
  const e = existing || {};
  openModal({
    title: existing ? 'Edit project' : 'Submit a project',
    html: `<form id="proj-form" novalidate><div class="form-error" id="pf-error" role="alert"></div>
      ${fieldHtml({ id: 'pf-title', label: 'Title', placeholder: 'My awesome site', maxlength: 80, value: e.title || '' })}
      ${fieldHtml({ id: 'pf-desc', label: 'Description', textarea: true, placeholder: 'What is it and what did you build it with?', maxlength: 500, value: e.description || '', hint: '10–500 characters.' })}
      ${fieldHtml({ id: 'pf-url', label: 'Website URL', type: 'url', placeholder: 'https://example.com', maxlength: 300, value: e.url || '' })}
      ${fieldHtml({ id: 'pf-prev', label: 'Preview image URL (optional)', type: 'url', placeholder: 'https://example.com/preview.png', maxlength: 300, value: e.preview_url || '', required: false, hint: 'A direct link to a screenshot. If it can’t load, a placeholder is shown.' })}
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${existing ? 'Save changes' : 'Submit project'}</button></div></form>`,
    onOpen: (d, close) => {
      $('#pf-title', d).focus();
      $('#proj-form', d).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget, btn = $('button[type=submit]', form);
        clearErrs(form); $('#pf-error', d).textContent = '';
        const body = { title: $('#pf-title', d).value.trim(), description: $('#pf-desc', d).value.trim(), url: $('#pf-url', d).value.trim(), preview_url: $('#pf-prev', d).value.trim() };
        const errs = {
          'pf-title': body.title.length < 2 || body.title.length > 80 ? 'Title must be 2–80 characters.' : '',
          'pf-desc': body.description.length < 10 || body.description.length > 500 ? 'Description must be 10–500 characters.' : '',
          'pf-url': V.url(body.url, true), 'pf-prev': V.url(body.preview_url, false),
        };
        let bad = false; for (const [id, m] of Object.entries(errs)) if (m) { setErr(id, m); bad = true; }
        if (bad) return;
        busy(btn, true, existing ? 'Saving…' : 'Submitting…');
        try {
          await api(existing ? `/projects/${existing.id}` : '/projects', { method: existing ? 'PATCH' : 'POST', body });
          close(); toast(existing ? 'Project updated.' : 'Project submitted!', 'success');
          if (parseHash()[0] === 'web') loadProjects(true); else route();
        } catch (err) {
          busy(btn, false);
          if (!applyServerErrors({ title: 'pf-title', description: 'pf-desc', url: 'pf-url', preview_url: 'pf-prev' }, err)) $('#pf-error', d).textContent = err.message;
        }
      });
    },
  });
}
async function deleteProject(id) {
  const p = S.proj.get(id);
  if (!(await confirmDialog(`Delete “${p?.title || 'this project'}”? This can’t be undone.`))) return;
  try {
    await api(`/projects/${id}`, { method: 'DELETE' });
    toast('Project deleted.', 'success'); S.proj.delete(id);
    S.web.items = S.web.items.filter((x) => x.id !== id);
    route();
  } catch (e) { toast(e.message, 'error'); }
}

/* ======================================================================
   Profile
   ====================================================================== */
async function renderProfile(username, isSelf, token) {
  setMain('<div class="page"><div class="loading-row"><span class="spinner"></span>Loading profile…</div></div>');
  let u, projects = [];
  try {
    const r = await api('/users/' + encodeURIComponent(username));
    u = r.user;
    const pr = await api(`/projects?user=${encodeURIComponent(u.username)}&limit=50`);
    projects = pr.projects;
  } catch (e) {
    if (token !== S.token) return;
    setMain(`<div class="page"><div class="empty"><h3>${e.status === 404 ? 'Developer not found' : 'Couldn’t load profile'}</h3><p>${esc(e.message)}</p><a class="btn primary" href="#/web">Back to Web</a></div></div>`);
    return;
  }
  if (token !== S.token) return;
  isSelf = u.id === S.user.id;
  if (isSelf) u = { ...u, ...S.user, project_count: projects.length };
  let site = ''; if (u.website) { try { site = new URL(u.website).host; } catch { site = u.website; } }
  setMain(`<div class="page">
    <div class="card" style="border-radius:20px;overflow:hidden"><div class="profile-banner"></div>
      <div class="profile-card"><div class="profile-top">${avatar(u, 96)}
        <div class="profile-id"><h1>${esc(u.display_name)}</h1><div class="handle">@${esc(u.username)} ${S.online.has(u.id) || isSelf && S.wsOpen ? '<span class="status on" style="margin-left:6px">Online</span>' : ''}</div></div>
        ${isSelf ? `<button class="btn" data-action="edit-profile">${icon('edit', 16)} Edit profile</button>` : `<button class="btn primary" data-action="message-user" data-username="${esc(u.username)}">${icon('chat', 16)} Message</button>`}
      </div>
      ${u.bio ? `<p class="profile-bio">${esc(u.bio)}</p>` : `<p class="profile-bio" style="color:var(--muted)">${isSelf ? 'You haven’t written a bio yet.' : 'No bio yet.'}</p>`}
      <div class="profile-meta">${u.website ? `<a href="${esc(u.website)}" target="_blank" rel="noopener noreferrer nofollow">${icon('link', 15)} ${esc(site)}</a>` : ''}<span>${icon('calendar', 15)} Joined ${esc(fmtJoined(u.created_at))}</span></div></div></div>
    <h2 class="section-title">Website projects <span class="pill">${projects.length}</span>${isSelf ? `<button class="btn sm primary" style="margin-left:auto" data-action="new-project">${icon('plus', 15)} Submit</button>` : ''}</h2>
    ${projects.length ? `<div class="grid">${projects.map(projectCard).join('')}</div>` : `<div class="empty"><div class="em-ico">${icon('globe', 24)}</div><h3>No projects yet</h3><p>${isSelf ? 'Share a website you built with the community.' : `${esc(u.display_name)} hasn’t shared any projects.`}</p></div>`}
  </div>`);
  S.profileView = { user: u };
}
function editProfileModal() {
  const u = S.user;
  openModal({
    title: 'Edit profile',
    html: `<form id="ep-form" novalidate><div class="form-error" id="ep-error" role="alert"></div>
      ${fieldHtml({ id: 'ep-display', label: 'Display name', value: u.display_name, maxlength: 40 })}
      ${fieldHtml({ id: 'ep-bio', label: 'Bio', textarea: true, value: u.bio || '', maxlength: 280, required: false, hint: 'Up to 280 characters.' })}
      ${fieldHtml({ id: 'ep-web', label: 'Website or portfolio', type: 'url', value: u.website || '', placeholder: 'https://', maxlength: 200, required: false })}
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>`,
    onOpen: (d, close) => $('#ep-form', d).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget, btn = $('button[type=submit]', form);
      clearErrs(form); $('#ep-error', d).textContent = '';
      const body = { display_name: $('#ep-display', d).value.trim(), bio: $('#ep-bio', d).value.trim(), website: $('#ep-web', d).value.trim() };
      const errs = { 'ep-display': V.display(body.display_name), 'ep-bio': body.bio.length > 280 ? 'Bio must be 280 characters or fewer.' : '', 'ep-web': V.url(body.website, false) };
      let bad = false; for (const [id, m] of Object.entries(errs)) if (m) { setErr(id, m); bad = true; }
      if (bad) return;
      busy(btn, true, 'Saving…');
      try {
        const r = await api('/me', { method: 'PATCH', body });
        S.user = r.user; renderMeCard(); close(); toast('Profile updated.', 'success'); route();
      } catch (err) {
        busy(btn, false);
        if (!applyServerErrors({ display_name: 'ep-display', bio: 'ep-bio', website: 'ep-web' }, err)) $('#ep-error', d).textContent = err.message;
      }
    }),
  });
}

/* ======================================================================
   Settings
   ====================================================================== */
function renderSettings() {
  const u = S.user;
  const m = setMain(`<div class="page"><div class="page-head"><div><h1>Settings</h1><p>Manage your account and how you appear on Webcord.</p></div></div>
  <div class="settings-grid">
    <section class="card settings-card"><h2>Avatar</h2><p>PNG, JPEG, GIF or WebP up to 5 MB.</p>
      <div class="avatar-row"><span id="set-avatar">${avatar(u, 84)}</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><label class="btn" for="avatar-input">${icon('upload', 16)} Upload new</label><input type="file" id="avatar-input" class="sr-only" accept="image/png,image/jpeg,image/gif,image/webp">
        <button class="btn danger" id="avatar-remove" ${u.avatar_url ? '' : 'hidden'}>Remove</button></div></div>
      <p class="err" id="avatar-err" style="margin-top:10px"></p></section>

    <section class="card settings-card"><h2>Profile</h2><p>This is what other developers see.</p>
      <form id="set-profile" novalidate><div class="form-error" id="sp-error" role="alert"></div><div id="sp-ok"></div>
        ${fieldHtml({ id: 'sp-username', label: 'Username', value: u.username, maxlength: 20, hint: 'Unique. Changing it changes your profile link.' })}
        ${fieldHtml({ id: 'sp-display', label: 'Display name', value: u.display_name, maxlength: 40 })}
        ${fieldHtml({ id: 'sp-bio', label: 'Bio', textarea: true, value: u.bio || '', maxlength: 280, required: false })}
        ${fieldHtml({ id: 'sp-web', label: 'Website or portfolio', type: 'url', value: u.website || '', placeholder: 'https://', maxlength: 200, required: false })}
        <button class="btn primary" type="submit">Save profile</button></form></section>

    <section class="card settings-card"><h2>Email address</h2><p>Confirm with your current password to change it.</p>
      <form id="set-email" novalidate><div class="form-error" id="se-error" role="alert"></div><div id="se-ok"></div>
        ${fieldHtml({ id: 'se-email', label: 'Email', type: 'email', value: u.email, autocomplete: 'email', maxlength: 254 })}
        ${fieldHtml({ id: 'se-pw', label: 'Current password', type: 'password', autocomplete: 'current-password', pw: true, maxlength: 128 })}
        <button class="btn primary" type="submit">Update email</button></form></section>

    <section class="card settings-card"><h2>Password</h2><p>Changing it signs you out of your other devices.</p>
      <form id="set-pw" novalidate><div class="form-error" id="spw-error" role="alert"></div><div id="spw-ok"></div>
        ${fieldHtml({ id: 'spw-cur', label: 'Current password', type: 'password', autocomplete: 'current-password', pw: true, maxlength: 128 })}
        ${fieldHtml({ id: 'spw-new', label: 'New password', type: 'password', autocomplete: 'new-password', pw: true, maxlength: 128, hint: 'At least 8 characters with a letter and a number.' })}
        ${fieldHtml({ id: 'spw-new2', label: 'Confirm new password', type: 'password', autocomplete: 'new-password', pw: true, maxlength: 128 })}
        <button class="btn primary" type="submit">Change password</button></form></section>

    <section class="card settings-card"><h2>Session</h2><p>Logging out ends this session on the server.</p>
      <button class="btn danger" data-action="logout">${icon('logout', 16)} Log out</button></section>
  </div></div>`);

  const ok = (id, msg) => { $(id).innerHTML = `<div class="form-success">${esc(msg)}</div>`; };

  $('#avatar-input', m).addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const err = $('#avatar-err'); err.textContent = '';
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { err.textContent = 'Choose a PNG, JPEG, GIF or WebP image.'; return; }
    if (f.size > 5 * 1048576) { err.textContent = 'Avatar must be 5 MB or smaller.'; return; }
    try {
      const url = await uploadImage(f);
      const r = await api('/me', { method: 'PATCH', body: { avatar_url: url } });
      S.user = r.user; $('#set-avatar').innerHTML = avatar(S.user, 84); $('#avatar-remove').hidden = false; renderMeCard(); toast('Avatar updated.', 'success');
    } catch (e2) { err.textContent = e2.message; }
  });
  $('#avatar-remove', m).addEventListener('click', async () => {
    try { const r = await api('/me', { method: 'PATCH', body: { avatar_url: null } }); S.user = r.user; $('#set-avatar').innerHTML = avatar(S.user, 84); $('#avatar-remove').hidden = true; renderMeCard(); toast('Avatar removed.', 'success'); }
    catch (e) { $('#avatar-err').textContent = e.message; }
  });

  $('#set-profile', m).addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget, btn = $('button[type=submit]', form);
    clearErrs(form); $('#sp-error').textContent = ''; $('#sp-ok').innerHTML = '';
    const body = { username: $('#sp-username').value.trim(), display_name: $('#sp-display').value.trim(), bio: $('#sp-bio').value.trim(), website: $('#sp-web').value.trim() };
    const errs = { 'sp-username': V.username(body.username), 'sp-display': V.display(body.display_name), 'sp-bio': body.bio.length > 280 ? 'Bio must be 280 characters or fewer.' : '', 'sp-web': V.url(body.website, false) };
    let bad = false; for (const [id, msg] of Object.entries(errs)) if (msg) { setErr(id, msg); bad = true; }
    if (bad) return;
    busy(btn, true, 'Saving…');
    try { const r = await api('/me', { method: 'PATCH', body }); S.user = r.user; renderMeCard(); ok('#sp-ok', 'Profile saved.'); }
    catch (err) { if (!applyServerErrors({ username: 'sp-username', display_name: 'sp-display', bio: 'sp-bio', website: 'sp-web' }, err)) $('#sp-error').textContent = err.message; }
    finally { busy(btn, false); }
  });

  $('#set-email', m).addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget, btn = $('button[type=submit]', form);
    clearErrs(form); $('#se-error').textContent = ''; $('#se-ok').innerHTML = '';
    const email = $('#se-email').value.trim(), password = $('#se-pw').value;
    const errs = { 'se-email': V.email(email), 'se-pw': password ? '' : 'Enter your current password.' };
    let bad = false; for (const [id, msg] of Object.entries(errs)) if (msg) { setErr(id, msg); bad = true; }
    if (bad) return;
    busy(btn, true, 'Updating…');
    try { const r = await api('/me/email', { method: 'POST', body: { email, password } }); S.user = r.user; $('#se-pw').value = ''; ok('#se-ok', 'Email updated.'); }
    catch (err) { if (!applyServerErrors({ email: 'se-email', password: 'se-pw' }, err)) $('#se-error').textContent = err.message; }
    finally { busy(btn, false); }
  });

  $('#set-pw', m).addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget, btn = $('button[type=submit]', form);
    clearErrs(form); $('#spw-error').textContent = ''; $('#spw-ok').innerHTML = '';
    const cur = $('#spw-cur').value, nw = $('#spw-new').value, nw2 = $('#spw-new2').value;
    const errs = { 'spw-cur': cur ? '' : 'Enter your current password.', 'spw-new': V.password(nw), 'spw-new2': nw === nw2 ? '' : 'Passwords do not match.' };
    let bad = false; for (const [id, msg] of Object.entries(errs)) if (msg) { setErr(id, msg); bad = true; }
    if (bad) return;
    busy(btn, true, 'Changing…');
    try { await api('/me/password', { method: 'POST', body: { current_password: cur, new_password: nw } }); form.reset(); ok('#spw-ok', 'Password changed. Other devices have been signed out.'); }
    catch (err) { if (!applyServerErrors({ current_password: 'spw-cur', new_password: 'spw-new' }, err)) $('#spw-error').textContent = err.message; }
    finally { busy(btn, false); }
  });
}

/* ======================================================================
   Global event delegation
   ====================================================================== */
document.addEventListener('click', async (e) => {
  const pw = e.target.closest('[data-toggle-pw]');
  if (pw) {
    const input = $('input', pw.parentElement); const show = input.type === 'password';
    input.type = show ? 'text' : 'password'; pw.innerHTML = icon(show ? 'eyeoff' : 'eye', 18);
    pw.setAttribute('aria-pressed', String(show)); pw.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    return;
  }
  const modeBtn = e.target.closest('[data-mode]');
  if (modeBtn && $('#auth-area')) { mountAuthForm(modeBtn.dataset.mode); return; }
  const sc = e.target.closest('[data-scroll]');
  if (sc) { document.getElementById(sc.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const t = e.target.closest('[data-action]'); if (!t) return;
  const a = t.dataset.action;
  switch (a) {
    case 'copy': {
      const code = t.closest('.code')?.querySelector('code')?.textContent || '';
      const ok = await copyText(code);
      const label = $('span', t); const prev = 'Copy';
      t.classList.toggle('done', ok); label.textContent = ok ? 'Copied!' : 'Press Ctrl+C';
      setTimeout(() => { t.classList.remove('done'); label.textContent = prev; }, 1600); break;
    }
    case 'logout': logout(); break;
    case 'toggle-nav': $('#shell').classList.toggle('nav-open'); break;
    case 'close-nav': $('#shell').classList.remove('nav-open'); break;
    case 'toggle-rooms': $('#chat')?.classList.toggle('rooms-open'); break;
    case 'load-older': loadOlder(t); break;
    case 'insert-code': insertCodeBlock(); break;
    case 'remove-pending': S.pending = null; renderPending(); break;
    case 'new-dm': openNewDm(); break;
    case 'retry-chat': S.roomsLoaded = false; route(); break;
    case 'retry-room': { const r = S.room; S.room = null; if (r) openRoom(r, S.token); break; }
    case 'new-project': projectModal(null); break;
    case 'edit-project': projectModal(S.proj.get(t.dataset.id)); break;
    case 'delete-project': deleteProject(t.dataset.id); break;
    case 'more-projects': busy(t, true); await loadProjects(false); break;
    case 'retry-projects': loadProjects(true); break;
    case 'edit-profile': editProfileModal(); break;
    case 'message-user': startDm(t.dataset.username); break;
    default: break;
  }
});
// Gracefully handle missing / blocked preview images by removing the broken <img> (a placeholder sits underneath).
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.hasAttribute('data-fb')) {
    if (t.classList.contains('att-img')) { const link = t.closest('a'); if (link) link.outerHTML = '<span class="muted-p">Image unavailable</span>'; } else t.remove();
  }
}, true);

/* ======================================================================
   Boot: restore the session from the server (never trust localStorage)
   ====================================================================== */
(async function boot() {
  try {
    const r = await api('/me', { quiet: true });
    S.user = r.user;
    startSync();
  } catch (e) {
    S.user = null;
    if (e.status === 401) setToken('');
    if (e.status === 0) toast(e.message, 'error');
  }
  S.booted = true;
  route();
})();
