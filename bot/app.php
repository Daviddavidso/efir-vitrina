<?php
// Логика бота: меню, разделы, карточки офферов, правка полей, плашки, разделы, настройки, админы.
// Подключается из bot.php (вебхук) и из тестов. Сам ничего не выполняет.

require_once __DIR__ . '/lib.php';

const FIELDS = [
    'name'  => ['Название', 'Пришли новое название — до 80 символов.', 80],
    'brand' => ['Компания', 'Пришли название банка или компании — до 60 символов.', 60],
    'cond'  => ['Главная строка', "Пришли главную строку — она крупно на карточке.\nНапример: «Кэшбэк до 30%» или «до 7 000 ₽ в день». До 60 символов.", 60],
    'desc'  => ['Описание', 'Пришли описание: 1–2 предложения, до 300 символов.', 300],
    'facts' => ['Детали', "Пришли детали — каждую с новой строки, до 6 строк:\nГрафик: свободный\nВыплаты: каждый день\n\nЧтобы очистить — пришли «-».", 80],
    'link'  => ['Ссылка', "Пришли ссылку — начинается с https://\nЕсли в ссылке есть erid, сайт сам подпишет «Реклама · erid».\n\nЧтобы убрать ссылку — пришли «-».", 1500],
    'img'   => ['Крео', "Пришли картинку-крео — как фото или файлом, до 5 МБ. Лучше горизонтальную 16:9.\nЕсли на картинке есть текст — добавь его подписью к фото: его прочитают незрячие посетители.\nВсё важное с картинки продублируй в «Главной строке» и «Деталях».", 0],
    'logo'  => ['Логотип', "Пришли логотип — квадратный, можно PNG с прозрачным фоном.", 0],
];
const SITE_FIELDS = [
    'name'     => ['Название сайта', 'Пришли название сайта — до 30 символов.', 30],
    'tagline'  => ['Подзаголовок', 'Пришли подзаголовок под главным заголовком — до 160 символов.', 160],
    'telegram' => ['Телеграм', "Пришли ник или ссылку, например @moy_kanal.\nЧтобы убрать кнопку — пришли «-».", 100],
    'agency'   => ['Сайт агентства', "Пришли ссылку на сайт кадрового агентства — начинается с https://\nТуда поведут кнопки в разделе «Работа»: каждая — сразу на свою вакансию.\nЧтобы убрать — пришли «-».", 300],
    'note'     => ['Строка в подвале', "Пришли текст для подвала (реквизиты, контакты) — до 300 символов.\nЧтобы убрать — пришли «-».", 300],
];
const TONES = ['accr' => '🟧 оранжевая', 'live' => '⬛ чёрная', 'topup' => '🟪 фиолетовая', 'check' => '🟦 синяя', 'out' => '🟩 зелёная', 'hold' => '🟨 жёлтая', 'rates' => '⬜ серая'];
const GROUPS = ['fin' => 'финансы', 'other' => 'другое', 'hr' => 'вакансии'];

// ---------- разметка ----------

function btn(string $text, string $data): array { return ['text' => $text, 'callback_data' => $data]; }
function kb(array $rows): array { return ['inline_keyboard' => array_values(array_filter($rows))]; }
function cat_icon(array $c): string
{
    $map = ['debit' => '💳', 'credit' => '🏦', 'mfo' => '💸', 'sim' => '📱', 'hr' => '💼'];
    return $map[$c['id']] ?? (($c['group'] ?? '') === 'hr' ? '💼' : '📁');
}
function find_offer(array $d, string $id): ?int { foreach ($d['offers'] as $i => $o) if (($o['id'] ?? '') === $id) return $i; return null; }
function find_cat(array $d, string $id): ?int { foreach ($d['categories'] as $i => $c) if (($c['id'] ?? '') === $id) return $i; return null; }
function offers_in(array $d, string $cat): array { return array_values(array_filter($d['offers'], function ($o) use ($cat) { return ($o['cat'] ?? '') === $cat; })); }

// ---------- состояние диалога ----------

function state_get(int $uid): array { $s = jread(priv('state.json'), []); $v = $s[(string)$uid] ?? []; return ($v && time() - ($v['at'] ?? 0) < 3600) ? $v : []; }
function state_set(int $uid, array $v): void { $s = jread(priv('state.json'), []); if ($v) { $v['at'] = time(); $s[(string)$uid] = $v; } else unset($s[(string)$uid]); jwrite(priv('state.json'), $s); }

// ---------- админы ----------

function admins(): array { return jread(priv('admins.json'), []); }
function is_admin(int $uid): bool { foreach (admins() as $a) if ((int)$a['id'] === $uid) return true; return false; }
function admin_add(array $from): void
{
    $list = admins();
    foreach ($list as $a) if ((int)$a['id'] === (int)$from['id']) return;
    $list[] = ['id' => (int)$from['id'], 'name' => trim(($from['first_name'] ?? '') . ' ' . ($from['last_name'] ?? '')), 'username' => $from['username'] ?? '', 'at' => date('c')];
    jwrite(priv('admins.json'), $list);
}
function invite_take(string $code): bool
{
    $inv = jread(priv('invites.json'), []);
    $ok = false;
    foreach ($inv as $i => $x) {
        if (hash_equals($x['code'], $code) && time() < $x['until']) { $ok = true; unset($inv[$i]); }
        elseif (time() >= $x['until']) unset($inv[$i]);
    }
    jwrite(priv('invites.json'), array_values($inv));
    return $ok;
}

