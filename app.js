// Благо — мини-приложение в Телеграме. Экраны: главная, круг, проверки, профиль.
// Запись сделанного — в add.js. Все данные и расчёты — на сервере (Apps Script).

const WebApp = window.Telegram && window.Telegram.WebApp;
const tg = WebApp && WebApp.initData ? WebApp : null;
const S = { boot: null, me: null, week: null, weekOffset: 0, checks: null, tab: 'home', retry: null, circleMode: 'week', monthYm: null };

// ---------- сервер ----------

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function api(action, data) {
  const body = JSON.stringify({ initData: tg ? tg.initData : '', action: action, data: data || {} });
  let res;
  try {
    if (window.BLAGO_TRANSPORT) {
      res = await window.BLAGO_TRANSPORT(body);
    } else {
      const r = await fetch(window.BLAGO_API + '?api=1', { method: 'POST', body: body });
      res = await r.json();
    }
  } catch (e) {
    throw new ApiError('network', 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  if (!res || !res.ok) throw new ApiError(res && res.error, (res && res.message) || 'Ошибка сервера.');
  return res;
}

// ---------- мелочи ----------

const $ = sel => document.querySelector(sel);
const screen = () => $('#screen');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const DAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(n) {
  const r = Math.round((Number(n) || 0) * 10) / 10;
  const int = Math.floor(Math.abs(r)), frac = Math.round((Math.abs(r) - int) * 10);
  return (r < 0 ? '−' : '') + String(int).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac ? ',' + frac : '');
}
function plural(n, one, few, many) {
  const a = Math.abs(Math.floor(n)) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
}
function pct(part, whole) { return whole > 0 ? Math.max(0, Math.min(100, Math.round(part / whole * 100))) : 0; }

function ymdUtc(ymd) { const p = ymd.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function ymdAdd(ymd, n) { return new Date(ymdUtc(ymd) + n * 86400000).toISOString().slice(0, 10); }
function ymdParts(ymd) { const d = new Date(ymdUtc(ymd)); return { d: d.getUTCDate(), m: d.getUTCMonth(), wd: d.getUTCDay() }; }

function dateLabel(ymd) {
  const diff = Math.round((ymdUtc(S.boot.today) - ymdUtc(ymd)) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff === 2) return 'позавчера';
  const p = ymdParts(ymd);
  return p.d + ' ' + MONTHS_SHORT[p.m];
}
function rangeLabel(monday, upto) {
  const a = ymdParts(monday), b = ymdParts(ymdAdd(monday, upto));
  return a.m === b.m ? a.d + '–' + b.d + ' ' + MONTHS[a.m] : a.d + ' ' + MONTHS_SHORT[a.m] + ' – ' + b.d + ' ' + MONTHS_SHORT[b.m];
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
}
function haptic(kind) {
  try { if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(kind); } catch (e) { /* старый клиент */ }
}
function askConfirm(text) {
  return new Promise(resolve => {
    if (tg && tg.showConfirm && tg.isVersionAtLeast && tg.isVersionAtLeast('6.2')) tg.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });
}
function skeleton(n) { return '<div class="skeleton"></div>'.repeat(n); }

function fatal(icon, title, text, retry) {
  $('#tabbar').hidden = true;
  screen().classList.add('no-tabs');
  screen().innerHTML = `<div class="empty" style="padding-top:18vh"><div class="big">${icon}</div>
    <h1>${esc(title)}</h1><p class="sub">${esc(text)}</p>
    ${retry ? '<button class="btn" data-act="reload">Попробовать ещё раз</button>' : ''}</div>`;
}
function showError(e, retry) {
  S.retry = retry;
  screen().innerHTML = `<div class="card empty"><div class="big">⚠️</div><p>${esc(e.message)}</p>
    <button class="btn secondary" data-act="retry">Повторить</button></div>`;
}
function updateBadge(n) {
  const b = $('#checks-badge');
  b.textContent = n;
  b.hidden = !n;
}

// ---------- запуск и навигация ----------

async function start() {
  if (WebApp) {
    try {
      WebApp.ready();
      WebApp.expand();
      if (WebApp.isVersionAtLeast && WebApp.isVersionAtLeast('7.7')) WebApp.disableVerticalSwipes();
    } catch (e) { /* не в Телеграме или старый клиент */ }
    if (tg) {
      document.documentElement.classList.add('tg');
      const syncTheme = () => document.documentElement.classList.toggle('tg-dark', WebApp.colorScheme === 'dark');
      syncTheme();
      WebApp.onEvent('themeChanged', syncTheme);
    }
  }
  screen().addEventListener('click', onScreenClick);
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'add') openAdd(); else go(b.dataset.tab);
  }));

  if (!tg) return fatal('📱', 'Откройте в Телеграме', 'Приложение работает внутри Телеграма: кнопка «Благо» в чате с ботом.');
  if (!window.BLAGO_API && !window.BLAGO_TRANSPORT) return fatal('⚙️', 'Не указан адрес сервера', 'Впишите адрес веб-приложения Apps Script в config.js.');

  screen().innerHTML = skeleton(3);
  try {
    S.boot = await api('boot');
  } catch (e) {
    if (e.code === 'not_member') return fatal('🤝', 'Вы ещё не в круге', e.message);
    if (e.code === 'auth') return fatal('🔒', 'Не удалось войти', e.message);
    return fatal('⚠️', 'Сервер не ответил', e.message, true);
  }
  $('#tabbar').hidden = false;
  go('home');
}

