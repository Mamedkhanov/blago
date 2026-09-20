// Запись сделанного: сфера → раздел → вид → форма → итог.
// Проверки полей здесь только для быстрого ответа; решает всё равно сервер.

const SECTION_HINTS = {
  aqidah: 'вероубеждение', fiqh: 'поклонение, муамалят, усуль', hadith: 'заучивание, мусталях',
  arabic: 'нахв, сарф, лексика, тексты', history: 'сира, сподвижники, умма',
  quran_read: 'таджвид, произношение', quran_hifz: 'заучивание и повторение'
};
const UNIT_RATE = { 'минута': 'за минуту', 'страница': 'за страницу', 'слово': 'за слово', 'аят': 'за аят' };
const MAX_UPLOAD = 8 * 1024 * 1024;

let A = null;

function openAdd() {
  A = { step: 'sphere', texts: {}, daysAgo: 0 };
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!openAdd.bound) {
    $('#sheet').addEventListener('click', onAddClick);
    $('#sheet').addEventListener('input', onAddInput);
    $('#sheet').addEventListener('change', ev => {
      if (!A) return;
      if (ev.target.matches('input[type=file]')) return onFile(ev.target);
      if (ev.target.matches('input[data-libcheck]')) {
        A.toLibrary = ev.target.checked;
        if (A.toLibrary && A.libTitle == null) A.libTitle = suggestTitle(curType());
        renderAdd();
      }
    });
    openAdd.bound = true;
  }
  if (tg && tg.BackButton && tg.isVersionAtLeast('6.1')) { tg.BackButton.onClick(backAdd); tg.BackButton.show(); }
  renderAdd();
}

function closeAdd() {
  const saved = A && A.saved;
  A = null;
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
  if (tg && tg.BackButton && tg.isVersionAtLeast('6.1')) { tg.BackButton.offClick(backAdd); tg.BackButton.hide(); }
  if (saved) afterSave();
}

function backAdd() {
  if (!A) return;
  if (A.step === 'form') A.step = 'type';
  else if (A.step === 'type') A.step = A.sphere === 'religion' ? 'section' : 'sphere';
  else if (A.step === 'section') A.step = 'sphere';
  else return closeAdd();
  A.error = '';
  renderAdd();
}

function typesFor() {
  const seen = new Set();
  return S.boot.types.filter(t => {
    if (t.sphere !== A.sphere || seen.has(t.type)) return false;
    if (t.sections.length && t.sections.indexOf(A.section) < 0) return false;
    seen.add(t.type);
    return true;
  });
}
function curType() { return typesFor().find(t => t.type === A.type); }
function sectionOf(key) { return S.boot.sections.find(s => s.key === key); }

function amountOf(t) { return t.fixedAmount || Number(A.amount) || 0; }
function rateText(t) {
  if (t.unit === 'штука') return fmt(t.rate) + ' XP';
  return fmt(t.rate) + ' XP ' + (UNIT_RATE[t.unit] || 'за единицу');
}

// ---------- отрисовка ----------

function renderAdd() {
  const view = { sphere: stepSphere, section: stepSection, type: stepType, form: stepForm, done: stepDone }[A.step];
  const top = A.step === 'sphere' || A.step === 'done' ? 'Закрыть' : '‹ Назад';
  $('#sheet').innerHTML = `<div class="screen">
      <button class="link-btn" data-a="back">${top}</button>
      ${A.step === 'done' ? '' : stepsBar()}
      ${view()}
    </div>
    ${A.step === 'form' ? saveBar() : ''}`;
  $('#sheet').scrollTop = 0;
}

