/* Webcord Events — code competitions. Admins create an event, everyone submits ONE entry (a snapshot of code files taken from a codespace or
   uploaded), browses the other entries and rates them 1–5 stars; an admin crowns the winner, who gets the WINNER role.
   Loaded after app.js and uses its helpers ($, esc, icon, api, openModal, toast, setMain, S, nameHtml, avatar, codeBlock …).
   Routes: #/events (all events) · #/events/<id> (one event). The backend is the /api/events/* block at the end of backend/worker.js. */
'use strict';

Object.assign(ICONS, {
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  crown: '<path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
});

const EVS = { sort: 'top', open: null };
const EV_LIMIT_CHARS = 300000, EV_LIMIT_FILES = 40;
const STATUS = {
  open: { label: 'Live', cls: 'live' },
  judging: { label: 'Judging', cls: 'judging' },
  finished: { label: 'Finished', cls: 'done' },
};
const evPill = (st) => `<span class="ev-pill ${STATUS[st].cls}"><i></i>${STATUS[st].label}</span>`;
function evLeft(e) {
  if (e.status === 'finished') return 'Finished';
  if (e.status === 'judging') return e.ends_at && e.ends_at < Date.now() ? 'Submissions closed' : 'Judging';
  if (!e.ends_at) return 'Open until an admin closes it';
  const ms = e.ends_at - Date.now();
  if (ms <= 0) return 'Closing…';
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d >= 1 ? `${d}d ${h}h left` : h >= 1 ? `${h}h ${m % 60}m left` : `${Math.max(1, m)}m left`;
}
const evDate = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const stars = (v, size = 14) => `<span class="ev-stars" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<span class="${v >= i - 0.25 ? 'on' : v >= i - 0.75 ? 'half' : ''}">${icon('star', size)}</span>`).join('')}</span>`;
const scoreTxt = (v) => (v == null ? '–' : v.toFixed(1));

/* ======================================================================
   Router entry
   ====================================================================== */
async function renderEvents(id, token) {
  const main = $('#main'); if (main) main.className = 'main';
  setMain('<div class="page ev-page"><div class="loading-row"><span class="spinner"></span>Loading events…</div></div>');
  document.title = 'Events — Webcord';
  try {
    if (!id) {
      const r = await api('/events');
      if (token !== S.token) return;
      return drawEventList(r.events);
    }
    const r = await api(`/events/${encodeURIComponent(id)}?sort=${EVS.sort}`);
    if (token !== S.token) return;
    EVS.open = r;
    drawEvent(r);
    const sid = parseHash()[2];
    if (sid) openEntry(r.event.id, sid);
  } catch (e) {
    if (token !== S.token) return;
    setMain(`<div class="page"><div class="empty"><div class="em-ico">${icon('trophy', 24)}</div><h3>${e.status === 404 ? 'Event not found' : 'Couldn’t load events'}</h3><p>${esc(e.message)}</p><a class="btn primary" href="#/events">Back to events</a></div></div>`);
  }
}

/* ======================================================================
   All events
   ====================================================================== */
function evCard(e) {
  const [a, b] = gradFor(e.title);
  return `<a class="ev-card" href="#/events/${encodeURIComponent(e.id)}" style="--a:${a};--b:${b}">
    <div class="ev-card-top"><span class="ev-card-ico">${icon('trophy', 22)}</span>${evPill(e.status)}</div>
    <h3>${esc(e.title)}</h3>
    <p>${e.description ? esc(e.description) : '<span class="muted-p">No description</span>'}</p>
    <div class="ev-card-meta"><span>${icon('file', 13)} ${e.submissions} entr${e.submissions === 1 ? 'y' : 'ies'}</span><span>${icon('clock', 13)} ${esc(evLeft(e))}</span>${e.prize ? `<span class="prize">${icon('crown', 13)} ${esc(e.prize)}</span>` : ''}</div>
    ${e.winner ? `<div class="ev-card-win">${icon('crown', 14)}<span>Won by</span><b>${nameHtml(e.winner.user, { tag: false })}</b></div>` : ''}
  </a>`;
}
function drawEventList(events) {
  const live = events.filter((e) => e.status !== 'finished'), done = events.filter((e) => e.status === 'finished');
  const featured = live[0];
  setMain(`<div class="page ev-page">
    <div class="page-head"><div><h1>Events</h1><p>Code competitions. Submit your best work, rate other people’s, and win the <b class="ev-winword">WINNER</b> role.</p></div>
      ${isAdmin() ? `<button class="btn primary" data-ev="new">${icon('plus', 17)} New event</button>` : ''}</div>
    ${featured ? `<a class="ev-feature" href="#/events/${encodeURIComponent(featured.id)}"><div class="ev-feature-in">
        <div class="ev-feature-l">${evPill(featured.status)}<h2>${esc(featured.title)}</h2><p>${esc(featured.description || 'Show the community what you can build.')}</p>
          <div class="ev-chips"><span>${icon('file', 14)} ${featured.submissions} entr${featured.submissions === 1 ? 'y' : 'ies'}</span><span>${icon('clock', 14)} ${esc(evLeft(featured))}</span>${featured.prize ? `<span class="gold">${icon('crown', 14)} ${esc(featured.prize)}</span>` : ''}</div>
          <span class="btn lg ev-cta">${icon('flag', 17)} Enter the arena</span></div>
        <div class="ev-feature-r" aria-hidden="true">${icon('trophy', 120)}</div></div></a>` : ''}
    ${live.length > 1 ? `<h2 class="section-title">More events <span class="pill">${live.length - 1}</span></h2><div class="ev-grid-cards">${live.slice(1).map(evCard).join('')}</div>` : ''}
    ${done.length ? `<h2 class="section-title">Hall of fame <span class="pill">${done.length}</span></h2><div class="ev-grid-cards">${done.map(evCard).join('')}</div>` : ''}
    ${!events.length ? `<div class="empty"><div class="em-ico">${icon('trophy', 24)}</div><h3>No events yet</h3><p>${isAdmin() ? 'Create the first competition and the community can start submitting.' : 'An admin hasn’t started a competition yet. Check back soon!'}</p>${isAdmin() ? `<button class="btn primary" data-ev="new">${icon('plus', 16)} New event</button>` : ''}</div>` : ''}
  </div>`);
}

/* ======================================================================
   One event
   ====================================================================== */
function entryCard(s, e, i, sorted) {
  const [a, b] = gradFor(s.title + s.id);
  const mineEntry = S.user && s.author.id === S.user.id;
  const isWin = e.winner && e.winner.sub_id === s.id;
  const rank = sorted === 'top' && s.score != null && i < 3 && !isWin ? ['', '1', '2', '3'][i + 1] : '';
  const names = s.file_names.slice(0, 4);
  return `<article class="ev-entry${isWin ? ' winner' : ''}" data-sid="${esc(s.id)}">
    <button class="ev-entry-main" data-ev="view" data-sid="${esc(s.id)}" aria-label="View ${esc(s.title)}">
      <div class="ev-thumb" style="--a:${a};--b:${b}">
        ${isWin ? `<span class="ev-medal crown">${icon('crown', 13)} Winner</span>` : rank ? `<span class="ev-medal m${rank}">#${rank}</span>` : ''}
        ${mineEntry ? '<span class="ev-mine">Your entry</span>' : ''}
        <div class="cs-win"><div class="cs-win-bar"><i></i><i></i><i></i></div>${names.map((n) => { const k = fileKind(n); return `<div class="cs-win-row"><span class="cs-ext tone-${k.tone}">${esc(k.badge)}</span><span>${esc(n)}</span></div>`; }).join('')}
          ${s.file_count > names.length ? `<div class="cs-win-row more">+ ${s.file_count - names.length} more</div>` : ''}</div></div>
      <div class="ev-entry-body"><h3>${esc(s.title)}</h3><p>${s.description ? esc(s.description) : '<span class="muted-p">No description</span>'}</p></div>
    </button>
    <div class="ev-entry-foot">
      <a class="creator" href="#/u/${encodeURIComponent(s.author.username)}">${avatar(s.author, 24)}<span>${nameHtml(s.author, { tag: false })}</span></a>
      <div class="ev-score" title="Score (admin votes count double)">${stars(s.score || 0, 13)}<b>${scoreTxt(s.score)}</b><small>${s.community.count + s.admin.count}</small></div>
    </div></article>`;
}
function drawEvent(r) {
  const { event: e, submissions: subs, mine } = r;
  const [a, b] = gradFor(e.title);
  const admin = isAdmin();
  const canSubmit = e.status === 'open';
  const winnerSub = e.winner && subs.find((s) => s.id === e.winner.sub_id);
  document.title = `${e.title} — Events — Webcord`;
  setMain(`<div class="page ev-page">
    <a class="ev-back" href="#/events">${icon('arrowleft', 15)} All events</a>
    <section class="ev-hero" style="--a:${a};--b:${b}"><div class="ev-hero-art" aria-hidden="true">${icon('trophy', 190)}</div>
      <div class="ev-hero-in">
        <div class="ev-hero-top">${evPill(e.status)}<span class="ev-left">${icon('clock', 14)} ${esc(evLeft(e))}</span></div>
        <h1>${esc(e.title)}</h1>
        ${e.description ? `<p class="ev-desc">${esc(e.description)}</p>` : ''}
        <div class="ev-chips"><span>${icon('file', 14)} ${subs.length} entr${subs.length === 1 ? 'y' : 'ies'}</span>${e.ends_at ? `<span>${icon('flag', 14)} ${e.status === 'open' ? 'Closes' : 'Closed'} ${esc(evDate(e.ends_at))}</span>` : ''}${e.prize ? `<span class="gold">${icon('crown', 14)} ${esc(e.prize)}</span>` : ''}</div>
        <div class="ev-hero-actions">
          ${canSubmit ? `<button class="btn lg ev-cta" data-ev="submit">${icon(mine ? 'edit' : 'upload', 17)} ${mine ? 'Edit my entry' : 'Submit your work'}</button>` : ''}
          ${admin ? `<button class="btn ev-ghost" data-ev="edit">${icon('edit', 15)} Edit</button>
            ${e.status === 'open' ? `<button class="btn ev-ghost" data-ev="close">${icon('lock', 15)} Close submissions</button>` : e.status === 'judging' ? `<button class="btn ev-ghost" data-ev="reopen">${icon('refresh', 15)} Reopen</button>` : ''}
            <button class="btn ev-ghost danger" data-ev="delete">${icon('trash', 15)} Delete</button>` : ''}
        </div>
      </div></section>
    ${e.rules ? `<details class="ev-rules"><summary>${icon('flag', 15)} Rules &amp; judging</summary><div>${renderMessage(e.rules)}<p class="ev-note">Everyone can rate 1–5 stars (not their own entry). Admin ratings count double. An admin picks the winner, who gets the <b class="ev-winword">WINNER</b> role.</p></div></details>` : `<details class="ev-rules"><summary>${icon('flag', 15)} How judging works</summary><div><p class="ev-note">Everyone can rate 1–5 stars (not their own entry). Admin ratings count double. An admin picks the winner, who gets the <b class="ev-winword">WINNER</b> role.</p></div></details>`}
    ${e.winner ? `<section class="ev-winner"><div class="ev-winner-in"><span class="ev-crown">${icon('crown', 30)}</span>
        <div><small>Winner</small><h2>${esc(e.winner.title)}</h2><div class="by">${avatar(e.winner.user, 26)}<b>${nameHtml(e.winner.user, { tag: false })}</b></div></div>
        ${winnerSub ? `<button class="btn primary" data-ev="view" data-sid="${esc(winnerSub.id)}">View winning entry</button>` : ''}</div></section>` : ''}
    <div class="ev-bar"><h2>Entries <span class="pill">${subs.length}</span></h2>
      <div class="chips" role="group" aria-label="Sort entries">${[['top', 'Top rated'], ['admin', 'Admin picks'], ['new', 'Newest']].map(([k, l]) => `<button type="button" class="chip" data-ev="sort" data-sort="${k}" aria-pressed="${EVS.sort === k}">${l}</button>`).join('')}</div></div>
    ${subs.length ? `<div class="ev-grid">${subs.map((s, i) => entryCard(s, e, i, EVS.sort)).join('')}</div>`
      : `<div class="empty"><div class="em-ico">${icon('trophy', 24)}</div><h3>No entries yet</h3><p>${canSubmit ? 'Be the first to put your work on the board.' : 'Nobody submitted anything.'}</p>${canSubmit ? `<button class="btn primary" data-ev="submit">${icon('upload', 16)} Submit your work</button>` : ''}</div>`}
  </div>`);
}
const reloadEvent = async () => { if (EVS.open) { const r = await api(`/events/${encodeURIComponent(EVS.open.event.id)}?sort=${EVS.sort}`); EVS.open = r; if (parseHash()[0] === 'events' && parseHash()[1] === r.event.id) drawEvent(r); } };

/* ======================================================================
   Entry viewer (code + rating)
   ====================================================================== */
async function openEntry(eid, sid) {
  openModal({
    title: 'Entry', wide: true,
    html: '<div id="ev-view"><div class="loading-row"><span class="spinner"></span>Loading entry…</div></div>',
    onOpen: async (d, close) => {
      d.classList.add('ev-modal');
      const box = $('#ev-view', d);
      let data;
      try { data = await api(`/events/${encodeURIComponent(eid)}/subs/${encodeURIComponent(sid)}`); } catch (e) { box.innerHTML = `<div class="empty"><h3>Couldn’t load this entry</h3><p>${esc(e.message)}</p></div>`; return; }
      let cur = data.submission.files[0] ? data.submission.files[0].path : '';
      const paint = () => {
        const s = data.submission, e = data.event, f = s.files.find((x) => x.path === cur);
        const isMine = S.user && s.author.id === S.user.id, admin = isAdmin(), closed = e.status === 'finished';
        const isWin = e.winner && e.winner.sub_id === s.id;
        $('#modal-title', d).textContent = s.title;
        box.innerHTML = `<div class="ev-view">
          <div class="ev-code"><div class="ev-files" role="tablist">${s.files.map((x) => { const k = fileKind(x.path.split('/').pop()); return `<button type="button" role="tab" class="ev-ftab${x.path === cur ? ' active' : ''}" data-f="${esc(x.path)}" aria-selected="${x.path === cur}"><span class="cs-ext tone-${k.tone}">${esc(k.badge)}</span>${esc(x.path)}</button>`; }).join('')}</div>
            ${f ? codeBlock(f.content, fileExt(f.path), { numbered: true }) : '<div class="empty"><p>No files.</p></div>'}</div>
          <aside class="ev-side">
            <div class="ev-author"><a class="creator" href="#/u/${encodeURIComponent(s.author.username)}" data-close>${avatar(s.author, 36)}<span><b>${nameHtml(s.author)}</b><small>@${esc(s.author.username)}</small></span></a>${isWin ? `<span class="ev-medal crown static">${icon('crown', 13)} Winner</span>` : ''}</div>
            ${s.description ? `<p class="ev-sdesc">${esc(s.description)}</p>` : ''}
            <div class="ev-rate" id="ev-rate">${ratePanel(s, e, isMine, closed)}</div>
            <div class="ev-side-acts">
              <button class="btn" data-a="fork">${icon('fork', 15)} Open a copy to run &amp; tinker</button>
              ${isMine && e.status === 'open' ? `<button class="btn" data-a="edit">${icon('edit', 15)} Edit my entry</button><button class="btn danger" data-a="del">${icon('trash', 15)} Withdraw</button>` : ''}
              ${admin ? (isWin ? `<button class="btn" data-a="unwin">${icon('x', 15)} Remove winner</button>` : `<button class="btn primary" data-a="win">${icon('crown', 15)} Crown as winner</button>`) : ''}
              ${admin && !isMine ? `<button class="btn danger" data-a="del">${icon('trash', 15)} Remove entry</button>` : ''}
            </div>
            <p class="ev-fine">${s.file_count} file${s.file_count === 1 ? '' : 's'} · ${(s.chars / 1000).toFixed(1)}k characters · submitted ${esc(evDate(s.created_at))}</p>
          </aside></div>`;
      };
      paint();
      d.addEventListener('click', async (ev) => {
        const t = ev.target.closest('[data-f],[data-a],[data-star],[data-clear]'); if (!t) return;
        const s = data.submission, e = data.event;
        if (t.dataset.f) { cur = t.dataset.f; paint(); return; }
        if (t.dataset.star !== undefined || t.dataset.clear !== undefined) {
          const v = t.dataset.clear !== undefined ? 0 : (+t.dataset.star === s.mine ? 0 : +t.dataset.star);
          try {
            const r = await api(`/events/${encodeURIComponent(eid)}/subs/${encodeURIComponent(s.id)}/rating`, { method: 'PUT', body: { stars: v } });
            Object.assign(s, { mine: r.rating.mine, community: r.rating.community, admin: r.rating.admin, score: r.rating.score });
            $('#ev-rate', d).innerHTML = ratePanel(s, e, false, false); toast(v ? `Rated ${v} star${v === 1 ? '' : 's'}.` : 'Rating removed.', 'success');
            reloadEvent();
          } catch (err) { toast(err.message, 'error'); }
          return;
        }
        const act = t.dataset.a;
        if (act === 'fork') {
          busy(t, true, 'Copying…');
          try { const r = await api(`/events/${encodeURIComponent(eid)}/subs/${encodeURIComponent(s.id)}/fork`, { method: 'POST', body: {} }); close(); toast('Copied to your codespaces.', 'success'); go('#/codespace/' + encodeURIComponent(r.codespace.id)); }
          catch (err) { busy(t, false); toast(err.message, 'error'); }
        } else if (act === 'edit') { close(); submitModal(data.submission); }
        else if (act === 'del') {
          if (!(await confirmDialog(`Remove “${s.title}” from this event? This can’t be undone.`, 'Remove'))) return;
          try { await api(`/events/${encodeURIComponent(eid)}/subs/${encodeURIComponent(s.id)}`, { method: 'DELETE' }); close(); toast('Entry removed.', 'success'); reloadEvent(); } catch (err) { toast(err.message, 'error'); }
        } else if (act === 'win') {
          if (!(await confirmDialog(`Crown “${s.title}” by ${s.author.display_name} as the winner? They get the WINNER role and voting closes.`, 'Crown winner'))) return;
          try { await api(`/events/${encodeURIComponent(eid)}/winner`, { method: 'POST', body: { sub_id: s.id } }); close(); toast('Winner crowned! 🏆', 'success'); reloadEvent(); } catch (err) { toast(err.message, 'error'); }
        } else if (act === 'unwin') {
          try { await api(`/events/${encodeURIComponent(eid)}/winner`, { method: 'DELETE' }); close(); toast('Winner removed — the event is back in judging.', 'success'); reloadEvent(); } catch (err) { toast(err.message, 'error'); }
        }
      });
      d.addEventListener('mouseover', (ev) => { const b = ev.target.closest('.ev-star'); if (!b) return; const n = +b.dataset.star; $$('.ev-star', d).forEach((x) => x.classList.toggle('hot', +x.dataset.star <= n)); });
      d.addEventListener('mouseout', (ev) => { if (ev.target.closest('.ev-star')) $$('.ev-star', d).forEach((x) => x.classList.remove('hot')); });
    },
  });
}
function ratePanel(s, e, isMine, closed) {
  const can = !isMine && !closed;
  const me = s.mine || 0;
  return `<div class="ev-score-big"><div class="num">${scoreTxt(s.score)}</div><div>${stars(s.score || 0, 17)}<small>Overall score · admin votes count double</small></div></div>
    <div class="ev-split"><div><b>${scoreTxt(s.community.avg)}</b><span>Community · ${s.community.count}</span></div><div class="adm"><b>${scoreTxt(s.admin.avg)}</b><span>Admins · ${s.admin.count}</span></div></div>
    ${can ? `<div class="ev-yours"><span>${me ? 'Your rating' : 'Rate this entry'}</span><div class="ev-pick" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="ev-star${me >= i ? ' on' : ''}" data-star="${i}" aria-label="${i} star${i === 1 ? '' : 's'}" aria-pressed="${me === i}">${icon('star', 26)}</button>`).join('')}</div>${me ? '<button type="button" class="ev-clear" data-clear>Remove my rating</button>' : ''}</div>`
      : `<p class="ev-note">${isMine ? 'You can’t rate your own entry.' : 'Voting is closed — a winner has been chosen.'}</p>`}`;
}

