<?php
// Общие функции бота: настройки, файлы с блокировкой, откат, Telegram API, картинки.
// Совместимо с PHP 7.4+.

function cfg(string $key, $default = null)
{
    static $c = null;
    if ($c === null) {
        $file = __DIR__ . '/config.php';
        $c = is_file($file) ? (require $file) : [];
        if (isset($GLOBALS['EFIR_CONFIG_OVERRIDE'])) $c = array_merge($c, $GLOBALS['EFIR_CONFIG_OVERRIDE']);
        date_default_timezone_set($c['tz'] ?? 'Europe/Moscow');
    }
    return array_key_exists($key, $c) ? $c[$key] : $default;
}

/** Закрытая папка: админы, состояния, копии каталога. По умолчанию — над корнем сайта. */
function priv(string $file = ''): string
{
    $dir = cfg('private_dir') ?: dirname(__DIR__, 2) . '/.efir-private';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return rtrim($dir, '/') . ($file !== '' ? '/' . $file : '');
}

function site_root(): string { return cfg('site_root') ?: dirname(__DIR__); }
function data_path(): string { return site_root() . '/data.json'; }
function uploads_dir(): string { $d = site_root() . '/uploads'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }

// ---------- JSON с блокировкой и атомарной записью ----------

function jread(string $path, $default)
{
    if (!is_file($path)) return $default;
    $fh = fopen($path, 'r');
    if (!$fh) return $default;
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $v = json_decode((string)$raw, true);
    return is_array($v) ? $v : $default;
}

function jwrite(string $path, $value): void
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) throw new RuntimeException('json encode failed');
    $tmp = $path . '.tmp' . bin2hex(random_bytes(3));
    file_put_contents($tmp, $json, LOCK_EX);
    @chmod($tmp, 0644);
    if (!rename($tmp, $path)) { @unlink($tmp); throw new RuntimeException('cannot write ' . basename($path)); }
}