function go(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  ({ home: showHome, circle: showCircle, checks: showChecks, me: showMe })[tab]();
}

function onScreenClick(ev) {
  const el = ev.target.closest('[data-go],[data-act],[data-del],[data-verdict],[data-week],[data-mode],[data-month]');
  if (!el) return;
  if (el.dataset.go) return go(el.dataset.go);
  if (el.dataset.mode) { S.circleMode = el.dataset.mode; return showCircle(); }
  if (el.dataset.month) { S.monthYm = el.dataset.month; return showCircle(); }
  if (el.dataset.del) return removeEntry(Number(el.dataset.del));
  if (el.dataset.verdict) return verdict(Number(el.dataset.id), el.dataset.verdict, el);
  if (el.dataset.week) { S.weekOffset = Math.min(0, S.weekOffset + Number(el.dataset.week)); return showCircle(); }
  if (el.dataset.act === 'add') return openAdd();
  if (el.dataset.act === 'quest') return openQuest();
  if (el.dataset.act === 'library') return openLibrary();
  if (el.dataset.act === 'retry' && S.retry) return S.retry();
  if (el.dataset.act === 'reload') return location.reload();
}

// Вызывается из add.js после записи: данные устарели, текущий экран перерисовывается.
function afterSave() {
  S.me = null;
  go(S.tab);
}

// ---------- общие куски ----------

function progress(xp, next, cls) {
  if (next == null) return `<div class="bar ${cls}"><i style="width:100%"></i></div><div class="meta"><span class="num">${fmt(xp)} XP</span><span>максимальный уровень</span></div>`;
  return `<div class="bar ${cls}"><i style="width:${pct(xp, next)}%"></i></div>
    <div class="meta"><span class="num">${fmt(xp)} / ${fmt(next)}</span><span>ещё ${fmt(Math.max(0, next - xp))} до следующего</span></div>`;
}

function statusMark(e) {
  if (e.status === 'pending') return '<span class="muted small">⏳ ждёт</span>';
  if (e.status === 'rejected') return '<span class="muted small">не сдан</span>';
  return `<b class="num">+${fmt(e.xp)}</b>`;
}

function historyList(items, withDelete) {
  if (!items.length) return '<div class="card empty"><div class="big">🌱</div>Записей пока нет. Начните с «＋».</div>';
  return '<div class="card tight">' + items.map(e => `
    <div class="list-item">
      <div class="grow">
        <div class="title">${esc(e.sphere === 'sport' ? e.label : e.sectionLabel)}${e.private ? ' <span class="lock">🔒</span>' : ''}</div>
        <div class="note">${esc([e.sphere === 'sport' ? '' : e.label, e.amountText, dateLabel(e.date)].filter(Boolean).join(' · '))}${e.note ? ' — ' + esc(e.note) : ''}</div>
      </div>
      <div class="right">${statusMark(e)}${withDelete && e.canDelete ? `<br><button class="del-btn" data-del="${e.id}">Удалить</button>` : ''}</div>
    </div>`).join('') + '</div>';
}