// ---------- отправка ----------

/** Показать экран: в ответ на кнопку — правим то же сообщение, иначе шлём новое. */
function show(array $ctx, string $text, ?array $keyboard = null, array $extra = []): void
{
    $p = ['chat_id' => $ctx['chat'], 'text' => $text, 'parse_mode' => 'HTML'] + $extra;
    if ($keyboard !== null) $p['reply_markup'] = $keyboard;
    if (!isset($p['link_preview_options'])) $p['link_preview_options'] = ['is_disabled' => true];
    if (!empty($ctx['msg'])) {
        $p['message_id'] = $ctx['msg'];
        if (tg('editMessageText', $p) !== null) return;
        // «message is not modified» — экран и так актуален, второе сообщение не нужно
        if (stripos((string)($GLOBALS['TG_LAST_ERROR'] ?? ''), 'not modified') !== false) return;
        unset($p['message_id']);
    }
    tg('sendMessage', $p);
}
function send(array $ctx, string $text, ?array $keyboard = null, array $extra = []): void { $c = $ctx; $c['msg'] = null; show($c, $text, $keyboard, $extra); }
function toast(array $ctx, string $text = ''): void { if (!empty($ctx['cb'])) tg('answerCallbackQuery', ['callback_query_id' => $ctx['cb'], 'text' => $text]); }

// ---------- экраны ----------

function screen_main(array $ctx): void
{
    $d = data_load();
    $live = count(array_filter($d['offers'], function ($o) { return empty($o['hidden']); }));
    $rows = [];
    foreach ($d['categories'] as $c) {
        $n = count(offers_in($d, $c['id']));
        $rows[] = [btn(cat_icon($c) . ' ' . $c['name'] . ' · ' . $n, 'c:' . $c['id'])];
    }
    $rows[] = [btn('🏷 Плашки', 'bm'), btn('🗂 Разделы', 'cm')];
    $rows[] = [btn('⚙️ Сайт', 'st'), btn('↩️ Откатить', 'undo')];
    $site = site_url();
    $rows[] = $site ? [btn('👥 Админы', 'adm'), ['text' => '🌐 Открыть сайт', 'url' => $site]] : [btn('👥 Админы', 'adm')];
    $upd = !empty($d['updated']) ? date('d.m, H:i', strtotime($d['updated'])) : '—';
    $name = $d['site']['name'] ?? 'Витрина';
    show($ctx, "<b>" . h($name) . " · управление витриной</b>\n"
        . "На сайте {$live} из " . count($d['offers']) . " офферов · разделов " . count($d['categories']) . "\n"
        . "Последнее изменение: {$upd}\n\n"
        . "Выбери раздел или просто напиши название оффера — найду.", kb($rows));
}

function screen_cat(array $ctx, string $catId, string $note = ''): void
{
    $d = data_load();
    $ci = find_cat($d, $catId);
    if ($ci === null) { screen_main($ctx); return; }
    $c = $d['categories'][$ci];
    $list = offers_in($d, $catId);
    $hidden = count(array_filter($list, function ($o) { return !empty($o['hidden']); }));
    $rows = [];
    foreach ($list as $o) $rows[] = [btn((empty($o['hidden']) ? '✅ ' : '🙈 ') . mb_substr($o['name'], 0, 40), 'o:' . $o['id'])];
    $rows[] = [btn('➕ Добавить оффер', 'new:' . $catId)];
    $rows[] = [btn('⬅️ Меню', 'm')];
    $txt = ($note ? $note . "\n\n" : '') . "<b>" . cat_icon($c) . ' ' . h($c['name']) . "</b> — " . count($list) . " офф."
        . ($hidden ? " (скрыто {$hidden})" : '') . "\n✅ — на сайте, 🙈 — скрыт. Нажми на оффер, чтобы изменить.";
    show($ctx, $txt, kb($rows));
}

function offer_text(array $d, array $o): string
{
    $ci = find_cat($d, $o['cat']);
    $cat = $ci !== null ? $d['categories'][$ci]['name'] : '—';
    $bmap = []; foreach ($d['badges'] as $b) $bmap[$b['id']] = $b['label'];
    $badges = array_values(array_filter(array_map(function ($id) use ($bmap) { return $bmap[$id] ?? null; }, $o['badges'] ?? [])));
    $facts = array_filter($o['facts'] ?? []);
    $t = '<b>' . h($o['name']) . '</b>' . (!empty($o['brand']) ? ' · ' . h($o['brand']) : '') . "\n"
        . 'Раздел: ' . h($cat) . "\n"
        . 'Статус: ' . (empty($o['hidden']) ? '✅ на сайте' : '🙈 скрыт') . "\n\n"
        . '<b>Главная строка:</b> ' . (($o['cond'] ?? '') !== '' ? h($o['cond']) : '—') . "\n"
        . '<b>Описание:</b> ' . (($o['desc'] ?? '') !== '' ? h($o['desc']) : '—') . "\n"
        . '<b>Детали:</b> ' . ($facts ? "\n• " . implode("\n• ", array_map('h', $facts)) : '—') . "\n"
        . '<b>Плашки:</b> ' . ($badges ? h(implode(', ', $badges)) : '—') . "\n"
        . '<b>Ссылка:</b> ' . (!empty($o['link']) ? h($o['link']) : '❗️ не задана') . "\n"
        . '<b>Крео:</b> ' . (!empty($o['img']) ? 'есть' : 'нет') . ' · <b>Логотип:</b> ' . (!empty($o['logo']) ? 'есть' : 'нет');
    return $t;
}

