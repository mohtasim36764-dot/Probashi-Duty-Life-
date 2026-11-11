<?php
// Anonymous visit counter: stores only daily totals (no IP, no personal data).
header('Content-Type: text/plain'); header('Cache-Control: no-store');
$dir = __DIR__ . '/../../pdl-stats';             // outside the public website folder
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$in = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$clean = function ($v, $allowed) { return in_array($v, $allowed, true) ? $v : 'other'; };
$e = $clean($in['e'] ?? '', ['view', 'tab', 'new']);
$t = $clean($in['t'] ?? '', ['home','duty','salary','money','more','docs','grat','cv','jobs','help','backup']);
$c = $clean($in['c'] ?? '', ['KW','SA','AE','QA','BH','none']);
$l = $clean($in['l'] ?? '', ['bn','en','hi','ur','ne','none']);
$file = $dir . '/' . gmdate('Y-m-d') . '.json';
$fp = @fopen($file, 'c+'); if (!$fp) { echo 'x'; exit; }
flock($fp, LOCK_EX);
$d = json_decode(stream_get_contents($fp) ?: '{}', true) ?: [];
$inc = function ($k) use (&$d) { $d[$k] = ($d[$k] ?? 0) + 1; };
$inc("e:$e");
if ($e === 'view') { $inc("c:$c"); $inc("l:$l"); }
if ($e === 'tab') { $inc("t:$t"); }
ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($d)); fflush($fp); flock($fp, LOCK_UN); fclose($fp);
echo 'ok';