function bonusText(w) {
  const need = S.boot.sport.BONUS_DAYS;
  if (w.bonus) return `бонус +${w.bonus} за ${w.activeDays} ${plural(w.activeDays, 'день', 'дня', 'дней')}`;
  return `${w.activeDays} из ${need} дней до бонуса +${S.boot.sport.BONUS_XP}`;
}

function daysRow(monday) {
  const active = new Set(S.me.history.filter(e => e.sphere === 'sport' && e.status === 'ok').map(e => e.date));
  return '<div class="days">' + DAY_SHORT.map((d, i) => {
    const ymd = ymdAdd(monday, i);
    return `<span class="${active.has(ymd) ? 'on' : ''} ${ymd === S.boot.today ? 'today' : ''}">${d}</span>`;
  }).join('') + '</div>';
}

// ---------- главная ----------

async function showHome() {
  if (S.me) renderHome(); else screen().innerHTML = homeHeader() + skeleton(2);
  try {
    const both = await Promise.all([api('me'), api('quest')]);
    S.me = both[0];
    S.quest = both[1];
  } catch (e) { if (S.tab === 'home') showError(e, showHome); return; }
  updateBadge(S.me.toCheck);
  if (S.tab === 'home') renderHome();
}

function homeHeader() {
  const p = ymdParts(S.boot.today);
  return `<h1>Ас-саляму алейкум, ${esc(S.boot.me.name)}</h1><p class="sub">${WEEKDAYS[p.wd]}, ${p.d} ${MONTHS[p.m]}</p>`;
}

function renderHome() {
  const me = S.me, rel = me.religion, sp = me.sport, w = sp.week, cap = S.boot.sport.WEEK_CAP;
  screen().innerHTML = `
    ${homeHeader()}
    <button class="btn hero-add" data-act="add">＋ Отметить сделанное</button>
    ${me.toCheck ? `<button class="pill-link" data-go="checks">⏳ <span>Ждут вашей проверки</span><span class="count">${me.toCheck}</span></button>` : ''}
    ${questCard(S.quest)}
    ${libraryCard(me.library)}

    <h2>Религия</h2>
    <div class="card faith" data-go="me">
      <div class="card-head">
        <div class="sphere-icon">🕌</div>
        <div><div class="muted small">уровень сферы</div><div class="level num">${rel.level}<small>/10</small></div></div>
        <div class="right"><b class="num">${fmt(rel.total)}</b><div class="muted small">XP всего</div></div>
      </div>
      ${progress(rel.total, rel.next, 'faith')}
      ${rel.weak ? `<div class="weak">Слабое место: <b>${esc(rel.weak.label.toLowerCase())}</b>, ур. ${rel.weak.level}</div>` : ''}
    </div>

    <h2>Спорт · эта неделя</h2>
    <div class="card sport" data-go="me">
      <div class="card-head">
        <div class="sphere-icon">🏃</div>
        <div><div class="muted small">уровень</div><div class="level num">${sp.level}<small>/10</small></div></div>
        <div class="right"><b class="num">${fmt(w.total)}</b><div class="muted small">XP за неделю</div></div>
      </div>
      <div class="bar"><i style="width:${pct(w.capped, cap)}%"></i></div>
      <div class="meta"><span>${bonusText(w)}</span><span class="num">потолок ${fmt(cap)}</span></div>
      ${daysRow(w.monday)}
    </div>

    <h2>Последние записи</h2>
    ${historyList(me.history.slice(0, 5), false)}`;
}

// ---------- круг ----------

function segment() {
  return `<div class="segment">
    <button class="${S.circleMode === 'week' ? 'on' : ''}" data-mode="week">Неделя</button>
    <button class="${S.circleMode === 'month' ? 'on' : ''}" data-mode="month">Месяц и номинации</button>
  </div>`;
}