function screen_offer(array $ctx, string $id, string $note = ''): void
{
    $d = data_load();
    $i = find_offer($d, $id);
    if ($i === null) { show($ctx, 'Оффер не найден — возможно, его уже удалили.', kb([[btn('⬅️ Меню', 'm')]])); return; }
    $o = $d['offers'][$i];
    $rows = [
        [btn('✏️ Название', "e:$id:name"), btn('🏢 Компания', "e:$id:brand")],
        [btn('⭐ Главная строка', "e:$id:cond"), btn('📝 Описание', "e:$id:desc")],
        [btn('📋 Детали', "e:$id:facts"), btn('🔗 Ссылка', "e:$id:link")],
        [btn('🖼 Крео', "e:$id:img"), btn('🔘 Логотип', "e:$id:logo")],
        [btn('🏷 Плашки', "b:$id"), btn('📦 Раздел', "mv:$id")],
        [btn('⬆️ Выше', "up:$id"), btn('⬇️ Ниже', "dn:$id"), btn(empty($o['hidden']) ? '🙈 Скрыть' : '✅ Показать', "hd:$id")],
        [btn('🗑 Удалить', "del:$id"), btn('⬅️ К разделу', 'c:' . $o['cat'])],
    ];
    $extra = [];
    if (!empty($o['img']) && site_url() !== '') {
        $extra['link_preview_options'] = ['url' => site_url($o['img']), 'prefer_large_media' => true, 'show_above_text' => true];
    }
    show($ctx, ($note ? $note . "\n\n" : '') . offer_text($d, $o), kb($rows), $extra);
}

function screen_badges(array $ctx, string $id): void
{
    $d = data_load();
    $i = find_offer($d, $id);
    if ($i === null) { screen_main($ctx); return; }
    $on = $d['offers'][$i]['badges'] ?? [];
    $rows = []; $row = [];
    foreach ($d['badges'] as $b) {
        $row[] = btn((in_array($b['id'], $on, true) ? '✅ ' : '▫️ ') . $b['label'], "bt:$id:" . $b['id']);
        if (count($row) === 2) { $rows[] = $row; $row = []; }
    }
    if ($row) $rows[] = $row;
    $rows[] = [btn('⬅️ К офферу', "o:$id")];
    show($ctx, 'Плашки для «' . h($d['offers'][$i]['name']) . "»\nНажимай, чтобы включить или выключить. На карточке их лучше 1–3.", kb($rows));
}

function screen_move(array $ctx, string $id): void
{
    $d = data_load();
    $i = find_offer($d, $id);
    if ($i === null) { screen_main($ctx); return; }
    $rows = [];
    foreach ($d['categories'] as $c) {
        $cur = $c['id'] === $d['offers'][$i]['cat'];
        $rows[] = [btn(($cur ? '• ' : '') . cat_icon($c) . ' ' . $c['name'], $cur ? "o:$id" : "mvc:$id:" . $c['id'])];
    }
    $rows[] = [btn('⬅️ К офферу', "o:$id")];
    show($ctx, 'В какой раздел перенести «' . h($d['offers'][$i]['name']) . '»?', kb($rows));
}

function screen_badge_admin(array $ctx, string $note = ''): void
{
    $d = data_load();
    $rows = [];
    foreach ($d['badges'] as $b) {
        $used = count(array_filter($d['offers'], function ($o) use ($b) { return in_array($b['id'], $o['badges'] ?? [], true); }));
        $rows[] = [btn(explode(' ', TONES[$b['tone']] ?? '⬜')[0] . ' ' . $b['label'] . " · $used", 'bme:' . $b['id']), btn('🗑', 'bmd:' . $b['id'])];
    }
    $rows[] = [btn('➕ Новая плашка', 'bmn')];
    $rows[] = [btn('⬅️ Меню', 'm')];
    show($ctx, ($note ? $note . "\n\n" : '') . "<b>🏷 Плашки</b>\nЦифра — на скольких офферах стоит. Нажми на название, чтобы переименовать.", kb($rows));
}

function screen_cat_admin(array $ctx, string $note = ''): void
{
    $d = data_load();
    $rows = [];
    foreach ($d['categories'] as $c) $rows[] = [btn(cat_icon($c) . ' ' . $c['name'] . ' · ' . count(offers_in($d, $c['id'])), 'cmx:' . $c['id'])];
    $rows[] = [btn('➕ Новый раздел', 'cmn')];
    $rows[] = [btn('⬅️ Меню', 'm')];
    show($ctx, ($note ? $note . "\n\n" : '') . "<b>🗂 Разделы сайта</b>\nПорядок здесь = порядок на сайте. Нажми на раздел, чтобы изменить.", kb($rows));
}

