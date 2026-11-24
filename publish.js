/* ==========================================================================
   СОХРАНЕНИЕ НА САЙТ — общий модуль для админок витрин.

   Подключается ПОСЛЕ admin.js. Админка сообщает модулю, как собрать файл
   данных и как себя проверить:

     window.PUBLISH = {
       build:    function () { return '...текст файла data.js...'; },
       validate: function () { return true; },   // необязательно
       after:    'селектор',                     // куда воткнуть панель
     };

   Всё остальное модуль делает сам: рисует блок с кнопками, спрашивает
   пароль, ходит в api.php, показывает состояние. Если api.php рядом нет
   (админку открыли локально или хостинг без PHP), кнопки не появляются —
   остаётся прежний путь: скачать файл и положить его руками.
   ========================================================================== */

(function () {
  'use strict';

  var cfg = window.PUBLISH;
  if (!cfg || typeof cfg.build !== 'function') return;

  var API = cfg.api || 'api.php';
  var inFlight = false;
  var reqSeq = 0;
  var authed = false;
  var lastPublished = { at: null };
  var afterLogin = null;
  var authHandled = false;
  var published = null;      // что уже уехало на сайт из этой вкладки

  /* ---------------------------------------------- разметка ------------- */

  var CSS = [
    '.pub { margin: 20px 0; padding: 16px 18px; border: 1px solid rgba(128,128,128,.45);',
    '       border-radius: 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }',
    '.pub__btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px;',
    '            min-height: 44px; padding: 0 16px; border-radius: 12px; cursor: pointer;',
    '            border: 1px solid currentColor; background: transparent; color: inherit;',
    '            font: inherit; font-weight: 600; }',
    '.pub__btn--main { background: #1c7a3e; border-color: #1c7a3e; color: #fff; }',
    '.pub__btn[aria-disabled="true"] { cursor: progress; }',
    '.pub__state { flex: 1 1 100%; margin: 0; font-size: .92rem; }',
    '.pub__state[data-dirty="true"] { color: #b06a00; font-weight: 600; }',
    '.pub__spin { width: 14px; height: 14px; border: 2px solid currentColor;',
    '             border-right-color: transparent; border-radius: 50%; animation: pubspin .8s linear infinite; }',
    '@keyframes pubspin { to { transform: rotate(360deg); } }',
    '@media (prefers-reduced-motion: reduce) { .pub__spin { display: none; } }',
    '.pub__dlg { max-width: 440px; padding: 22px; border: 1px solid rgba(128,128,128,.6);',
    '            border-radius: 14px; background: Canvas; color: CanvasText; }',
    '.pub__dlg::backdrop { background: rgba(0,0,0,.7); }',
    '.pub__dlg input[type="password"] { min-height: 44px; padding: 10px 12px; width: 100%;',
    '            border: 1px solid rgba(128,128,128,.7); border-radius: 10px;',
    '            background: Canvas; color: CanvasText; font: inherit; }',
    '.pub__row { display: flex; gap: 8px; align-items: flex-start; }',
    '.pub__row input { flex: 1 1 auto; min-width: 0; }',
    '.pub__err { color: #c62828; font-weight: 600; font-size: .88rem; min-height: 0; }',
    '.pub__err:empty { display: none; }',
    '.pub__hint { opacity: .75; font-size: .85rem; }',
    '.pub__vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;',
    '           border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* Живые области создаём на старте и больше не трогаем: область, созданная
     в момент сообщения, у части связок браузер+скринридер не читается. */
  var live = document.createElement('p');
  live.className = 'pub__vh';
  live.setAttribute('role', 'status');
  var alert = document.createElement('p');
  alert.className = 'pub__vh';
  alert.setAttribute('role', 'alert');
  document.body.insertBefore(alert, document.body.firstChild);
  document.body.insertBefore(live, document.body.firstChild);

  var box = document.createElement('div');
  box.className = 'pub';
  box.innerHTML =
    '<button class="pub__btn pub__btn--main" type="button" data-pub="save">Сохранить на сайт</button>' +
    '<button class="pub__btn" type="button" data-pub="zip" hidden>Скачать сайт целиком</button>' +
    '<button class="pub__btn" type="button" data-pub="rollback" hidden>Вернуть предыдущую версию</button>' +
    '<button class="pub__btn" type="button" data-pub="logout" hidden>Выйти</button>' +
    '<p class="pub__state" data-pub="state">Проверяю, работает ли сохранение на сайт…</p>';

  var dlg = document.createElement('dialog');
  dlg.className = 'pub__dlg';
  dlg.setAttribute('aria-labelledby', 'pub-title');
  dlg.setAttribute('aria-describedby', 'pub-intro');
  dlg.innerHTML =
    '<form data-pub="form" novalidate>' +
      '<h2 id="pub-title" style="margin:0 0 8px">Сохранение на сайт</h2>' +
      '<p id="pub-intro" style="margin:0 0 16px">Введите пароль сайта — после этого правки уедут на сайт. ' +
        'Пароль спрашиваем один раз, дальше кнопка работает сразу.</p>' +
      '<label for="pub-pass" style="display:block;font-weight:600;margin-bottom:6px">Пароль сайта</label>' +
      '<div class="pub__row">' +
        '<input type="password" id="pub-pass" name="sitekey" autocomplete="current-password" ' +
          'autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" ' +
          'aria-describedby="pub-pass-hint pub-pass-err">' +
        '<button class="pub__btn" type="button" data-pub="toggle" aria-pressed="false" aria-label="Показать пароль">' +
          '<span aria-hidden="true">👁</span></button>' +
      '</div>' +
      '<p class="pub__hint" id="pub-pass-hint">Общий пароль этого сайта, не ваш личный. Его даёт разработчик.</p>' +
      '<p class="pub__err" id="pub-pass-err"></p>' +
      '<div style="display:flex;gap:10px;margin-top:18px">' +
        '<button class="pub__btn" type="button" data-pub="cancel">Отмена</button>' +
        '<button class="pub__btn pub__btn--main" type="submit" data-pub="ok">Войти и сохранить</button>' +
      '</div>' +
    '</form>';

  var confirmDlg = document.createElement('dialog');
  confirmDlg.className = 'pub__dlg';
  confirmDlg.setAttribute('role', 'alertdialog');
  confirmDlg.setAttribute('aria-labelledby', 'pub-c-title');
  confirmDlg.setAttribute('aria-describedby', 'pub-c-text');
  confirmDlg.innerHTML =
    '<h2 id="pub-c-title" style="margin:0 0 8px">Сохранить каталог на сайте?</h2>' +
    '<p id="pub-c-text" style="margin:0"></p>' +
    '<div style="display:flex;gap:10px;margin-top:18px">' +
      '<button class="pub__btn" type="button" data-pub="c-no">Отмена</button>' +
      '<button class="pub__btn pub__btn--main" type="button" data-pub="c-yes">Сохранить на сайт</button>' +
    '</div>';

  /* Если страница уже принесла свои кнопки (общая оболочка админки), берём
     их. Свой блок рисуем только там, где панель осталась старая — иначе
     на экране оказались бы две пары одинаковых кнопок. */
  var shell = document.getElementById('publish');

  function el(name, root) { return (root || box).querySelector('[data-pub="' + name + '"]'); }

  var btnSave, btnZip, btnRoll, btnOut, stateLine, extraSave;

  if (shell) {
    box = null;
    btnSave = shell;
    extraSave = document.getElementById('publish-2');
    btnZip = document.getElementById('zip');
    btnRoll = document.getElementById('rollback');
    btnOut = document.getElementById('logout');
    stateLine = document.getElementById('publish-state');
  } else {
    var anchor = cfg.after ? document.querySelector(cfg.after) : null;
    if (anchor) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    else {
      var main = document.querySelector('main') || document.body;
      main.insertBefore(box, main.firstChild);
    }
    btnSave = el('save'); btnZip = el('zip'); btnRoll = el('rollback'); btnOut = el('logout');
    stateLine = el('state');
  }

  document.body.appendChild(dlg);
  document.body.appendChild(confirmDlg);

  /* Живые области оболочки уже есть — свои не плодим. */
  var shellStatus = document.getElementById('a-status');
  if (shellStatus) { live.remove(); alert.remove(); live = shellStatus; alert = document.getElementById('a-alert'); }

  /* Диалог подтверждения оболочки (#ask) переиспользуем: он уже вычитан
     и одинаково ведёт себя во всех витринах. */
  var shellAsk = document.getElementById('ask');
  var pass = dlg.querySelector('#pub-pass');
  var passErr = dlg.querySelector('#pub-pass-err');

  /* ---------------------------------------------- объявления ----------- */

  var timers = {};
  function say(text, assertive) {
    /* Диктор ядра панели, если он есть: один писатель на живую область,
       иначе два таймера затирают сообщения друг друга. */
    if (window.PANEL && typeof window.PANEL.announce === 'function') {
      window.PANEL.announce(text, assertive);
      return;
    }
    var node = assertive ? alert : live;
    var key = assertive ? 'a' : 's';
    clearTimeout(timers[key]);
    node.textContent = '';
    /* Пустой такт: одинаковый текст подряд иначе не объявляется. */
    timers[key] = setTimeout(function () { node.textContent = text; }, 80);
  }

  /* Фокус из кода должен быть виден и после работы мышью. */
  function focusRing(node) {
    if (!node) return;
    if (window.PANEL && typeof window.PANEL.focusRing === 'function') { window.PANEL.focusRing(node); return; }
    node.classList.add('js-ring');
    node.addEventListener('blur', function once() {
      node.classList.remove('js-ring');
      node.removeEventListener('blur', once);
    });
    node.focus();
  }

  /* ---------------------------------------------- сеть ----------------- */

  function apiOnce(action, payload, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms || 20000);
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      credentials: 'same-origin',
      signal: ctrl.signal
    }).then(function (res) {
      /* Успех — только настоящий JSON с ok:true. Иначе страница-заглушка
         хостинга («200 и html») прочиталась бы как «готово». */
      var isJson = (res.headers.get('content-type') || '').indexOf('application/json') !== -1;
      if (!isJson) return { status: res.status, ok: false, data: {}, notApi: true };
      return res.json().catch(function () { return {}; }).then(function (d) {
        return { status: res.status, ok: res.ok, data: d };
      });
    }).finally(function () { clearTimeout(timer); });
  }

  /* Safari после паузы иногда шлёт запрос в соединение, которое сервер уже
     закрыл, и сразу получает обрыв («The network connection was lost») — до
     сервера запрос не доходит. Один тихий повтор через полсекунды это лечит.
     Свой таймаут (AbortError) не повторяем: там сервер мог и ответить. */
  function api(action, payload, ms) {
    return apiOnce(action, payload, ms).catch(function (e) {
      if (e && e.name === 'AbortError') throw e;
      return new Promise(function (r) { setTimeout(r, 500); }).then(function () {
        return apiOnce(action, payload, ms);
      });
    });
  }

  function setBusy(on) {
    inFlight = on;
    btnSave.setAttribute('aria-disabled', on ? 'true' : 'false');
    var spin = btnSave.querySelector('.pub__spin');
    if (on && !spin) {
      spin = document.createElement('span');
      spin.className = 'pub__spin';
      spin.setAttribute('aria-hidden', 'true');
      btnSave.appendChild(spin);
    }
    if (!on && spin) spin.remove();
  }

  /* Что сравнивать на «есть ли несохранённые правки». Собранный файл для
     этого не годится: в его шапке стоит время сборки. */
  function snapshot() {
    return typeof cfg.stateHash === 'function' ? cfg.stateHash() : cfg.build();
  }

  function hashOf(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h) + ':' + s.length;
  }

  function niceTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString()
      ? 'сегодня в ' + t
      : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ' в ' + t;
  }

  /* Состояние несут слова, а не только цвет. Живой областью строка не
     является: она меняется на каждую правку и заговорила бы сама с собой. */
  function refresh() {
    var when = niceTime(lastPublished.at);
    var now;
    try { now = hashOf(snapshot()); } catch (e) { now = null; }
    var pending = now === null || now !== published;
    stateLine.setAttribute('data-dirty', pending ? 'true' : 'false');
    if (pending) {
      stateLine.textContent = when
        ? 'Есть правки, которых нет на сайте. Последнее сохранение: ' + when + '.'
        : 'Есть правки, которых нет на сайте. Нажмите «Сохранить на сайт».';
    } else {
      stateLine.textContent = when ? 'Всё сохранено на сайте: ' + when + '.' : 'На сайте текущая версия.';
    }
  }

  function problem(res) {
    if (res.notApi) return 'Сайт ответил не по делу — сохранение не прошло. Правки на месте, ничего не потеряно.';
    var msg = res.data && res.data.error ? String(res.data.error).slice(0, 140) : '';
    if (res.status === 413) return msg || 'Слишком тяжёлая картинка — сайт её не принял. Правки остались здесь.';
    if (res.status >= 500) return 'На сайте ошибка ' + res.status + '. Правки остались здесь, попробуйте через пару минут.';
    return (msg || 'Сайт отказался принять правки.') + ' Правки остались здесь.';
  }

  function run(action) {
    if (inFlight) { say('Идёт сохранение, подождите.'); return; }
    setBusy(true);
    var my = ++reqSeq;
    timers.slow = setTimeout(function () { say('Сохраняю на сайт…'); }, 1000);

    var body = action === 'rollback' ? {} : { data: cfg.build() };
    api(action, body, 25000).then(function (res) {
      if (my !== reqSeq) return;
      clearTimeout(timers.slow);
      setBusy(false);

      if (res.status === 401) {
        authed = false;
        /* С экраном входа сессию продлевают там, а не в нашем диалоге. */
        if (window.PANEL && typeof window.PANEL.lock === 'function') {
          window.PANEL.lock('сессия истекла — войдите заново и нажмите «Сохранить на сайт» ещё раз. Правки на месте.');
          return;
        }
        afterLogin = function () { run(action); };
        openAuth();
        return;
      }
      if (!res.ok || !res.data.ok) { say(problem(res), true); return; }

      authed = true;
      lastPublished = res.data.published || lastPublished;
      published = action === 'rollback' ? null : hashOf(snapshot());
      /* Витрина может захотеть узнать, что её версия уехала на сайт
         (например, чтобы сбросить предупреждение про чужие правки). */
      if (action !== 'rollback' && typeof cfg.onPublished === 'function') {
        try { cfg.onPublished(); } catch (e) { /* не мешаем публикации */ }
      }
      btnOut.hidden = false; btnZip.hidden = false; btnRoll.hidden = false;
      refresh();
      say(action === 'rollback'
        ? 'Прежняя версия вернулась на сайт. Обновите страницу сайта.'
        : 'Изменения на сайте. Обновите страницу сайта, чтобы их увидеть.');
      if (action === 'rollback') setTimeout(function () {
        var dropped = false;
        if (typeof cfg.forgetCleanDraft === 'function') {
          try { dropped = cfg.forgetCleanDraft(); } catch (e) { dropped = false; }
        }
        /* После перезагрузки экран входа не спросит пароль заново и скажет итог. */
        try {
          sessionStorage.setItem('panel:keep', dropped
            ? 'Прежняя версия вернулась на сайт. В редакторе — то, что сейчас на сайте.'
            : 'Прежняя версия вернулась на сайт. Ваши несохранённые правки остались в черновике.');
        } catch (e) { /* без метки просто спросит пароль */ }
        window.PANEL_RELOADING = true;
        location.reload();
      }, 600);
    }).catch(function (err) {
      if (my !== reqSeq) return;
      clearTimeout(timers.slow);
      setBusy(false);
      say(err && err.name === 'AbortError'
        ? 'Сайт не ответил. Ничего не сохранено, правки на месте — попробуйте ещё раз.'
        : 'Связи с сайтом нет. Ничего не сохранено, правки на месте.', true);
    });
  }

  /* ---------------------------------------------- подтверждение -------- */

  var pendingRun = null;

  function ask(title, text, yes, fn) {
    var d = shellAsk || confirmDlg;
    if (d.open) return;
    pendingRun = fn;
    if (shellAsk) {
      document.getElementById('ask-title').textContent = title;
      document.getElementById('ask-text').textContent = text;
      var y = document.getElementById('ask-yes');
      y.textContent = yes;
      y.setAttribute('data-pub-run', '1');      // это наше подтверждение, не удаление
      d.showModal();
      document.getElementById('ask-no').focus({ preventScroll: true });
      return;
    }
    confirmDlg.querySelector('#pub-c-title').textContent = title;
    confirmDlg.querySelector('#pub-c-text').textContent = text;
    el('c-yes', confirmDlg).textContent = yes;
    confirmDlg.showModal();
    el('c-no', confirmDlg).focus();   // фокус на безопасную кнопку
  }

  /* Ядро админки делает работу в обработчике кнопки и там же чистит своё
     pending; наш запуск помечен атрибутом, чтобы не спутать с удалением. */
  if (shellAsk) {
    document.getElementById('ask-yes').addEventListener('click', function () {
      if (this.getAttribute('data-pub-run') !== '1') return;
      this.removeAttribute('data-pub-run');
      var fn = pendingRun;
      pendingRun = null;
      if (fn) fn();
    });
    document.getElementById('ask-no').addEventListener('click', function () {
      var y = document.getElementById('ask-yes');
      if (y.getAttribute('data-pub-run') === '1') { y.removeAttribute('data-pub-run'); pendingRun = null; }
    });
    /* Escape закрывает диалог мимо обеих кнопок. Без этого наше
       подтверждение оставалось бы взведённым, и следующее «Удалить» в
       чужом диалоге заодно выгрузило бы каталог на боевой сайт.
       Событие close приходит и на Escape, и на close(), но отдельной
       задачей — уже после того, как нажатие отработало. */
    var disarm = function () {
      var y = document.getElementById('ask-yes');
      if (y) y.removeAttribute('data-pub-run');
      pendingRun = null;
    };
    /* cancel приходит сразу по Escape, close — и по Escape, и по close():
       вешаем оба, чтобы взведённое подтверждение не пережило закрытие. */
    shellAsk.addEventListener('cancel', disarm);
    shellAsk.addEventListener('close', disarm);
  }

  el('c-no', confirmDlg).addEventListener('click', function () {
    pendingRun = null;
    confirmDlg.close();
    focusRing(btnSave);
  });

  /* Работу делаем здесь, а не в обработчике close: событие close приходит
     не во всех окружениях, и действие тогда молча не случается. */
  el('c-yes', confirmDlg).addEventListener('click', function () {
    var fn = pendingRun;
    pendingRun = null;
    confirmDlg.close();
    if (fn) fn();
  });

  confirmDlg.addEventListener('cancel', function () { pendingRun = null; });

  /* ---------------------------------------------- кнопки --------------- */

  function onSaveClick() {
    if (inFlight) { say('Идёт сохранение, подождите.'); return; }
    if (typeof cfg.validate === 'function' && !cfg.validate()) return;
    ask('Сохранить каталог на сайте?',
        (cfg.confirmText || 'Каталог на сайте будет заменён этой версией.') +
        ' Прежняя версия сохранится — её вернёт кнопка «Вернуть предыдущую версию».',
        'Сохранить на сайт',
        function () { run('publish'); });
  }
  btnSave.addEventListener('click', onSaveClick);
  if (extraSave) extraSave.addEventListener('click', onSaveClick);

  btnRoll.addEventListener('click', function () {
    ask('Вернуть предыдущую версию?',
        'Сайт откатится к каталогу, который был до последнего сохранения.',
        'Вернуть',
        function () { run('rollback'); });
  });

  btnOut.addEventListener('click', function () {
    api('logout').then(function () {
      authed = false;
      btnOut.hidden = true;
      /* С экраном входа выход — это возврат на него. Черновик переживает
         перезагрузку: он лежит в localStorage и дописывается на pagehide. */
      if (window.PANEL_GATE) { window.PANEL_RELOADING = true; location.reload(); return; }
      say('Вы вышли. Правки остались в браузере.');
    }).catch(function () { say('Связи с сайтом нет.', true); });
  });

  /* Экран входа (gate.js) логинит человека сам, мимо нашего диалога. Как
     только он пустил в редактор, спрашиваем сервер заново — иначе кнопки
     «Выйти», «Вернуть предыдущую версию» и «Скачать сайт» появлялись бы
     только после первого сохранения. */
  document.addEventListener('panel:unlocked', function () {
    api('state', null, 15000).then(function (res) {
      if (!(res.data && res.data.ok)) return;
      authed = !!res.data.auth;
      lastPublished = res.data.published || lastPublished;
      btnOut.hidden = !authed; btnZip.hidden = !authed; btnRoll.hidden = !authed;
      refresh();
    }).catch(function () { /* без api.php публикация и так выключена */ });
  });

  btnZip.addEventListener('click', function () {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = API + '?action=zip';
    form.style.display = 'none';
    document.body.appendChild(form);
    form.submit();
    setTimeout(function () { form.remove(); }, 1000);
    say('Собираю архив сайта. Файл появится в загрузках.');
  });

  /* ---------------------------------------------- вход ----------------- */

  function cleanup() {
    pass.value = '';
    pass.type = 'password';
    passErr.textContent = '';
    pass.removeAttribute('aria-invalid');
    el('toggle', dlg).setAttribute('aria-pressed', 'false');
  }

  function openAuth() {
    if (dlg.open) return;
    authHandled = false;
    cleanup();
    dlg.showModal();
    pass.focus();
  }

  el('cancel', dlg).addEventListener('click', function () {
    afterLogin = null;
    authHandled = true;
    cleanup();
    dlg.close();
    focusRing(btnSave);
  });

  /* Имя кнопки постоянное, состояние — в aria-pressed: пара «меняющееся имя
     + aria-pressed» читается как «Скрыть пароль, нажата», то есть наоборот. */
  el('toggle', dlg).addEventListener('click', function () {
    var shown = pass.type === 'text';
    var a = pass.selectionStart, b = pass.selectionEnd;
    pass.type = shown ? 'password' : 'text';
    this.setAttribute('aria-pressed', shown ? 'false' : 'true');
    try { pass.setSelectionRange(a, b); } catch (e) { /* не все типы дают */ }
  });

  el('form', dlg).addEventListener('submit', function (e) {
    e.preventDefault();
    var value = pass.value.trim();
    var ok = el('ok', dlg);
    if (!value) {
      pass.setAttribute('aria-invalid', 'true');
      passErr.textContent = 'Ошибка: введите пароль.';
      pass.focus();
      return;
    }
    ok.setAttribute('aria-disabled', 'true');
    api('login', { password: value }, 20000).then(function (res) {
      ok.setAttribute('aria-disabled', 'false');
      if (res.ok && res.data.ok) {
        authed = true;
        lastPublished = res.data.published || lastPublished;
        btnOut.hidden = false; btnZip.hidden = false; btnRoll.hidden = false;
        var next = afterLogin;
        afterLogin = null;
        authHandled = true;
        cleanup();
        dlg.close();
        if (next) next();
        return;
      }
      /* Ошибка одного поля: текст рядом с полем и фокус туда же.
         В живую область дублировать нельзя — прозвучит дважды. */
      pass.setAttribute('aria-invalid', 'true');
      passErr.textContent = 'Ошибка: ' + ((res.data && res.data.error) || 'пароль не подошёл.');
      pass.focus();
      pass.select();
    }).catch(function () {
      ok.setAttribute('aria-disabled', 'false');
      pass.setAttribute('aria-invalid', 'true');
      passErr.textContent = 'Ошибка: нет связи с сайтом. Правки на месте, попробуйте ещё раз.';
      pass.focus();
    });
  });

  pass.addEventListener('input', function () {
    pass.removeAttribute('aria-invalid');
    passErr.textContent = '';
  });

  dlg.addEventListener('close', function () {
    if (authHandled) { authHandled = false; return; }
    afterLogin = null;
    cleanup();
    focusRing(btnSave);
  });

  /* ---------------------------------------------- старт ---------------- */

  api('state', null, 15000).then(function (res) {
    if (!(res.data && res.data.ok)) throw new Error('нет api.php');
    authed = !!res.data.auth;
    lastPublished = res.data.published || lastPublished;
    btnOut.hidden = !authed; btnZip.hidden = !authed; btnRoll.hidden = !authed;
    try { published = hashOf(snapshot()); } catch (e) { published = null; }
    refresh();
    /* Правки в админке модуль не отслеживает — просто пересчитываем состояние. */
    setInterval(refresh, 2000);
  }).catch(function () {
    /* Публиковать некуда — не дразним кнопкой. Остаётся «Скачать
       резервную копию», её рисует ядро админки. */
    if (box) box.hidden = true;
    [btnSave, extraSave, btnZip, btnRoll, btnOut].forEach(function (b) { if (b) b.hidden = true; });
    if (stateLine) {
      stateLine.removeAttribute('data-dirty');
      stateLine.textContent = 'Сохранение на сайт отсюда не работает: страница открыта не с сайта. '
        + 'Правки остаются в браузере — выгрузить их можно кнопкой «Скачать резервную копию».';
    }
  });
})();