async function showCircle() {
  S.tab = 'circle';
  if (S.circleMode === 'month') return showMonth();
  screen().innerHTML = segment() + weekNav(null) + skeleton(2);
  let w;
  try { w = await api('week', { offset: S.weekOffset }); } catch (e) { if (S.tab === 'circle') showError(e, showCircle); return; }
  if (S.tab !== 'circle') return;
  S.week = w;
  renderCircle();
}

function weekNav(w) {
  const label = w ? `<b>Неделя ${w.week}</b><div class="muted small">${rangeLabel(w.monday, w.upto)}</div>` : '<b>Неделя</b><div class="muted small">…</div>';
  return `<div class="week-nav">
    <button class="icon-btn" data-week="-1" aria-label="Предыдущая неделя">‹</button>
    <div class="label">${label}</div>
    <button class="icon-btn" data-week="1" aria-label="Следующая неделя" ${S.weekOffset >= 0 ? 'disabled' : ''}>›</button>
  </div>`;
}

// Два рейтинга (§6 регламента): знание — XP религии без Корана с бонусами ивентов
// и базы знаний, спорт — дни с занятиями. При нуле места нет.
const MEDALS = ['🥇', '🥈', '🥉'];
function rankingCard(r, title) {
  const list = (items, show) => items.map(x => `<div class="rank-row ${x.id === S.boot.me.id ? 'mine' : ''}">
      <span class="place">${x.value > 0 ? (MEDALS[x.place - 1] || x.place) : '—'}</span>
      <span class="grow">${esc(x.name)}</span>
      <span class="num muted small">${show(x.value)}</span></div>`).join('');
  return `<h2>${esc(title)}</h2>
    <div class="rank-grid">
      <div class="card"><div class="rank-head">📚 Знание</div>${list(r.knowledge, v => fmt(v) + ' XP')}</div>
      <div class="card"><div class="rank-head">🏃 Спорт</div>${list(r.sport, v => v + ' ' + plural(v, 'день', 'дня', 'дней'))}</div>
    </div>`;
}

function shortSport(label) {
  const w = label.split(/[\s,]+/)[0];
  return w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase();
}

function personRow(r) {
  const sport = [...new Set(r.sportTypes.map(t => shortSport(t.label)))];
  return `<div class="person">
    <div class="card-head">
      <span class="name">${esc(r.name)}${r.id === S.boot.me.id ? ' <span class="muted small">· вы</span>' : ''}</span>
      <span class="right total num">${fmt(r.total)} <span class="muted small">XP</span></span>
    </div>
    ${r.total ? `<div class="split"><i class="f" style="width:${pct(r.religion, r.total)}%"></i><i class="s" style="width:${pct(r.sport, r.total)}%"></i></div>`
              : '<div class="muted small" style="margin:4px 0">пока без записей</div>'}
    <div class="tags">
      ${r.sections.map(s => `<span class="tag f">${esc(s.label.toLowerCase())}${s.key === 'hadith' && r.hadith ? ' · ' + r.hadith : ''}</span>`).join('')}
      ${sport.map(t => `<span class="tag s">${esc(t)}</span>`).join('')}
      ${r.bonus ? `<span class="tag s">бонус +${r.bonus}</span>` : ''}
      ${r.quest ? `<span class="tag q">🎯 ${r.quest.complete ? '✓ +' + fmt(r.quest.xp) : r.quest.done + '/' + r.quest.total}</span>` : ''}
      ${r.library ? `<span class="tag f">📚 +${fmt(r.library)}</span>` : ''}
    </div>
  </div>`;
}