function screen_cat_edit(array $ctx, string $cid, string $note = ''): void
{
    $d = data_load();
    $ci = find_cat($d, $cid);
    if ($ci === null) { screen_cat_admin($ctx); return; }
    $c = $d['categories'][$ci];
    $n = count(offers_in($d, $cid));
    $rows = [
        [btn('✏️ Название', "cme:$cid:name"), btn('🔘 Текст кнопки', "cme:$cid:cta")],
        [btn('⬆️ Выше', "cmu:$cid"), btn('⬇️ Ниже', "cmd:$cid"), btn('🧩 Тип: ' . (GROUPS[$c['group'] ?? 'other'] ?? 'другое'), "cmg:$cid")],
        [$n ? btn('🗑 Удалить (сначала перенеси офферы)', "cmx:$cid") : btn('🗑 Удалить раздел', "cmdel:$cid")],
        [btn('⬅️ Разделы', 'cm')],
    ];
    show($ctx, ($note ? $note . "\n\n" : '') . '<b>' . cat_icon($c) . ' ' . h($c['name']) . "</b>\nОфферов: $n\nКнопка на карточках: «" . h($c['cta'] ?? 'Оформить') . "»\nТип: " . (GROUPS[$c['group'] ?? 'other'] ?? 'другое') . ' (у вакансий свой вид карточки)', kb($rows));
}

function screen_site(array $ctx, string $note = ''): void
{
    $d = data_load();
    $s = $d['site'] ?? [];
    $t = ($note ? $note . "\n\n" : '') . "<b>⚙️ Настройки сайта</b>\n";
    foreach (SITE_FIELDS as $k => $f) $t .= '<b>' . $f[0] . ':</b> ' . (($s[$k] ?? '') !== '' ? h($s[$k]) : '—') . "\n";
    $rows = [];
    foreach (SITE_FIELDS as $k => $f) $rows[] = [btn('✏️ ' . $f[0], "ste:$k")];
    $rows[] = [btn('⬅️ Меню', 'm')];
    show($ctx, $t, kb($rows));
}

function screen_admins(array $ctx, string $note = ''): void
{
    $rows = [];
    foreach (admins() as $a) {
        $label = ($a['name'] ?: 'без имени') . ($a['username'] ? ' @' . $a['username'] : '');
        $rows[] = (int)$a['id'] === $ctx['user'] ? [btn('👤 ' . $label . ' (ты)', 'adm')] : [btn('👤 ' . $label, 'adm'), btn('Убрать', 'admdel:' . $a['id'])];
    }
    $rows[] = [btn('➕ Пригласить админа', 'inv')];
    $rows[] = [btn('⬅️ Меню', 'm')];
    show($ctx, ($note ? $note . "\n\n" : '') . "<b>👥 Кто управляет витриной</b>\nНовый админ подключается по одноразовой ссылке — она живёт 30 минут.", kb($rows));
}

function prompt(array $ctx, string $text, array $state, array $extraRows = []): void
{
    $rows = $extraRows;
    $rows[] = [btn('✖️ Отмена', 'cx')];
    show($ctx, $text, kb($rows));
    state_set($ctx['user'], $state + ['msg' => $ctx['msg'] ?? null]);
}

// ---------- кнопки ----------