function stepsBar() {
  const order = A.sphere === 'sport' ? ['sphere', 'type', 'form'] : ['sphere', 'section', 'type', 'form'];
  const at = order.indexOf(A.step);
  const crumbs = [];
  if (A.sphere) crumbs.push(A.sphere === 'sport' ? 'Спорт' : 'Религия');
  if (A.section && A.step !== 'section') crumbs.push(sectionOf(A.section).label);
  if (A.type && A.step === 'form') crumbs.push(curType().label);
  return `<div class="steps">${order.map((s, i) => `<i class="${i <= at ? 'on' : ''}"></i>`).join('')}</div>
    <div class="crumbs">${esc(A.step === 'sphere' ? '' : crumbs.join(' › '))}</div>`;
}

function stepSphere() {
  return `<h1>Что отметить?</h1>
    <p class="sub">За сегодня или до трёх дней назад.</p>
    <div class="tiles">
      <button class="tile big faith" data-a="sphere" data-v="religion"><span class="e">🕌</span>
        <span><span class="t">Религия</span><br><span class="d">знание и труд</span></span></button>
      <button class="tile big sport" data-a="sphere" data-v="sport"><span class="e">🏃</span>
        <span><span class="t">Спорт</span><br><span class="d">минуты занятия</span></span></button>
    </div>`;
}

function stepSection() {
  const pub = S.boot.sections.filter(s => !s.private), priv = S.boot.sections.filter(s => s.private);
  const tile = s => `<button class="tile faith" data-a="section" data-v="${s.key}">
      <span class="t">${esc(s.label)}${s.private ? ' 🔒' : ''}</span><span class="d">${esc(SECTION_HINTS[s.key] || '')}</span></button>`;
  return `<h1>Раздел</h1>
    <div class="tiles">${pub.map(tile).join('')}</div>
    ${priv.length ? `<h2>Только для вас</h2><div class="tiles">${priv.map(tile).join('')}</div>
      <p class="muted small" style="margin:8px 4px">Коран никто, кроме вас, не видит.</p>` : ''}`;
}

function stepType() {
  const list = typesFor();
  return `<h1>${A.sphere === 'sport' ? 'Какое занятие?' : 'Что сделали?'}</h1>
    ${A.sphere === 'sport' ? '<p class="sub">Считаются только минуты самого занятия — без разминки, перерывов и дороги.</p>' : ''}
    <div class="card tight">${list.map(t => `
      <button class="list-item" style="width:100%;border:0;background:none;text-align:left" data-a="type" data-v="${t.type}">
        <span class="grow"><span class="title">${esc(t.label)}</span><br>
          <span class="note">${rateText(t)}${t.check ? ' · после проверки' : ''}</span></span>
        <span class="muted">›</span>
      </button>`).join('')}</div>
    ${A.sphere === 'sport' ? `<button class="btn ghost" data-a="other">Моего вида спорта нет</button>` : ''}`;
}

function field(label, hint, optional, inner) {
  return `<div class="field"><div class="label">${esc(label)}${optional ? ' <span class="muted small">· можно пропустить</span>' : ''}</div>
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}${inner}</div>`;
}

// Галочка «положить в общую базу» под артефактом. Видна, только когда файл или
// ссылка уже есть и вид записи вообще кладётся в базу (§12).
function libraryKindOf(type) {
  const map = S.boot.library && S.boot.library.fromType;
  return map ? map[type] || '' : '';
}

function suggestTitle(t) {
  const first = t.texts.length ? String(A.texts[t.texts[0].key] || '').trim() : '';
  return (first.split(/\s+—\s+/)[0] || t.label).slice(0, 120);
}

function toLibraryBox(t) {
  if (!libraryKindOf(t.type)) return '';
  const off = !A.link;
  return `<label class="check ${off ? 'off' : ''}">
      <input type="checkbox" data-libcheck ${A.toLibrary && !off ? 'checked' : ''} ${off ? 'disabled' : ''}>
      <span>Положить в общую базу знаний <span class="muted small">· ${off ? 'когда будет файл или ссылка' : '+' + fmt(S.boot.library.rate) + ' XP'}</span></span>
    </label>
    ${A.toLibrary && !off ? `<input class="input" data-f="libtitle" maxlength="120" placeholder="Название для базы"
      value="${esc(A.libTitle != null ? A.libTitle : suggestTitle(t))}">` : ''}`;
}