/* ======================================================================
   Submit / edit an entry
   ====================================================================== */
function submitModal(existing) {
  const ev = EVS.open && EVS.open.event; if (!ev) return;
  const files = new Map((existing ? existing.files : []).map((f) => [f.path, f.content]));
  let csList = null;
  const total = () => [...files.values()].reduce((n, c) => n + c.length, 0);
  openModal({
    title: existing ? 'Edit your entry' : 'Submit your work', wide: true,
    html: `<form id="ev-form" novalidate><div class="form-error" id="evf-error" role="alert"></div>
      ${fieldHtml({ id: 'evf-title', label: 'Title', placeholder: 'My awesome project', maxlength: 80, value: existing ? existing.title : '' })}
      ${fieldHtml({ id: 'evf-desc', label: 'Description (optional)', textarea: true, rows: 3, required: false, placeholder: 'What did you build and how? What should the judges look at?', maxlength: 1000, value: existing ? existing.description : '' })}
      <div class="field"><label>Your code</label>
        <div class="ev-src"><button type="button" class="ev-src-tab active" data-src="cs">${icon('code', 15)} From a codespace</button><button type="button" class="ev-src-tab" data-src="up">${icon('upload', 15)} Upload files</button></div>
        <div class="ev-src-pane" id="evf-cs"><select class="select" id="evf-cs-pick" aria-label="Pick a codespace"><option value="">Loading your codespaces…</option></select><span class="hint">A snapshot is taken now — you can edit this entry (and re-snapshot) until the event closes.</span></div>
        <div class="ev-src-pane" id="evf-up" hidden><label class="btn" for="evf-file">${icon('upload', 16)} Choose code files</label><input type="file" id="evf-file" multiple hidden><span class="hint">Text and code files only (HTML, CSS, JS, Python, …). Up to ${EV_LIMIT_FILES} files, ${(EV_LIMIT_CHARS / 1000).toFixed(0)}k characters in total.</span></div>
        <p class="err" id="evf-files-err" role="alert"></p>
        <div class="ev-flist" id="evf-list"></div></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${existing ? 'Save entry' : 'Submit entry'}</button></div></form>`,
    onOpen: (d, close) => {
      const drawList = () => {
        const list = $('#evf-list', d);
        list.innerHTML = files.size ? `<div class="ev-flist-head"><b>${files.size} file${files.size === 1 ? '' : 's'}</b><span class="${total() > EV_LIMIT_CHARS ? 'bad' : ''}">${(total() / 1000).toFixed(1)}k / ${(EV_LIMIT_CHARS / 1000).toFixed(0)}k</span></div>${[...files].map(([p, c]) => { const k = fileKind(p.split('/').pop()); return `<div class="ev-frow"><span class="cs-ext tone-${k.tone}">${esc(k.badge)}</span><span class="n">${esc(p)}</span><small>${(c.length / 1000).toFixed(1)}k</small><button type="button" class="btn icon sm ghost" data-rm="${esc(p)}" aria-label="Remove ${esc(p)}">${icon('x', 14)}</button></div>`; }).join('')}` : '<p class="muted-p">No files added yet.</p>';
      };
      drawList();
      $$('.ev-src-tab', d).forEach((b) => b.addEventListener('click', () => {
        $$('.ev-src-tab', d).forEach((x) => x.classList.toggle('active', x === b));
        $('#evf-cs', d).hidden = b.dataset.src !== 'cs'; $('#evf-up', d).hidden = b.dataset.src !== 'up';
      }));
      $('#evf-list', d).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { files.delete(b.dataset.rm); drawList(); } });
      (async () => {                                           // the user's codespaces
        const sel = $('#evf-cs-pick', d);
        try {
          csList = (await api('/codespaces?scope=mine&limit=50')).codespaces;
          sel.innerHTML = `<option value="">${csList.length ? 'Choose one of your codespaces…' : 'You have no codespaces yet — upload files instead'}</option>${csList.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} · ${c.file_count} file${c.file_count === 1 ? '' : 's'}</option>`).join('')}`;
        } catch (e) { sel.innerHTML = `<option value="">Couldn’t load codespaces</option>`; }
        sel.addEventListener('change', async () => {
          if (!sel.value) return;
          sel.disabled = true;
          try {
            const r = await api(`/codespaces/${encodeURIComponent(sel.value)}`);
            files.clear();
            for (const f of r.files) if (!f.content.startsWith('webcord-asset:') && !ASSET_EXTS.has(fileExt(f.path))) files.set(f.path, f.content);
            if (!$('#evf-title', d).value.trim()) $('#evf-title', d).value = r.codespace.name;
            $('#evf-files-err', d).textContent = files.size ? '' : 'That codespace has no text or code files.';
            drawList();
          } catch (e) { toast(e.message, 'error'); } finally { sel.disabled = false; }
        });
      })();
      $('#evf-file', d).addEventListener('change', async (e) => {
        const list = [...e.target.files]; e.target.value = '';
        for (const file of list) {
          const name = file.name.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
          if (!TEXT_EXTS.has(fileExt(name)) && !['svg', 'readme', 'license'].includes(fileExt(name))) { toast(`${file.name}: only text and code files can be submitted.`, 'error'); continue; }
          if (file.size > 600000) { toast(`${file.name} is too large.`, 'error'); continue; }
          let p = name, n = 2; while (files.has(p)) { const i = name.lastIndexOf('.'); p = i > 0 ? `${name.slice(0, i)}-${n}${name.slice(i)}` : `${name}-${n++}`; if (n > 99) break; if (i > 0) n++; }
          files.set(p, (await file.text()).replace(/\r\n/g, '\n'));
        }
        $('#evf-files-err', d).textContent = ''; drawList();
      });
      $('#ev-form', d).addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget, btn = $('button[type=submit]', form);
        clearErrs(form); $('#evf-error', d).textContent = ''; $('#evf-files-err', d).textContent = '';
        const body = { title: $('#evf-title', d).value.trim(), description: $('#evf-desc', d).value.trim(), files: [...files].map(([path, content]) => ({ path, content })) };
        let bad = false;
        if (body.title.length < 3 || body.title.length > 80) { setErr('evf-title', 'Title must be 3–80 characters.'); bad = true; }
        if (!body.files.length) { $('#evf-files-err', d).textContent = 'Add at least one code file.'; bad = true; }
        else if (body.files.length > EV_LIMIT_FILES) { $('#evf-files-err', d).textContent = `You can submit up to ${EV_LIMIT_FILES} files.`; bad = true; }
        else if (total() > EV_LIMIT_CHARS) { $('#evf-files-err', d).textContent = 'That’s too much code for one entry.'; bad = true; }
        if (bad) return;
        busy(btn, true, 'Submitting…');
        try {
          await api(`/events/${encodeURIComponent(ev.id)}/submission`, { method: 'PUT', body });
          close(); toast(existing ? 'Entry updated.' : 'Entry submitted — good luck! 🏆', 'success'); reloadEvent();
        } catch (err) {
          busy(btn, false);
          if (err.fields && err.fields.files) $('#evf-files-err', d).textContent = err.fields.files;
          else if (!applyServerErrors({ title: 'evf-title', description: 'evf-desc' }, err)) $('#evf-error', d).textContent = err.message;
        }
      });
    },
  });
}

/* ======================================================================
   Admin: create / edit an event
   ====================================================================== */
const toLocalInput = (ts) => { if (!ts) return ''; const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
function eventModal(existing) {
  const e = existing || {};
  openModal({
    title: existing ? 'Edit event' : 'New event', wide: true,
    html: `<form id="eve-form" novalidate><div class="form-error" id="eve-error" role="alert"></div>
      ${fieldHtml({ id: 'eve-title', label: 'Title', placeholder: 'e.g. Build a game in 48 hours', maxlength: 80, value: e.title || '' })}
      ${fieldHtml({ id: 'eve-desc', label: 'Description', textarea: true, rows: 3, required: false, placeholder: 'The theme and what people should build.', maxlength: 1500, value: e.description || '' })}
      ${fieldHtml({ id: 'eve-rules', label: 'Rules (optional)', textarea: true, rows: 3, required: false, placeholder: 'Languages allowed, team size, judging criteria…', maxlength: 1500, value: e.rules || '' })}
      <div class="ev-two">${fieldHtml({ id: 'eve-prize', label: 'Prize (optional)', placeholder: 'e.g. WINNER role + glory', maxlength: 80, required: false, value: e.prize || '' })}
        <div class="field"><label for="eve-end">Deadline (optional)</label><div class="input-wrap"><input class="input" id="eve-end" type="datetime-local" value="${esc(toLocalInput(e.ends_at))}"></div><span class="hint">Submissions close automatically. Leave empty to close it yourself.</span><p class="err" id="eve-end-err" role="alert"></p></div></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${existing ? 'Save changes' : 'Create event'}</button></div></form>`,
    onOpen: (d, close) => {
      $('#eve-title', d).focus();
      $('#eve-form', d).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget, btn = $('button[type=submit]', form);
        clearErrs(form); $('#eve-error', d).textContent = ''; $('#eve-end-err', d).textContent = '';
        const endRaw = $('#eve-end', d).value;
        const body = { title: $('#eve-title', d).value.trim(), description: $('#eve-desc', d).value.trim(), rules: $('#eve-rules', d).value.trim(), prize: $('#eve-prize', d).value.trim(), ends_at: endRaw ? new Date(endRaw).getTime() : null };
        if (body.title.length < 3) return setErr('eve-title', 'Title must be at least 3 characters.');
        if (body.ends_at && body.ends_at < Date.now() && !existing) return void ($('#eve-end-err', d).textContent = 'The deadline must be in the future.');
        busy(btn, true, 'Saving…');
        try {
          const r = await api(existing ? `/events/${encodeURIComponent(existing.id)}` : '/events', { method: existing ? 'PATCH' : 'POST', body });
          close(); toast(existing ? 'Event updated.' : 'Event created!', 'success');
          if (existing) reloadEvent(); else go('#/events/' + encodeURIComponent(r.event.id));
        } catch (err) {
          busy(btn, false);
          if (!applyServerErrors({ title: 'eve-title', description: 'eve-desc', rules: 'eve-rules', prize: 'eve-prize', ends_at: 'eve-end' }, err)) $('#eve-error', d).textContent = err.message;
        }
      });
    },
  });
}

/* ======================================================================
   Clicks
   ====================================================================== */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-ev]'); if (!t) return;
  const a = t.dataset.ev, ev = EVS.open && EVS.open.event;
  switch (a) {
    case 'new': eventModal(null); break;
    case 'edit': if (ev) eventModal(ev); break;
    case 'submit': if (ev) submitModal(EVS.open.mine ? await api(`/events/${encodeURIComponent(ev.id)}/subs/${encodeURIComponent(EVS.open.mine)}`).then((r) => r.submission).catch(() => null) : null); break;
    case 'view': if (ev) openEntry(ev.id, t.dataset.sid); break;
    case 'sort': EVS.sort = t.dataset.sort; reloadEvent().catch((err) => toast(err.message, 'error')); break;
    case 'close': if (ev && await confirmDialog('Stop accepting submissions? People can still rate until you crown a winner.', 'Close submissions')) { try { await api(`/events/${encodeURIComponent(ev.id)}`, { method: 'PATCH', body: { status: 'judging' } }); toast('Submissions closed.', 'success'); reloadEvent(); } catch (err) { toast(err.message, 'error'); } } break;
    case 'reopen': if (ev) { try { await api(`/events/${encodeURIComponent(ev.id)}`, { method: 'PATCH', body: { status: 'open' } }); toast('Event reopened.', 'success'); reloadEvent(); } catch (err) { toast(err.message, 'error'); } } break;
    case 'delete': if (ev && await confirmDialog(`Delete “${ev.title}” with all its entries and ratings? This can’t be undone.`)) { try { await api(`/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' }); toast('Event deleted.', 'success'); go('#/events'); } catch (err) { toast(err.message, 'error'); } } break;
    default: break;
  }
});