function on_callback(array $ctx, string $data): void
{
    $p = explode(':', $data);
    $a = $p[0];
    $id = $p[1] ?? '';
    $x = $p[2] ?? '';

    switch ($a) {
        case 'm': state_set($ctx['user'], []); toast($ctx); screen_main($ctx); return;
        case 'c': state_set($ctx['user'], []); toast($ctx); screen_cat($ctx, $id); return;
        case 'o': state_set($ctx['user'], []); toast($ctx); screen_offer($ctx, $id); return;
        case 'cx': state_set($ctx['user'], []); toast($ctx, 'Отменено'); screen_main($ctx); return;

        case 'e':
            if (!isset(FIELDS[$x])) { toast($ctx); return; }
            toast($ctx);
            $d = data_load(); $i = find_offer($d, $id);
            if ($i === null) { screen_main($ctx); return; }
            $o = $d['offers'][$i];
            $cur = $x === 'facts' ? implode("\n", $o['facts'] ?? []) : (string)($o[$x] ?? '');
            $extra = [];
            if (($x === 'img' || $x === 'logo') && !empty($o[$x])) $extra[] = [btn('🗑 Убрать ' . ($x === 'img' ? 'крео' : 'логотип'), "rm:$id:$x")];
            $t = '<b>' . FIELDS[$x][0] . '</b> — «' . h($o['name']) . "»\n\n" . h(FIELDS[$x][1])
                . (($x !== 'img' && $x !== 'logo' && $cur !== '') ? "\n\nСейчас:\n<code>" . h($cur) . '</code>' : '');
            prompt($ctx, $t, ['await' => 'field', 'field' => $x, 'id' => $id], $extra);
            return;

        case 'rm':
            if ($x !== 'img' && $x !== 'logo') return;
            $old = null;
            data_edit(function (&$d) use ($id, $x, &$old) { $i = find_offer($d, $id); if ($i === null) return; $old = $d['offers'][$i][$x] ?? null; $d['offers'][$i][$x] = ''; if ($x === 'img') unset($d['offers'][$i]['imgAlt']); }, ($x === 'img' ? 'крео убрано' : 'логотип убран'));
            drop_upload($old, data_load());
            state_set($ctx['user'], []);
            toast($ctx, 'Убрано');
            screen_offer($ctx, $id, '✔️ Убрано.');
            return;

        case 'ia0':
            data_edit(function (&$d) use ($id) { $i = find_offer($d, $id); if ($i === null) return; $d['offers'][$i]['imgAlt'] = ''; }, 'текст с крео');
            state_set($ctx['user'], []);
            toast($ctx, 'Сохранено');
            screen_offer($ctx, $id, '✔️ Крео обновлено — на сайте уже новое.');
            return;

        case 'b': toast($ctx); screen_badges($ctx, $id); return;
        case 'bt':
            data_edit(function (&$d) use ($id, $x) {
                $i = find_offer($d, $id); if ($i === null) return;
                $list = $d['offers'][$i]['badges'] ?? [];
                $list = in_array($x, $list, true) ? array_values(array_diff($list, [$x])) : array_merge($list, [$x]);
                $d['offers'][$i]['badges'] = $list;
            }, 'плашки оффера');
            toast($ctx, 'Сохранено');
            screen_badges($ctx, $id);
            return;

        case 'hd':
            $now = null;
            data_edit(function (&$d) use ($id, &$now) { $i = find_offer($d, $id); if ($i === null) return; $d['offers'][$i]['hidden'] = empty($d['offers'][$i]['hidden']); $now = $d['offers'][$i]['hidden']; }, 'видимость оффера');
            toast($ctx, $now ? 'Скрыт с сайта' : 'Показан на сайте');
            screen_offer($ctx, $id);
            return;

        case 'up': case 'dn':
            $moved = data_edit(function (&$d) use ($id, $a) {
                $i = find_offer($d, $id); if ($i === null) return false;
                $cat = $d['offers'][$i]['cat'];
                $idx = []; foreach ($d['offers'] as $k => $o) if ($o['cat'] === $cat) $idx[] = $k;
                $pos = array_search($i, $idx, true);
                $j = $a === 'up' ? ($idx[$pos - 1] ?? null) : ($idx[$pos + 1] ?? null);
                if ($j === null) return false;
                $tmp = $d['offers'][$i]; $d['offers'][$i] = $d['offers'][$j]; $d['offers'][$j] = $tmp;
                return true;
            }, 'порядок офферов');
            toast($ctx, $moved ? ($a === 'up' ? 'Поднял' : 'Опустил') : 'Дальше некуда');
            if ($moved) screen_offer($ctx, $id);
            return;

        case 'mv': toast($ctx); screen_move($ctx, $id); return;
        case 'mvc':
            data_edit(function (&$d) use ($id, $x) { $i = find_offer($d, $id); if ($i === null || find_cat($d, $x) === null) return; $d['offers'][$i]['cat'] = $x; }, 'перенос в другой раздел');
            toast($ctx, 'Перенёс');
            screen_offer($ctx, $id, '✔️ Перенёс в другой раздел.');
            return;

        case 'del':
            toast($ctx);
            $d = data_load(); $i = find_offer($d, $id);
            if ($i === null) { screen_main($ctx); return; }
            show($ctx, 'Удалить «' . h($d['offers'][$i]['name']) . "» насовсем?\nЕсли передумаешь — «↩️ Откатить» в меню вернёт его.", kb([[btn('🗑 Да, удалить', "delok:$id"), btn('Нет', "o:$id")]]));
            return;
        case 'delok':
            $cat = null; $removed = null;
            data_edit(function (&$d) use ($id, &$cat, &$removed) { $i = find_offer($d, $id); if ($i === null) return; $removed = $d['offers'][$i]; $cat = $removed['cat']; array_splice($d['offers'], $i, 1); }, 'удаление оффера');
            toast($ctx, 'Удалено');
            if ($cat) screen_cat($ctx, $cat, '🗑 «' . h($removed['name']) . '» удалён.'); else screen_main($ctx);
            return;

        case 'new':
            toast($ctx);
            prompt($ctx, "Как назовём новый оффер?\nПришли название — например «Карта Ozon». Остальное заполним дальше.", ['await' => 'new', 'cat' => $id]);
            return;

        case 'undo':
            $what = data_undo();
            toast($ctx, $what ? 'Откатил' : 'Нечего откатывать');
            if ($what) send($ctx, '↩️ Отменил: ' . h($what) . '. Сайт уже показывает прошлую версию.');
            screen_main(['msg' => null] + $ctx);
            return;

        // плашки
        case 'bm': toast($ctx); screen_badge_admin($ctx); return;
        case 'bme':
            toast($ctx);
            prompt($ctx, 'Как переименовать плашку? Пришли новое название — до 24 символов.', ['await' => 'badge_label', 'id' => $id]);
            return;
        case 'bmd':
            data_edit(function (&$d) use ($id) {
                $d['badges'] = array_values(array_filter($d['badges'], function ($b) use ($id) { return $b['id'] !== $id; }));
                foreach ($d['offers'] as &$o) $o['badges'] = array_values(array_diff($o['badges'] ?? [], [$id]));
            }, 'удаление плашки');
            toast($ctx, 'Удалена');
            screen_badge_admin($ctx, '🗑 Плашка удалена со всех офферов.');
            return;
        case 'bmn':
            toast($ctx);
            prompt($ctx, 'Новая плашка: пришли название — до 24 символов. Например «Без процентов».', ['await' => 'badge_new']);
            return;
        case 'bmt':
            $st = state_get($ctx['user']);
            if (($st['await'] ?? '') !== 'badge_tone' || !isset(TONES[$id])) { toast($ctx); screen_badge_admin($ctx); return; }
            $label = $st['label'];
            data_edit(function (&$d) use ($label, $id) { $d['badges'][] = ['id' => new_id('b', array_column($d['badges'], 'id')), 'label' => $label, 'tone' => $id]; }, 'новая плашка');
            state_set($ctx['user'], []);
            toast($ctx, 'Готово');
            screen_badge_admin($ctx, '✔️ Плашка «' . h($label) . '» добавлена. Включить её можно в карточке оффера → 🏷 Плашки.');
            return;

        // разделы
        case 'cm': toast($ctx); screen_cat_admin($ctx); return;
        case 'cmx': toast($ctx); screen_cat_edit($ctx, $id); return;
        case 'cme':
            if ($x !== 'name' && $x !== 'cta') return;
            toast($ctx);
            prompt($ctx, $x === 'name' ? 'Пришли новое название раздела — до 40 символов.' : 'Пришли текст кнопки на карточках этого раздела — до 20 символов. Например «Оформить» или «Откликнуться».', ['await' => 'cat_field', 'id' => $id, 'field' => $x]);
            return;
        case 'cmg':
            data_edit(function (&$d) use ($id) { $i = find_cat($d, $id); if ($i === null) return; $keys = array_keys(GROUPS); $cur = array_search($d['categories'][$i]['group'] ?? 'other', $keys, true); $d['categories'][$i]['group'] = $keys[((int)$cur + 1) % count($keys)]; }, 'тип раздела');
            toast($ctx, 'Сохранено');
            screen_cat_edit($ctx, $id);
            return;
        case 'cmu': case 'cmd':
            data_edit(function (&$d) use ($id, $a) { $i = find_cat($d, $id); if ($i === null) return; $j = $a === 'cmu' ? $i - 1 : $i + 1; if (!isset($d['categories'][$j])) return; $t = $d['categories'][$i]; $d['categories'][$i] = $d['categories'][$j]; $d['categories'][$j] = $t; }, 'порядок разделов');
            toast($ctx);
            screen_cat_edit($ctx, $id);
            return;
        case 'cmdel':
            $ok = data_edit(function (&$d) use ($id) { if (offers_in($d, $id)) return false; $i = find_cat($d, $id); if ($i === null) return false; array_splice($d['categories'], $i, 1); return true; }, 'удаление раздела');
            toast($ctx, $ok ? 'Раздел удалён' : 'В разделе есть офферы');
            screen_cat_admin($ctx, $ok ? '🗑 Раздел удалён.' : '');
            return;
        case 'cmn':
            toast($ctx);
            prompt($ctx, 'Как назовём новый раздел? Например «Инвестиции» — до 40 символов.', ['await' => 'cat_new']);
            return;

        // сайт
        case 'st': toast($ctx); screen_site($ctx); return;
        case 'ste':
            if (!isset(SITE_FIELDS[$id])) return;
            toast($ctx);
            prompt($ctx, '<b>' . SITE_FIELDS[$id][0] . "</b>\n" . h(SITE_FIELDS[$id][1]), ['await' => 'site', 'field' => $id]);
            return;

        // админы
        case 'adm': toast($ctx); screen_admins($ctx); return;
        case 'inv':
            $code = strtoupper(substr(str_replace(['0', 'O', '1', 'I', 'L'], '', bin2hex(random_bytes(8))), 0, 8));
            $inv = jread(priv('invites.json'), []);
            $inv[] = ['code' => $code, 'until' => time() + 1800, 'by' => $ctx['user']];
            jwrite(priv('invites.json'), $inv);
            toast($ctx);
            $bot = (string)cfg('bot_username', '');
            $how = $bot !== '' ? "Отправь человеку эту ссылку:\nhttps://t.me/" . h($bot) . '?start=' . $code : 'Пусть напишет боту: <code>/start ' . $code . '</code>';
            show($ctx, "➕ Приглашение готово — работает один раз и 30 минут.\n\n" . $how, kb([[btn('⬅️ Админы', 'adm')]]));
            return;
        case 'admdel':
            $uid = (int)$id;
            if ($uid !== $ctx['user']) jwrite(priv('admins.json'), array_values(array_filter(admins(), function ($a) use ($uid) { return (int)$a['id'] !== $uid; })));
            toast($ctx, 'Убран');
            screen_admins($ctx);
            return;
    }
    toast($ctx);
}