function renderCircle() {
  const w = S.week;
  const delta = w.prevPot > 0 ? Math.round((w.pot - w.prevPot) / w.prevPot * 100) : null;
  const privateNote = S.boot.privateInPot ? '' : ' Чтение и заучивание Корана сюда не входят.';
  screen().innerHTML = `
    ${segment()}
    ${weekNav(w)}
    <div class="card pot">
      <div class="muted small">Общий котёл круга</div>
      <div class="value num">${fmt(w.pot)} <span class="muted small">XP</span></div>
      ${delta === null ? '<div class="muted small">с прошлой неделей сравнить не с чем</div>'
        : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'}${Math.abs(delta)}% к прошлой${w.upto < 6 ? ' на этот день' : ''}</span>`}
    </div>
    ${rankingCard(w.ranking, 'Рейтинг недели' + (w.upto < 6 ? ' · пока' : ''))}
    <h2>Кто что делал</h2>
    <div class="card tight">${w.rows.map(personRow).join('')}</div>
    <p class="muted small" style="margin:8px 4px">Знание и спорт считаются отдельно, спорт — днями, а не нагрузкой.${privateNote}</p>
    ${w.pending.length ? `<h2>Ждёт проверки</h2><div class="card tight">${w.pending.map(p => `
      <div class="list-item"><div class="grow"><div class="title">${p.kind === 'book' ? '📚 Тест по книге' : '📜 Хадис'}</div>
      <div class="note">${esc(p.name)} · ${esc(p.sectionLabel)}</div></div></div>`).join('')}</div>` : ''}`;
}

// ---------- месяц и номинации ----------

async function showMonth() {
  screen().innerHTML = segment() + skeleton(3);
  let m;
  try { m = await api('month', S.monthYm ? { ym: S.monthYm } : {}); } catch (e) { if (S.tab === 'circle') showError(e, showCircle); return; }
  if (S.tab !== 'circle' || S.circleMode !== 'month') return;
  S.monthYm = m.ym;
  renderMonth(m);
}

function winnersLine(a) {
  if (!a.winners.length) return '<span class="muted small">пока без победителя</span>';
  const names = a.winners.map(w => esc(w.name) + (w.id === S.boot.me.id ? ' <span class="muted small">(вы)</span>' : '')).join(', ');
  return `<b>${names}</b><span class="muted small num">${esc(a.valueText)}</span>`;
}

function isMine(a) { return a.winners.some(w => w.id === S.boot.me.id); }

function renderMonth(m) {
  const delta = m.prevPot > 0 ? Math.round((m.pot - m.prevPot) / m.prevPot * 100) : null;
  const sections = m.awards.filter(a => a.key === 'section_best');
  const others = m.awards.filter(a => a.key !== 'section_best');
  const status = m.current ? 'итоги — ' + dateLabelLong(m.resultsDate) : (m.saved ? 'итоги подведены' : 'месяц закончился');
  const sectionPrize = sections.length && sections[0].prize ? `<div class="prize">🎁 ${esc(sections[0].prize)}</div>` : '';

  screen().innerHTML = `
    ${segment()}
    <div class="week-nav">
      <button class="icon-btn" ${m.prev ? `data-month="${m.prev}"` : 'disabled'} aria-label="Прошлый месяц">‹</button>
      <div class="label"><b>${esc(m.label)}</b><div class="muted small">${esc(status)}</div></div>
      <button class="icon-btn" ${m.next ? `data-month="${m.next}"` : 'disabled'} aria-label="Следующий месяц">›</button>
    </div>
    <div class="card pot">
      <div class="muted small">Котёл месяца</div>
      <div class="value num">${fmt(m.pot)} <span class="muted small">XP</span></div>
      ${delta === null ? '' : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'}${Math.abs(delta)}% к прошлому месяцу</span>`}
    </div>
    ${rankingCard(m.ranking, 'Рейтинг месяца' + (m.current ? ' · пока' : ''))}

    <h2>${m.current ? 'Номинации · пока впереди' : 'Номинации'}</h2>
    ${sections.length ? `<div class="card award">
      <div class="card-head"><span class="award-icon">📚</span><div class="grow"><b>Знатоки месяца</b>
        <div class="muted small">${esc(sections[0].description)}</div></div></div>
      ${sections.map(a => `<div class="award-row ${isMine(a) ? 'mine' : ''}"><span>${esc(a.title.replace(/^.*?:\s*/, ''))}</span><span class="right">${winnersLine(a)}</span></div>`).join('')}
      ${sectionPrize}
    </div>` : ''}
    ${others.map(a => `<div class="card award ${isMine(a) ? 'mine' : ''} ${a.winners.length ? '' : 'empty'}">
      <div class="card-head"><span class="award-icon">🏅</span><div class="grow"><b>${esc(a.title)}</b>
        <div class="muted small">${esc(a.description)}</div></div></div>
      <div class="award-win">${winnersLine(a)}</div>
      ${a.prize ? `<div class="prize">🎁 ${esc(a.prize)}</div>` : ''}
    </div>`).join('')}

    <h2>Кто сколько за месяц</h2>
    <div class="card tight">${m.rows.map(r => `<div class="person">
      <div class="card-head"><span class="name">${esc(r.name)}${r.id === S.boot.me.id ? ' <span class="muted small">· вы</span>' : ''}</span>
        <span class="right total num">${fmt(r.total)} <span class="muted small">XP</span></span></div>
      ${r.total ? `<div class="split"><i class="f" style="width:${pct(r.religion + r.quest + r.library, r.total)}%"></i><i class="s" style="width:${pct(r.sport, r.total)}%"></i></div>` : ''}
      <div class="muted small">религия ${fmt(r.religion)} · спорт ${fmt(r.sport)}${r.quest ? ' · ивенты ' + fmt(r.quest) : ''}${r.library ? ' · база ' + fmt(r.library) : ''}</div>
    </div>`).join('')}</div>
    <p class="muted small" style="margin:8px 4px">Рейтинги — отдельно по знанию и по спорту (дни), Коран не участвует. Названия номинаций и призы меняются в листе nominations.</p>`;
}

function dateLabelLong(ymd) {
  const p = ymdParts(ymd);
  return p.d + ' ' + MONTHS[p.m];
}

// ---------- проверки ----------

async function showChecks() {
  screen().innerHTML = '<h1>Проверки</h1><p class="sub">Хадисы — устно, книги — тестом на пятничной встрече</p>' + skeleton(2);
  let c;
  try { c = await api('checks'); } catch (e) { if (S.tab === 'checks') showError(e, showChecks); return; }
  updateBadge(c.others.length);
  if (S.tab !== 'checks') return;
  S.checks = c;
  renderChecks();
}

function checkCard(x) {
  const book = x.kind === 'book';
  return `<div class="card check-card">
    <div class="kind">${book ? '📚 Книга закрыта — нужен тест' : '📜 Хадис — нужна устная проверка'}</div>
    <div class="card-head" style="margin-top:6px"><b>${esc(x.author)}</b>
      <span class="right muted small">${esc(x.sectionLabel)} · ${dateLabel(x.date)}</span></div>
    <div class="quote">${esc(x.note)}</div>
    <div class="muted small">${book ? '10 вопросов: 6 на понимание, 4 на детали. Проходной балл — 7.'
                                     : 'Матн без искажений, от кого передан, источник и номер.'}</div>
    <div class="btn-row">
      <button class="btn" data-verdict="ok" data-id="${x.id}">${book ? 'Сдал' : 'Подтверждаю'}</button>
      <button class="btn secondary" data-verdict="${book ? 're' : 'no'}" data-id="${x.id}">${book ? 'Пересдача' : 'Не сдал'}</button>
    </div>
  </div>`;
}

function renderChecks() {
  const c = S.checks;
  screen().innerHTML = `<h1>Проверки</h1><p class="sub">Хадисы — устно, книги — тестом на пятничной встрече</p>
    ${c.others.length ? c.others.map(checkCard).join('') : '<div class="card empty"><div class="big">✅</div>Сейчас проверять нечего.</div>'}
    ${c.mine.length ? '<h2>Ваши записи ждут</h2>' + historyList(c.mine, false) : ''}`;
}

async function verdict(id, decision, button) {
  const card = button.closest('.card');
  card.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    const r = await api('verify', { id: id, decision: decision });
    haptic('success');
    toast({ ok: 'Засчитано', rejected: 'Отмечено: пока не сдан', retake: 'Пересдача через неделю' }[r.result] || 'Готово');
  } catch (e) {
    haptic('error');
    toast(e.message);
  }
  S.me = null;
  showChecks();
}

// ---------- профиль ----------

async function showMe() {
  if (S.me) renderMe(); else screen().innerHTML = skeleton(3);
  try { S.me = await api('me'); } catch (e) { if (S.tab === 'me') showError(e, showMe); return; }
  updateBadge(S.me.toCheck);
  if (S.tab === 'me') renderMe();
}

function sectionRow(s) {
  return `<div class="list-item">
    <div class="grow">
      <div class="title">${esc(s.label)}${s.private ? ' <span class="lock">🔒</span>' : ''}</div>
      <div class="bar thin faith"><i style="width:${s.next ? pct(s.xp, s.next) : 100}%"></i></div>
      <div class="note num">${fmt(s.xp)}${s.next ? ' / ' + fmt(s.next) : ' · максимум'}</div>
    </div>
    <div class="level num" style="font-size:22px">${s.level}</div>
  </div>`;
}

function renderMe() {
  const me = S.me, rel = me.religion, sp = me.sport, w = sp.week;
  screen().innerHTML = `
    <h1>${esc(S.boot.me.name)}</h1>
    <p class="sub">Уровень показывает вложенный труд, и ничего больше.</p>

    <h2>Религия · ур. ${rel.level}</h2>
    <div class="card faith">
      ${progress(rel.total, rel.next, 'faith')}
      ${rel.weak ? `<div class="weak">Слабое место: <b>${esc(rel.weak.label.toLowerCase())}</b>, ур. ${rel.weak.level}</div>` : ''}
    </div>
    ${me.quest.launched ? `<div class="card">
      <div class="card-head"><div class="sphere-icon" style="background:var(--quest-soft)">🎯</div>
        <div class="grow"><b>Ивенты пятницы</b><div class="muted small">выполнено ${me.quest.completed} из ${me.quest.launched} · серия ${me.quest.streak}</div></div>
        <div class="right"><b class="num">+${fmt(me.quest.bonusXp)}</b><div class="muted small">XP бонусов</div></div></div>
      <div class="muted small" style="margin-top:8px">Бонусы входят в сумму сферы «Религия», но ни в один раздел.</div>
    </div>` : ''}
    ${me.library && me.library.total ? `<button class="card" data-act="library" style="width:100%;text-align:left">
      <div class="card-head"><div class="sphere-icon">📚</div>
        <div class="grow"><b>База знаний</b><div class="muted small">ваших ${me.library.mine} из ${me.library.total}</div></div>
        <div class="right"><b class="num">+${fmt(me.library.xp)}</b><div class="muted small">XP за базу</div></div></div>
      <div class="muted small" style="margin-top:8px">Тоже в сумме сферы, но не в разделе. Потолок ${fmt(me.library.week.cap)} XP в неделю.</div>
    </button>` : ''}
    <div class="card tight">${rel.sections.map(sectionRow).join('')}</div>
    <p class="muted small" style="margin:6px 4px">🔒 Коран видите только вы.${S.boot.privateInPot ? '' : ' В сводку круга и общий котёл он не попадает.'}</p>

    <h2>Спорт · ур. ${sp.level}</h2>
    <div class="card sport">
      <div class="muted small">в среднем за ${sp.weeks} ${plural(sp.weeks, 'неделю', 'недели', 'недель')}</div>
      <div class="level num">${fmt(Math.round(sp.avg))}<small> XP в неделю</small></div>
      ${progress(Math.round(sp.avg), sp.next, 'sport')}
      <div class="weak">Эта неделя: <b>${fmt(w.total)} XP</b> · ${bonusText(w)}</div>
      ${w.byType.length ? '<div class="tags" style="margin-top:8px">' + w.byType.map(t => `<span class="tag s">${esc(t.label.toLowerCase())} · ${fmt(t.xp)}</span>`).join('') + '</div>' : ''}
    </div>

    <h2>История</h2>
    ${historyList(me.history, true)}
    <p class="muted small" style="margin:6px 4px">Удалить можно запись моложе суток.</p>`;
}

async function removeEntry(id) {
  const e = S.me && S.me.history.find(x => x.id === id);
  const what = e ? (e.sphere === 'sport' ? e.label : e.sectionLabel + ' · ' + e.label) : 'запись';
  if (!(await askConfirm('Удалить запись «' + what + '»?'))) return;
  try {
    await api('remove', { id: id });
    haptic('success');
    toast('Удалено');
  } catch (err) {
    toast(err.message);
  }
  S.me = null;
  go(S.tab);
}