// Ссылку вводят без перерисовки формы, поэтому галочку включаем и гасим руками.
function syncLibraryBox() {
  const box = $('[data-libcheck]');
  if (!box) return;
  const off = !A.link;
  box.disabled = off;
  if (off) { box.checked = false; A.toLibrary = false; }
  box.closest('.check').classList.toggle('off', off);
  const hint = box.parentElement.querySelector('.muted');
  if (hint) hint.textContent = off ? '· когда будет файл или ссылка' : '· +' + fmt(S.boot.library.rate) + ' XP';
}

function stepForm() {
  const t = curType();
  const parts = [`<h1>${esc(t.label)}</h1>`];

  if (!t.fixedAmount) {
    parts.push(field(t.ask.text, t.ask.hint, false,
      `<input class="input amount num" data-f="amount" type="number" inputmode="numeric" min="1" max="${t.maxAmount}" value="${esc(A.amount || '')}" placeholder="0">
       ${t.quick ? `<div class="chips" style="margin-top:8px">${t.quick.map(n =>
         `<button class="chip ${Number(A.amount) === n ? 'on' : ''}" data-a="quick" data-v="${n}">${n}</button>`).join('')}</div>` : ''}`));
  }

  t.texts.forEach(x => parts.push(field(x.text, x.hint, x.optional,
    `<textarea class="input" data-f="text:${x.key}" maxlength="500" rows="3">${esc(A.texts[x.key] || '')}</textarea>`)));

  if (t.artifact) {
    let inner;
    if (A.uploading) inner = '<div class="file-box"><span class="grow">Загружаю…</span></div>';
    else if (A.link) inner = `<div class="file-box"><span>📎</span><span class="grow">${esc(A.fileName || A.link)}</span>
        <button class="link-btn" data-a="unlink">Убрать</button></div>`;
    else inner = `<label class="btn secondary">📷 Фото или PDF
          <input type="file" accept="image/*,application/pdf" hidden></label>
        <div class="or">или ссылкой</div>
        <input class="input" data-f="link" type="url" inputmode="url" placeholder="https://…" value="${esc(A.link || '')}">`;
    parts.push(field(t.artifactPrompt, '', t.artifact === 'optional', inner + toLibraryBox(t)));
  }

  if (t.check === 'hadith') {
    const others = S.boot.users.filter(u => u.id !== S.boot.me.id);
    parts.push(field('Кто проверил устно?', 'Он получит в боте кнопку «Подтверждаю».', false,
      `<div class="chips">${others.map(u => `<button class="chip ${A.verifier === u.id ? 'on' : ''}" data-a="verifier" data-v="${u.id}">${esc(u.name)}</button>`).join('')}</div>`));
  }

  const days = ['Сегодня', 'Вчера', '2 дня назад', '3 дня назад'];
  parts.push(field('Когда это было?', '', false,
    `<div class="chips">${days.map((d, i) => `<button class="chip ${A.daysAgo === i ? 'on' : ''}" data-a="day" data-v="${i}">${d}</button>`).join('')}</div>`));

  if (t.check === 'book') parts.push('<div class="warn">XP начислятся после теста на пятничной встрече: 10 вопросов, проходной балл 7.</div>');
  return parts.join('');
}

function saveBar() {
  const t = curType();
  const xp = amountOf(t) * t.rate;
  return `<div class="savebar"><div class="inner">
    ${A.error ? `<div class="error">${esc(A.error)}</div>` : ''}
    <div class="preview"><span>${t.check ? 'После проверки' : 'Будет начислено'}</span><b class="num" id="xp-preview">${fmt(xp)} XP</b></div>
    <button class="btn" data-a="save" ${A.saving || A.uploading ? 'disabled' : ''}>${A.saving ? 'Сохраняю…' : 'Сохранить'}</button>
  </div></div>`;
}

