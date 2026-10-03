import { firebaseConfig } from './firebase-config.js';

(async () => {
  'use strict';

  const STAGES = [
    { id: 'todo',     label: 'To Do',          color: '#C5BEB2' },
    { id: 'assigned', label: 'Assigned',       color: '#7A7F69' },
    { id: 'started',  label: 'Started',        color: '#C4917A' },
    { id: 'part',     label: 'Part Completed', color: '#A9A58B' },
    { id: 'done',     label: 'Completed',      color: '#2F312B' },
  ];
  const NEXT = { assigned: ['started', 'Start'], started: ['done', 'Complete'], part: ['done', 'Complete'] };
  const DEFAULT_PEOPLE = ['Steve', 'Harry', 'Em', 'Gail', 'Tradesperson'];
  const DEFAULT_ROOMS = ['Kitchen', 'Lounge', 'Dining Room', 'Hall & Stairs', 'Bathroom', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Garden', 'Garage'];
  const NO_ROOM = '__none';
  const PRIORITIES = ['P1', 'P2', 'P3'];
  const prioRank = (t) => { const i = PRIORITIES.indexOf(t.priority); return i < 0 ? 9 : i; };   // no priority sorts last
  // Highest priority first, then soonest due date, then oldest
  const byPriority = (a, b) => prioRank(a) - prioRank(b) || (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created;
  const KEY = 'rosedene.v1';
  const ME_KEY = 'rosedene.me';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- State ----------
  let state = load();
  let me = safeGet(ME_KEY) || '';
  let filter = 'All';
  let roomFilter = 'All';
  let view = safeGet('rosedene.view') === 'cal' ? 'cal' : 'board';
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let calMonth = new Date(); calMonth.setDate(1);
  let calDay = null;      // selected day (yyyy-mm-dd) or null for "whole month"
  let visibleTasks = [];
  let activeStage = 'todo';
  let draft = null;      // task being edited in the sheet
  let isNew = false;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

  function load() {
    try {
      const s = JSON.parse(safeGet(KEY));
      if (s && Array.isArray(s.tasks) && Array.isArray(s.people)) return { rooms: [...DEFAULT_ROOMS], ...s };
    } catch {}
    return { people: [...DEFAULT_PEOPLE], rooms: [...DEFAULT_ROOMS], tasks: [] };
  }
  // ---------- Persistence: Firestore (behind a passcode) when configured, otherwise this device only ----------
  // The 6-digit passcode is the name of the board in the database (houses/<passcode>/...). The Firestore rules
  // don't allow listing boards, so you can only reach data if you already know the passcode.
  const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const CODE_KEY = 'rosedene.code';
  const USE_CLOUD = !!firebaseConfig.apiKey;
  let fbLib = null;     // { db, fs } once Firebase is loaded
  let cloud = null;     // { db, fs, code } while a board is open
  let unsubs = [];
  const setSync = (cls, title) => { const el = $('sync'); if (el) { el.className = 'sync ' + cls; el.title = title; } };

  function saveLocal() {
    if (!safeSet(KEY, JSON.stringify(state))) toast('Storage is full — remove some photos or export a backup.');
  }
  const cloudErr = (e) => { console.error(e); setSync('err', 'Sync problem'); toast('Couldn\'t sync — check your connection'); };
  const dref = (...path) => cloud.fs.doc(cloud.db, 'houses', cloud.code, ...path);
  function saveTask(t) {
    if (!cloud) return saveLocal();
    cloud.fs.setDoc(dref('tasks', t.id), t).catch(cloudErr);
  }
  function removeTask(id) {
    if (!cloud) return saveLocal();
    cloud.fs.deleteDoc(dref('tasks', id)).catch(cloudErr);
  }
  function savePeople() {
    if (!cloud) return saveLocal();
    cloud.fs.setDoc(dref('meta', 'people'), { list: state.people, rooms: state.rooms }).catch(cloudErr);
  }
  function saveAll() {
    if (!cloud) return saveLocal();
    const batch = cloud.fs.writeBatch(cloud.db);
    state.tasks.forEach((t) => batch.set(dref('tasks', t.id), t));
    batch.set(dref('meta', 'people'), { list: state.people, rooms: state.rooms });
    return batch.commit().catch(cloudErr);
  }

  async function loadFirebase() {
    if (fbLib) return fbLib;
    const [{ initializeApp }, fs] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js')]);
    const app = initializeApp(firebaseConfig);
    const db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    return (fbLib = { db, fs });
  }

  function startBoard(code) {
    stopBoard();
    cloud = { ...fbLib, code };
    safeSet(CODE_KEY, code);
    const { fs, db } = cloud;
    unsubs.push(
      fs.onSnapshot(fs.doc(db, 'houses', code, 'meta', 'people'), (snap) => {
        if (snap.exists()) { state.people = snap.data().list; state.rooms = snap.data().rooms || [...DEFAULT_ROOMS]; render(); if (!$('peopleOverlay').hidden) renderPeople(); }
      }, cloudErr),
      fs.onSnapshot(fs.collection(db, 'houses', code, 'tasks'), (snap) => {
        state.tasks = snap.docs.map((d) => d.data());
        setSync('live', snap.metadata.fromCache ? 'Offline — will sync when back online' : 'Synced');
        render();
      }, cloudErr),
    );
    $('lockBtn').hidden = false;
    $('gate').hidden = true;
    document.body.classList.remove('locked');
    render();
  }
  function stopBoard() {
    unsubs.forEach((u) => u()); unsubs = []; cloud = null;
    state = { people: [...DEFAULT_PEOPLE], rooms: [...DEFAULT_ROOMS], tasks: [] };
  }
  function lock() {
    stopBoard(); safeSet(CODE_KEY, '');
    $('peopleOverlay').hidden = true; if (draft) closeSheet();
    document.body.classList.add('locked'); $('lockBtn').hidden = true;
    showGate();
  }

  // ---------- Passcode gate ----------
  function showGate(msg = '', offerCreate = false) {
    $('gate').hidden = false;
    $('gateForm').hidden = false;
    $('gateMsg').textContent = msg;
    $('gateCreate').hidden = !offerCreate;
    $('gateCode').value = ''; $('gateCode').focus();
  }
  async function tryCode(code, { create = false, silent = false } = {}) {
    try {
      const { db, fs } = await loadFirebase();
      const r = fs.doc(db, 'houses', code, 'meta', 'people');
      const snap = await fs.getDoc(r);
      if (snap.exists()) return startBoard(code);
      if (create) { await fs.setDoc(r, { list: [...DEFAULT_PEOPLE], rooms: [...DEFAULT_ROOMS] }); return startBoard(code); }
      showGate('No board found for that passcode.', true);
      pendingCode = code;
    } catch (e) {
      console.error(e);
      if (silent && e.code === 'unavailable') return startBoard(code);   // offline: use the cached board
      const msg = e.code === 'permission-denied'
        ? 'The database rules need updating — see the README.'
        : 'Couldn\'t reach the database. Check your connection.';
      showGate(msg);
    }
  }
  let pendingCode = '';
  $('gateForm').addEventListener('submit', (e) => { e.preventDefault(); const c = $('gateCode').value.trim(); if (/^\d{6}$/.test(c)) tryCode(c); });
  $('gateCode').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); $('gateMsg').textContent = ''; $('gateCreate').hidden = true; if (e.target.value.length === 6) $('gateForm').requestSubmit(); });
  $('gateCreate').addEventListener('click', () => { if (pendingCode) tryCode(pendingCode, { create: true }); });
  $('lockBtn').addEventListener('click', lock);

  async function initCloud() {
    if (!USE_CLOUD) { document.body.classList.remove('locked'); $('gate').hidden = true; setSync('', 'Local only — not synced'); return; }
    state = { people: [...DEFAULT_PEOPLE], rooms: [...DEFAULT_ROOMS], tasks: [] };
    const saved = safeGet(CODE_KEY);
    if (/^\d{6}$/.test(saved || '')) { $('gateForm').hidden = true; $('gateMsg').textContent = 'Opening…'; tryCode(saved, { silent: true }); }
    else showGate();
  }

  // ---------- Helpers ----------
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const stageOf = (id) => STAGES.find((s) => s.id === id);
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function isLate(t) {
    if (!t.due || t.status === 'done') return false;
    return t.due < new Date().toLocaleDateString('en-CA');
  }
  function normalise(t) {
    // Assigning someone to a To Do task moves it to Assigned; removing everyone from Assigned sends it back.
    if (t.assignees.length && t.status === 'todo') t.status = 'assigned';
    if (!t.assignees.length && t.status === 'assigned') t.status = 'todo';
  }
  function setStatus(t, status) {
    if (status !== 'todo' && !t.assignees.length) { toast('Assign someone first'); return false; }
    t.status = status; return true;
  }

  // ---------- Render ----------
  function render() {
    // me select
    $('meSelect').innerHTML = '<option value="">Nobody</option>' +
      state.people.map((p) => `<option ${p === me ? 'selected' : ''}>${esc(p)}</option>`).join('');

    // filters
    if (filter !== 'All' && !state.people.includes(filter)) filter = 'All';
    $('filters').innerHTML = ['All', ...state.people]
      .map((p) => `<button type="button" class="filter ${p === filter ? 'on' : ''}" data-f="${esc(p)}">${esc(p)}</button>`).join('');

    if (roomFilter !== 'All' && roomFilter !== NO_ROOM && !state.rooms.includes(roomFilter)) roomFilter = 'All';
    $('roomFilter').innerHTML = `<option value="All">All rooms</option>` +
      state.rooms.map((r) => `<option value="${esc(r)}" ${r === roomFilter ? 'selected' : ''}>${esc(r)}</option>`).join('') +
      `<option value="${NO_ROOM}" ${roomFilter === NO_ROOM ? 'selected' : ''}>No room</option>`;

    const inRoom = (t) => roomFilter === 'All' || (roomFilter === NO_ROOM ? !roomsOf(t).length : roomsOf(t).includes(roomFilter));
    const visible = state.tasks.filter((t) => (filter === 'All' || t.assignees.includes(filter)) && inRoom(t));
    visibleTasks = visible;
    const byStage = (id) => visible.filter((t) => t.status === id).sort(byPriority);

    $('tabs').innerHTML = STAGES.map((s) =>
      `<button type="button" role="tab" class="tab ${s.id === activeStage ? 'on' : ''}" data-s="${s.id}">${s.label}<b>${byStage(s.id).length}</b></button>`).join('');

    $('board').innerHTML = STAGES.map((s) => {
      const list = byStage(s.id);
      return `<section class="col ${s.id === activeStage ? 'on' : ''}" data-stage="${s.id}" style="--stage:${s.color}">
        <div class="col-head"><span>${s.label}</span><b>${list.length}</b></div>
        ${list.length ? list.map(card).join('') : '<div class="empty">Nothing here yet</div>'}
      </section>`;
    }).join('');
    renderCal();
  }

  // ---------- Calendar ----------
  function renderCal() {
    document.body.classList.toggle('view-cal', view === 'cal');
    document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    if (view !== 'cal') return;

    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    $('calTitle').textContent = calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const byDay = {};
    visibleTasks.forEach((t) => { if (t.due) (byDay[t.due] = byDay[t.due] || []).push(t); });
    const today = iso(new Date());
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;      // Monday first
    const days = new Date(y, m + 1, 0).getDate();
    let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('');
    html += '<div class="blank"></div>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const key = iso(new Date(y, m, d));
      const list = byDay[key] || [];
      const dots = list.slice(0, 4).map((t) => `<i data-stage="${t.status}" class="${t.status === 'done' ? 'fin' : ''}"></i>`).join('') + (list.length > 4 ? `<em>+${list.length - 4}</em>` : '');
      const names = list.slice(0, 2).map((t) => `<span data-stage="${t.status}" class="${t.status === 'done' ? 'fin' : ''}">${esc(t.title)}</span>`).join('') + (list.length > 2 ? `<em>+${list.length - 2} more</em>` : '');
      html += `<button type="button" class="day ${key === today ? 'today' : ''} ${key === calDay ? 'sel' : ''} ${list.length ? 'has' : ''}" data-d="${key}">
        <b>${d}</b><div class="dots">${dots}</div><div class="names">${names}</div></button>`;
    }
    $('calGrid').innerHTML = html;

    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const list = (calDay ? visibleTasks.filter((t) => t.due === calDay) : visibleTasks.filter((t) => (t.due || '').startsWith(prefix)))
      .sort((a, b) => (a.due || '').localeCompare(b.due || '') || byPriority(a, b));
    const heading = calDay ? fmtDate(calDay) : `Due in ${calMonth.toLocaleDateString('en-GB', { month: 'long' })}`;
    $('calDay').innerHTML = `<div class="cal-day-head"><h3>${heading}</h3>
      ${calDay ? `<button type="button" class="mini solid" data-addday="${calDay}">+ Task on this day</button><button type="button" class="mini" data-clearday>Show whole month</button>` : ''}</div>
      ${list.length ? list.map((t) => `<div data-stage="${t.status}">${card(t)}</div>`).join('') : '<div class="empty">No tasks due</div>'}
      ${calDay ? '' : `<p class="cal-note">${visibleTasks.filter((t) => !t.due).length} task(s) have no due date and don't appear here.</p>`}`;
  }

  const roomsOf = (t) => t.rooms || [];

  function card(t) {
    const prio = PRIORITIES.includes(t.priority) ? `<span class="tag prio ${t.priority}">${t.priority}</span>` : '';
    const rooms = roomsOf(t).map((r) => `<span class="tag room">${esc(r)}</span>`).join('');
    const assigned = t.assignees.map((a) => `<span class="tag">${esc(a)}</span>`).join('');
    const due = t.due ? `<span class="tag ${isLate(t) ? 'late' : 'due'}">${isLate(t) ? 'Overdue · ' : 'Due '}${fmtDate(t.due)}</span>` : '';
    const meta = [t.photos.length ? `${t.photos.length} photo${t.photos.length > 1 ? 's' : ''}` : '', t.links.length ? `${t.links.length} link${t.links.length > 1 ? 's' : ''}` : '']
      .filter(Boolean).map((m) => `<span class="tag meta">${m}</span>`).join('');

    const actions = [];
    if (me && !t.assignees.includes(me) && t.status !== 'done') actions.push(`<button type="button" class="mini solid" data-act="assign">Assign me</button>`);
    if (NEXT[t.status]) actions.push(`<button type="button" class="mini" data-act="next">${NEXT[t.status][1]} →</button>`);
    if (t.status === 'started') actions.push(`<button type="button" class="mini peach" data-act="part">Part complete</button>`);
    if (t.status === 'done') actions.push(`<button type="button" class="mini peach" data-act="reopen">Reopen</button>`);

    return `<article class="card" draggable="true" data-id="${t.id}">
      <h3>${esc(t.title)}</h3>
      ${t.details ? `<p>${esc(t.details)}</p>` : ''}
      <div class="tags">${prio}${rooms}${assigned}${due}${meta}</div>
      ${actions.length ? `<div class="card-actions">${actions.join('')}</div>` : ''}
    </article>`;
  }

  // ---------- Board interactions ----------
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    activeStage = b.dataset.s; render();
  });
  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f; render();
  });
  $('roomFilter').addEventListener('change', (e) => { roomFilter = e.target.value; render(); });
  $('meSelect').addEventListener('change', (e) => { me = e.target.value; safeSet(ME_KEY, me); render(); });

  const onCardClick = (e) => {
    const cardEl = e.target.closest('.card'); if (!cardEl) return;
    const t = state.tasks.find((x) => x.id === cardEl.dataset.id); if (!t) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return openSheet(t);
    if (act === 'assign') { if (!t.assignees.includes(me)) t.assignees.push(me); normalise(t); toast(`Assigned to ${me}`); }
    if (act === 'next') { setStatus(t, NEXT[t.status][0]); }
    if (act === 'part') { t.status = 'part'; }
    if (act === 'reopen') { t.status = t.assignees.length ? 'started' : 'todo'; }
    touch(t); saveTask(t); render();
  };
  $('board').addEventListener('click', onCardClick);
  $('calDay').addEventListener('click', (e) => {
    const add = e.target.closest('[data-addday]');
    if (add) return openSheet(null, add.dataset.addday);
    if (e.target.closest('[data-clearday]')) { calDay = null; return render(); }
    onCardClick(e);
  });

  // Calendar navigation
  document.querySelector('.viewbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    view = b.dataset.view; safeSet('rosedene.view', view); render();
  });
  $('calPrev').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); calDay = null; render(); });
  $('calNext').addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); calDay = null; render(); });
  $('calToday').addEventListener('click', () => { calMonth = new Date(); calMonth.setDate(1); calDay = iso(new Date()); render(); });
  $('calGrid').addEventListener('click', (e) => {
    const d = e.target.closest('[data-d]'); if (!d) return;
    calDay = calDay === d.dataset.d ? null : d.dataset.d; render();
  });

  // Drag & drop between columns (desktop)
  let dragId = null;
  $('board').addEventListener('dragstart', (e) => {
    const c = e.target.closest('.card'); if (!c) return;
    dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
  });
  $('board').addEventListener('dragover', (e) => {
    const col = e.target.closest('.col'); if (!col || !dragId) return;
    e.preventDefault(); document.querySelectorAll('.col.drop').forEach((c) => c !== col && c.classList.remove('drop')); col.classList.add('drop');
  });
  $('board').addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.col.drop').forEach((c) => c.classList.remove('drop')); });
  $('board').addEventListener('drop', (e) => {
    const col = e.target.closest('.col'); if (!col || !dragId) return;
    e.preventDefault();
    const t = state.tasks.find((x) => x.id === dragId);
    if (t && t.status !== col.dataset.stage && setStatus(t, col.dataset.stage)) {
      if (col.dataset.stage === 'todo') t.assignees = [];
      touch(t); saveTask(t);
    }
    dragId = null; render();
  });

  function touch(t) { t.updated = Date.now(); }

  // ---------- Task sheet ----------
  $('addBtn').addEventListener('click', () => openSheet(null));

  function openSheet(task, dueDate = '') {
    isNew = !task;
    draft = task
      ? { rooms: [], ...JSON.parse(JSON.stringify(task)) }
      : { id: uid(), title: '', details: '', due: '', assignees: [], rooms: [], priority: '', status: 'todo', photos: [], links: [], created: Date.now(), updated: Date.now() };
    if (!task) draft.due = dueDate;
    $('sheetTitle').textContent = isNew ? 'New task' : 'Edit task';
    $('fTitle').value = draft.title;
    $('fDetails').value = draft.details;
    $('fDue').value = draft.due;
    $('deleteBtn').style.visibility = isNew ? 'hidden' : 'visible';
    $('stageField').hidden = isNew;
    renderSheet();
    $('overlay').hidden = false;
    document.body.style.overflow = 'hidden';
    if (isNew) setTimeout(() => $('fTitle').focus(), 50);
  }
  function closeSheet() { $('overlay').hidden = true; document.body.style.overflow = ''; draft = null; }

  function renderSheet() {
    $('fPeople').innerHTML = state.people.map((p) =>
      `<button type="button" class="chip ${draft.assignees.includes(p) ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('');
    $('fPriority').innerHTML = ['', ...PRIORITIES].map((p) =>
      `<button type="button" class="chip prio ${p} ${(draft.priority || '') === p ? 'on' : ''}" data-pr="${p}">${p || 'None'}</button>`).join('');
    $('fRooms').innerHTML = state.rooms.map((r) =>
      `<button type="button" class="chip room ${draft.rooms.includes(r) ? 'on' : ''}" data-r="${esc(r)}">${esc(r)}</button>`).join('');
    $('fStage').innerHTML = STAGES.map((s) =>
      `<button type="button" class="chip ${draft.status === s.id ? 'on' : ''}" data-s="${s.id}">${s.label}</button>`).join('');
    $('fPhotos').innerHTML = draft.photos.map((src, i) =>
      `<div class="photo"><img src="${src}" alt="Task photo ${i + 1}" data-view="${i}"><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></div>`).join('');
    $('fLinks').innerHTML = draft.links.map((l, i) =>
      `<div class="link-row"><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label || l.url)}</a><button type="button" data-rmlink="${i}" aria-label="Remove link">×</button></div>`).join('');
  }

  $('fPeople').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    const p = b.dataset.p, a = draft.assignees;
    a.includes(p) ? a.splice(a.indexOf(p), 1) : a.push(p);
    normalise(draft); renderSheet();
  });
  $('fPriority').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pr]'); if (!b) return;
    draft.priority = b.dataset.pr; renderSheet();
  });
  $('fRooms').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = b.dataset.r, a = draft.rooms;
    a.includes(r) ? a.splice(a.indexOf(r), 1) : a.push(r);
    renderSheet();
  });
  $('fStage').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    if (setStatus(draft, b.dataset.s)) renderSheet();
  });
  $('fPhotos').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { draft.photos.splice(+rm.dataset.rm, 1); return renderSheet(); }
    const v = e.target.closest('[data-view]');
    if (v) { $('viewerImg').src = draft.photos[+v.dataset.view]; $('viewer').hidden = false; }
  });
  $('viewer').addEventListener('click', () => { $('viewer').hidden = true; });
  $('fLinks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rmlink]'); if (!b) return;
    draft.links.splice(+b.dataset.rmlink, 1); renderSheet();
  });

  $('addLink').addEventListener('click', () => {
    let url = $('fLinkUrl').value.trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch { return toast('That link doesn\'t look right'); }
    draft.links.push({ url, label: $('fLinkLabel').value.trim() });
    $('fLinkUrl').value = ''; $('fLinkLabel').value = ''; renderSheet();
  });

  $('fPhotoInput').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) {
      try { draft.photos.push(await shrink(f)); } catch { toast('Couldn\'t read one of the photos'); }
    }
    renderSheet();
  });

  // Resize photos so they fit comfortably in browser storage
  function shrink(file, max = 800, quality = 0.65) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }

  $('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    draft.title = $('fTitle').value.trim();
    if (!draft.title) return;
    draft.details = $('fDetails').value.trim();
    draft.due = $('fDue').value;
    normalise(draft); touch(draft);
    if (cloud && JSON.stringify(draft).length > 950000) return toast('Too many photos for one task — remove a few');
    activeStage = draft.status;
    if (isNew) state.tasks.push(draft);
    else state.tasks[state.tasks.findIndex((t) => t.id === draft.id)] = draft;
    saveTask(draft); closeSheet(); render();
  });
  $('deleteBtn').addEventListener('click', () => {
    if (!confirm('Delete this task?')) return;
    state.tasks = state.tasks.filter((t) => t.id !== draft.id);
    removeTask(draft.id); closeSheet(); render();
  });
  $('closeSheet').addEventListener('click', closeSheet);
  $('cancelBtn').addEventListener('click', closeSheet);
  $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeSheet(); });

  // ---------- People ----------
  function renderPeople() {
    $('peopleList').innerHTML = state.people.map((p) =>
      `<li><span>${esc(p)}</span><button type="button" data-del="${esc(p)}">Remove</button></li>`).join('');
    $('roomList').innerHTML = state.rooms.map((r) =>
      `<li><span>${esc(r)}</span><button type="button" data-delroom="${esc(r)}">Remove</button></li>`).join('');
  }
  $('peopleBtn').addEventListener('click', () => { renderPeople(); $('peopleOverlay').hidden = false; });
  $('closePeople').addEventListener('click', () => { $('peopleOverlay').hidden = true; });
  $('peopleOverlay').addEventListener('click', (e) => { if (e.target === $('peopleOverlay')) $('peopleOverlay').hidden = true; });
  $('personForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = $('personName').value.trim();
    if (!n) return;
    if (state.people.some((p) => p.toLowerCase() === n.toLowerCase())) return toast('Already on the list');
    state.people.push(n); $('personName').value = ''; savePeople(); renderPeople(); render();
  });
  $('roomForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = $('roomName').value.trim();
    if (!n) return;
    if (state.rooms.some((r) => r.toLowerCase() === n.toLowerCase())) return toast('Already on the list');
    state.rooms.push(n); $('roomName').value = ''; savePeople(); renderPeople(); render();
  });
  $('roomList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-delroom]'); if (!b) return;
    const r = b.dataset.delroom;
    if (!confirm(`Remove the room "${r}"? It will be taken off any tasks.`)) return;
    state.rooms = state.rooms.filter((x) => x !== r);
    state.tasks.forEach((t) => {
      if (!roomsOf(t).includes(r)) return;
      t.rooms = t.rooms.filter((x) => x !== r); touch(t); saveTask(t);
    });
    savePeople(); renderPeople(); render();
  });
  $('peopleList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const p = b.dataset.del;
    if (!confirm(`Remove ${p}? They'll be unassigned from any tasks.`)) return;
    state.people = state.people.filter((x) => x !== p);
    state.tasks.forEach((t) => {
      if (!t.assignees.includes(p)) return;
      t.assignees = t.assignees.filter((a) => a !== p); normalise(t); touch(t); saveTask(t);
    });
    if (me === p) { me = ''; safeSet(ME_KEY, ''); }
    savePeople(); renderPeople(); render();
  });

  // Backup
  $('exportBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    a.download = `rosedene-backup-${new Date().toLocaleDateString('en-CA')}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!Array.isArray(s.tasks) || !Array.isArray(s.people)) throw 0;
      if (!confirm('Replace everything on this device with this backup?')) return;
      state = { rooms: [...DEFAULT_ROOMS], ...s }; saveAll(); $('peopleOverlay').hidden = true; render(); toast('Backup restored');
    } catch { toast('That file isn\'t a valid backup'); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('viewer').hidden) $('viewer').hidden = true;
    else if (!$('overlay').hidden) closeSheet();
    else $('peopleOverlay').hidden = true;
  });

  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  await initCloud();
})();