/** Изменение каталога под одной блокировкой: читаем → меняем → копия старого → пишем. */
function data_edit(callable $fn, string $why = '')
{
    $lock = fopen(priv('.data.lock'), 'c');
    flock($lock, LOCK_EX);
    try {
        $data = jread(data_path(), null);
        if (!is_array($data)) throw new RuntimeException('каталог не найден');
        $before = json_encode($data, JSON_UNESCAPED_UNICODE);
        $result = $fn($data);
        if (json_encode($data, JSON_UNESCAPED_UNICODE) !== $before) {
            backup_push($before, $why);
            $data['updated'] = date('c');
            jwrite(data_path(), $data);
        }
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function data_load(): array { return jread(data_path(), ['site' => [], 'badges' => [], 'categories' => [], 'offers' => []]); }

function backup_push(string $json, string $why): void
{
    $dir = priv('backups');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $name = date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '.json';
    file_put_contents("$dir/$name", $json);
    $log = jread(priv('backups/log.json'), []);
    $log[] = ['file' => $name, 'why' => $why, 'at' => date('c')];
    // храним последние 40 копий
    while (count($log) > 40) { $old = array_shift($log); @unlink("$dir/" . $old['file']); }
    jwrite(priv('backups/log.json'), $log);
}

/** Откат последнего изменения. Возвращает описание отменённого действия или null. */
function data_undo(): ?string
{
    $lock = fopen(priv('.data.lock'), 'c');
    flock($lock, LOCK_EX);
    try {
        $log = jread(priv('backups/log.json'), []);
        if (!$log) return null;
        $last = array_pop($log);
        $file = priv('backups/' . $last['file']);
        $prev = is_file($file) ? json_decode((string)file_get_contents($file), true) : null;
        if (!is_array($prev)) return null;
        $prev['updated'] = date('c');
        jwrite(data_path(), $prev);
        @unlink($file);
        jwrite(priv('backups/log.json'), $log);
        return $last['why'] ?: 'изменение';
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

// ---------- мелочи ----------

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function clip(string $s, int $max): string { $s = trim(preg_replace('/[ \t]+/u', ' ', $s)); return mb_strlen($s) > $max ? mb_substr($s, 0, $max) : $s; }
function is_url(string $u): bool { return (bool)preg_match('~^https?://[^\s<>"]+$~i', $u) && strlen($u) <= 1500; }
function new_id(string $prefix, array $taken): string
{
    do { $id = $prefix . substr(bin2hex(random_bytes(3)), 0, 5); } while (in_array($id, $taken, true));
    return $id;
}
function starts_with(string $s, string $p): bool { return strncmp($s, $p, strlen($p)) === 0; }
function site_url(string $path = ''): string { return rtrim((string)cfg('site_url', ''), '/') . ($path !== '' ? '/' . ltrim($path, '/') : ''); }

// ---------- Telegram ----------

/** Вызов Bot API. В тестах подменяется через $GLOBALS['TG_FAKE'] (callable). */
function tg(string $method, array $params = [])
{
    if (isset($GLOBALS['TG_FAKE'])) return ($GLOBALS['TG_FAKE'])($method, $params);
    $ch = curl_init('https://api.telegram.org/bot' . cfg('token') . '/' . $method);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($params, JSON_UNESCAPED_UNICODE),
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
    $res = json_decode((string)$raw, true);
    if (!is_array($res) || empty($res['ok'])) {
        $GLOBALS['TG_LAST_ERROR'] = (string)($res['description'] ?? 'network error');
        error_log('tg ' . $method . ' failed: ' . substr((string)$raw, 0, 300));
        return null;
    }
    $GLOBALS['TG_LAST_ERROR'] = '';
    return $res['result'];
}

/** Скачивает файл из Telegram во временный файл. null — если больше лимита или ошибка. */
function tg_download(string $fileId, int $maxBytes)
{
    if (isset($GLOBALS['TG_FAKE_FILE'])) return ($GLOBALS['TG_FAKE_FILE'])($fileId);
    $f = tg('getFile', ['file_id' => $fileId]);
    if (!$f || empty($f['file_path']) || (isset($f['file_size']) && $f['file_size'] > $maxBytes)) return null;
    $tmp = tempnam(sys_get_temp_dir(), 'tg');
    $ch = curl_init('https://api.telegram.org/file/bot' . cfg('token') . '/' . $f['file_path']);
    $fh = fopen($tmp, 'w');
    curl_setopt_array($ch, [CURLOPT_FILE => $fh, CURLOPT_TIMEOUT => 40, CURLOPT_FOLLOWLOCATION => false]);
    $ok = curl_exec($ch);
    curl_close($ch);
    fclose($fh);
    if (!$ok || filesize($tmp) > $maxBytes) { @unlink($tmp); return null; }
    return $tmp;
}

// ---------- картинки ----------

/**
 * Проверяет, что файл — картинка, уменьшает и сохраняет в uploads/.
 * $kind: 'img' — крео (JPEG до 1600px), 'logo' — логотип (PNG до 256px, прозрачность сохраняется).
 * Возвращает путь от корня сайта (uploads/…) или null.
 */
function save_image(string $tmp, string $kind): ?string
{
    $info = @getimagesize($tmp);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) return null;
    $max = $kind === 'logo' ? 256 : 1600;
    $name = $kind . '-' . date('ymd') . '-' . bin2hex(random_bytes(5));
    $dir = uploads_dir();
    if (function_exists('imagecreatefromstring')) {
        $src = @imagecreatefromstring((string)file_get_contents($tmp));
        if (!$src) return null;
        $w = imagesx($src); $h = imagesy($src);
        $k = min(1, $max / max($w, $h));
        $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
        $dst = imagecreatetruecolor($nw, $nh);
        if ($kind === 'logo') { imagealphablending($dst, false); imagesavealpha($dst, true); imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127)); }
        else { imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255)); }
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        $file = $name . ($kind === 'logo' ? '.png' : '.jpg');
        $ok = $kind === 'logo' ? imagepng($dst, "$dir/$file", 8) : imagejpeg($dst, "$dir/$file", 86);
        if (!$ok) return null;
    } else {
        $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'][$info[2]];
        $file = "$name.$ext";
        if (!copy($tmp, "$dir/$file")) return null;
    }
    @chmod("$dir/$file", 0644);
    return 'uploads/' . $file;
}

/** Удаляет старую загрузку, если она лежит в uploads/ и больше нигде не используется. */
function drop_upload(?string $path, array $data): void
{
    if (!$path || !starts_with($path, 'uploads/') || strpos($path, '..') !== false) return;
    foreach ($data['offers'] ?? [] as $o) { if (($o['img'] ?? '') === $path || ($o['logo'] ?? '') === $path) return; }
    @unlink(site_root() . '/' . $path);
}
