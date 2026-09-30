<?php
// Одноразовая установка: открыть в браузере https://сайт/bot/install.php?key=СЕКРЕТ
// Прописывает вебхук с секретным заголовком и меню команд. Повторный запуск безопасен.
require_once __DIR__ . '/lib.php';
header('Content-Type: text/plain; charset=utf-8');

$secret = (string)cfg('secret', '');
if ($secret === '' || !hash_equals($secret, (string)($_GET['key'] ?? ''))) { http_response_code(403); exit("Нет доступа: нужен ?key= из config.php\n"); }
if (!cfg('token') || !cfg('site_url')) exit("Заполни token и site_url в bot/config.php\n");

$me = tg('getMe');
if (!$me) exit("Токен не подошёл: проверь token в config.php\n");
$hook = site_url('bot/bot.php');
$ok = tg('setWebhook', ['url' => $hook, 'secret_token' => $secret, 'allowed_updates' => ['message', 'callback_query'], 'drop_pending_updates' => true]);
tg('setMyCommands', ['commands' => [
    ['command' => 'menu', 'description' => 'Главное меню'],
    ['command' => 'undo', 'description' => 'Откатить последнее изменение'],
    ['command' => 'cancel', 'description' => 'Отменить ввод'],
]]);
priv(); // создаёт закрытую папку

echo "Бот: @" . $me['username'] . "\n";
echo "Вебхук: " . ($ok !== null ? "установлен → $hook" : "НЕ установлен — проверь, что сайт открывается по https") . "\n";
echo "Закрытая папка: " . priv() . (is_writable(priv()) ? " (запись есть)" : " (НЕТ ЗАПИСИ — поправь права)") . "\n";
echo "Каталог: " . data_path() . (is_writable(data_path()) ? " (запись есть)" : " (НЕТ ЗАПИСИ — поправь права)") . "\n\n";
echo "Дальше: напиши боту /start " . cfg('bind_code') . " — и ты админ.\n";
