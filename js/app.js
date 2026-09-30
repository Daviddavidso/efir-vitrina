// Витрина v2: каталог из data.php → data.json (правится телеграм-ботом), плитки разделов с иконками,
// фильтр, карточки офферов и 3D-веер карт в первом экране.
(function () {
  const $ = s => document.querySelector(s);

  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = reduceMq.matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
  const okLink = u => /^https?:\/\//i.test(u || '');
  const erid = u => { const m = /[?&]erid=([^&#]+)/i.exec(u || ''); return m ? decodeURIComponent(m[1]) : ''; };
  const emoji = id => { const e = (window.EMOJI || []).find(x => x.id === id); return e ? window.emojiSVG(e) : ''; };

  // иконки разделов — js/emoji.js
  const CAT_EMOJI = { debit: 'card', credit: 'stavki', mfo: 'nach', sim: 'waves', hr: 'popol' };
  const CAT_NOTE = { debit: 'Кэшбэк и бесплатное обслуживание', credit: 'Льготный период и рассрочка', mfo: 'Деньги на карту онлайн', sim: 'Тарифы, eSIM, перенос номера', hr: 'Курьеры, склады, магазины' };
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const OUT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>';

  let DATA, active = 'all', ctaT, ctaClearT, countT;
  const OFFERS = (n, hr) => `${n} ${hr ? plural(n, 'вакансия', 'вакансии', 'вакансий') : plural(n, 'предложение', 'предложения', 'предложений')}`;
  const isHr = f => !!(DATA && (DATA.categories || []).some(c => c.id === f && c.group === 'hr'));

  // фирменный цвет: из js/brands.js по имени файла логотипа, для новых логотипов — считаем из картинки
  const BRAND = window.BRAND_COLORS || {};
  const logoFile = o => String(o.logo || '').split(/[?#]/)[0].split('/').pop();
  const brandOf = o => BRAND[logoFile(o)] || null;
  const isLight = hex => {
    const n = parseInt(hex.slice(1), 16);
    const L = [n >> 16, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return .2126 * L[0] + .7152 * L[1] + .0722 * L[2] > .45;
  };
  function sampleBrand(img) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 48;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data, bins = {};
      let seen = 0, best = null;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 160) continue;
        seen++;
        const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (!mx || (mx - mn) / mx < .35 || mx < 56) continue;
        let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
        const k = Math.floor((((h * 60) + 360) % 360) / 15), z = bins[k] || (bins[k] = { n: 0, r: 0, g: 0, b: 0 });
        z.n++; z.r += r; z.g += g; z.b += b;
        if (!best || z.n > best.n) best = z;
      }
      if (!best || best.n < seen * .04) return null;
      return '#' + [best.r, best.g, best.b].map(v => Math.round(v / best.n).toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; } // логотип с чужого сайта — canvas закрыт, остаётся нейтральный цвет
  }
  function paint(cardEl, hex) {
    cardEl.style.setProperty('--brand', hex);
    const m = cardEl.querySelector('.mini');
    if (m) m.classList.toggle('is-light', isLight(hex));
  }
  // «номер» мини-карты: стабильный для оффера, но без подряд идущих цифр у соседних карточек
  const last4 = id => { let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return String((h >>> 0) % 10000).padStart(4, '0'); };
  const NFC = '<svg class="mini__nfc" viewBox="0 0 40 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><path d="M6 22 A10 10 0 0 1 6 38"/><path d="M15 14 A20 20 0 0 1 15 46"/><path d="M24 6 A30 30 0 0 1 24 54"/></svg>';

  function media(o, cat, light) {
    if (o.img) return `<img class="card__img" src="${esc(o.img)}" alt="${esc(o.imgAlt || '')}" loading="lazy">`;
    const lg = o.logo ? `src="${esc(o.logo)}" alt="" loading="lazy" decoding="async"` : '';
    if (cat.id === 'debit' || cat.id === 'credit') {
      return `<div class="mini${light ? ' is-light' : ''}"><div class="mini__top">${lg ? `<img class="mini__logo" ${lg} width="22" height="22">` : ''}<span>${esc(o.brand || o.name)}</span>${NFC}</div>
        <div class="mini__row"><span class="mini__chip"></span><span class="mini__num">•••• ${last4(o.id)}</span></div></div>`;
    }
    return lg ? `<img class="card__logo" ${lg} width="72" height="72">`
      : `<span class="card__logo card__logo--mono">${esc((o.brand || o.name || '?').trim().charAt(0))}</span>`;
  }
  function badges(o) {
    const map = Object.fromEntries((DATA.badges || []).map(b => [b.id, b]));
    const list = (o.badges || []).map(id => map[id]).filter(Boolean);
    if (!list.length) return '';
    return `<ul class="badges" role="list" aria-label="Метки">${list.map(b => `<li class="chip chip--${esc(b.tone || 'rates')}"><i aria-hidden="true"></i>${esc(b.label)}</li>`).join('')}</ul>`;
  }
  // «Оформление: онлайн» → строка «Оформление | онлайн»; строка без двоеточия идёт целиком
  function specs(list) {
    const pairs = [], plain = [];
    list.forEach(f => {
      const i = f.indexOf(':');
      if (i > 0 && i < 40 && f.slice(i + 1).trim()) pairs.push([f.slice(0, i).trim(), f.slice(i + 1).trim()]); else plain.push(f);
    });
    return (pairs.length ? `<dl class="specs">${pairs.map(([t, v]) => `<div><dt>${esc(t)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '')
      + plain.map(f => `<p class="spec-note">${esc(f)}</p>`).join('');
  }
  // раздел «Работа»: если в настройках указан сайт агентства, кнопки ведут туда — сразу на эту вакансию (#vac-<id>)
  let AGENCY = '';
  function card(o, cat) {
    const cta = cat.cta || 'Оформить';
    const toAgency = cat.group === 'hr' && AGENCY;
    const ad = toAgency ? '' : erid(o.link);
    const color = brandOf(o);
    const light = color && isLight(color);
    const btn = toAgency
      ? `<a class="cta" href="${esc(AGENCY + '#vac-' + encodeURIComponent(o.id))}" target="_blank" rel="noopener">${esc(cta)}${OUT}<span class="vh">: ${esc(o.name)} (откроется сайт агентства в новой вкладке)</span></a>`
      : okLink(o.link)
      ? `<a class="cta" href="${esc(o.link)}" target="_blank" rel="sponsored noopener">${esc(cta)}${ARROW}<span class="vh">: ${esc(o.name)} (откроется в новой вкладке)</span></a>`
      : `<button class="cta" type="button" data-empty>${esc(cta)}${ARROW}<span class="vh">: ${esc(o.name)}</span></button>`;
    return `<li class="card${cat.group === 'hr' ? ' card--hr' : ''}" id="ofr-${esc(o.id)}"${color ? ` style="--brand:${color}"` : ' data-sample'}>
      <div class="card__body">
        <div class="card__titles"><h4>${esc(o.name)}</h4>${o.brand && o.brand !== o.name ? `<span class="card__brand">${esc(o.brand)}</span>` : ''}</div>
        ${badges(o)}
        ${o.cond ? `<p class="card__cond">${esc(o.cond)}</p>` : ''}
        ${o.desc ? `<p class="card__desc">${esc(o.desc)}</p>` : ''}
        ${specs((o.facts || []).filter(Boolean))}
        <div class="card__foot">${btn}<span class="ad">Реклама${ad ? `<br>erid ${esc(ad)}` : ''}</span></div>
        <p class="card__note" id="note-${esc(o.id)}"></p>
      </div>
      <div class="card__media"${o.img && o.imgAlt ? '' : ' aria-hidden="true"'}>${media(o, cat, light)}</div>
    </li>`;
  }

  function render() {
    const S = DATA.site || {};
    document.querySelectorAll('[data-site="name"]').forEach(n => n.textContent = S.name || 'Подборка');
    if (S.tagline) $('[data-site="tagline"]').textContent = S.tagline;
    if (S.note) $('[data-site="note"]').textContent = S.note;
    if (S.name) document.title = `${S.name} — карты, займы, сим-карты и вакансии`;
    AGENCY = okLink(S.agency) ? String(S.agency).replace(/#.*$/, '') : '';
    if (S.telegram) { const t = $('#tg-link'); t.href = /^https?:/.test(S.telegram) ? S.telegram : `https://t.me/${S.telegram.replace(/^@/, '')}`; t.target = '_blank'; t.rel = 'noopener'; t.hidden = false; }

    const cats = DATA.categories || [];
    const live = (DATA.offers || []).filter(o => !o.hidden && cats.some(c => c.id === o.cat));
    const byCat = c => live.filter(o => o.cat === c.id);
    const nonEmpty = cats.filter(c => byCat(c).length);

    const upd = DATA.updated ? new Date(DATA.updated) : null;
    if (upd && !isNaN(upd)) $('#pill').textContent = `Обновлено ${upd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · ${live.length} ${plural(live.length, 'предложение', 'предложения', 'предложений')}`;
    $('#facts').innerHTML = `<li><b>${live.length}</b><span>${plural(live.length, 'предложение', 'предложения', 'предложений')}</span></li>
      <li><b>${new Set(live.map(o => o.brand)).size}</b><span>компаний</span></li>
      <li><b>${nonEmpty.length}</b><span>${plural(nonEmpty.length, 'раздел', 'раздела', 'разделов')}</span></li>`;

    $('#bento').innerHTML = nonEmpty.map(c => {
      const n = byCat(c).length;
      return `<li><a class="tile" href="#cat-${esc(c.id)}" data-f="${esc(c.id)}">
        <span class="tile__ico" aria-hidden="true">${emoji(CAT_EMOJI[c.id] || 'chart')}</span>
        <span class="tile__arrow" aria-hidden="true">${ARROW}</span>
        <span class="tile__txt"><b>${esc(c.name)}<span class="vh">,</span></b><span>${n} ${c.group === 'hr' ? plural(n, 'вакансия', 'вакансии', 'вакансий') : plural(n, 'вариант', 'варианта', 'вариантов')}${CAT_NOTE[c.id] ? `<span class="tile__note"><span aria-hidden="true"> · </span><span class="vh">, </span>${CAT_NOTE[c.id]}</span>` : ''}</span></span>
      </a></li>`;
    }).join('');

    const cnt = (n, hr) => `<span>${n}<span class="vh"> ${hr ? plural(n, 'вакансия', 'вакансии', 'вакансий') : plural(n, 'предложение', 'предложения', 'предложений')}</span></span>`;
    $('#filters').innerHTML = `<button class="fbtn" type="button" data-f="all" data-name="Все разделы" aria-pressed="true">Все ${cnt(live.length)}</button>` +
      nonEmpty.map(c => `<button class="fbtn" type="button" data-f="${esc(c.id)}" data-name="${esc(c.name)}" aria-pressed="false">${esc(c.name)} ${cnt(byCat(c).length, c.group === 'hr')}</button>`).join('');

    $('#sections').innerHTML = nonEmpty.map(c => `<section class="cat" id="cat-${esc(c.id)}" data-cat="${esc(c.id)}">
        <div class="cat__head"><h3 id="h-${esc(c.id)}">${esc(c.name)}</h3>${cnt(byCat(c).length, c.group === 'hr')}${c.group === 'hr' && AGENCY ? `<a class="cat__more" href="${esc(AGENCY)}" target="_blank" rel="noopener">Все вакансии на сайте агентства<span class="vh"> (откроется в новой вкладке)</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></a>` : ''}</div>
        <ul class="grid" role="list">${byCat(c).map(o => card(o, c)).join('')}</ul></section>`).join('') || '<p class="state">Подборка пока пустая.</p>';
    document.querySelectorAll('.card[data-sample]').forEach(el => {
      const img = el.querySelector('.mini__logo, .card__logo');
      if (!img || img.tagName !== 'IMG') return;
      const go = () => { const hex = sampleBrand(img); if (hex) paint(el, hex); };
      img.complete && img.naturalWidth ? go() : img.addEventListener('load', go, { once: true });
    });
    document.querySelectorAll('a[href^="#cat-"]').forEach(a => {
      const gone = !document.getElementById(a.getAttribute('href').slice(1));
      (a.closest('.hdr li') || a).hidden = gone;
    });
    applyFilter(active, false);
  }

  function applyFilter(f, announce = true) {
    active = f;
    let shown = 0;
    document.querySelectorAll('.fbtn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    document.querySelectorAll('.cat').forEach(s => {
      const on = f === 'all' || s.dataset.cat === f;
      s.hidden = !on;
      if (on) shown += s.querySelectorAll('.card').length;
    });
    const st = $('#count-status');
    clearTimeout(countT);
    st.textContent = '';
    if (announce) {
      const name = typeof announce === 'string' ? announce : ($(`.fbtn[data-f="${f}"]`) || {}).dataset?.name || '';
      countT = setTimeout(() => { st.textContent = `${name ? name + ': ' : ''}${OFFERS(shown, isHr(f))}`; }, 150);
    }
  }
  // переход к разделу. only — из плитки или кнопки «Вакансии»: показываем только его; из меню — все разделы.
  // В обоих случаях фокус на заголовке раздела, чтобы чтение с экрана продолжилось оттуда.
  function goToCat(f, only) {
    const sec = document.getElementById('cat-' + f), h = sec && sec.querySelector('h3');
    if (!h) return false;
    if (only) applyFilter(f, false);
    else if (sec.hidden) applyFilter('all', false);
    sec.scrollIntoView({ block: 'start' });
    h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    h.addEventListener('blur', () => h.removeAttribute('tabindex'), { once: true });
    try { history.replaceState(null, '', '#cat-' + f); } catch (e) { /* file:// */ }
    clearTimeout(countT);
    if (only) countT = setTimeout(() => { $('#count-status').textContent = `Раздел «${h.textContent}»: ${OFFERS(sec.querySelectorAll('.card').length, isHr(f))}. Остальные скрыты, показать все — кнопка «Все» в фильтре.`; }, 400);
    return true;
  }

  document.addEventListener('click', e => {
    const fb = e.target.closest('.fbtn');
    if (fb) {
      applyFilter(fb.dataset.f);
      const s = $('.cat:not([hidden])'), bars = hdr.offsetHeight + $('.filters').offsetHeight;
      if (s && s.getBoundingClientRect().top < bars) s.scrollIntoView({ block: 'start' });
      return;
    }
    const empty = e.target.closest('[data-empty]');
    if (empty) {
      const card = empty.closest('.card');
      card.querySelector('.card__note').textContent = 'Ссылку на оформление скоро добавим.';
      const st = $('#cta-status');
      clearTimeout(ctaT); clearTimeout(ctaClearT); st.textContent = '';
      ctaT = setTimeout(() => { st.textContent = `Ссылку на «${card.querySelector('h4').textContent}» скоро добавим.`; }, 100);
      ctaClearT = setTimeout(() => { st.textContent = ''; }, 5000);
      return;
    }
    const cardEl = e.target.closest('.card');
    if (cardEl && !e.target.closest('a, button') && !String(getSelection ? getSelection() : '')) { cardEl.querySelector('.cta')?.click(); return; }
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    // ссылка пропуска: фокус на main только на время перехода
    if (a.classList.contains('skip')) {
      const m = $('#main'); e.preventDefault();
      m.setAttribute('tabindex', '-1'); m.focus(); m.scrollIntoView();
      m.addEventListener('blur', () => m.removeAttribute('tabindex'), { once: true });
      return;
    }
    // плитка раздела — показываем только его; «Смотреть предложения» — все; якорь в скрытый раздел сбрасывает фильтр
    if (a.dataset.f) { if (goToCat(a.dataset.f, true)) e.preventDefault(); return; }
    const m = /^#cat-(.+)$/.exec(a.getAttribute('href'));
    if (m) { if (goToCat(m[1], false)) e.preventDefault(); return; }
    if (a.getAttribute('href') === '#catalog') { applyFilter('all', false); return; }
    if (active !== 'all') {
      const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (target && target.closest('.cat[hidden]')) applyFilter('all', false);
    }
  });

  // активная кнопка фильтра не уезжает за край ленты
  document.addEventListener('focusin', e => {
    const b = e.target.closest && e.target.closest('.fbtn');
    if (!b) return;
    const box = b.parentElement;
    const l = b.offsetLeft - 16, r = b.offsetLeft + b.offsetWidth + 16 - box.clientWidth;
    if (box.scrollLeft > l) box.scrollLeft = l; else if (box.scrollLeft < r) box.scrollLeft = r;
  });

  // ---------- шапка: тонкая линия, когда страница прокручена ----------
  const hdr = $('#hdr');
  const onScroll = () => hdr.classList.toggle('is-stuck', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const measureBars = () => {
    const r = document.documentElement.style;
    r.setProperty('--hdr', hdr.offsetHeight + 'px');
    r.setProperty('--flt', ($('.filters') || {}).offsetHeight + 'px');
  };
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(measureBars); ro.observe(hdr); ro.observe($('.filters')); }
  measureBars();

  // ---------- веер карт: одна карта раскрывается в пять ----------
  // Наведение поднимает только лицевую сторону карты (зона под курсором стоит на месте — ничего не дёргается),
  // клик «вытаскивает» карту из веера поверх остальных, повторный клик или клик мимо — кладёт обратно.
  const fan = $('#fan'), stage = $('#fan-stage');
  const banks = [...fan.querySelectorAll('.bank')];
  const open = () => {
    if (fan.classList.contains('is-open')) return;
    // при первом раскрытии карты расходятся по очереди от центра, дальше — все сразу
    banks.forEach(b => b.style.setProperty('--delay', `${Math.abs(+b.dataset.slot - 2) * 70}ms`));
    fan.classList.add('is-open');
    setTimeout(() => banks.forEach(b => b.style.removeProperty('--delay')), 1100);
  };
  const drop = () => banks.forEach(b => b.classList.remove('is-picked'));
  fan.addEventListener('click', e => {
    const b = e.target.closest('.bank');
    if (!b) return;
    if (!fan.classList.contains('is-open')) { open(); return; }
    const was = b.classList.contains('is-picked');
    drop();
    if (!was) b.classList.add('is-picked');
  });
  document.addEventListener('click', e => { if (!fan.contains(e.target)) drop(); });
  fan.addEventListener('touchstart', () => {}, { passive: true }); // iOS: без этого не срабатывает :active

  // прокрутка: вниз — веер складывается в одну карту, вверх — раскрывается обратно.
  // Полностью раскрыт, пока веер на своём месте в первом экране; сложен, когда ушёл вверх на ~треть экрана.
  let lastP = -1;
  const fold = () => {
    const vh = innerHeight, r = fan.getBoundingClientRect();
    const center = r.top + r.height / 2, home = Math.min(center + scrollY, vh * .45);
    const p = reduceMq.matches ? 1 : Math.max(0, Math.min(1, 1 - (home - center) / Math.max(vh * .3, 180)));
    const q = Math.round(p * 1000) / 1000;
    if (q !== lastP) { lastP = q; fan.style.setProperty('--p', q); if (q < .6) drop(); }
  };
  addEventListener('scroll', fold, { passive: true });
  addEventListener('resize', fold);
  fold();


  if (reduce) open();
  else {
    const whenSeen = () => {
      if (!('IntersectionObserver' in window)) { setTimeout(open, 450); return; }
      const io = new IntersectionObserver(en => { if (en.some(x => x.isIntersecting)) { io.disconnect(); setTimeout(open, 350); } }, { threshold: .45 });
      io.observe(fan);
    };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => (document.readyState === 'complete' ? whenSeen() : addEventListener('load', whenSeen, { once: true })));
    // лёгкий наклон веера за курсором — только над самим веером и только мышью
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let raf = 0, px = 0, py = 0;
      const tilt = () => {
        raf = 0;
        if (reduceMq.matches) return;
        const r = fan.getBoundingClientRect();
        const dx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / (r.width / 2)));
        const dy = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / (r.height / 2)));
        stage.style.setProperty('--ry', `${(-8 + dx * 7).toFixed(2)}deg`);
        stage.style.setProperty('--rx', `${(12 - dy * 5).toFixed(2)}deg`);
      };
      fan.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(tilt); });
      fan.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); raf = 0; stage.style.removeProperty('--ry'); stage.style.removeProperty('--rx'); });
    }
  }

  async function load() {
    for (const url of ['data.php', 'data.json']) {
      const ctl = 'AbortController' in window ? new AbortController() : null;
      const t = ctl && setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
        if (!r.ok) continue;
        const d = await r.json();
        if (d && Array.isArray(d.offers)) return d;
      } catch (e) { /* пробуем следующий источник */ } finally { clearTimeout(t); }
    }
    throw new Error('no data');
  }
  const t0 = Date.now();
  load().then(d => {
    DATA = d; render();
    if (Date.now() - t0 > 2000) $('#count-status').textContent = `Подборка загружена: ${OFFERS(document.querySelectorAll('.card').length)}`;
  }).catch(() => {
    $('#state').textContent = 'Не удалось загрузить подборку. Обновите страницу.';
    ['#sections-sec', '.filters', '#facts'].forEach(sel => { const n = $(sel); if (n) n.hidden = true; });
    document.querySelectorAll('a[href^="#cat-"]').forEach(l => { (l.closest('.hdr li') || l).hidden = true; });
  });
})();
