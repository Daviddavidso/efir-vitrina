/* ==========================================================================
   СМЕНА ПАРОЛЯ — модуль панели витрины.

   Подключается после panel-core.js и publish.js, ходит в api.php той же
   сессией. Стартует по событию panel:unlocked от экрана входа (gate.js):
   до входа редактора для человека не существует.

   Озвучка: у панели один диктор — window.PANEL.announce из ядра. Видимая
   строка состояния НЕ живая, иначе на каждое действие звучало бы два
   сообщения: из строки и из общей области.
   ========================================================================== */

(function () {
  'use strict';

  var API = 'api.php';

  function $(s) { return document.querySelector(s); }

  var form = $('#pass-form');
  if (!form) return;

  var P = function () { return window.PANEL || {}; };
  function announce(text, assertive) {
    if (typeof P().announce === 'function') P().announce(text, assertive);
  }
  function focusRing(node) {
    if (!node) return;
    if (typeof P().focusRing === 'function') P().focusRing(node); else node.focus();
  }

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
      /* Успех — только настоящий JSON. Иначе страница-заглушка хостинга
         («200 и html») прочиталась бы как «готово». */
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

  /* ---------------------------------------------- состояние ------------ */

  var statusNode = $('#pass-status');

  function status(msg, tone, silent) {
    statusNode.textContent = msg || '';
    statusNode.className = 'status' + (tone ? ' status--' + tone : '');
    if (msg && !silent) announce(msg, tone === 'bad');
  }

  /* Поле ошибки живёт в разметке всегда и всегда в aria-describedby —
     так скринридер видит связь ещё до первой ошибки. */
  function fieldErr(sel, msg) {
    var input = $(sel), box = $(sel + '-err');
    if (!input || !box) return;
    box.textContent = msg ? 'Ошибка: ' + msg : '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  ['#p-old', '#p-new', '#p-new2'].forEach(function (s) {
    var i = $(s);
    if (i) i.addEventListener('input', function () { fieldErr(s, null); });
  });

  function isBusy(btn) { return btn.getAttribute('aria-disabled') === 'true'; }
  function setBusy(btn, on) {
    /* Именно aria-disabled: настоящий disabled на кнопке под фокусом
       уронил бы фокус в body посреди действия. */
    btn.setAttribute('aria-disabled', on ? 'true' : 'false');
  }

  function plural(n, one, few, many) {
    var a = n % 100, b = n % 10;
    var w = (a > 10 && a < 20) ? many : (b > 1 && b < 5) ? few : (b === 1) ? one : many;
    return n + ' ' + w;
  }

  /* Сводка ошибок с ссылками на поля: с тремя полями «прокрутить к первой»
     мало — человек должен видеть весь список сразу. */
  function showErrors(errs) {
    var box = $('#pass-errs'), list = $('#pass-err-list'), h = $('#pass-errs-h');
    h.textContent = errs.length === 1 ? 'В форме одна ошибка'
                                      : 'В форме ' + plural(errs.length, 'ошибка', 'ошибки', 'ошибок');
    list.textContent = '';
    errs.forEach(function (pair) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + pair[0];
      a.textContent = pair[1];
      a.addEventListener('click', function (ev) { ev.preventDefault(); focusRing($('#' + pair[0])); });
      li.appendChild(a);
      list.appendChild(li);
    });
    status('');
    box.hidden = false;
    focusRing(box);          /* сводка сама себе сообщение — announce не нужен */
  }

  /* ---------------------------------------------- показать пароли ------ */

  var show = $('#p-show');
  if (show) show.addEventListener('change', function () {
    var on = this.checked;
    ['#p-old', '#p-new', '#p-new2'].forEach(function (s) {
      var i = $(s), a = i.selectionStart, b = i.selectionEnd;
      var focused = document.activeElement === i;
      i.type = on ? 'text' : 'password';
      if (focused) { try { i.setSelectionRange(a, b); } catch (e) { /* поле не даёт */ } }
    });
  });

  /* ---------------------------------------------- отправка ------------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var errs = [];
    ['#p-old', '#p-new', '#p-new2'].forEach(function (s) { fieldErr(s, null); });
    status('');
    $('#pass-errs').hidden = true;

    var old = $('#p-old').value, nw = $('#p-new').value, nw2 = $('#p-new2').value;
    if (!old) {
      fieldErr('#p-old', 'без текущего пароля сменить нельзя.');
      errs.push(['p-old', 'Текущий пароль не введён']);
    }
    if (nw.length < 8) {
      fieldErr('#p-new', 'нужно хотя бы 8 символов, сейчас ' + nw.length + '.');
      errs.push(['p-new', 'Новый пароль короче 8 символов']);
    } else if (/\s/.test(nw)) {
      fieldErr('#p-new', 'в пароле не должно быть пробелов.');
      errs.push(['p-new', 'В новом пароле есть пробел']);
    } else if (nw === old) {
      fieldErr('#p-new', 'новый пароль совпадает с текущим.');
      errs.push(['p-new', 'Новый пароль совпадает с текущим']);
    } else if (nw !== nw2) {
      fieldErr('#p-new2', 'второй пароль отличается от первого. Введите один и тот же.');
      errs.push(['p-new2', 'Пароли не совпадают']);
    }
    if (errs.length) { showErrors(errs); return; }

    var btn = $('#pass-submit');
    if (isBusy(btn)) return;
    setBusy(btn, true);
    status('Меняю пароль…', '', true);
    announce('Меняю пароль…');

    api('password', { old: old, new: nw }).then(function (res) {
      if (res.notApi) {
        status('Панель открыта не с сайта — пароль меняется только на сервере.', 'bad');
        return;
      }
      if (res.ok && res.data && res.data.ok) {
        form.reset();
        if (show) show.checked = false;
        ['#p-old', '#p-new', '#p-new2'].forEach(function (s) { $(s).type = 'password'; });
        status('Готово. Пароль изменён — следующий вход уже с новым. Запишите его: восстановить пароль нельзя.', 'ok');
        return;
      }
      var msg = (res.data && res.data.error) || 'Не получилось сменить пароль.';
      var isNew = res.data && res.data.field === 'new';
      var isOld = res.data && res.data.field === 'old';
      if (isNew || isOld) {
        fieldErr(isNew ? '#p-new' : '#p-old', msg.replace(/^(.)/, function (c) { return c.toLowerCase(); }));
        if (isOld) $('#p-old').value = '';   /* новый пароль набран верно, стирать его незачем */
        showErrors([[isNew ? 'p-new' : 'p-old', msg.replace(/\.$/, '')]]);
      } else status(msg, 'bad');
    }).catch(function () {
      status('Сервер не ответил. Пароль не изменён — попробуйте ещё раз.', 'bad');
    }).then(function () { setBusy(btn, false); });
  });

  /* ---------------------------------------------- старт ---------------- */

  function offline(msg) {
    var note = $('#pass-note');
    note.textContent = msg || 'Пароль меняется на сервере, а эта страница открыта не с сайта.';
    note.hidden = false;
    $('#pass-body').hidden = true;
  }

  function init() {
    api('state', null, 15000).then(function (res) {
      if (res.notApi || !res.ok) { offline(); return; }
      if (!res.data.auth) { offline('Смена пароля доступна после входа.'); return; }
      $('#pass-note').hidden = true;
      $('#pass-body').hidden = false;
    }).catch(function () { offline('Сервер не ответил. Обновите страницу.'); });
  }

  if (document.getElementById('gate')) document.addEventListener('panel:unlocked', init);
  else init();
})();
