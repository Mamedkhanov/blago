// Ивент пятницы: карточка на главной, список заданий, квиз, отчёт и спорт.
// Что засчитано и сколько XP — решает сервер; здесь только ввод и показ.

const QUEST_ICON = { quiz: '🧠', report: '📖', sport: '🏃' };
const QUEST_KIND = { quiz: 'Квиз', report: 'Задание с отчётом', sport: 'Спортивный вызов' };

let Q = null;

function weekdayDate(ymd) {
  const p = ymdParts(ymd);
  return WEEKDAYS[p.wd] + ', ' + p.d + ' ' + MONTHS[p.m];
}

// ---------- карточка на главной ----------

function questCard(qr) {
  if (!qr) return '';
  const cur = qr.current, st = qr.stats;
  const streak = st.streak ? ` · серия ${st.streak}` : '';
  if (cur && cur.open) {
    return `<h2>Ивент пятницы · до 23:59</h2>
      <button class="card quest-card" data-act="quest">
        <div class="card-head">
          <div class="sphere-icon">🎯</div>
          <div><div class="muted small">выполнено</div><div class="level num">${cur.done}<small>/${cur.total}</small></div></div>
          <div class="right">${cur.complete ? '<b class="state done">✓ бонус</b>' : `<b class="num">+${fmt(qr.bonusXp)}</b><div class="muted small">XP за все</div>`}</div>
        </div>
        <div class="q-dots">${cur.tasks.map(t => `<span class="${t.state}">${QUEST_ICON[t.kind]}</span>`).join('')}</div>
      </button>`;
  }
  const last = cur ? `Прошлый: ${cur.complete ? 'выполнен ✓' : cur.done + ' из ' + cur.total}` : '';
  const next = qr.next ? 'Следующий ивент — ' + weekdayDate(qr.next) : 'Запас ивентов закончился — добавьте задания в таблицу';
  return `<button class="card quest-card idle" data-act="quest" ${cur ? '' : 'disabled'}>
      <div class="card-head"><div class="sphere-icon">🎯</div>
        <div class="grow"><b>${esc(next)}</b><div class="muted small">${esc(last)}${streak}</div></div></div>
    </button>`;
}

// ---------- экран ивента ----------

function openQuest() {
  if (!S.quest || !S.quest.current) return;
  Q = { view: 'list', changed: false };
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  if (!openQuest.bound) {
    $('#sheet').addEventListener('click', onQuestClick);
    $('#sheet').addEventListener('input', onQuestInput);
    $('#sheet').addEventListener('change', ev => { if (Q && ev.target.matches('input[data-qfile]')) onQuestFile(ev.target); });
    openQuest.bound = true;
  }
  if (tg && tg.BackButton && tg.isVersionAtLeast('6.1')) { tg.BackButton.onClick(backQuest); tg.BackButton.show(); }
  renderQuest();
}

function closeQuest() {
  const changed = Q && Q.changed;
  Q = null;
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
  if (tg && tg.BackButton && tg.isVersionAtLeast('6.1')) { tg.BackButton.offClick(backQuest); tg.BackButton.hide(); }
  if (changed) afterSave();
}

function backQuest() {
  if (!Q) return;
  if (Q.view === 'list') return closeQuest();
  if (Q.view === 'quiz' && Q.qi > 0) { Q.qi--; return renderQuest(); }
  Q.view = 'list';
  Q.error = '';
  renderQuest();
}

function curTask() { return S.quest.current.tasks.find(t => t.idx === Q.idx); }

function renderQuest() {
  const view = { list: questList, quiz: quizView, result: quizResult, task: taskForm }[Q.view];
  $('#sheet').innerHTML = view();
  $('#sheet').scrollTop = 0;
}

function stateMark(t, open) {
  if (t.state === 'done') return `<span class="state done">✓ +${fmt(t.xp)}</span>`;
  if (t.state === 'pending') return '<span class="state pending">⏳ проверка</span>';
  if (t.state === 'failed') return `<span class="state failed">${t.correct} из ${t.total}</span>`;
  if (t.state === 'rejected') return '<span class="state rejected">не сдан</span>';
  return open ? '' : '<span class="state todo">не выполнено</span>';
}

