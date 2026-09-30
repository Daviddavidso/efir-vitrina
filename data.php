<?php
// Отдаёт каталог мимо кеша хостинга: бот сохранил — сайт сразу видит новое.
// Открыт для чтения с других доменов: так ленд агентства берёт вакансии из того же каталога (?cat=hr).
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Access-Control-Allow-Origin: *');
$file = __DIR__ . '/data.json';
if (!is_file($file)) { http_response_code(404); echo '{"offers":[]}'; exit; }
$raw = (string)file_get_contents($file);
$cat = isset($_GET['cat']) ? preg_replace('/[^a-z0-9_-]/i', '', (string)$_GET['cat']) : '';
if ($cat === '') { echo $raw; exit; }
$d = json_decode($raw, true) ?: [];
$d['offers'] = array_values(array_filter($d['offers'] ?? [], function ($o) use ($cat) { return ($o['cat'] ?? '') === $cat && empty($o['hidden']); }));
$d['categories'] = array_values(array_filter($d['categories'] ?? [], function ($c) use ($cat) { return ($c['id'] ?? '') === $cat; }));
echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
