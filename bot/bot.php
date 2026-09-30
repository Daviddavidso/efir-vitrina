<?php
// Вебхук Telegram. Принимает обновления только с секретным заголовком, который задан при установке.
require_once __DIR__ . '/app.php';

$secret = (string)cfg('secret', '');
$got = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
if ($secret === '' || !hash_equals($secret, $got)) { http_response_code(403); exit; }

$update = json_decode((string)file_get_contents('php://input'), true);
// Telegram ждёт быстрый ответ; ошибки пишем в лог, но всегда отвечаем 200, чтобы не было повторов.
http_response_code(200);
if (is_array($update)) {
    try { handle_update($update); } catch (Throwable $e) { error_log('efir bot: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine()); }
}