// ---------- текст и картинки ----------

function on_input(array $ctx, array $msg): void
{
    $st = state_get($ctx['user']);
    $text = isset($msg['text']) ? trim($msg['text']) : '';
    $clear = $text === '-';

    if (!$st) {
        if ($text === '' ) { send($ctx, 'Чтобы заменить картинку, открой оффер и нажми 🖼 Крео.'); return; }
        search($ctx, $text);
        return;
    }
    $close = function (string $done) use ($ctx, $st) {
        if (!empty($st['msg'])) tg('editMessageText', ['chat_id' => $ctx['chat'], 'message_id' => $st['msg'], 'text' => $done]);
        state_set($ctx['user'], []);
    };

    switch ($st['await']) {
        case 'field':
            $f = $st['field']; $id = $st['id'];
            if ($f === 'img' || $f === 'logo') {
                $fileId = null;
                if (!empty($msg['photo'])) { $ph = end($msg['photo']); $fileId = $ph['file_id']; }
                elseif (!empty($msg['document']) && starts_with((string)($msg['document']['mime_type'] ?? ''), 'image/')) $fileId = $msg['document']['file_id'];
                if (!$fileId) { send($ctx, 'Жду картинку — пришли её как фото или файлом. Или нажми «Отмена».'); return; }
                $tmp = tg_download($fileId, 5 * 1024 * 1024);
                $path = $tmp ? save_image($tmp, $f) : null;
                if ($tmp) @unlink($tmp);
                if (!$path) { send($ctx, 'Не получилось сохранить: нужна картинка JPG, PNG или WEBP до 5 МБ.'); return; }
                $old = null;
                $cap = $f === 'img' ? trim((string)($msg['caption'] ?? '')) : '';
                $alt = $cap === '-' ? '' : clip($cap, 200);
                data_edit(function (&$d) use ($id, $f, $path, $alt, &$old) {
                    $i = find_offer($d, $id); if ($i === null) return;
                    $old = $d['offers'][$i][$f] ?? null; $d['offers'][$i][$f] = $path;
                    if ($f === 'img') $d['offers'][$i]['imgAlt'] = $alt;
                }, $f === 'img' ? 'новое крео' : 'новый логотип');
                drop_upload($old, data_load());
                $close('✔️ Поле «' . FIELDS[$f][0] . '» сохранено.');
                if ($f === 'img' && $cap === '') {
                    prompt($ctx, "🖼 Крео сохранено. Что на нём написано?\nПришли текст с картинки — его прочитают незрячие посетители. Если текста нет — нажми кнопку или пришли «-».",
                        ['await' => 'imgalt', 'id' => $id], [[btn('Текста нет', "ia0:$id")]]);
                    return;
                }
                send_offer($ctx, $id, '✔️ Поле «' . FIELDS[$f][0] . '» обновлено — на сайте уже новое.');
                return;
            }
            if ($text === '') { send($ctx, 'Жду текст. Или нажми «Отмена».'); return; }
            if ($f === 'link' && !$clear && !is_url($text)) { send($ctx, 'Это не похоже на ссылку. Нужна полная ссылка, начинается с https://'); return; }
            if ($f === 'name' && $clear) { send($ctx, 'Без названия нельзя — пришли название.'); return; }
            $val = $clear ? '' : $text;
            if ($f === 'facts') {
                $val = $clear ? [] : array_slice(array_values(array_filter(array_map(function ($l) { return clip(ltrim($l, "•-–— \t"), 80); }, preg_split('/\R/u', $text)))), 0, 6);
            } elseif ($f !== 'link') {
                $val = clip($val, FIELDS[$f][2]);
            }
            data_edit(function (&$d) use ($id, $f, $val) { $i = find_offer($d, $id); if ($i === null) return; $d['offers'][$i][$f] = $val; }, FIELDS[$f][0] . ' оффера');
            $close('✔️ Поле «' . FIELDS[$f][0] . '» сохранено.');
            send_offer($ctx, $id, '✔️ Поле «' . FIELDS[$f][0] . '» обновлено — на сайте уже новое.');
            return;

        case 'imgalt':
            $id = $st['id'];
            if ($text === '') { send($ctx, 'Жду текст с картинки. Если текста нет — пришли «-».'); return; }
            $alt = $clear ? '' : clip($text, 200);
            data_edit(function (&$d) use ($id, $alt) { $i = find_offer($d, $id); if ($i === null) return; $d['offers'][$i]['imgAlt'] = $alt; }, 'текст с крео');
            $close('✔️ Текст с картинки сохранён.');
            send_offer($ctx, $id, '✔️ Крео обновлено — на сайте уже новое.');
            return;

        case 'new':
            if ($text === '' || $clear) { send($ctx, 'Пришли название оффера текстом.'); return; }
            $cat = $st['cat'];
            $newId = data_edit(function (&$d) use ($cat, $text) {
                if (find_cat($d, $cat) === null) return null;
                $id = new_id('o', array_column($d['offers'], 'id'));
                $d['offers'][] = ['id' => $id, 'cat' => $cat, 'name' => clip($text, 80), 'brand' => '', 'logo' => '', 'img' => '', 'cond' => '', 'desc' => '', 'facts' => [], 'link' => '', 'badges' => [], 'hidden' => true];
                return $id;
            }, 'новый оффер');
            $close('✔️ Оффер создан.');
            if ($newId) send_offer($ctx, $newId, "🆕 Оффер создан и пока скрыт.\nЗаполни ссылку, главную строку и описание, потом нажми «✅ Показать».");
            return;

        case 'badge_label':
            if ($text === '' || $clear) return;
            $id = $st['id'];
            data_edit(function (&$d) use ($id, $text) { foreach ($d['badges'] as &$b) if ($b['id'] === $id) $b['label'] = clip($text, 24); }, 'название плашки');
            $close('✔️ Сохранено.');
            state_set($ctx['user'], []);
            screen_badge_admin(['msg' => null] + $ctx, '✔️ Плашка переименована.');
            return;

        case 'badge_new':
            if ($text === '' || $clear) return;
            $rows = []; $row = [];
            foreach (TONES as $k => $v) { $row[] = btn($v, "bmt:$k"); if (count($row) === 2) { $rows[] = $row; $row = []; } }
            if ($row) $rows[] = $row;
            $rows[] = [btn('✖️ Отмена', 'cx')];
            if (!empty($st['msg'])) tg('editMessageText', ['chat_id' => $ctx['chat'], 'message_id' => $st['msg'], 'text' => 'Название: ' . clip($text, 24)]);
            send($ctx, 'Какого цвета будет «' . h(clip($text, 24)) . '»?', kb($rows));
            state_set($ctx['user'], ['await' => 'badge_tone', 'label' => clip($text, 24)]);
            return;

        case 'cat_field':
            if ($text === '' || $clear) return;
            $id = $st['id']; $f = $st['field'];
            data_edit(function (&$d) use ($id, $f, $text) { $i = find_cat($d, $id); if ($i === null) return; $d['categories'][$i][$f] = clip($text, $f === 'cta' ? 20 : 40); }, $f === 'cta' ? 'текст кнопки раздела' : 'название раздела');
            $close('✔️ Сохранено.');
            screen_cat_edit(['msg' => null] + $ctx, $id, '✔️ Сохранено — на сайте уже новое.');
            return;

        case 'cat_new':
            if ($text === '' || $clear) return;
            $cid = data_edit(function (&$d) use ($text) { $id = new_id('c', array_column($d['categories'], 'id')); $d['categories'][] = ['id' => $id, 'name' => clip($text, 40), 'group' => 'other', 'cta' => 'Подробнее']; return $id; }, 'новый раздел');
            $close('✔️ Раздел создан.');
            screen_cat_edit(['msg' => null] + $ctx, $cid, '🆕 Раздел создан. Он появится на сайте, когда в нём будет хотя бы один видимый оффер.');
            return;

        case 'site':
            if ($text === '') return;
            $f = $st['field'];
            $val = $clear ? '' : clip($text, SITE_FIELDS[$f][2]);
            if ($f === 'name' && $val === '') { send($ctx, 'Без названия нельзя.'); return; }
            if ($f === 'agency' && $val !== '' && !is_url($val)) { send($ctx, 'Это не похоже на ссылку. Нужна полная ссылка, начинается с https://'); return; }
            data_edit(function (&$d) use ($f, $val) { $d['site'][$f] = $val; }, 'настройки сайта');
            $close('✔️ Сохранено.');
            screen_site(['msg' => null] + $ctx, '✔️ Сохранено — на сайте уже новое.');
            return;
    }
    state_set($ctx['user'], []);
    screen_main($ctx);
}