function stepDone() {
  const r = A.result, e = r.event;
  const head = [e.sphere === 'sport' ? e.label : e.sectionLabel + ' · ' + e.label, e.amountText, dateLabel(e.date)].filter(Boolean).join(' · ');
  let body;
  if (e.status === 'pending') {
    const v = S.boot.users.find(u => u.id === e.verifiedBy);
    body = e.type === 'book_done'
      ? `<div class="done wait"><div class="mark">📚</div><h1>Книга ждёт теста</h1>
          <p class="sub">${esc(head)}</p><p>На пятничной встрече — тест. После сдачи +${fmt(e.xp)} XP.</p></div>`
      : `<div class="done wait"><div class="mark">⏳</div><h1>Отправлено на проверку</h1>
          <p class="sub">${esc(head)}</p><p>${esc(v ? v.name : 'Проверяющий')} получит уведомление в боте. +${fmt(e.xp)} XP после подтверждения.</p></div>`;
  } else {
    body = `<div class="done"><div class="mark">✅</div><div class="xp num">+${fmt(e.xp)} XP</div><p class="sub">${esc(head)}</p></div>`;
    if (r.section) {
      const s = r.section;
      body += `<div class="card faith"><div class="card-head"><b>${esc(s.label)}${s.private ? ' 🔒' : ''}</b><span class="right level num" style="font-size:20px">ур. ${s.level}</span></div>
        ${progress(s.xp, s.next, 'faith')}</div>`;
    }
    if (r.week) {
      body += `<div class="card sport"><div class="card-head"><b>Неделя</b><span class="right num"><b>${fmt(r.week.total)}</b> XP</span></div>
        <div class="bar"><i style="width:${pct(r.week.capped, S.boot.sport.WEEK_CAP)}%"></i></div>
        <div class="meta"><span>${bonusText(r.week)}</span><span class="num">потолок ${fmt(S.boot.sport.WEEK_CAP)}</span></div></div>`;
    }
    body += r.warnings.map(w => `<div class="warn">${esc(w)}</div>`).join('');
  }
  if (A.inLibrary) {
    body += `<div class="card lib-item"><div class="card-head"><span class="q-icon">${A.inLibrary.icon}</span>
      <div class="grow"><b>${esc(A.inLibrary.title)}</b><div class="muted small">положено в базу знаний · +${fmt(S.boot.library.rate)} XP</div></div></div></div>`;
  } else if (A.toLibrary) {
    body += '<div class="warn">В базу не положено: такой материал там уже есть.</div>';
  }
  return body + `<div class="btn-row"><button class="btn secondary" data-a="again">Ещё запись</button><button class="btn" data-a="close">Готово</button></div>`;
}

// ---------- действия ----------

function onAddClick(ev) {
  const el = ev.target.closest('[data-a]');
  if (!el || !A) return;
  const v = el.dataset.v;
  switch (el.dataset.a) {
    case 'back': return backAdd();
    case 'close': return closeAdd();
    case 'sphere': A.sphere = v; A.section = ''; A.step = v === 'religion' ? 'section' : 'type'; break;
    case 'section': A.section = v; A.step = 'type'; break;
    case 'type':
      Object.assign(A, { type: v, step: 'form', amount: '', texts: {}, link: '', fileName: '', verifier: '',
                         error: '', toLibrary: false, libTitle: null, inLibrary: null });
      break;
    case 'other':
      return toast('Новый вид спорта добавляется строкой в лист rules: назовите занятие кругу и вместе подберите коэффициент.');
    case 'quick': A.amount = v; break;
    case 'verifier': A.verifier = v; break;
    case 'day': A.daysAgo = Number(v); break;
    case 'unlink': A.link = ''; A.fileName = ''; A.toLibrary = false; break;
    case 'save': return saveAdd();
    case 'again': {
      const sphere = A.sphere, section = A.section;
      A = { step: 'type', sphere: sphere, section: section, texts: {}, daysAgo: 0, saved: true };
      break;
    }
    default: return;
  }
  renderAdd();
}