function questList() {
  const qr = S.quest, cur = qr.current;
  const tasks = cur.tasks.map(t => {
    const canDo = cur.open && (t.state === 'todo' || t.state === 'rejected');
    const action = t.kind === 'quiz' ? `Начать квиз · ${t.total} ${plural(t.total, 'вопрос', 'вопроса', 'вопросов')}`
      : t.kind === 'sport' ? 'Отметить занятие' : 'Отметить выполненным';
    return `<div class="card quest-task ${t.state}">
      <div class="card-head"><span class="q-icon">${QUEST_ICON[t.kind]}</span>
        <div class="grow"><b>${esc(t.title)}</b><div class="muted small">${QUEST_KIND[t.kind]}${t.sectionLabel ? ' · ' + esc(t.sectionLabel) : ''}</div></div>
        ${stateMark(t, cur.open)}</div>
      <p class="q-desc">${esc(t.description)}</p>
      ${t.kind === 'quiz' && t.state === 'failed' ? '<p class="muted small">Засчитывается, если верных хотя бы половина. Попытка была одна.</p>' : ''}
      ${canDo ? `<button class="btn" data-q="open" data-v="${t.idx}">${action}</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="screen">
    <button class="link-btn" data-q="close">Закрыть</button>
    ${Q.celebrate ? `<div class="celebrate">🎉 Ивент выполнен полностью: +${fmt(qr.bonusXp)} XP</div>` : ''}
    <div class="card quest-hero">
      <div class="big">🎯</div>
      <h1>Ивент пятницы</h1>
      <p class="sub">${esc(weekdayDate(cur.date))} · ${cur.open ? 'до 23:59' : 'завершён'}</p>
      <div class="bar"><i style="width:${pct(cur.done, cur.total)}%"></i></div>
      <div class="meta"><span>выполнено ${cur.done} из ${cur.total}</span><span>${cur.complete ? 'бонус получен' : '+' + fmt(qr.bonusXp) + ' XP за все'}</span></div>
    </div>
    ${tasks}
    <h2>Круг</h2>
    <div class="card tight">${cur.circle.map(c => `<div class="list-item">
      <div class="grow title">${esc(c.name)}${c.id === S.boot.me.id ? ' <span class="muted small">· вы</span>' : ''}</div>
      ${c.complete ? '<span class="state done">✓ выполнен</span>' : `<span class="state todo">${c.done} из ${c.total}</span>`}</div>`).join('')}</div>
    <p class="muted small" style="margin:8px 4px">Серия: ${qr.stats.streak} · выполнено ивентов: ${qr.stats.completed} из ${qr.stats.launched}</p>
  </div>`;
}

// ---------- квиз ----------

function quizView() {
  const t = curTask(), qs = t.questions, q = qs[Q.qi], last = Q.qi === qs.length - 1;
  const chosen = Q.answers[Q.qi];
  return `<div class="screen">
      <button class="link-btn" data-q="back">${Q.qi ? '‹ Предыдущий вопрос' : '‹ К заданиям'}</button>
      <div class="steps">${qs.map((_, i) => `<i class="${i <= Q.qi ? 'on' : ''}"></i>`).join('')}</div>
      <div class="crumbs">Вопрос ${Q.qi + 1} из ${qs.length}${Q.qi === 0 ? ' · попытка одна, зачёт — от половины верных' : ''}</div>
      <h1 class="q-question" dir="auto">${esc(q.question)}</h1>
      <div class="options">${q.options.map((o, i) =>
        `<button class="option ${chosen === i ? 'on' : ''}" dir="auto" data-q="pick" data-v="${i}">${esc(o)}</button>`).join('')}</div>
    </div>
    <div class="savebar"><div class="inner">
      ${Q.error ? `<div class="error">${esc(Q.error)}</div>` : ''}
      <button class="btn" data-q="${last ? 'submitQuiz' : 'next'}" ${chosen == null || Q.saving ? 'disabled' : ''}>
        ${Q.saving ? 'Проверяю…' : last ? 'Сдать квиз' : 'Дальше'}</button>
    </div></div>`;
}

function quizResult() {
  const r = Q.result, qs = Q.questions;
  return `<div class="screen">
    <div class="done ${r.passed ? '' : 'wait'}"><div class="mark">${r.passed ? '🧠' : '📘'}</div>
      <div class="xp num">${r.correct} из ${r.total}</div>
      <p class="sub">${r.passed ? 'Квиз пройден' : 'Не пройден: нужно хотя бы половина верных'} · +${fmt(r.xp)} XP</p></div>
    <h2>Разбор</h2>
    ${qs.map((q, i) => `<div class="card"><b dir="auto">${esc(q.question)}</b><div class="review">
      ${q.options.map((o, j) => {
        const cls = j === r.review[i].answer ? 'correct' : j === r.review[i].chosen ? 'wrong' : '';
        return cls ? `<span class="${cls}" dir="auto">${esc(o)}</span>` : '';
      }).join('')}</div></div>`).join('')}
    <button class="btn" data-q="toList">К заданиям</button>
  </div>`;
}

// ---------- отчёт и спорт ----------

function taskForm() {
  const t = curTask(), f = Q.form;
  const parts = [`<div class="screen">
    <button class="link-btn" data-q="back">‹ К заданиям</button>
    <div class="crumbs">${QUEST_KIND[t.kind]}${t.sectionLabel ? ' · ' + esc(t.sectionLabel) : ''}</div>
    <h1>${esc(t.title)}</h1><p class="sub">${esc(t.description)}</p>`];

  if (t.kind === 'sport') {
    if (t.types.length > 1) {
      parts.push(field('Какое занятие?', '', false, `<div class="chips">${t.types.map(x =>
        `<button class="chip ${f.type === x.type ? 'on' : ''}" data-q="type" data-v="${x.type}">${esc(x.label)}</button>`).join('')}</div>`));
    }
    parts.push(field('Сколько минут?', `не меньше ${t.minAmount}`, false,
      `<input class="input amount num" data-qf="amount" type="number" inputmode="numeric" min="${t.minAmount}" value="${esc(f.amount)}">`));
  } else {
    if (!t.fixedAmount) {
      parts.push(field(UNIT_ASK_APP[t.unit] || 'Сколько?', `не меньше ${t.minAmount}`, false,
        `<input class="input amount num" data-qf="amount" type="number" inputmode="numeric" min="${t.minAmount}" value="${esc(f.amount)}">`));
    }
    parts.push(field('Отчёт', t.check === 'hadith' ? 'Начало матна, от кого передан, источник и номер' : 'Что сделали и что вынесли', false,
      `<textarea class="input" data-qf="report" maxlength="500" rows="4">${esc(f.report)}</textarea>`));
    if (t.artifact) {
      const inner = Q.uploading ? '<div class="file-box"><span class="grow">Загружаю…</span></div>'
        : f.link ? `<div class="file-box"><span>📎</span><span class="grow">${esc(f.fileName || f.link)}</span><button class="link-btn" data-q="unlink">Убрать</button></div>`
        : `<label class="btn secondary">📷 Фото или PDF<input type="file" data-qfile accept="image/*,application/pdf" hidden></label>
           <div class="or">или ссылкой</div><input class="input" data-qf="link" type="url" inputmode="url" placeholder="https://…">`;
      parts.push(field(t.artifactPrompt, '', t.artifact === 'optional', inner));
    }
    if (t.check === 'hadith') {
      const others = S.boot.users.filter(u => u.id !== S.boot.me.id);
      parts.push(field('Кто проверил устно?', 'На встрече вечером — он подтвердит в приложении или боте.', false,
        `<div class="chips">${others.map(u => `<button class="chip ${f.verifier === u.id ? 'on' : ''}" data-q="verifier" data-v="${u.id}">${esc(u.name)}</button>`).join('')}</div>`));
    }
  }
  parts.push(`</div><div class="savebar"><div class="inner">
    ${Q.error ? `<div class="error">${esc(Q.error)}</div>` : ''}
    <div class="preview"><span>${t.check ? 'После проверки' : 'Будет начислено'}</span><b class="num" id="q-xp">${fmt(taskXp(t))} XP</b></div>
    <button class="btn" data-q="submitTask" ${Q.saving || Q.uploading ? 'disabled' : ''}>${Q.saving ? 'Сохраняю…' : 'Отметить выполненным'}</button>
  </div></div>`);
  return parts.join('');
}

const UNIT_ASK_APP = { 'минута': 'Сколько минут?', 'страница': 'Сколько страниц?', 'слово': 'Сколько слов?', 'аят': 'Сколько аятов?' };

function taskXp(t) {
  const f = Q.form;
  if (t.kind === 'sport') {
    const type = t.types.find(x => x.type === f.type) || (t.types.length === 1 ? t.types[0] : null);
    return type ? (Number(f.amount) || 0) * type.rate : 0;
  }
  return (t.fixedAmount || Number(f.amount) || 0) * t.rate;
}

function validateTask(t) {
  const f = Q.form, n = Number(f.amount);
  if (t.kind === 'sport') {
    if (t.types.length > 1 && !f.type) return 'Выберите занятие.';
    if (!(n >= t.minAmount) || Math.round(n) !== n) return `Нужно не меньше ${t.minAmount} минут.`;
    return '';
  }
  if (!t.fixedAmount && (!(n >= t.minAmount) || Math.round(n) !== n)) return `Нужно не меньше ${t.minAmount}.`;
  if (!String(f.report || '').trim()) return 'Напишите отчёт.';
  if (t.artifact === 'required' && !f.link) return t.artifactPrompt;
  if (f.link && !/^https?:\/\//.test(f.link)) return 'Ссылка должна начинаться с https://';
  if (t.check === 'hadith' && !f.verifier) return 'Выберите, кто проверил.';
  return '';
}

// ---------- действия ----------

function applyQuest(view) {
  const wasComplete = S.quest.current.complete;
  S.quest.current = view;
  Q.changed = true;
  if (view.complete && !wasComplete) {
    Q.celebrate = true;
    S.quest.stats.completed++;
    haptic('success');
  }
}

async function onQuestClick(ev) {
  const el = ev.target.closest('[data-q]');
  if (!el || !Q) return;
  const v = el.dataset.v;
  switch (el.dataset.q) {
    case 'close': return closeQuest();
    case 'back': return backQuest();
    case 'toList': Q.view = 'list'; break;
    case 'open': {
      Q.idx = Number(v);
      const t = curTask();
      Q.error = '';
      if (t.kind === 'quiz') Object.assign(Q, { view: 'quiz', qi: 0, answers: [], questions: t.questions });
      else Object.assign(Q, { view: 'task', form: { amount: t.minAmount || '', report: '', link: '', fileName: '', verifier: '', type: t.types && t.types.length === 1 ? t.types[0].type : '' } });
      break;
    }
    case 'pick': Q.answers[Q.qi] = Number(v); break;
    case 'next': if (Q.answers[Q.qi] != null) Q.qi++; break;
    case 'type': Q.form.type = v; break;
    case 'verifier': Q.form.verifier = v; break;
    case 'unlink': Q.form.link = ''; Q.form.fileName = ''; break;
    case 'submitQuiz': return submitQuiz();
    case 'submitTask': return submitTask();
    default: return;
  }
  renderQuest();
}

function onQuestInput(ev) {
  const key = ev.target.dataset && ev.target.dataset.qf;
  if (!key || !Q || !Q.form) return;
  Q.form[key] = key === 'link' ? ev.target.value.trim() : ev.target.value;
  const out = $('#q-xp');
  if (out) out.textContent = fmt(taskXp(curTask())) + ' XP';
}

async function submitQuiz() {
  Q.saving = true;
  renderQuest();
  try {
    const r = await api('questSubmit', { no: S.quest.current.no, idx: Q.idx, answers: Q.answers });
    applyQuest(r.quest);
    Q.result = r.quiz;
    Q.view = 'result';
    haptic(r.quiz.passed ? 'success' : 'warning');
  } catch (e) {
    Q.error = e.message;
    haptic('error');
  }
  Q.saving = false;
  if (Q) renderQuest();
}

async function submitTask() {
  const t = curTask();
  Q.error = validateTask(t);
  if (Q.error) { haptic('error'); return renderQuest(); }
  Q.saving = true;
  renderQuest();
  const f = Q.form;
  try {
    const r = await api('questSubmit', {
      no: S.quest.current.no, idx: t.idx, amount: Number(f.amount) || 0, type: f.type,
      report: f.report, link: f.link, verifier: f.verifier
    });
    applyQuest(r.quest);
    Q.view = 'list';
    if (!Q.celebrate) toast(r.saved.event.status === 'pending' ? 'Отправлено на проверку' : 'Задание выполнено');
  } catch (e) {
    Q.error = e.message;
    haptic('error');
  }
  Q.saving = false;
  if (Q) renderQuest();
}

async function onQuestFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  Q.uploading = true;
  Q.error = '';
  renderQuest();
  try {
    let blob = file, mime = file.type, name = file.name || 'файл';
    if (/^image\//.test(file.type)) {
      try { blob = await shrinkImage(file); mime = 'image/jpeg'; name = name.replace(/\.[^.]+$/, '') + '.jpg'; } catch (e) { /* как есть */ }
    } else if (file.type !== 'application/pdf') {
      throw new Error('Можно фото или PDF.');
    }
    if (blob.size > MAX_UPLOAD) throw new Error('Файл больше 8 МБ. Сожмите или пришлите ссылку.');
    const r = await api('upload', { name: name, mime: mime, base64: await toBase64(blob) });
    if (!Q) return;
    Q.form.link = r.link;
    Q.form.fileName = name;
  } catch (e) {
    if (Q) Q.error = e.message;
  }
  if (!Q) return;
  Q.uploading = false;
  renderQuest();
}
