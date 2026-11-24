/* ==========================================================================
   ЯДРО АДМИНКИ — одинаковое во всех витринах.

   Проект описывает себя схемой и двумя функциями (файл admin-schema.js):

     window.ADMIN = {
       brand:    'ВЫГОДА',                 // видно в шапке
       draftKey: 'vygoda_admin_draft',     // ключ черновика в браузере
       preview:  'index.html?draft=1',     // необязательно
       requireErid: true,                  // без erid карточку не сохранить
                                           // 'warn' — только предупреждаем
       logo: true,                         // блок логотипа/плашки в карточке
       singleGroup: true,                  // сайт с одним разделом: панель не
                                           // даёт добавлять/двигать/удалять
                                           // разделы и не спрашивает раздел
                                           // в карточке (необязательно)
       site:   [ {key, label, hint, textarea, required, section} ],
                                           // тексты сайта; section у поля
                                           // открывает новый блок-гармошку
                                           // («Первый экран», «Вопросы»)
       groups: [ {key, label, hint, textarea} ],       // подписи разделов
       card:   [ {key, label, hint, type, required} ], // поля карточки
       load:   function () { return {SITE, GROUPS, CARDS}; },
       build:  function (model) { return 'текст файла данных'; }
     };

   Общая модель: SITE — объект строк, GROUPS — [{key,title,...}],
   CARDS — [{uid, group, hidden, ...поля схемы}]. Как это ложится на
   реальный файл проекта, знает только его схема — ядро о формате не знает.

   Типы полей: text | textarea | url | pairs («Подпись: значение» построчно)
               | lines (по строке на пункт)
               | select (выбор из f.options: [{value, label}])
   У поля может быть default — значение в новой карточке.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.ADMIN;
  if (!A) { console.error('Нет window.ADMIN — админке нечего показывать.'); return; }

  /* Фон карточки на сайте — к нему считаем контраст плашки. У витрин он
     разный: тёмная карточка в одной, белая в другой. Берём из схемы
     проекта, иначе проверка ругается на цвета, которые на самом деле
     нормально читаются, и клиент не может ничего сохранить. */
  var SURFACE = (window.ADMIN && window.ADMIN.surface) || '#1c1c1c';

  /* Маркировка erid. true — карточку без неё сохранить нельзя; 'warn' —
     строку про erid показываем, но не блокируем: ссылки бывают не только
     из партнёрки, но и прямые — из приложения банка или с его сайта. */
  var ERID_SHOW = !!A.requireErid;
  var ERID_HARD = A.requireErid === true;

  var MIN_INK = 4.5, MIN_TILE = 3.0;
  var MAX_LOGO = 200 * 1024;
  /* Цвета новой плашки. Витрина может задать свои (фирменные) в схеме. */
  var DEFAULT_TONE = (A.defaultTone && A.defaultTone.bg && A.defaultTone.ink)
    ? { bg: String(A.defaultTone.bg), ink: String(A.defaultTone.ink) }
    : { bg: '#ff9f43', ink: '#111111' };

  var groupsBox = document.getElementById('groups');
  var stateLine = document.getElementById('state');
  var summary = document.getElementById('error-summary');
  var summaryList = document.getElementById('error-summary-list');
  var summaryTitle = document.getElementById('error-summary-title');
  var ask = document.getElementById('ask');

  /* ---------------------------------------------- состояние ------------ */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var fileModel = A.load();
  function fileState() { return clone(fileModel); }

  var state = fileState();
  var fromDraft = false;
  var staleDraft = false;

  /* Слепок каталога, который лежит на сайте прямо сейчас. Рядом с черновиком
     храним такой же слепок на момент, когда черновик писался: если они
     разошлись — каталог на сайте с тех пор меняли (другой браузер, другой
     человек, правка разработчика), и сохранение черновика затрёт те правки
     молча. Молча — самое плохое, поэтому предупреждаем. */
  function baseHash(m) {
    return JSON.stringify({ S: m.SITE, G: m.GROUPS, C: m.CARDS });
  }
  var siteHash = baseHash(fileModel);
  /* Слепок сайта, из которого вырос открытый черновик. Пишем его рядом с
     черновиком и НЕ обновляем на каждое сохранение: иначе правка, приехавшая
     на сайт со стороны, потеряется из виду после первого же автосохранения. */
  var draftBase = null;

  try {
    var raw = localStorage.getItem(A.draftKey);
    var draft = raw ? JSON.parse(raw) : null;
    if (draft && Array.isArray(draft.CARDS) && Array.isArray(draft.GROUPS) && draft.SITE) {
      state = draft;
      fromDraft = true;
      draftBase = localStorage.getItem(A.draftKey + ':base');
      /* Настройки сайта (название, контакты) сводим по полям: поле, которое
         человек в черновике не трогал, а на сайте оно поменялось (правка
         разработчика или новое поле панели), берём с сайта — иначе сохранение
         черновика молча стёрло бы его. Если кроме настроек на сайте ничего не
         менялось, черновик не устарел и пугать предупреждением незачем. */
      var baseModel = null;
      try { baseModel = draftBase ? JSON.parse(draftBase) : null; } catch (e2) { baseModel = null; }
      if (baseModel && baseModel.S) {
        var siteNow = fileModel.SITE || {};
        Object.keys(siteNow).forEach(function (k) {
          var was = baseModel.S[k], mine = state.SITE[k];
          var untouched = mine === was || ((mine == null || mine === '') && (was == null || was === ''));
          if (untouched && siteNow[k] !== was) state.SITE[k] = siteNow[k];
        });
        if (JSON.stringify(baseModel.G) === JSON.stringify(fileModel.GROUPS) &&
            JSON.stringify(baseModel.C) === JSON.stringify(fileModel.CARDS)) {
          draftBase = baseHash({ SITE: siteNow, GROUPS: fileModel.GROUPS, CARDS: fileModel.CARDS });
          try { localStorage.setItem(A.draftKey + ':base', draftBase); } catch (e3) { /* нет места */ }
        }
      }
      /* Слепка нет — черновик писала прошлая версия панели. Тогда сравниваем
         сам черновик с сайтом: совпал — молчим, разошёлся — это или
         несохранённые правки, или каталог ушёл вперёд, и на глаз это не
         различить. Говорим об этом прямо, а не пугаем зря. */
      staleDraft = draftBase ? (draftBase !== siteHash)
                             : (baseHash(draft) !== siteHash ? 'unknown' : false);
    }
  } catch (e) { /* черновик битый — работаем с файлом */ }
  if (!fromDraft) draftBase = siteHash;

  var open = {};
  var dirty = false;

  /* ---------------------------------------------- помощники ------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function trim(v) { return String(v == null ? '' : v).trim(); }

  function eridOf(url) {
    var m = /[?&]erid=([A-Za-z0-9_-]+)/.exec(String(url || ''));
    return m ? m[1] : '';
  }

  /* Одна строка под ссылкой — и в разметке карточки, и при правке поля,
     чтобы человек не гадал, что будет на сайте. */
  function eridText(url) {
    var erid = eridOf(url);
    if (erid) return 'Маркировка на сайте: «Реклама. Идентификатор erid: ' + erid + '»';
    if (ERID_HARD) return 'В ссылке нет erid — карточка на сайт не попадёт.';
    return 'В ссылке нет erid: карточка покажется, но пометки «Реклама» под кнопкой не будет. ' +
           'Для ссылок из партнёрок erid обязателен по закону о рекламе.';
  }

  /* Ссылки из личных кабинетов приходят как попало: без https:// (РКО Групп,
     ЛК партнёрок), с http://, с хвостами пробелов и переносов из мессенджера.
     Доводим адрес до полного вида сами, а не заставляем человека править руками. */
  function normalizeUrl(raw) {
    var s = String(raw == null ? '' : raw).replace(/\s+/g, '');
    if (!s) return '';
    if (/^\/\//.test(s)) return 'https:' + s;
    /* Уже есть схема или что-то на неё похожее («htps://», «mailto:») — не
       дописываем: пусть честно упадёт в проверке, а не уедет рабочим мусором.
       Двоеточие перед цифрой — это порт, а не схема. */
    if (s.indexOf('://') !== -1 || /^[a-zа-яё][a-z0-9а-яё+.-]*:(?![0-9])/i.test(s)) return s;
    return 'https://' + s;
  }

  /* Обновляет строку про erid под полем ссылки и возвращает новое состояние
     ('pass'/'warn'). Объявления вслух — на совести вызывающего. */
  function eridBox(li, card) {
    var box = li && li.querySelector('[data-role="erid"]');
    if (!box) return null;
    var now = eridOf(card.url) ? 'pass' : 'warn';
    box.textContent = eridText(card.url);
    box.setAttribute('data-state', now);
    return now;
  }

  function initials(name) {
    var w = trim(name).split(/[\s.\-—]+/).filter(Boolean);
    if (!w.length) return '?';
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0][0]).toUpperCase();
  }

  var NAME_KEYS = ['partner', 'brand', 'title', 'name'];
  function label(card) {
    var parts = [];
    A.card.forEach(function (f) {
      if (NAME_KEYS.indexOf(f.key) !== -1 && trim(card[f.key])) parts.push(trim(card[f.key]));
    });
    return parts.slice(0, 2).join(', ');
  }

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return n + ' ' + many;
    if (b > 1 && b < 5) return n + ' ' + few;
    if (b === 1) return n + ' ' + one;
    return n + ' ' + many;
  }

  function uidNew() {
    if (window.crypto && crypto.randomUUID) return 'c-' + crypto.randomUUID().slice(0, 8);
    return 'c-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------------------------------------- контраст ------------- */

  function isHex(v) { return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trim(v)); }

  function lum(hex) {
    var h = trim(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = [0, 2, 4].map(function (i) {
      var c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function fmt(n) { return n.toFixed(2).replace('.', ',') + ':1'; }

  /* Две проверки: буква к плашке (обычный текст) и плашка к фону карточки
     (несущий элемент интерфейса). */
  function toneReport(bg, ink) {
    if (!isHex(bg) || !isHex(ink)) {
      return { state: 'fail', ok: false, text: 'Цвет записывается как #12833B или #fff.' };
    }
    var rInk = ratio(bg, ink), rTile = ratio(bg, SURFACE);
    var okInk = rInk >= MIN_INK, okTile = rTile >= MIN_TILE;
    if (!okInk || !okTile) {
      return { state: 'fail', ok: false,
        text: 'Не проходит: буква к плашке ' + fmt(rInk) + ' (нужно 4,5:1), плашка к фону карточки '
            + fmt(rTile) + ' (нужно 3:1). ' + (okInk ? 'Возьмите фон плашки светлее.' : 'Возьмите буквы светлее.') };
    }
    if (rInk < 5.5 || rTile < 4) {
      return { state: 'warn', ok: true, text: 'Впритык: буква ' + fmt(rInk) + ', плашка ' + fmt(rTile) + '.' };
    }
    return { state: 'pass', ok: true, text: 'Проходит: буква ' + fmt(rInk) + ', плашка ' + fmt(rTile) + '.' };
  }

  /* ---------------------------------------------- живые области -------- */

  var timers = {}, slowTimers = {};

  function announce(text, assertive) {
    var node = document.getElementById(assertive ? 'a-alert' : 'a-status');
    var key = assertive ? 'alert' : 'status';
    clearTimeout(timers[key]);
    /* Отложенные сообщения снимаем: поставленное раньше сработало бы позже
       и затёрло бы то, что человек ждёт прямо сейчас. */
    Object.keys(slowTimers).forEach(function (k) { clearTimeout(slowTimers[k]); });
    node.textContent = '';
    /* Пустой такт: одинаковый текст подряд иначе не объявляется. */
    timers[key] = setTimeout(function () { node.textContent = text; }, 80);
  }
  function announceSlow(key, delay, text) {
    clearTimeout(slowTimers[key]);
    slowTimers[key] = setTimeout(function () { announce(text); }, delay);
  }

  /* Фокус из кода должен быть виден и после работы мышью: :focus-visible
     в этом случае не срабатывает. */
  function focusRing(node) {
    if (!node) return;
    node.classList.add('js-ring');
    node.addEventListener('blur', function once() {
      node.classList.remove('js-ring');
      node.removeEventListener('blur', once);
    });
    node.focus();
  }

  /* ---------------------------------------------- разметка ------------- */

  var ICON = {
    up: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
        '<path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
        '<path d="M12 5v13M6 12l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    open: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
        '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function fid(uid, name) { return 'f-' + uid + '-' + name; }

  function valueFor(card, f) {
    var v = card[f.key];
    if (f.type === 'pairs') {
      return (v || []).map(function (p) { return p[0] + ': ' + p[1]; }).join('\n');
    }
    if (f.type === 'lines') return (v || []).join('\n');
    return v == null ? '' : v;
  }

  function fieldHTML(uid, f, card) {
    var id = fid(uid, f.key);
    var val = valueFor(card, f);
    var wide = f.type === 'textarea' || f.type === 'pairs' || f.type === 'lines' || f.type === 'url';
    var multi = f.type === 'textarea' || f.type === 'pairs' || f.type === 'lines';

    /* Строка про erid живёт внутри поля ссылки и входит в его описание:
       стояла бы отдельным абзацем в конце карточки — про отсутствие
       маркировки узнавали бы только глазами и только случайно. */
    var eridLine = (ERID_SHOW && f.type === 'url')
      ? '<p class="hint" data-role="erid" id="' + id + '-erid" data-state="' +
        (eridOf(val) ? 'pass' : 'warn') + '">' + esc(eridText(val)) + '</p>'
      : '';
    var desc = id + '-hint' + (eridLine ? ' ' + id + '-erid' : '') + ' ' + id + '-err';

    /* Выпадающий список: значения задаёт схема витрины (f.options),
       клиент выбирает из готового — например, цветовую тему карточки. */
    var input = f.type === 'select'
      ? '<select id="' + id + '" data-field="' + f.key + '" aria-describedby="' + desc + '">' +
        (f.options || []).map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (o.value === val ? ' selected' : '') + '>' +
                 esc(o.label) + '</option>';
        }).join('') + '</select>'
      : multi
      ? '<textarea id="' + id + '" data-field="' + f.key + '" rows="4" aria-describedby="' +
        desc + '">' + esc(val) + '</textarea>'
      : '<input type="' + (f.type === 'url' ? 'url' : 'text') + '" id="' + id + '" data-field="' + f.key +
        '" autocomplete="off" aria-describedby="' + desc + '" value="' + esc(val) + '">';
    return '<div class="field' + (wide ? ' wide' : '') + '">' +
             '<label for="' + id + '">' + esc(f.label) + '</label>' + input +
             '<p class="hint" id="' + id + '-hint">' + esc(f.hint || '') + '</p>' + eridLine +
             '<p class="field__error" id="' + id + '-err"></p>' +
           '</div>';
  }

  /* Готовые логотипы из схемы витрины. Раньше список в схеме был, а
     показать его панель не умела: клиент видел только поле пути и искал
     картинки по интернету сам. */
  function presetList() { return (A.presets || []).filter(function (g) { return g.items && g.items.length; }); }

  function presetHTML(uid, card) {
    var groups = presetList();
    if (!groups.length) return '';
    var id = fid(uid, 'preset');
    var now = trim(card.logo);
    var opts = '<option value="">— выбрать из списка —</option>';
    groups.forEach(function (g) {
      opts += '<optgroup label="' + esc(g.label) + '">';
      g.items.forEach(function (it) {
        opts += '<option value="' + esc(it.value) + '"' +
                (it.value === now ? ' selected' : '') + '>' + esc(it.name) + '</option>';
      });
      opts += '</optgroup>';
    });
    return '<div class="field wide">' +
             '<label for="' + id + '">Готовый логотип</label>' +
             '<select id="' + id + '" data-field="preset" aria-describedby="' + id + '-hint">' + opts + '</select>' +
             '<p class="hint" id="' + id + '-hint">Логотипы банков и МФО уже лежат на сайте. ' +
               'Выберите нужный — путь подставится сам. Своей картинки в списке нет — ' +
               'кнопка «Выбрать файл…» ниже.</p>' +
           '</div>';
  }

  function logoHTML(card) {
    var uid = card.uid;
    var mono = !trim(card.logo);
    var tone = card.tone || clone(DEFAULT_TONE);
    var rep = toneReport(tone.bg, tone.ink);
    /* Встроенная картинка — это тысячи символов base64. В текстовое поле их
       возвращать нельзя: диктор читает их вслух по одному, а глазами такое
       поле не разобрать. Показываем имя файла, поле оставляем пустым. */
    var embedded = /^data:/.test(trim(card.logo));
    var pathCard = embedded ? JSON.parse(JSON.stringify(card)) : card;
    if (embedded) pathCard.logo = '';
    return '<fieldset class="logo-modes wide">' +
      '<legend>Логотип</legend>' +
      '<div class="radios">' +
        '<label><input type="radio" name="mode-' + uid + '" data-field="mode" value="img"' +
          (mono ? '' : ' checked') + '> Картинка</label>' +
        '<label><input type="radio" name="mode-' + uid + '" data-field="mode" value="mono"' +
          (mono ? ' checked' : '') + '> Плашка с инициалами</label>' +
      '</div>' +
      '<div data-pane="img"' + (mono ? ' hidden' : '') + '>' +
        presetHTML(uid, pathCard) +
        '<div class="fields">' +
          fieldHTML(uid, { key: 'logo', label: 'Файл логотипа',
            hint: embedded
              ? 'Сейчас стоит загруженная картинка. Впишите путь или выберите файл, чтобы её заменить.'
              : 'Путь внутри сайта. Либо выберите файл — он встроится в файл данных.' }, pathCard) +
        '</div>' +
        '<div class="row-inline" style="margin-top:6px">' +
          '<span class="logo-preview"><img src="' + esc(card.logo || '') + '" alt="" width="52" height="52" data-role="img-preview"></span>' +
          '<label class="abtn" for="' + fid(uid, 'file') + '">Выбрать файл…</label>' +
          '<input class="vh" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="' +
            fid(uid, 'file') + '" data-field="file">' +
          '<span class="hint" data-role="file-name">' +
            (embedded && card.logoName ? esc('Файл встроен в файл данных: ' + card.logoName) : '') +
          '</span>' +
        '</div>' +
      '</div>' +
      '<div data-pane="mono"' + (mono ? '' : ' hidden') + '>' +
        '<div class="row-inline" style="margin-top:6px">' +
          '<span class="tile-preview" data-role="tile" aria-hidden="true" style="--tone:' + esc(tone.bg) +
            ';--tone-ink:' + esc(tone.ink) + '">' + esc(initials(label(card))) + '</span>' +
          '<span class="color-pair"><label for="' + fid(uid, 'toneBg') + '">Плашка</label>' +
            '<input type="color" id="' + fid(uid, 'toneBg') + '" data-field="toneBg" value="' + esc(tone.bg) + '">' +
            '<input type="text" data-field="toneBgHex" aria-label="Цвет плашки кодом" value="' + esc(tone.bg) + '"></span>' +
          '<span class="color-pair"><label for="' + fid(uid, 'toneInk') + '">Буквы</label>' +
            '<input type="color" id="' + fid(uid, 'toneInk') + '" data-field="toneInk" value="' + esc(tone.ink) + '">' +
            '<input type="text" data-field="toneInkHex" aria-label="Цвет букв кодом" value="' + esc(tone.ink) + '"></span>' +
        '</div>' +
        '<p class="contrast" data-role="contrast" data-state="' + rep.state + '" id="' + fid(uid, 'tone') + '-err">' +
          esc(rep.text) + '</p>' +
      '</div>' +
    '</fieldset>';
  }

  function cardHTML(card, i, total) {
    var uid = card.uid;
    var name = label(card) || 'новая карточка';
    var isOpen = !!open[uid];

    var fields = A.card.map(function (f) { return fieldHTML(uid, f, card); }).join('');

    return '<li class="card" data-uid="' + esc(uid) + '" data-hidden="' + (card.hidden ? 'true' : 'false') + '">' +
      '<div class="card__row">' +
        '<span class="card__pos">' + (i + 1) + ' / ' + total + '</span>' +
        '<button class="abtn abtn--icon" type="button" data-act="toggle" aria-expanded="' +
          (isOpen ? 'true' : 'false') + '" aria-controls="panel-' + esc(uid) + '">' + ICON.open +
          '<span class="vh">Открыть карточку ' + esc(name) + '</span></button>' +
        '<span class="card__name" data-role="name">' + esc(name) + '</span>' +
        '<span class="card__flag" data-role="flag"' + (card.hidden ? '' : ' hidden') + '>Скрыта с сайта</span>' +
        '<button class="abtn abtn--icon" type="button" data-act="up"' +
          (i === 0 ? ' aria-disabled="true"' : '') + '>' + ICON.up +
          '<span class="vh">Переместить «' + esc(name) + '» выше</span></button>' +
        '<button class="abtn abtn--icon" type="button" data-act="down"' +
          (i === total - 1 ? ' aria-disabled="true"' : '') + '>' + ICON.down +
          '<span class="vh">Переместить «' + esc(name) + '» ниже</span></button>' +
        '<label class="check"><input type="checkbox" data-field="hidden"' + (card.hidden ? ' checked' : '') +
          '> Скрыть<span class="vh"> карточку ' + esc(name) + ' с сайта</span></label>' +
        '<button class="abtn abtn--danger" type="button" data-act="del">Удалить' +
          '<span class="vh"> карточку ' + esc(name) + '</span></button>' +
      '</div>' +
      '<div class="card__panel" id="panel-' + esc(uid) + '"' + (isOpen ? '' : ' hidden') + '>' +
        '<fieldset style="border:0;margin:0;padding:0">' +
          '<legend class="vh">Карточка ' + esc(name) + '</legend>' +
          '<div class="fields">' + fields +
            (A.singleGroup ? '' :
            '<div class="field"><label for="' + fid(uid, 'group') + '">Раздел каталога</label>' +
              '<select id="' + fid(uid, 'group') + '" data-field="group" aria-describedby="' +
                fid(uid, 'group') + '-hint ' + fid(uid, 'group') + '-err">' +
                state.GROUPS.map(function (g) {
                  return '<option value="' + esc(g.key) + '"' + (g.key === card.group ? ' selected' : '') +
                         '>' + esc(g.title) + '</option>';
                }).join('') +
              '</select>' +
              '<p class="hint" id="' + fid(uid, 'group') + '-hint">Куда карточка попадёт на сайте.</p>' +
              '<p class="field__error" id="' + fid(uid, 'group') + '-err"></p></div>') +
            (A.logo ? logoHTML(card) : '') +
          '</div>' +
        '</fieldset>' +
      '</div>' +
    '</li>';
  }

  /* Имя раздела берём одинаково везде — в заголовке, в подписях кнопок и
     в диалоге удаления. Иначе один и тот же раздел зовётся то «Раздел 3»,
     то «без названия», и человек ищет на экране разные вещи. */
  function groupName(g, i) {
    if (!g) return '';
    var pos = i;
    if (pos == null) { pos = 0; state.GROUPS.forEach(function (x, n) { if (x === g) pos = n; }); }
    return trim(g.title) || 'Раздел ' + (pos + 1);
  }

  function cardsOf(key) {
    return state.CARDS.filter(function (c) { return c.group === key; });
  }

  function render(focusSel) {
    /* Список ошибок пересобирается только проверкой, а разметку с
       aria-invalid мы сейчас снесём — оставленная сводка вела бы в поля,
       где никакой ошибки уже не видно. */
    summary.hidden = true;
    summaryList.textContent = '';

    groupsBox.innerHTML = state.GROUPS.map(function (g, gi) {
      var list = cardsOf(g.key);
      var gid = 'g-' + g.key;
      var meta = (A.groups || []).map(function (f) {
        var id = gid + '-' + f.key;
        var v = g[f.key] == null ? '' : g[f.key];
        var input = f.textarea
          ? '<textarea id="' + id + '" data-group="' + esc(g.key) + '" data-gfield="' + f.key +
            '" aria-describedby="' + id + '-hint ' + id + '-err">' + esc(v) + '</textarea>'
          : '<input type="text" id="' + id + '" data-group="' + esc(g.key) + '" data-gfield="' + f.key +
            '" autocomplete="off" aria-describedby="' + id + '-hint ' + id + '-err" value="' + esc(v) + '">';
        return '<div class="field wide"><label for="' + id + '">' + esc(f.label) + '</label>' + input +
               '<p class="hint" id="' + id + '-hint">' + esc(f.hint || '') + '</p>' +
               '<p class="field__error" id="' + id + '-err"></p></div>';
      }).join('');

      var gname = groupName(g, gi);
      var block = groupDeleteBlock(g.key);

      return '<section class="agroup" aria-labelledby="' + gid + '-h">' +
        '<div class="agroup__bar">' +
          '<h2 id="' + gid + '-h">' + esc(gname) + '</h2>' +
          '<span class="agroup__count">' + plural(list.length, 'карточка', 'карточки', 'карточек') + '</span>' +
          (A.singleGroup ? '' :
          '<button class="abtn abtn--icon" type="button" data-gact="up" data-group="' + esc(g.key) + '"' +
            (gi === 0 ? ' aria-disabled="true"' : '') + '>' + ICON.up +
            '<span class="vh">Переместить раздел «' + esc(gname) + '» выше</span></button>' +
          '<button class="abtn abtn--icon" type="button" data-gact="down" data-group="' + esc(g.key) + '"' +
            (gi === state.GROUPS.length - 1 ? ' aria-disabled="true"' : '') + '>' + ICON.down +
            '<span class="vh">Переместить раздел «' + esc(gname) + '» ниже</span></button>' +
          '<button class="abtn abtn--danger" type="button" data-gact="del" data-group="' + esc(g.key) + '"' +
            (block ? ' aria-disabled="true" aria-describedby="' + gid + '-delnote"'
                   : ' aria-haspopup="dialog"') +
            '>Удалить раздел<span class="vh"> «' + esc(gname) + '»</span></button>') +
        '</div>' +
        (block && !A.singleGroup ? '<p class="hint" data-role="delnote" id="' + gid + '-delnote">' + esc(block.short) + '</p>' : '') +
        (meta ? '<fieldset class="agroup__meta"><legend>Как подписан раздел</legend>' +
                '<div class="fields">' + meta + '</div></fieldset>' : '') +
        (list.length
          ? '<ul class="editor-list" role="list">' +
            list.map(function (c, i) { return cardHTML(c, i, list.length); }).join('') + '</ul>'
          : '<p class="hint">В разделе пока нет карточек. Пустой раздел на сайте не показывается.</p>') +
        '<p style="margin-top:14px"><button class="abtn" type="button" data-add="' + esc(g.key) + '">' +
          'Добавить карточку<span class="vh"> в раздел ' + esc(gname) + '</span></button></p>' +
      '</section>';
    }).join('') +
    (A.singleGroup ? '' :
    '<div class="add-group">' +
      '<button class="abtn" type="button" id="add-group-btn" data-gact="new" aria-describedby="add-group-hint">Добавить раздел</button>' +
      '<p class="hint" id="add-group-hint">Раздел — это кнопка-фильтр наверху сайта и полоса карточек под ней. ' +
        'Новый раздел появится на сайте, когда в нём будет хотя бы одна карточка.</p>' +
    '</div>');

    if (focusSel) focusRing(groupsBox.querySelector(focusSel));
  }

  /* ---------------------------------------------- разделы -------------- */

  /* Почему раздел сейчас удалить нельзя; null — можно. Короткая причина
     стоит под кнопкой и читается при каждом заходе на неё, длинная звучит
     один раз по нажатию — чтобы Tab по редактору не превращался в лекцию. */
  function groupDeleteBlock(key) {
    if (state.GROUPS.length < 2) {
      return { short: 'Единственный раздел удалить нельзя.',
               full: 'Это единственный раздел каталога — без него карточкам негде лежать.' };
    }
    var n = cardsOf(key).length;
    if (n) {
      var many = plural(n, 'карточка', 'карточки', 'карточек');
      return { short: 'Удалить можно только пустой раздел, сейчас в нём ' + many + '.',
               full: 'Удалить можно только пустой раздел, сейчас в нём ' + many +
                     '. Перенесите их в другой раздел — внутри карточки поле «Раздел каталога» — или удалите.' };
    }
    return null;
  }

  /* Ключ раздела попадает в файл каталога и в адрес якоря на сайте
     (#sec-…), поэтому только латиница и цифры. Заголовок при этом
     переименовывается свободно — ключ остаётся прежним, и ссылки,
     которые уже кому-то отправили, не ломаются. */
  function groupKeyNew() {
    var taken = {}, n = state.GROUPS.length + 1, key;
    state.GROUPS.forEach(function (g) { taken[g.key] = true; });
    do { key = 'razdel-' + n; n++; } while (taken[key]);
    return key;
  }

  /* Переименование идёт без перерисовки — иначе фокус выбило бы из поля на
     первой же букве. Поэтому все места, где имя уже напечатано, правим
     руками: заголовок, невидимые подписи кнопок раздела и список
     «Раздел каталога» во всех карточках (там имя видно и глазами). */
  function renameGroupInPlace(g) {
    var name = groupName(g);

    var h = document.getElementById('g-' + g.key + '-h');
    if (h) h.textContent = name;

    var sec = h ? h.closest('.agroup') : null;
    if (sec) {
      var vh = {
        up: 'Переместить раздел «' + name + '» выше',
        down: 'Переместить раздел «' + name + '» ниже',
        del: ' «' + name + '»'
      };
      Object.keys(vh).forEach(function (act) {
        var box = sec.querySelector('[data-gact="' + act + '"] .vh');
        if (box) box.textContent = vh[act];
      });
      var add = sec.querySelector('[data-add] .vh');
      if (add) add.textContent = ' в раздел ' + name;
    }

    Array.prototype.forEach.call(
      groupsBox.querySelectorAll('select[data-field="group"] option[value="' + g.key + '"]'),
      function (o) { o.textContent = name; });
  }

  function addGroup() {
    var g = { key: groupKeyNew(), title: 'Новый раздел' };
    (A.groups || []).forEach(function (f) {
      if (g[f.key] == null) g[f.key] = f.key === 'cta' ? 'Оформить' : '';
    });
    state.GROUPS.push(g);

    /* Если у витрины полей раздела нет, целимся в кнопку удаления: без
       цели фокус после замены разметки упал бы в начало страницы. */
    var first = (A.groups && A.groups[0]) ? A.groups[0].key : null;
    render(first ? '#g-' + g.key + '-' + first
                 : '[data-gact="del"][data-group="' + g.key + '"]');
    /* Название выделено целиком: первая же буква заменит «Новый раздел». */
    var input = first ? document.getElementById('g-' + g.key + '-' + first) : null;
    if (input && input.select) input.select();

    /* Через паузу: фокус только что переехал, и диктор читает поле —
       сообщение поверх него не услышали бы. */
    var total = state.GROUPS.length;
    setTimeout(function () {
      announce('Раздел добавлен, он последний. Всего ' +
        plural(total, 'раздел', 'раздела', 'разделов') + '.');
    }, 150);
    touched();
  }

  function moveGroup(key, dir) {
    var pos = -1;
    state.GROUPS.forEach(function (g, i) { if (g.key === key) pos = i; });
    if (pos === -1) return;
    var g = state.GROUPS[pos];
    var name = groupName(g, pos);

    if (dir === 'up' && pos === 0) { announceSlow('gmove', 400, 'Раздел «' + name + '» уже первый.'); return; }
    if (dir === 'down' && pos === state.GROUPS.length - 1) {
      announceSlow('gmove', 400, 'Раздел «' + name + '» уже последний.'); return;
    }

    var to = dir === 'up' ? pos - 1 : pos + 1;
    state.GROUPS[pos] = state.GROUPS[to];
    state.GROUPS[to] = g;

    render('[data-gact="' + dir + '"][data-group="' + key + '"]');
    announceSlow('gmove', 400, 'Раздел «' + name + '»: место ' + (to + 1) + ' из ' + state.GROUPS.length +
                 '. В этом же порядке разделы идут на сайте.');
    touched();
  }

  function askDeleteGroup(key) {
    var g = state.GROUPS.filter(function (x) { return x.key === key; })[0];
    if (!g) return;
    var name = groupName(g);
    openAsk('Удалить раздел «' + name + '»?',
            'Раздел пропадёт из каталога и из кнопок-фильтров на сайте. Вернуть его можно будет только сбросом черновика.',
            'Удалить', function () { doDeleteGroup(key); });
  }

  function doDeleteGroup(key) {
    var g = state.GROUPS.filter(function (x) { return x.key === key; })[0];
    if (!g || cardsOf(key).length || state.GROUPS.length < 2) {
      announce('Раздел не удалён: ' + ((groupDeleteBlock(key) || {}).full || 'его уже нет в списке.'));
      return;
    }
    var name = groupName(g);
    /* Соседа запоминаем до удаления: фокус должен остаться на месте
       работы, а не уехать за все разделы к кнопке «Добавить раздел». */
    var pos = state.GROUPS.indexOf(g);
    var near = state.GROUPS[pos + 1] || state.GROUPS[pos - 1];

    state.GROUPS = state.GROUPS.filter(function (x) { return x.key !== key; });
    render();
    focusRing((near && groupsBox.querySelector('[data-gact="del"][data-group="' + near.key + '"]'))
              || groupsBox.querySelector('[data-gact="new"]'));
    setTimeout(function () {
      announce('Раздел «' + name + '» удалён. Осталось ' +
        plural(state.GROUPS.length, 'раздел', 'раздела', 'разделов') + '.');
    }, 150);
    touched();
  }

  /* ---------------------------------------------- правка --------------- */

  function cardOf(node) {
    var li = node.closest('[data-uid]');
    if (!li) return null;
    var uid = li.getAttribute('data-uid');
    for (var i = 0; i < state.CARDS.length; i++) {
      if (state.CARDS[i].uid === uid) return { card: state.CARDS[i], li: li, i: i };
    }
    return null;
  }

  function touched() {
    dirty = true;
    stateLine.setAttribute('data-dirty', 'true');
    stateLine.textContent = 'Есть правки, ещё не сохранённые на сайте';
    clearTimeout(timers.autosave);
    timers.autosave = setTimeout(function () { saveDraft(true); }, 700);
  }

  function fieldByKey(key) {
    for (var i = 0; i < A.card.length; i++) if (A.card[i].key === key) return A.card[i];
    return null;
  }

  groupsBox.addEventListener('input', function (e) {
    var t = e.target;
    var gkey = t.getAttribute('data-group');
    if (gkey) {
      var g = state.GROUPS.filter(function (x) { return x.key === gkey; })[0];
      if (g) {
        g[t.getAttribute('data-gfield')] = t.value;
        if (t.getAttribute('data-gfield') === 'title') renameGroupInPlace(g);
      }
      touched();
      return;
    }

    var key = t.getAttribute('data-field');
    if (!key) return;
    var ref = cardOf(t);
    if (!ref) return;
    var card = ref.card;
    var f = fieldByKey(key);

    if (f && f.type === 'pairs') {
      card[key] = t.value.split('\n').map(function (line) {
        var at = line.indexOf(':');
        if (at === -1) return null;
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }).filter(function (p) { return p && p[0] && p[1]; });
    } else if (f && f.type === 'lines') {
      card[key] = t.value.split('\n').map(trim).filter(Boolean);
    } else if (key === 'toneBg' || key === 'toneInk' || key === 'toneBgHex' || key === 'toneInkHex') {
      syncTone(ref, key, t.value);
    } else if (key !== 'file' && key !== 'mode' && key !== 'preset') {
      card[key] = t.value;
    }

    if (NAME_KEYS.indexOf(key) !== -1) {
      var nameBox = ref.li.querySelector('[data-role="name"]');
      if (nameBox) nameBox.textContent = label(card) || 'Новая карточка';
      var tile = ref.li.querySelector('[data-role="tile"]');
      if (tile) tile.textContent = initials(label(card));
    }

    if (key === 'url' && ERID_SHOW) {
      var box = ref.li.querySelector('[data-role="erid"]');
      if (box) {
        var was = box.getAttribute('data-state');
        var now = eridBox(ref.li, card);
        /* Вслух — один раз на смену состояния и с задержкой: иначе строка
           читалась бы на каждую букву поверх эха ввода. */
        if (was !== now) {
          announceSlow('erid', 1200, now === 'pass'
            ? 'В ссылке есть erid, маркировка «Реклама» на сайте будет.'
            : 'В ссылке нет erid, пометки «Реклама» под кнопкой не будет.');
        }
      }
    }

    if (key === 'preset') {
      var picked = t.value;
      var pathBox = ref.li.querySelector('[data-field="logo"]');
      card.logo = picked;
      card.logoName = '';
      if (pathBox) pathBox.value = picked;
      var prev = ref.li.querySelector('[data-role="img-preview"]');
      if (prev) prev.src = picked;
      var fname = ref.li.querySelector('[data-role="file-name"]');
      if (fname) fname.textContent = '';
      if (picked) {
        var opt = t.options[t.selectedIndex];
        announceSlow('preset', 400, 'Логотип ' + (opt ? opt.textContent : '') + ' подставлен.');
      }
      touched();
      return;
    }

    if (key === 'logo') {
      var img = ref.li.querySelector('[data-role="img-preview"]');
      if (img && trim(t.value)) img.src = t.value;
      /* Путь правят руками — список готовых должен показывать то же самое,
         иначе он утверждает одно, а на сайте стоит другое. */
      var sel = ref.li.querySelector('[data-field="preset"]');
      if (sel) {
        var val = trim(t.value);
        var has = Array.prototype.some.call(sel.options, function (o) { return o.value === val; });
        sel.value = has ? val : '';
      }
    }

    touched();
  });

  /* Кем выбран раздел — клавишами или мышью. Нужно только затем, чтобы
     не перерисовывать список, пока по нему идут стрелками. */
  groupsBox.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'SELECT') e.target.setAttribute('data-kbd', '1');
  });
  groupsBox.addEventListener('mousedown', function (e) {
    if (e.target.tagName === 'SELECT') e.target.removeAttribute('data-kbd');
  });

  function syncTone(ref, key, value) {
    var card = ref.card;
    card.tone = card.tone || clone(DEFAULT_TONE);
    var isBg = key === 'toneBg' || key === 'toneBgHex';
    card.tone[isBg ? 'bg' : 'ink'] = value;

    var pair = ref.li.querySelector('[data-field="' + (isBg ? 'toneBg' : 'toneInk') + '"]');
    var hex = ref.li.querySelector('[data-field="' + (isBg ? 'toneBgHex' : 'toneInkHex') + '"]');
    if (isHex(value)) {
      if (pair && pair.value.toLowerCase() !== value.toLowerCase()) pair.value = value;
      if (hex && hex.value.toLowerCase() !== value.toLowerCase()) hex.value = value;
    }
    var tile = ref.li.querySelector('[data-role="tile"]');
    if (tile) {
      /* Недописанный или битый код цвета в свотч не отдаём: значение,
         которое CSS не понимает, делает плашку прозрачной, и образец
         молча показывает фон панели вместо выбранного цвета. */
      if (isHex(card.tone.bg)) tile.style.setProperty('--tone', card.tone.bg);
      if (isHex(card.tone.ink)) tile.style.setProperty('--tone-ink', card.tone.ink);
    }
    var out = ref.li.querySelector('[data-role="contrast"]');
    if (out) {
      var rep = toneReport(card.tone.bg, card.tone.ink);
      out.setAttribute('data-state', rep.state);
      out.textContent = rep.text;
    }
  }

  groupsBox.addEventListener('change', function (e) {
    var t = e.target;
    var key = t.getAttribute('data-field');
    if (!key) return;
    var ref = cardOf(t);
    if (!ref) return;
    var card = ref.card;

    var f = fieldByKey(key);
    if (f && f.type === 'url') {
      var fixed = normalizeUrl(card[key]);
      /* Нетронутая заготовка «https://» — это пустое поле, а не адрес. */
      if (fixed === 'https://' || fixed === 'http://') fixed = '';
      if (fixed !== card[key]) {
        card[key] = fixed;
        t.value = fixed;
        /* Одно сообщение на всё: отдельная озвучка erid из input-обработчика
           не пережила бы соседнюю (announce снимает все отложенные). */
        var msg = fixed ? 'Ссылка дополнена до полного адреса, менять ничего не нужно.' : '';
        if (ERID_SHOW) {
          var now = eridBox(ref.li, card);
          if (msg && now) {
            msg += now === 'pass' ? ' В ссылке есть erid, маркировка «Реклама» на сайте будет.'
                                  : ' В ссылке нет erid, пометки «Реклама» под кнопкой не будет.';
          }
        }
        if (msg) announceSlow('erid', 500, msg);
        touched();
      }
      return;
    }

    if (key === 'hidden') {
      card.hidden = t.checked;
      ref.li.setAttribute('data-hidden', card.hidden ? 'true' : 'false');
      var flag = ref.li.querySelector('[data-role="flag"]');
      if (flag) flag.hidden = !card.hidden;
      var shown = cardsOf(card.group).filter(function (c) { return !c.hidden; }).length;
      announceSlow('hide', 500, (card.hidden ? 'Скрыто. ' : 'Показано. ') +
        'В разделе видно ' + plural(shown, 'карточку', 'карточки', 'карточек') + '.');
      touched();
      return;
    }

    if (key === 'group') {
      var from = card.group;
      card.group = t.value;
      open[card.uid] = true;
      touched();

      var apply = function () {
        var g = state.GROUPS.filter(function (x) { return x.key === card.group; })[0];
        var fromG = state.GROUPS.filter(function (x) { return x.key === from; })[0];
        render('[data-uid="' + card.uid + '"] [data-act="toggle"]');
        announce('Карточка перенесена в раздел «' + (g ? groupName(g) : card.group) + '», в нём ' +
          plural(cardsOf(card.group).length, 'карточка', 'карточки', 'карточек') + '.' +
          (from === card.group || cardsOf(from).length ? ''
            : ' Раздел «' + (fromG ? groupName(fromG) : from) + '» опустел.'));
      };

      /* В Chrome стрелки по закрытому списку шлют change на каждый шаг.
         Перерисовать разметку прямо здесь — значит уничтожить сам список
         под пальцами: клавиатурой дальше соседнего пункта не уехать.
         Поэтому с клавиатуры ждём ухода с поля, а мышью переносим сразу —
         иначе выглядит так, будто выбор не сработал. */
      if (t.getAttribute('data-kbd') === '1' && document.activeElement === t) {
        t.addEventListener('focusout', apply, { once: true });
      } else apply();
      return;
    }

    if (key === 'mode') {
      var mono = t.value === 'mono';
      ref.li.querySelector('[data-pane="img"]').hidden = mono;
      ref.li.querySelector('[data-pane="mono"]').hidden = !mono;
      if (mono) { card.logo = ''; card.logoName = ''; card.tone = card.tone || clone(DEFAULT_TONE); }
      /* цвет плашки не стираем: логотип могут убрать снова, и карточка
         осталась бы без цвета — а поля цвета в этот момент даже не видно */
      /* Фокус не двигаем: переключатель не должен уводить в другое место. */
      announce(mono ? 'Логотип: плашка с инициалами.' : 'Логотип: картинка.');
      touched();
      return;
    }

    if (key === 'file') {
      var file = t.files && t.files[0];
      if (!file) return;
      var out = ref.li.querySelector('[data-role="file-name"]');
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) || file.size > MAX_LOGO) {
        t.value = '';
        if (out) out.textContent = 'Файл не подошёл: ' + file.name;
        announce('Файл не подходит: нужен PNG, JPG, WEBP или SVG размером до 200 КБ.');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        card.logo = String(reader.result);
        card.logoName = file.name;
        var img = ref.li.querySelector('[data-role="img-preview"]');
        if (img) img.src = card.logo;
        if (out) out.textContent = 'Файл встроен в файл данных: ' + file.name;
        /* В текстовое поле путь не пишем: тысячи символов base64 зачитываются
           вслух и правятся по одному символу. */
        var path = ref.li.querySelector('[data-field="logo"]');
        if (path) path.value = '';
        announce('Логотип обновлён: ' + file.name + '.');
        touched();
      };
      reader.readAsDataURL(file);
    }
  });

  /* ---------------------------------------------- кнопки карточек ------ */

  /* Дубль «Добавить раздел» в верхней панели: одинокая кнопка под всеми
     карточками находится плохо — клиент дважды не нашёл. Фокус после
     нажатия уезжает в поле имени нового раздела, страница доскроллится сама. */
  var addGroupTop = document.getElementById('add-group-top');
  if (addGroupTop) addGroupTop.addEventListener('click', addGroup);

  groupsBox.addEventListener('click', function (e) {
    var gbtn = e.target.closest('[data-gact]');
    if (gbtn) {
      var gact = gbtn.getAttribute('data-gact');
      var gkey = gbtn.getAttribute('data-group');
      if (gact === 'new') return addGroup();
      if (gact === 'up' || gact === 'down') return moveGroup(gkey, gact);
      if (gact === 'del') {
        /* Кнопку не выключаем совсем: у выключенной пропадает фокус и
           не прочитать, почему нельзя. Причина уже написана под кнопкой —
           её же и произносим. */
        var why = groupDeleteBlock(gkey);
        if (why) { announce(why.full); return; }
        return askDeleteGroup(gkey);
      }
      return;
    }

    var add = e.target.closest('[data-add]');
    if (add) return addCard(add.getAttribute('data-add'));

    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var ref = cardOf(btn);
    if (!ref) return;
    var act = btn.getAttribute('data-act');

    if (act === 'toggle') {
      var panel = document.getElementById('panel-' + ref.card.uid);
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      panel.hidden = isOpen;
      open[ref.card.uid] = !isOpen;
      return;
    }
    if (act === 'up' || act === 'down') return move(ref, act);
    if (act === 'del') return askDelete(ref);
  });

  /* Меняем местами элементы на их настоящих местах в общем массиве —
     порядок соседнего раздела при этом не трогается. */
  function move(ref, dir) {
    var list = cardsOf(ref.card.group);
    var pos = list.indexOf(ref.card);
    var name = label(ref.card);

    if (dir === 'up' && pos === 0) { announceSlow('move', 400, '«' + name + '» уже первая в разделе.'); return; }
    if (dir === 'down' && pos === list.length - 1) { announceSlow('move', 400, '«' + name + '» уже последняя в разделе.'); return; }

    var other = list[dir === 'up' ? pos - 1 : pos + 1];
    var a = state.CARDS.indexOf(ref.card), b = state.CARDS.indexOf(other);
    state.CARDS[a] = other;
    state.CARDS[b] = ref.card;

    var newPos = dir === 'up' ? pos : pos + 2;
    render('[data-uid="' + ref.card.uid + '"] [data-act="' + dir + '"]');
    announceSlow('move', 400, '«' + name + '»: позиция ' + newPos + ' из ' + list.length + '.');
    touched();
  }

  function addCard(groupKey) {
    var card = { uid: uidNew(), group: groupKey, hidden: false };
    A.card.forEach(function (f) {
      card[f.key] = f.type === 'pairs' || f.type === 'lines' ? []
        : f['default'] != null ? f['default']
        : f.type === 'select' && f.options && f.options.length ? f.options[0].value
        : (f.key === 'url' ? 'https://' : '');
    });
    if (A.logo) card.tone = clone(DEFAULT_TONE);

    var list = cardsOf(groupKey);
    var at = list.length ? state.CARDS.indexOf(list[list.length - 1]) + 1 : state.CARDS.length;
    state.CARDS.splice(at, 0, card);
    open[card.uid] = true;
    render('[data-uid="' + card.uid + '"] [data-field="' + A.card[0].key + '"]');
    announce('Карточка добавлена. В разделе ' + plural(list.length + 1, 'карточка', 'карточки', 'карточек') + '.');
    touched();
  }

  /* ---------------------------------------------- диалог --------------- */

  var pending = null;

  function openAsk(title, text, yesLabel, onYes) {
    if (ask.open) return;
    pending = onYes;
    document.getElementById('ask-title').textContent = title;
    document.getElementById('ask-text').textContent = text;
    document.getElementById('ask-yes').textContent = yesLabel;
    ask.showModal();
    document.getElementById('ask-no').focus({ preventScroll: true });
  }

  document.getElementById('ask-no').addEventListener('click', function () {
    pending = null;
    ask.close();
  });

  /* Работу делаем здесь, а не в обработчике close: событие close приходит
     не во всех окружениях, и действие тогда молча не случается. */
  document.getElementById('ask-yes').addEventListener('click', function () {
    var fn = pending;
    pending = null;
    ask.close();
    if (fn) fn();
  });

  ask.addEventListener('cancel', function () { pending = null; });

  function askDelete(ref) {
    var name = label(ref.card) || 'без названия';
    openAsk('Удалить карточку «' + name + '»?',
            'Карточка исчезнет из каталога. Вернуть её можно будет только сбросом черновика.',
            'Удалить', function () { doDelete(ref.card.uid); });
  }

  function doDelete(uid) {
    var idx = -1;
    for (var i = 0; i < state.CARDS.length; i++) if (state.CARDS[i].uid === uid) idx = i;
    if (idx === -1) return;

    var card = state.CARDS[idx];
    var name = label(card) || 'без названия';
    var group = card.group;
    var list = cardsOf(group);
    var pos = list.indexOf(card);
    var neighbour = list[pos + 1] || list[pos - 1];

    state.CARDS.splice(idx, 1);
    delete open[uid];
    render();

    /* Фокус обязан приземлиться на что-то осмысленное. */
    focusRing(neighbour
      ? groupsBox.querySelector('[data-uid="' + neighbour.uid + '"] [data-act="del"]')
      : groupsBox.querySelector('[data-add="' + group + '"]'));

    var left = cardsOf(group).length;
    setTimeout(function () {
      announce('Удалено: ' + name + '. В разделе осталось ' +
        plural(left, 'карточка', 'карточки', 'карточек') + '.');
    }, 150);
    touched();
  }

  /* ---------------------------------------------- проверка ------------- */

  function setError(id, message, problems, who) {
    var input = document.getElementById(id);
    var box = document.getElementById(id + '-err');
    /* aria-describedby задан в разметке и не трогается: иначе подсказка
       под полем пропадёт вместе с ошибкой. */
    if (input) input.setAttribute('aria-invalid', 'true');
    if (box) box.textContent = 'Ошибка: ' + message;
    problems.push({ id: id, text: who + ': ' + message });
  }

  function validate() {
    var problems = [];
    Array.prototype.forEach.call(document.querySelectorAll('[aria-invalid]'), function (n) {
      n.removeAttribute('aria-invalid');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.field__error'), function (n) {
      n.textContent = '';
    });

    (A.site || []).forEach(function (f) {
      if (f.required && !trim(state.SITE[f.key])) {
        setError('site-' + f.key, 'заполните «' + f.label.toLowerCase() + '».', problems, 'Тексты сайта');
      }
    });

    (A.groups || []).forEach(function (f) {
      if (!f.required) return;
      state.GROUPS.forEach(function (g) {
        if (!trim(g[f.key])) setError('g-' + g.key + '-' + f.key, 'заполните поле.', problems, 'Раздел');
      });
    });

    /* Проверяем ВСЕ карточки, включая скрытые: скрытая — это одна галочка
       до публикации, и ошибка всплыла бы в самый неудобный момент. */
    state.CARDS.forEach(function (card) {
      var inGroup = cardsOf(card.group);
      var g = state.GROUPS.filter(function (x) { return x.key === card.group; })[0];
      var who = (g ? '«' + trim(g.title) + '», ' : '') + 'карточка ' + (inGroup.indexOf(card) + 1) +
                (label(card) ? ' (' + label(card) + ')' : '');

      A.card.forEach(function (f) {
        if (f.type === 'url') {
          /* Карточки из файла через поле не проходили — доводим адрес до
             полного вида и здесь, прямо перед проверкой, и кладём его
             обратно в состояние и в поле: показываем ровно то, что уедет. */
          var fixed = normalizeUrl(card[f.key]);
          if (fixed === 'https://' || fixed === 'http://') fixed = '';
          if (fixed !== card[f.key]) {
            card[f.key] = fixed;
            var urlInput = document.getElementById(fid(card.uid, f.key));
            if (urlInput) urlInput.value = fixed;
            if (ERID_SHOW) eridBox(document.querySelector('[data-uid="' + card.uid + '"]'), card);
          }
        }
        if (f.required && !trim(card[f.key])) {
          setError(fid(card.uid, f.key), 'заполните «' + f.label.toLowerCase() + '».', problems, who);
        }
        if (f.type === 'url' && trim(card[f.key])) {
          var bad = '';
          try {
            var u = new URL(card[f.key]);
            if (u.protocol !== 'https:' && u.protocol !== 'http:') {
              bad = 'такая ссылка не ведёт на сайт — вставьте адрес страницы оформления из партнёрки.';
            } else if (u.hostname.indexOf('.') === -1) {
              bad = 'адрес не похож на ссылку — скопируйте её из партнёрки целиком.';
            } else if (ERID_HARD && !eridOf(card[f.key])) {
              bad = 'в ссылке нет erid — без маркировки карточку показывать нельзя.';
            }
          } catch (e) { bad = 'адрес не похож на ссылку — скопируйте её из партнёрки целиком.'; }
          if (bad) setError(fid(card.uid, f.key), bad, problems, who);
        }
      });

      if (A.logo && !trim(card.logo)) {
        /* Логотип убран, а цвета нет совсем (его стирала прошлая версия
           панели) — подставляем цвет по умолчанию. Ошибку показываем только
           на цвет, который человек сам ввёл неверно: его поле видно. */
        if (!card.tone || (!card.tone.bg && !card.tone.ink)) card.tone = clone(DEFAULT_TONE);
        var rep = toneReport(card.tone.bg, card.tone.ink);
        if (!rep.ok) setError(fid(card.uid, 'tone'), rep.text, problems, who);
      }
    });

    /* Список чистим вместе со скрытием: иначе при следующем показе
       на мгновение видны прошлые, уже исправленные ошибки. */
    if (!problems.length) { summary.hidden = true; summaryList.textContent = ''; return true; }

    /* Список пересобираем целиком и меняем заголовок: иначе вторая такая же
       проверка с теми же ошибками не прозвучит. */
    summaryTitle.textContent = 'Проверка не пройдена. ' +
      plural(problems.length, 'ошибка', 'ошибки', 'ошибок') + '.';
    summaryList.innerHTML = problems.map(function (p) {
      return '<li><a href="#' + esc(p.id) + '">' + esc(p.text) + '</a></li>';
    }).join('');
    summary.hidden = false;
    summary.blur();
    focusRing(summary);
    return false;
  }

  summaryList.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    var node = document.getElementById(a.getAttribute('href').slice(1));
    if (!node) return;
    var block = node.closest('details');
    if (block && !block.open) block.open = true;
    var li = node.closest('[data-uid]');
    if (li) {
      var panel = li.querySelector('.card__panel');
      var toggle = li.querySelector('[data-act="toggle"]');
      if (panel && panel.hidden) {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        open[li.getAttribute('data-uid')] = true;
      }
    }
    focusRing(node);
  });

  /* ---------------------------------------------- черновик и файл ------ */

  function saveDraft(silent) {
    try {
      localStorage.setItem(A.draftKey, JSON.stringify(state));
      /* Черновику без слепка его не выдаём, пока он расходится с сайтом:
         записать сюда сегодняшний слепок значило бы объявить чужие правки
         своими и больше про них не вспомнить. */
      if (draftBase) localStorage.setItem(A.draftKey + ':base', draftBase);
      else if (staleDraft !== 'unknown') localStorage.setItem(A.draftKey + ':base', siteHash);
      var t = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      stateLine.removeAttribute('data-dirty');
      stateLine.textContent = dirty ? 'Сохранено в браузере в ' + t + ', на сайт ещё не выгружено'
                                    : 'Сохранено в браузере в ' + t;
      if (!silent) announce('Черновик сохранён в браузере.');
      return true;
    } catch (e) {
      stateLine.setAttribute('data-dirty', 'true');
      stateLine.textContent = 'Черновик не сохранён: в браузере кончилось место';
      announce('Черновик не сохранён: в браузере кончилось место. Скачайте резервную копию прямо сейчас.', true);
      return false;
    }
  }

  function buildFile() { return A.build(state); }

  function download() {
    if (!validate()) return;
    saveDraft(true);
    var blob = new Blob([buildFile()], { type: 'text/javascript;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = A.dataFile || 'data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    announce('Резервная копия скачана.');
  }

  function preview() {
    if (!saveDraft(true)) return;
    /* Сайт не умеет собирать каталог из черновика — он читает готовый файл.
       Поэтому кладём рядом с черновиком собранный текст файла: страница с
       ?draft=1 подхватит его вместо боевого каталога и покажет правки. */
    try { localStorage.setItem(A.draftKey + ':file', buildFile()); } catch (e) { /* нет места */ }
    window.open(A.preview || 'index.html?draft=1', '_blank', 'noopener');
    announce('Предпросмотр открыт в новой вкладке.');
  }

  ['download', 'download-2'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', download);
  });
  ['preview', 'preview-2'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', preview);
  });
  document.getElementById('check').addEventListener('click', function () {
    if (validate()) announce('Ошибок нет, можно сохранять на сайт.');
  });
  document.getElementById('reset').addEventListener('click', function () {
    openAsk('Сбросить черновик?',
            'Все правки в этом браузере пропадут, редактор вернётся к тому, что сейчас на сайте.',
            'Сбросить', function () {
              localStorage.removeItem(A.draftKey);
              localStorage.removeItem(A.draftKey + ':base');
              draftBase = siteHash;
              staleDraft = false;
              state = fileState();
              open = {};
              dirty = false;
              summary.hidden = true;
              fillSite();
              render();
              stateLine.removeAttribute('data-dirty');
              stateLine.textContent = 'Черновик сброшен';
              announce('Черновик сброшен. Показано то, что лежит на сайте.');
            });
  });

  /* ---------------------------------------------- тексты сайта --------- */

  function fillSite() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-site-field]'), function (input) {
      input.value = state.SITE[input.getAttribute('data-site-field')] || '';
    });
  }

  /* Поля текстов. Если в схеме у поля есть section — с него начинается
     новый блок-гармошка: на сайте десятки строк, и сплошным списком их не
     найти. Блок с ошибкой проверка раскроет сама. */
  function siteField(f) {
    var id = 'site-' + f.key;
    var desc = id + '-hint ' + id + '-err';
    var input = f.textarea
      ? '<textarea id="' + id + '" data-site-field="' + f.key + '" rows="' + (f.rows || 3) + '" aria-describedby="' + desc + '"></textarea>'
      : '<input type="text" id="' + id + '" data-site-field="' + f.key + '" autocomplete="off" aria-describedby="' + desc + '">';
    return '<div class="field' + (f.textarea || f.wide ? ' wide' : '') + '"><label for="' + id + '">' + esc(f.label) +
           (f.required ? ' <span class="req">(обязательно)</span>' : '') + '</label>' + input +
           '<p class="hint" id="' + id + '-hint">' + esc(f.hint || '') + '</p>' +
           '<p class="field__error" id="' + id + '-err"></p></div>';
  }

  var siteBox = document.getElementById('site-fields');
  if (siteBox) {
    var shtml = '', inBlock = false;
    (A.site || []).forEach(function (f) {
      if (f.section) {
        if (inBlock) shtml += '</div></div></details>';
        shtml += '<details class="tblock"' + (f.sectionOpen ? ' open' : '') + '><summary class="tblock__sum">' +
                 '<span class="tblock__name">' + esc(f.section) + '</span>' +
                 (f.sectionHint ? '<span class="tblock__hint">' + esc(f.sectionHint) + '</span>' : '') +
                 '</summary><div class="tblock__body"><div class="fields">';
        inBlock = true;
      } else if (!inBlock && !shtml) {
        shtml += '<div class="fields">';
      }
      shtml += siteField(f);
    });
    if (inBlock) shtml += '</div></div></details>';
    else if (shtml) shtml += '</div>';
    siteBox.innerHTML = shtml;
  }

  document.getElementById('form').addEventListener('input', function (e) {
    var key = e.target.getAttribute('data-site-field');
    if (!key) return;
    state.SITE[key] = e.target.value;
    touched();
  });

  /* PANEL_RELOADING ставит сама панель перед своей перезагрузкой (выход,
     откат): черновик всё равно ляжет в браузер на pagehide, а вопрос
     «покинуть сайт?» после собственной кнопки только пугает. */
  window.addEventListener('beforeunload', function (e) {
    if (!dirty || window.PANEL_RELOADING) return;
    e.preventDefault();
    e.returnValue = '';
  });
  var keepDraft = true;   // гасит forgetCleanDraft перед перезагрузкой после отката
  window.addEventListener('pagehide', function () { if (keepDraft) saveDraft(true); });

  /* ---------------------------------------------- наружу --------------- */

  /* Модуль публикации (publish.js) берёт отсюда файл и проверку. */
  window.PUBLISH = {
    build: buildFile,
    validate: validate,
    /* Слепок берём с данных, а не с собранного файла: в его шапке стоит время
       сборки, и хеш файла менялся бы при каждом вызове — строка состояния
       вечно показывала бы «есть несохранённые правки». */
    stateHash: function () {
      return JSON.stringify({ S: state.SITE, G: state.GROUPS, C: state.CARDS });
    },
    /* Публикация делает каталог сайта копией панели — предупреждать больше
       не о чем, и слепок надо подвинуть, иначе оно застрянет навсегда. */
    /* Откат сайта. Если после сохранения правок не было, черновик — ровно та
       версия, от которой откатились: оставь его, и после перезагрузки редактор
       показал бы откаченные правки с пугалкой «каталог на сайте меняли».
       Тогда черновик забываем, и редактор откроет то, что теперь на сайте.
       Есть несохранённые правки — их не трогаем. */
    forgetCleanDraft: function () {
      if (dirty) return false;
      keepDraft = false;
      clearTimeout(timers.autosave);
      try {
        localStorage.removeItem(A.draftKey);
        localStorage.removeItem(A.draftKey + ':base');
      } catch (e) { /* нет доступа — останется как было */ }
      return true;
    },
    onPublished: function () {
      /* Всё уехало на сайт — несохранённого больше нет. Без этого браузер
         при выходе и закрытии вкладки пугал «изменения не сохранятся». */
      dirty = false;
      siteHash = baseHash(state);
      draftBase = siteHash;
      staleDraft = false;
      try { localStorage.setItem(A.draftKey + ':base', siteHash); } catch (e) { /* нет места */ }
      stateLine.removeAttribute('data-dirty');
    },
    get confirmText() {
      if (staleDraft === 'unknown') {
        return 'Каталог на сайте будет заменён этой версией. Черновик отличается от того, что сейчас на сайте: ' +
               'если каталог правили не отсюда, те правки пропадут.';
      }
      return staleDraft
        ? 'Каталог на сайте будет заменён этой версией. Внимание: после того как вы начали править, каталог на сайте меняли. Эти изменения пропадут.'
        : 'Каталог на сайте будет заменён этой версией.';
    }
  };

  /* Один диктор на всю панель: другие модули (публикация, заявки) говорят
     через него, а не через свои таймеры — иначе сообщения затирают друг
     друга. Программный фокус — тоже отсюда, чтобы кольцо было видно. */
  window.PANEL = window.PANEL || {};
  window.PANEL.announce = announce;
  window.PANEL.announceSlow = announceSlow;
  window.PANEL.focusRing = focusRing;

  /* ---------------------------------------------- старт ---------------- */

  fillSite();
  render();
  if (staleDraft) {
    stateLine.setAttribute('data-dirty', 'true');
    stateLine.textContent = staleDraft === 'unknown'
      ? 'Открыт черновик из этого браузера, он отличается от каталога на сайте'
      : 'Открыт черновик из этого браузера, но каталог на сайте с тех пор менялся';
    var warn = staleDraft === 'unknown'
      ? 'Открыт черновик из этого браузера, и он отличается от каталога на сайте. ' +
        'Если это ваши незавершённые правки — продолжайте. Если правили в другом браузере ' +
        'или каталог обновлял разработчик — нажмите «Сбросить черновик», чтобы взять версию с сайта.'
      : 'Открыт черновик из этого браузера. Каталог на сайте после этого меняли: если сохранить ' +
        'черновик, те правки пропадут. Кнопка «Сбросить черновик» покажет то, что лежит на сайте.';
    /* Пока висит экран входа, редактора для человека ещё нет: сообщение,
       сказанное сейчас, ушло бы в пустоту и было бы затёрто словами гейта. */
    if (document.getElementById('gate')) {
      document.addEventListener('panel:unlocked', function () { announceSlow('draft', 900, warn); });
    } else {
      announce(warn);
    }
  } else {
    stateLine.textContent = fromDraft ? 'Открыт черновик из этого браузера'
                                      : 'Показано то, что лежит на сайте';
  }
})();