function send_offer(array $ctx, string $id, string $note): void { screen_offer(['msg' => null] + $ctx, $id, $note); }

function search(array $ctx, string $q): void
{
    $d = data_load();
    $q = mb_strtolower($q);
    $found = array_values(array_filter($d['offers'], function ($o) use ($q) { return mb_strpos(mb_strtolower(($o['name'] ?? '') . ' ' . ($o['brand'] ?? '')), $q) !== false; }));
    if (!$found) { send($ctx, 'Не нашёл «' . h($q) . '». Попробуй часть названия или открой раздел.', kb([[btn('⬅️ Меню', 'm')]])); return; }
    $rows = [];
    foreach (array_slice($found, 0, 10) as $o) $rows[] = [btn((empty($o['hidden']) ? '✅ ' : '🙈 ') . mb_substr($o['name'], 0, 40), 'o:' . $o['id'])];
    $rows[] = [btn('⬅️ Меню', 'm')];
    send($ctx, 'Нашёл: ' . count($found), kb($rows));
}

// ---------- точка входа ----------

function handle_update(array $u): void
{
    if (isset($u['callback_query'])) {
        $cq = $u['callback_query'];
        $from = $cq['from'] ?? [];
        $chat = $cq['message']['chat'] ?? [];
        if (($chat['type'] ?? '') !== 'private') return;
        $ctx = ['chat' => $chat['id'], 'user' => (int)$from['id'], 'msg' => $cq['message']['message_id'] ?? null, 'cb' => $cq['id']];
        if (!is_admin($ctx['user'])) { toast($ctx, 'Нет доступа'); return; }
        on_callback($ctx, (string)($cq['data'] ?? ''));
        return;
    }
    $msg = $u['message'] ?? null;
    if (!$msg || ($msg['chat']['type'] ?? '') !== 'private') return;
    $from = $msg['from'] ?? [];
    $ctx = ['chat' => $msg['chat']['id'], 'user' => (int)($from['id'] ?? 0), 'msg' => null, 'cb' => null];
    $text = trim((string)($msg['text'] ?? ''));

    if (!is_admin($ctx['user'])) {
        if (preg_match('~^/start\s+(\S+)~u', $text, $m)) {
            $code = $m[1];
            $bind = (string)cfg('bind_code', '');
            if (($bind !== '' && hash_equals($bind, $code)) || invite_take($code)) {
                admin_add($from);
                send($ctx, "👋 Готово, теперь ты управляешь витриной.\nЗдесь меняются офферы, ссылки, крео, плашки и тексты — сайт обновляется сразу.");
                screen_main($ctx);
                return;
            }
        }
        send($ctx, 'Это закрытый бот для управления сайтом.');
        return;
    }

    if ($text === '/start' || $text === '/menu' || starts_with($text, '/start ')) { state_set($ctx['user'], []); screen_main($ctx); return; }
    if ($text === '/cancel') { state_set($ctx['user'], []); send($ctx, 'Отменил.'); screen_main($ctx); return; }
    if ($text === '/undo') { $w = data_undo(); send($ctx, $w ? '↩️ Отменил: ' . h($w) . '.' : 'Откатывать нечего.'); return; }
    on_input($ctx, $msg);
}
