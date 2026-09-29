(() => {
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
  const KEY = 'rosedene.v1';
  const ME_KEY = 'rosedene.me';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- State ----------
  let state = load();
  let me = safeGet(ME_KEY) || '';
  let filter = 'All';
  let activeStage = 'todo';
  let draft = null;      // task being edited in the sheet
  let isNew = false;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

  function load() {
    try {
      const s = JSON.parse(safeGet(KEY));
      if (s && Array.isArray(s.tasks) && Array.isArray(s.people)) return s;
    } catch {}
    return { people: [...DEFAULT_PEOPLE], tasks: [] };
  }
  function save() {
    if (!safeSet(KEY, JSON.stringify(state))) toast('Storage is full — remove some photos or export a backup.');
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

    const visible = state.tasks.filter((t) => filter === 'All' || t.assignees.includes(filter));
    const byStage = (id) => visible.filter((t) => t.status === id)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created);

    $('tabs').innerHTML = STAGES.map((s) =>
      `<button type="button" role="tab" class="tab ${s.id === activeStage ? 'on' : ''}" data-s="${s.id}">${s.label}<b>${byStage(s.id).length}</b></button>`).join('');

    $('board').innerHTML = STAGES.map((s) => {
      const list = byStage(s.id);
      return `<section class="col ${s.id === activeStage ? 'on' : ''}" data-stage="${s.id}" style="--stage:${s.color}">
        <div class="col-head"><span>${s.label}</span><b>${list.length}</b></div>
        ${list.length ? list.map(card).join('') : '<div class="empty">Nothing here yet</div>'}
      </section>`;
    }).join('');
  }

  function card(t) {
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
      <div class="tags">${assigned}${due}${meta}</div>
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
  $('meSelect').addEventListener('change', (e) => { me = e.target.value; safeSet(ME_KEY, me); render(); });

  $('board').addEventListener('click', (e) => {
    const cardEl = e.target.closest('.card'); if (!cardEl) return;
    const t = state.tasks.find((x) => x.id === cardEl.dataset.id); if (!t) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return openSheet(t);
    if (act === 'assign') { if (!t.assignees.includes(me)) t.assignees.push(me); normalise(t); toast(`Assigned to ${me}`); }
    if (act === 'next') { setStatus(t, NEXT[t.status][0]); }
    if (act === 'part') { t.status = 'part'; }
    if (act === 'reopen') { t.status = t.assignees.length ? 'started' : 'todo'; }
    touch(t); save(); render();
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
      touch(t); save();
    }
    dragId = null; render();
  });

  function touch(t) { t.updated = Date.now(); }

  // ---------- Task sheet ----------
  $('addBtn').addEventListener('click', () => openSheet(null));

  function openSheet(task) {
    isNew = !task;
    draft = task
      ? JSON.parse(JSON.stringify(task))
      : { id: uid(), title: '', details: '', due: '', assignees: [], status: 'todo', photos: [], links: [], created: Date.now(), updated: Date.now() };
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
  function shrink(file, max = 1000, quality = 0.72) {
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
    if (isNew) state.tasks.push(draft);
    else state.tasks[state.tasks.findIndex((t) => t.id === draft.id)] = draft;
    activeStage = draft.status;
    save(); closeSheet(); render();
  });
  $('deleteBtn').addEventListener('click', () => {
    if (!confirm('Delete this task?')) return;
    state.tasks = state.tasks.filter((t) => t.id !== draft.id);
    save(); closeSheet(); render();
  });
  $('closeSheet').addEventListener('click', closeSheet);
  $('cancelBtn').addEventListener('click', closeSheet);
  $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeSheet(); });

  // ---------- People ----------
  function renderPeople() {
    $('peopleList').innerHTML = state.people.map((p) =>
      `<li><span>${esc(p)}</span><button type="button" data-del="${esc(p)}">Remove</button></li>`).join('');
  }
  $('peopleBtn').addEventListener('click', () => { renderPeople(); $('peopleOverlay').hidden = false; });
  $('closePeople').addEventListener('click', () => { $('peopleOverlay').hidden = true; });
  $('peopleOverlay').addEventListener('click', (e) => { if (e.target === $('peopleOverlay')) $('peopleOverlay').hidden = true; });
  $('personForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = $('personName').value.trim();
    if (!n) return;
    if (state.people.some((p) => p.toLowerCase() === n.toLowerCase())) return toast('Already on the list');
    state.people.push(n); $('personName').value = ''; save(); renderPeople(); render();
  });
  $('peopleList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const p = b.dataset.del;
    if (!confirm(`Remove ${p}? They'll be unassigned from any tasks.`)) return;
    state.people = state.people.filter((x) => x !== p);
    state.tasks.forEach((t) => { t.assignees = t.assignees.filter((a) => a !== p); normalise(t); });
    if (me === p) { me = ''; safeSet(ME_KEY, ''); }
    save(); renderPeople(); render();
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
      state = s; save(); $('peopleOverlay').hidden = true; render(); toast('Backup restored');
    } catch { toast('That file isn\'t a valid backup'); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('viewer').hidden) $('viewer').hidden = true;
    else if (!$('overlay').hidden) closeSheet();
    else $('peopleOverlay').hidden = true;
  });

  render();
})();
