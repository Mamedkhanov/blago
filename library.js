// База знаний: карточка на главной, полка круга, форма «положить материал».
// Что принимается и сколько XP — решает сервер; здесь только ввод и показ.

let L = null;

// ---------- карточка на главной ----------

function libraryCard(lib) {
  if (!lib) return '';
  const counts = (lib.counts || []).filter(c => c.n).map(c => c.icon + ' ' + c.n).join(' · ');
  const last = lib.last;
  return `<h2>База знаний</h2>
    <button class="card lib-card" data-act="library">
      <div class="card-head">
        <div class="sphere-icon">📚</div>
        <div><div class="muted small">материалов</div><div class="level num">${lib.total}</div></div>
        <div class="right"><b class="num">${lib.mine}</b><div class="muted small">ваших</div></div>
      </div>
      ${counts ? `<div class="lib-counts">${counts}</div>` : ''}
      ${last ? `<div class="lib-last">${last.icon} <b>${esc(last.title)}</b><span class="muted"> · ${esc(last.by)}</span></div>`
             : '<div class="lib-last muted">Пусто. Положите книгу, лекцию или конспект.</div>'}
    </button>`;
}

// ---------- экран ----------

function openLibrary() {
  L = { view: 'list', kind: '', section: '', q: '', changed: false, data: null };
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!openLibrary.bound) {
    $('#sheet').addEventListener('click', onLibClick);
    $('#sheet').addEventListener('input', onLibInput);
    $('#sheet').addEventListener('change', ev => { if (L && ev.target.matches('input[data-libfile]')) onLibFile(ev.target); });
    openLibrary.bound = true;
  }
  if (tg && tg.BackButton && tg.isVersionAtLeast('6.1')) { tg.BackButton.onClick(backLib); tg.BackButton.show(); }
  renderLib();
  loadLib();
}

function closeLibrary() {
  const changed = L && L.changed;
  L = null;
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
  if (tg && tg.BackButton && tg.isVersionAtLeast('6.1')) { tg.BackButton.offClick(backLib); tg.BackButton.hide(); }
  if (changed) afterSave();
}

function backLib() {
  if (!L) return;
  if (L.view === 'list') return closeLibrary();
  L.view = 'list';
  L.error = '';
  renderLib();
}

async function loadLib() {
  try {
    const r = await api('library', { kind: L.kind, section: L.section, q: L.q });
    if (!L) return;
    L.data = r;
    L.error = '';
  } catch (e) {
    if (!L) return;
    L.error = e.message;
  }
  if (L && L.view === 'list') paintLib();
}

function renderLib() {
  const view = { list: libList, add: libForm }[L.view];
  $('#sheet').innerHTML = view();
  $('#sheet').scrollTop = 0;
}

// Список перерисовывается отдельно от экрана: иначе поле поиска теряло бы
// фокус и каретку на каждом ответе сервера.
function paintLib() {
  const list = $('#lib-list');
  if (!list) return renderLib();
  list.innerHTML = libBody();
  const count = $('#lib-count');
  if (count) count.textContent = libCount();
  const cap = $('#lib-cap');
  if (cap) cap.textContent = libCapLine();
}

function libItemCard(it) {
  const meta = [it.kindLabel, it.sectionLabel, it.author].filter(Boolean).join(' · ');
  return `<div class="card lib-item">
    <div class="card-head">
      <span class="q-icon">${it.icon}</span>
      <div class="grow"><b>${esc(it.title)}</b><div class="muted small">${esc(meta)}</div></div>
    </div>
    ${it.note ? `<p class="q-desc">${esc(it.note)}</p>` : ''}
    <div class="lib-row">
      <button class="btn secondary" data-lib="open" data-v="${esc(it.link)}">${it.file ? '📎 Открыть файл' : '🔗 Открыть ссылку'}</button>
      ${it.mine ? `<button class="del-btn" data-lib="remove" data-v="${it.id}">Убрать</button>` : ''}
    </div>
    <div class="muted small lib-by">положил ${esc(it.by)} · ${esc(dateLabel(it.date))}</div>
  </div>`;
}

function libBody() {
  const d = L.data;
  if (!d) return skeleton(2);
  if (d.items.length) return d.items.map(libItemCard).join('');
  return d.total
    ? '<div class="card empty"><div class="big">🔍</div>Ничего не нашлось. Снимите фильтры.</div>'
    : '<div class="card empty"><div class="big">📚</div>База пуста. Положите PDF книги, лекцию или конспект — их увидит весь круг.</div>';
}

function libCount() {
  const d = L.data;
  if (!d) return '';
  return d.shown === d.total ? 'Всего ' + d.total : d.shown + ' из ' + d.total;
}

