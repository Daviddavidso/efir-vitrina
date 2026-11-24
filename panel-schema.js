/* ==========================================================================
   СХЕМА ВИТРИНЫ ДЛЯ ЯДРА ПАНЕЛИ (panel-core.js).

   Файл сайта — data.js: SITE / BADGES / CATEGORIES / OFFERS.
   Особенности:
     * у раздела есть тип (group): fin, other или hr — его панель не правит,
       он переносится как есть; у раздела «Работа» (hr) кнопки ведут на сайт
       агентства (SITE.agency + #vac-<id>), ссылка в карточке не нужна;
     * плашки (BADGES) в карточке пишутся словами через запятую; новое слово —
       новая плашка;
     * id предложения постоянный: на него завязаны якоря вакансий агентства.
   ========================================================================== */

window.ADMIN = {
  brand: 'Витрина',
  dataFile: 'data.js',
  draftKey: 'vitrina_admin_draft',
  preview: 'index.html?draft=1',
  requireErid: false,
  logo: true,
  surface: '#ffffff',
  defaultTone: { bg: '#0B0D12', ink: '#FFFFFF' },

  presets: [
    { label: 'Логотипы на сайте', items: (function () {
      var names = {
        adengi: 'А Деньги', akbars: 'АК Барс', alfabank: 'Альфа-Банк', beeline: 'Билайн', bistrodengi: 'Быстроденьги',
        bspb: 'Банк Санкт-Петербург', carmoney: 'CarMoney', centrofinans: 'Центрофинанс', crediteurope: 'Кредит Европа Банк',
        creditplus: 'Кредит Плюс', denga: 'Деньга', denginadom: 'Деньги на дом', dengisrazu: 'Деньги Сразу', dodo: 'Додо Пицца',
        dozarplati: 'До Зарплаты', ekapusta: 'еКапуста', forabank: 'Фора-Банк', gazprombank: 'Газпромбанк', halva: 'Халва',
        homecredit: 'Хоум Банк', joymoney: 'Joymoney', kuper: 'Купер', kviku: 'Kviku', limezaim: 'Лайм-Займ', magnit: 'Магнит',
        maxcredit: 'Max.Credit', megafon: 'МегаФон', migcredit: 'МигКредит', modulbank: 'Модульбанк', moneyman: 'MoneyMan',
        mts: 'МТС', mtsbank: 'МТС Банк', oneclickmoney: 'OneClickMoney', otp: 'ОТП Банк', ozon: 'Ozon Банк', platiza: 'Platiza',
        pochtabank: 'Почта Банк', psb: 'ПСБ', pyaterochka: 'Пятёрочка', raiffeisen: 'Райффайзенбанк', rencredit: 'Ренессанс Кредит',
        rocketman: 'Rocketman', rsb: 'Русский Стандарт', rshb: 'Россельхозбанк', samokat: 'Самокат', sberbank: 'Сбербанк',
        sbermobile: 'СберМобайл', smartcash: 'Умные наличные', smsfinance: 'СМС Финанс', sovcombank: 'Совкомбанк',
        srochnodengi: 'Срочно Деньги', svoiludi: 'Свои Люди', t2: 'T2', tbank: 'Т-Банк', turbozaim: 'Турбозайм', ubrir: 'УБРиР',
        uralsib: 'Уралсиб', vkusvill: 'ВкусВилл', vtb: 'ВТБ', webbankir: 'Webbankir', wildberries: 'Wildberries',
        yandexeda: 'Яндекс Еда', yandexlavka: 'Яндекс Лавка', yandexmarket: 'Яндекс Маркет', yota: 'Yota', zaryad: 'Заряд от Магнита',
        zaymer: 'Займер', zaymigo: 'Zaymigo', zenit: 'Банк Зенит'
      };
      var ext = { crediteurope: 'svg', forabank: 'svg', smartcash: 'svg', turbozaim: 'svg', zaryad: 'svg' };
      return Object.keys(names).sort(function (a, b) { return names[a].localeCompare(names[b], 'ru'); })
        .map(function (k) { return { name: names[k], value: 'img/logos/' + k + '.' + (ext[k] || 'png') }; });
    })() }
  ],

  site: [
    { section: 'Название и контакты', sectionHint: 'шапка, вкладка браузера, Telegram, подвал',
      key: 'name', label: 'Название витрины', required: true,
      hint: 'В шапке, на вкладке браузера и в подвале. Пока стоит заглушка «Подборка».' },
    { key: 'tagline', label: 'Текст под заголовком', textarea: true,
      hint: 'Одно-два предложения в первом экране.' },
    { key: 'telegram', label: 'Telegram',
      hint: 'Ник (@name) или ссылка t.me/… Пока пусто — кнопки «Телеграм» в шапке нет.' },
    { key: 'note', label: 'Строка в подвале', textarea: true, hint: 'Реквизиты или оговорка. Пусто — строки нет.' },
    { key: 'agency', label: 'Сайт агентства',
      hint: 'Адрес сайта «Работа просто»: на него ведут кнопки раздела «Работа», каждая — сразу к своей вакансии.' },
    { key: 'updated', label: 'Дата обновления',
      hint: 'В виде 2026-11-24. В первом экране печатается «Обновлено 24 ноября».' }
  ],

  groups: [
    { key: 'title', label: 'Название раздела', required: true, hint: 'Плитка в первом экране и кнопка-фильтр.' },
    { key: 'cta', label: 'Надпись на кнопках', required: true, hint: 'Одна на все предложения раздела: «Оформить», «Открыть счёт».' }
  ],

  card: [
    { key: 'name', label: 'Название', required: true, hint: 'Крупно в карточке: «Альфа-Карта с кэшбэком».' },
    { key: 'brand', label: 'Компания', required: true, hint: 'Банк, МФО, оператор или работодатель: «Альфа-Банк».' },
    { key: 'cond', label: 'Главная строка', hint: 'Самое важное условие: «Кэшбэк до 5%». Цифры — только подтверждённые партнёркой.' },
    { key: 'desc', label: 'Описание', type: 'textarea', hint: 'Одно-два предложения.' },
    { key: 'facts', label: 'Условия', type: 'lines', hint: 'По строке на условие: «Выпуск: бесплатно».' },
    { key: 'badges', label: 'Плашки', hint: 'Через запятую: «Хит, Кэшбэк, Онлайн». Новое слово — новая плашка. Пусто — плашек нет.' },
    { key: 'link', label: 'Партнёрская ссылка', type: 'url',
      hint: 'Ссылку из партнёрки — целиком, с метками. Пусто — кнопка говорит «Ссылку скоро добавим». В разделе «Работа» оставьте пустой — кнопка ведёт на сайт агентства.' }
  ],

  load: function () {
    function str(v) { return v == null ? '' : String(v); }
    function extraOf(obj, known) {
      var x = {};
      Object.keys(obj).forEach(function (k) { if (known.indexOf(k) === -1) x[k] = obj[k]; });
      return x;
    }
    var B = typeof BADGES !== 'undefined' ? BADGES : [];
    var label = {}; B.forEach(function (b) { label[b.id] = b.label; });

    var groups = (typeof CATEGORIES !== 'undefined' ? CATEGORIES : []).map(function (c) {
      return { key: str(c.id), title: str(c.name), cta: str(c.cta), extra: extraOf(c, ['id', 'name', 'cta']) };
    });
    var KEYS = ['id', 'cat', 'name', 'brand', 'logo', 'tone', 'cond', 'desc', 'facts', 'badges', 'link', 'hidden'];
    var seen = {};
    var cards = (typeof OFFERS !== 'undefined' ? OFFERS : []).map(function (o, i) {
      var uid = str(o.id) || ('o' + i), base = uid, n = 2;
      while (seen[uid]) uid = base + '-' + (n++);
      seen[uid] = true;
      return {
        uid: uid, group: str(o.cat), hidden: !!o.hidden,
        name: str(o.name), brand: str(o.brand), cond: str(o.cond), desc: str(o.desc),
        facts: (o.facts || []).map(str),
        badges: (o.badges || []).map(function (id) { return label[id] || id; }).join(', '),
        link: str(o.link), logo: str(o.logo),
        tone: { bg: (o.tone && o.tone.bg) || '#0B0D12', ink: (o.tone && o.tone.ink) || '#FFFFFF' },
        extra: extraOf(o, KEYS)
      };
    });
    var site = JSON.parse(JSON.stringify(typeof SITE !== 'undefined' ? SITE : {}));
    /* плашки панель не показывает отдельным списком — держим их рядом с текстами */
    site.__badges = JSON.parse(JSON.stringify(B));
    return { SITE: site, GROUPS: groups, CARDS: cards };
  },

  build: function (m) {
    function js(v) { return JSON.stringify(v, null, 2); }
    function t(v) { return String(v == null ? '' : v).trim(); }
    var TONES = ['accr', 'live', 'topup', 'check', 'rates', 'hold', 'out'];
    var badges = (m.SITE.__badges || []).slice();
    function badgeId(word) {
      var w = t(word); if (!w) return '';
      for (var i = 0; i < badges.length; i++) if (badges[i].label.toLowerCase() === w.toLowerCase() || badges[i].id === w) return badges[i].id;
      var id = 'b' + (badges.length + 1); while (badges.some(function (b) { return b.id === id; })) id += 'x';
      badges.push({ id: id, label: w, tone: TONES[badges.length % TONES.length] });
      return id;
    }
    var site = {};
    Object.keys(m.SITE || {}).forEach(function (k) {
      if (k === '__badges') return;
      var v = m.SITE[k]; site[k] = typeof v === 'string' ? v.trim() : v;
    });
    var categories = m.GROUPS.map(function (g) {
      var c = { id: g.key, name: t(g.title) };
      Object.keys(g.extra || {}).forEach(function (k) { c[k] = g.extra[k]; });
      if (!c.group) c.group = 'fin';
      c.cta = t(g.cta) || 'Оформить';
      return c;
    });
    var offers = m.CARDS.map(function (c) {
      var o = { id: c.uid, cat: c.group, name: t(c.name), brand: t(c.brand), logo: t(c.logo) };
      if (!o.logo) o.tone = { bg: t(c.tone && c.tone.bg) || '#0B0D12', ink: t(c.tone && c.tone.ink) || '#FFFFFF' };
      Object.keys(c.extra || {}).forEach(function (k) { if (!(k in o)) o[k] = c.extra[k]; });
      o.cond = t(c.cond); o.desc = t(c.desc);
      o.facts = (c.facts || []).map(t).filter(Boolean);
      o.link = t(c.link);
      o.badges = t(c.badges).split(/\s*,\s*/).map(badgeId).filter(Boolean);
      o.hidden = !!c.hidden;
      return o;
    });
    /* неиспользуемые плашки, заведённые панелью, не копим */
    var used = {}; offers.forEach(function (o) { o.badges.forEach(function (b) { used[b] = 1; }); });
    badges = badges.filter(function (b) { return used[b.id] || !/^b\d+x*$/.test(b.id); });
    return [
      '/* ═════════════════════════════════════════════════════════════════════════',
      '   ВИТРИНА «' + (t(site.name) || 'Подборка') + '» — тексты, плашки, разделы и предложения.',
      '   Собран панелью ' + new Date().toLocaleString('ru-RU') + '.',
      '',
      '   Правится через panel.html. Руками тоже можно, но при следующем',
      '   сохранении из панели правки будут перезаписаны.',
      '',
      '   CATEGORIES.group: fin — финансы, other — прочее, hr — вакансии',
      '   (кнопки ведут на сайт агентства: SITE.agency + #vac-<id>).',
      '   OFFERS.link — партнёрская ссылка; пусто — «Ссылку скоро добавим».',
      '',
      '   ВАЖНО ПРО ЦИФРЫ: ставки, лимиты, кэшбэк — только подтверждённые партнёркой.',
      '   ═════════════════════════════════════════════════════════════════════════ */',
      '',
      'const SITE = ' + js(site) + ';',
      '',
      'const BADGES = ' + js(badges) + ';',
      '',
      'const CATEGORIES = ' + js(categories) + ';',
      '',
      'const OFFERS = ' + js(offers) + ';',
      ''
    ].join('\n');
  }
};
