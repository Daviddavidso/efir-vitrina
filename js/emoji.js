// Иконки разделов витрины: 5 знаков 100×100, петля 3 с, двигаются только при наведении/фокусе (css/emoji.css).
// Нейтральные — без знаков и символики чужих брендов. id совпадают с CAT_EMOJI в js/app.js.
(function () {
  const arcs = (cls = '') => `<path class="a1 ${cls}" d="M6 22 A10 10 0 0 1 6 38"/><path class="a2 ${cls}" d="M15 14 A20 20 0 0 1 15 46"/><path class="a3 ${cls}" d="M24 6 A30 30 0 0 1 24 54"/>`;
  const tile = (fill, extra = '') => `<rect x="5" y="5" width="90" height="90" rx="26" fill="${fill}" ${extra}/>`;
  const O = '#FF4A1C', INK = '#141414', W = '#FFFFFF';

  window.EMOJI = [
    { id: 'card', name: 'Карта',
      svg: `<defs><clipPath id="cardclip"><rect x="8" y="22" width="84" height="56" rx="11"/></clipPath></defs>
        <g class="cd-body">
          <rect x="8" y="22" width="84" height="56" rx="11" fill="${O}"/>
          <rect x="18" y="37" width="18" height="14" rx="3.5" fill="#F6E7BE"/>
          <path d="M18 44 H36 M27 37 V51" stroke="${O}" stroke-width="1.6"/>
          <g transform="translate(76 27) scale(.34)" fill="none" stroke="${W}" stroke-width="8" stroke-linecap="round">${arcs()}</g>
          <rect x="18" y="60" width="34" height="5" rx="2.5" fill="${W}" opacity=".9"/>
          <circle cx="70" cy="63" r="7" fill="${W}" opacity=".95"/><circle cx="79" cy="63" r="7" fill="${W}" opacity=".6"/>
          <g clip-path="url(#cardclip)"><rect class="cd-shine" x="-30" y="10" width="16" height="80" fill="${W}" opacity=".38" transform="rotate(20 50 50)"/></g>
        </g>` },

    { id: 'stavki', name: 'Процент',
      svg: `${tile(W, `stroke="${INK}" stroke-width="5"`)}
        <circle cx="31" cy="35" r="8" fill="none" stroke="${INK}" stroke-width="5.5"/>
        <circle cx="55" cy="67" r="8" fill="none" stroke="${INK}" stroke-width="5.5"/>
        <path d="M58 28 L28 74" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
        <g class="st-up"><path d="M76 72 V36 M65 47 L76 35 L87 47" fill="none" stroke="#0E8A43" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>` },

    { id: 'nach', name: 'Деньги на карту',
      svg: `${tile(O)}
        <g class="nc-coin">
          <circle cx="46" cy="54" r="24" fill="${W}"/>
          <path d="M40 66 V42 H50 C56 42 59 46 59 50 C59 54 56 58 50 58 H36 M36 62 H52" fill="none" stroke="${O}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g class="nc-plus"><path d="M78 16 V34 M69 25 H87" stroke="${W}" stroke-width="7" stroke-linecap="round"/></g>` },

    { id: 'waves', name: 'Связь',
      svg: `<circle cx="20" cy="50" r="8" fill="${O}"/>
        <g transform="translate(24 8) scale(1.4)" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round">${arcs('wv')}</g>` },

    { id: 'popol', name: 'Работа',
      svg: `${tile('#7A5CFF')}
        <circle cx="41" cy="38" r="12" fill="${W}"/>
        <path d="M19 76 C19 62 29 55 41 55 C53 55 63 62 63 76 Z" fill="${W}"/>
        <g class="pp-plus"><path d="M74 44 V64 M64 54 H84" stroke="${W}" stroke-width="8" stroke-linecap="round"/></g>` },
  ];

  window.emojiSVG = (e, cls = '') => `<svg class="emj emj-${e.id} ${cls}" viewBox="0 0 100 100" aria-hidden="true">${e.svg}</svg>`;
})();