function libCapLine() {
  const week = L.data && L.data.week;
  if (!week || !week.rate) return '';
  return week.left
    ? `За материал +${fmt(week.rate)} XP · на этой неделе ещё ${fmt(week.left)} XP до потолка`
    : `Потолок недели ${fmt(week.cap)} XP выбран — материалы кладутся, XP за них пойдут со следующей недели`;
}

function libList() {
  const d = L.data;
  const kinds = S.boot.library.kinds;
  const chips = list => `<div class="chips">${list.join('')}</div>`;
  const kindChips = chips([`<button class="chip ${L.kind ? '' : 'on'}" data-lib="kind" data-v="">Всё</button>`].concat(
    kinds.map(k => `<button class="chip ${L.kind === k.key ? 'on' : ''}" data-lib="kind" data-v="${k.key}">${k.icon} ${esc(k.label)}</button>`)));
  const secChips = chips([`<button class="chip ${L.section ? '' : 'on'}" data-lib="section" data-v="">Все разделы</button>`].concat(
    S.boot.library.sections.map(s => `<button class="chip ${L.section === s.key ? 'on' : ''}" data-lib="section" data-v="${s.key}">${esc(s.label)}</button>`)));

  return `<div class="screen">
    <button class="link-btn" data-lib="close">Закрыть</button>
    <h1>База знаний</h1>
    <p class="sub">Общая полка круга: книги, лекции, конспекты. Видят все трое.</p>
    <button class="btn" data-lib="new">＋ Положить материал</button>
    <p class="muted small lib-cap" id="lib-cap">${esc(libCapLine())}</p>
    <input class="input lib-search" data-libf="q" type="search" placeholder="Поиск по названию и автору" value="${esc(L.q)}">
    ${kindChips}
    ${secChips}
    <div class="crumbs" id="lib-count">${esc(libCount())}</div>
    ${L.error ? `<div class="error">${esc(L.error)}</div>` : ''}
    <div id="lib-list">${libBody()}</div>
  </div>`;
}

function libForm() {
  const f = L.form, kinds = S.boot.library.kinds;
  const lim = S.boot.library.maxMb;
  const parts = [`<div class="screen">
    <button class="link-btn" data-lib="back">‹ К базе</button>
    <h1>Новый материал</h1>`];

  parts.push(field('Что это?', '', false, `<div class="chips">${kinds.map(k =>
    `<button class="chip ${f.kind === k.key ? 'on' : ''}" data-lib="kind-pick" data-v="${k.key}">${k.icon} ${esc(k.label)}</button>`).join('')}</div>`));

  parts.push(field('Название', f.kind === 'lecture' ? 'Тема лекции' : 'Как называется книга или конспект', false,
    `<input class="input" data-libf="title" maxlength="120" value="${esc(f.title)}">`));

  parts.push(field('Автор или шейх', '', true,
    `<input class="input" data-libf="author" maxlength="120" value="${esc(f.author)}">`));

  parts.push(field('Раздел', '', true, `<div class="chips">
    <button class="chip ${f.section ? '' : 'on'}" data-lib="sec-pick" data-v="">Без раздела</button>
    ${S.boot.library.sections.map(s => `<button class="chip ${f.section === s.key ? 'on' : ''}" data-lib="sec-pick" data-v="${s.key}">${esc(s.label)}</button>`).join('')}
  </div>`));

  const inner = L.uploading ? '<div class="file-box"><span class="grow">Загружаю…</span></div>'
    : f.link ? `<div class="file-box"><span>📎</span><span class="grow">${esc(f.fileName || f.link)}</span><button class="link-btn" data-lib="unlink">Убрать</button></div>`
    : `<label class="btn secondary">📄 PDF, фото или аудио<input type="file" data-libfile accept="application/pdf,image/*,audio/*" hidden></label>
       <div class="or">или ссылкой</div><input class="input" data-libf="link" type="url" inputmode="url" placeholder="https://…" value="">`;
  parts.push(field('Файл или ссылка', `Файл — до ${lim} МБ. Что тяжелее, кладите ссылкой на Диск или канал.`, false, inner));

  parts.push(field('Пара слов', 'Зачем это круга стоит смотреть', true,
    `<textarea class="input" data-libf="note" maxlength="500" rows="3">${esc(f.note)}</textarea>`));

  parts.push(`</div><div class="savebar"><div class="inner">
    ${L.error ? `<div class="error">${esc(L.error)}</div>` : ''}
    <div class="preview"><span>За материал</span><b class="num">${fmt(S.boot.library.rate)} XP</b></div>
    <button class="btn" data-lib="save" ${L.saving || L.uploading ? 'disabled' : ''}>${L.saving ? 'Кладу…' : 'Положить в базу'}</button>
  </div></div>`);
  return parts.join('');
}

