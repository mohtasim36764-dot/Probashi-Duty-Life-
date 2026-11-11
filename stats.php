<?php
// Visit statistics for the owner. Password protected (only a bcrypt hash is stored here).
$HASH = '$2y$10$xD5RirgpCMfIIpOV4PJQ/OSj230Ko3veN3YvDG2dffSRChkIK56FK';
session_start();
if (isset($_POST['pw']) && password_verify($_POST['pw'], $HASH)) $_SESSION['ok'] = 1;
header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-store');
echo '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>পরিসংখ্যান</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:14px;background:#f2f5f4}h1{font-size:20px}.c{background:#fff;border-radius:14px;padding:12px;margin:10px 0}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #eee;text-align:left}b.big{font-size:28px;color:#0b5d56}input,button{font-size:18px;padding:10px;border-radius:10px;border:1px solid #ccc;width:100%;margin-top:8px}button{background:#0b5d56;color:#fff;border:0}</style>';
if (empty($_SESSION['ok'])) { echo '<h1>🔒 Probashi Duty Life — পরিসংখ্যান</h1><form method="post"><input type="password" name="pw" placeholder="পাসওয়ার্ড"><button>দেখুন</button></form>'; exit; }
$dir = __DIR__ . '/../../pdl-stats'; $days = [];
for ($i = 0; $i < 30; $i++) { $k = gmdate('Y-m-d', time() - 86400 * $i); $f = "$dir/$k.json"; $days[$k] = is_file($f) ? (json_decode(file_get_contents($f), true) ?: []) : []; }
$sum = function ($n, $key) use ($days) { $s = 0; $i = 0; foreach ($days as $d) { if ($i++ >= $n) break; $s += $d[$key] ?? 0; } return $s; };
$tot = []; foreach ($days as $d) foreach ($d as $k => $v) $tot[$k] = ($tot[$k] ?? 0) + $v;
$names = ['c:KW'=>'🇰🇼 কুয়েত','c:SA'=>'🇸🇦 সৌদি','c:AE'=>'🇦🇪 আমিরাত','c:QA'=>'🇶🇦 কাতার','c:BH'=>'🇧🇭 বাহরাইন','c:none'=>'দেশ বাছাই হয়নি','l:bn'=>'বাংলা','l:en'=>'English','l:hi'=>'हिन्दी','l:ur'=>'اردو','l:ne'=>'नेपाली','t:duty'=>'📅 ডিউটি','t:salary'=>'💰 বেতন','t:money'=>'💸 টাকা পাঠান','t:docs'=>'🪪 কাগজপত্র','t:grat'=>'🎁 গ্র্যাচুইটি','t:cv'=>'📄 সিভি','t:jobs'=>'💼 চাকরি','t:help'=>'🆘 জরুরি','t:backup'=>'💾 ব্যাকআপ','t:home'=>'🏠 হোম','t:more'=>'☰ আরো'];
echo '<h1>📊 Probashi Duty Life — পরিসংখ্যান</h1>';
echo '<div class="c">আজ অ্যাপ খোলা হয়েছে: <b class="big">' . $sum(1, 'e:view') . '</b> বার<br>গত ৭ দিনে: <b>' . $sum(7, 'e:view') . '</b> · গত ৩০ দিনে: <b>' . $sum(30, 'e:view') . '</b><br>নতুন ব্যবহারকারী — আজ: <b>' . $sum(1, 'e:new') . '</b> · ৭ দিনে: <b>' . $sum(7, 'e:new') . '</b> · ৩০ দিনে: <b>' . $sum(30, 'e:new') . '</b></div>';
foreach (['c:' => 'দেশ অনুযায়ী (৩০ দিন)', 'l:' => 'ভাষা অনুযায়ী (৩০ দিন)', 't:' => 'কোন অংশ বেশি ব্যবহার হচ্ছে (৩০ দিন)'] as $p => $title) {
  $rows = array_filter($tot, function ($k) use ($p) { return strpos($k, $p) === 0; }, ARRAY_FILTER_USE_KEY); arsort($rows);
  echo "<div class='c'><b>$title</b><table>"; foreach ($rows as $k => $v) echo '<tr><td>' . ($names[$k] ?? htmlspecialchars($k)) . "</td><td>$v</td></tr>"; echo '</table></div>';
}
echo '<div class="c"><b>দিন অনুযায়ী (অ্যাপ খোলা / নতুন)</b><table>'; foreach ($days as $k => $d) echo "<tr><td>$k</td><td>" . ($d['e:view'] ?? 0) . ' / ' . ($d['e:new'] ?? 0) . '</td></tr>'; echo '</table></div>';