// Ввод не перерисовывает форму (иначе пропадёт фокус) — только цифру XP внизу.
function onAddInput(ev) {
  const f = ev.target.dataset && ev.target.dataset.f;
  if (!f || !A) return;
  if (f === 'amount') {
    A.amount = ev.target.value;
    document.querySelectorAll('[data-a="quick"]').forEach(c => c.classList.toggle('on', Number(c.dataset.v) === Number(A.amount)));
  } else if (f === 'link') {
    A.link = ev.target.value.trim();
    A.fileName = '';
    syncLibraryBox();
    return; // поле со ссылкой исчезло бы при перерисовке, оставляем как есть
  } else if (f === 'libtitle') {
    A.libTitle = ev.target.value;
    return;
  } else if (f.indexOf('text:') === 0) {
    A.texts[f.slice(5)] = ev.target.value;
  }
  const t = curType(), out = $('#xp-preview');
  if (t && out) out.textContent = fmt(amountOf(t) * t.rate) + ' XP';
}

function validate() {
  const t = curType();
  if (!t.fixedAmount) {
    const n = Number(A.amount);
    if (!(n >= 1) || Math.round(n) !== n) return 'Укажите целое число больше нуля.';
    if (n > t.maxAmount) return 'Больше ' + t.maxAmount + ' за одну запись нельзя — разбейте на несколько.';
    if (t.minMinutes && n < t.minMinutes) return 'Меньше ' + t.minMinutes + ' минут не засчитывается.';
  }
  for (const x of t.texts) if (!x.optional && !String(A.texts[x.key] || '').trim()) return 'Заполните: ' + x.text;
  if (t.artifact === 'required' && !A.link) return t.artifactPrompt;
  if (A.link && !/^https?:\/\//.test(A.link)) return 'Ссылка должна начинаться с https://';
  if (t.check === 'hadith' && !A.verifier) return 'Выберите, кто проверил хадис.';
  return '';
}

async function saveAdd() {
  A.error = validate();
  if (A.error) { haptic('error'); return renderAdd(); }
  A.saving = true;
  renderAdd();
  try {
    const r = await api('add', {
      sphere: A.sphere, section: A.section, type: A.type, amount: Number(A.amount) || 0,
      texts: A.texts, link: A.link, verifier: A.verifier, daysAgo: A.daysAgo,
      toLibrary: !!A.toLibrary, libraryTitle: A.toLibrary ? (A.libTitle || suggestTitle(curType())) : ''
    });
    A.result = r.saved;
    A.inLibrary = r.library || null;
    A.saved = true;
    A.step = 'done';
    haptic('success');
  } catch (e) {
    A.error = e.message;
    haptic('error');
  }
  A.saving = false;
  if (A) renderAdd();
}

// ---------- файлы ----------

async function onFile(input) {
  const file = input.files && input.files[0];
  if (!file || !A) return;
  A.uploading = true;
  A.error = '';
  renderAdd();
  try {
    let blob = file, mime = file.type, name = file.name || 'файл';
    if (/^image\//.test(file.type)) {
      try {
        blob = await shrinkImage(file);
        mime = 'image/jpeg';
        name = name.replace(/\.[^.]+$/, '') + '.jpg';
      } catch (e) { /* не удалось разжать — отправляем как есть */ }
    } else if (file.type !== 'application/pdf') {
      throw new Error('Можно фото или PDF.');
    }
    if (blob.size > MAX_UPLOAD) throw new Error('Файл больше 8 МБ. Сожмите или пришлите ссылку.');
    const r = await api('upload', { name: name, mime: mime, base64: await toBase64(blob) });
    if (!A) return;
    A.link = r.link;
    A.fileName = name;
  } catch (e) {
    if (A) A.error = e.message;
  }
  if (!A) return;
  A.uploading = false;
  renderAdd();
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    r.readAsDataURL(blob);
  });
}