// ---------- действия ----------

function libValidate() {
  const f = L.form;
  if (!f.kind) return 'Выберите вид материала.';
  if (!String(f.title).trim()) return 'Напишите название.';
  if (!f.link) return 'Приложите файл или дайте ссылку.';
  if (!/^https?:\/\//.test(f.link)) return 'Ссылка должна начинаться с https://';
  return '';
}

async function onLibClick(ev) {
  const el = ev.target.closest('[data-lib]');
  if (!el || !L) return;
  const v = el.dataset.v;
  switch (el.dataset.lib) {
    case 'close': return closeLibrary();
    case 'back': return backLib();
    case 'open': return openOutside(v);
    case 'kind': L.kind = v; L.data = null; renderLib(); return loadLib();
    case 'section': L.section = v; L.data = null; renderLib(); return loadLib();
    case 'new':
      L.view = 'add';
      L.error = '';
      L.form = { kind: '', title: '', author: '', section: L.section || '', note: '', link: '', fileName: '' };
      break;
    case 'kind-pick': L.form.kind = v; break;
    case 'sec-pick': L.form.section = v; break;
    case 'unlink': L.form.link = ''; L.form.fileName = ''; break;
    case 'save': return saveLib();
    case 'remove': return removeLib(Number(v));
    default: return;
  }
  renderLib();
}

// Ввод не перерисовывает экран, иначе пропадает фокус.
function onLibInput(ev) {
  const key = ev.target.dataset && ev.target.dataset.libf;
  if (!key || !L) return;
  if (key === 'q') {
    L.q = ev.target.value;
    clearTimeout(onLibInput.timer);
    onLibInput.timer = setTimeout(() => { if (L && L.view === 'list') loadLib(); }, 300);
    return;
  }
  if (!L.form) return;
  L.form[key] = key === 'link' ? ev.target.value.trim() : ev.target.value;
  if (key === 'link') L.form.fileName = '';
}

function openOutside(url) {
  try {
    if (tg && tg.openLink) return tg.openLink(url);
  } catch (e) { /* старый клиент */ }
  window.open(url, '_blank');
}

async function saveLib() {
  L.error = libValidate();
  if (L.error) { haptic('error'); return renderLib(); }
  L.saving = true;
  renderLib();
  const f = L.form;
  try {
    const r = await api('libraryAdd', {
      kind: f.kind, title: f.title, author: f.author, section: f.section,
      note: f.note, link: f.link, mime: f.mime || ''
    });
    L.changed = true;
    L.view = 'list';
    L.data = null;
    // Фильтры снимаем: иначе положенное только что может не попасть в текущую выборку.
    L.q = '';
    L.kind = '';
    L.section = '';
    haptic('success');
    toast(r.xp ? `В базе. +${fmt(r.xp)} XP` : 'В базе. Потолок недели уже выбран');
    L.saving = false;
    renderLib();
    return loadLib();
  } catch (e) {
    L.error = e.message;
    haptic('error');
  }
  L.saving = false;
  if (L) renderLib();
}

async function removeLib(id) {
  if (!(await askConfirm('Убрать материал из базы? Файл на Диске останется.'))) return;
  try {
    await api('libraryRemove', { id: id });
    L.changed = true;
    L.data = null;
    renderLib();
    loadLib();
    toast('Убрано из базы');
  } catch (e) {
    toast(e.message);
  }
}

async function onLibFile(input) {
  const file = input.files && input.files[0];
  if (!file || !L) return;
  L.uploading = true;
  L.error = '';
  renderLib();
  try {
    let blob = file, mime = file.type, name = file.name || 'файл';
    if (/^image\//.test(file.type)) {
      try { blob = await shrinkImage(file); mime = 'image/jpeg'; name = name.replace(/\.[^.]+$/, '') + '.jpg'; } catch (e) { /* как есть */ }
    }
    const max = S.boot.library.maxMb * 1024 * 1024;
    if (blob.size > max) throw new Error(`Файл больше ${S.boot.library.maxMb} МБ. Положите ссылкой.`);
    const r = await api('upload', { scope: 'library', name: name, mime: mime, base64: await toBase64(blob) });
    if (!L) return;
    L.form.link = r.link;
    L.form.fileName = name;
    L.form.mime = r.mime;
    if (!L.form.title) L.form.title = name.replace(/\.[^.]+$/, '');
  } catch (e) {
    if (L) L.error = e.message;
  }
  if (!L) return;
  L.uploading = false;
  renderLib();
}
