<?php
declare(strict_types=1);

function site_config(): array {
    static $config;
    if ($config === null) {
        $defaults = require __DIR__ . '/config.example.php';
        $config = is_file(__DIR__ . '/config.php') ? array_replace($defaults, require __DIR__ . '/config.php') : $defaults;
    }
    return $config;
}

function respond_json($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-cache');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function read_dataset(string $filename): array {
    $path = __DIR__ . '/data/' . $filename;
    if (!is_file($path)) throw new RuntimeException('dataset_missing');
    $data = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data)) throw new RuntimeException('dataset_invalid');
    return $data;
}

function send_dataset(string $filename, bool $download = false): void {
    $path = __DIR__ . '/data/' . $filename;
    if (!is_file($path)) respond_json(['error'=>'dataset_unavailable'], 503);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=300');
    if ($download) header('Content-Disposition: attachment; filename="' . basename($filename) . '"');
    readfile($path);
    exit;
}

function database(): PDO {
    $c = site_config();
    if (!$c['db_name'] || !$c['db_user']) throw new RuntimeException('database_not_configured');
    $dsn = 'mysql:host=' . $c['db_host'] . ';port=' . (int)$c['db_port'] . ';dbname=' . $c['db_name'] . ';charset=utf8mb4';
    return new PDO($dsn, $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT=>10]);
}

function text_field(array $body, string $key, int $max): string {
    $value = $body[$key] ?? '';
    if (!is_scalar($value)) return '';
    $value = trim((string)$value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : implode('', array_slice(preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, $max));
}

function accept_consultation(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_json(['error'=>'method_not_allowed'], 405);
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) respond_json(['error'=>'json_required'], 415);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 250000) respond_json(['error'=>'request_too_large'], 413);
    $raw = file_get_contents('php://input', false, null, 0, 250001);
    if (strlen($raw) > 250000) respond_json(['error'=>'request_too_large'], 413);
    try { $body = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { respond_json(['error'=>'invalid_json'], 400); }
    if (!is_array($body)) respond_json(['error'=>'invalid_body'], 400);
    $category = in_array($body['category'] ?? '', ['overall','writing','interview','essay'], true) ? $body['category'] : 'overall';
    $mode = in_array($body['mode'] ?? '', ['online','phone','visit'], true) ? $body['mode'] : 'online';
    $name = text_field($body, 'name', 80);
    $contact = text_field($body, 'contact', 80);
    $message = text_field($body, 'message', 4000);
    $length = function_exists('mb_strlen') ? mb_strlen($message, 'UTF-8') : preg_match_all('/./us', $message);
    if (!$name || !$contact || $length < 10 || ($body['consent'] ?? false) !== true) {
        respond_json(['ok'=>false,'error'=>'consultation_fields_required','message'=>'신청자명·연락처·상담 내용을 입력하고 개인정보 수집·이용에 동의해 주세요.'], 400);
    }
    try {
        $db = database();
        $query = $db->prepare('INSERT INTO consultation_requests (category, grade, applicant_name, contact, target, consultation_mode, preferred_time, message, consent) VALUES (?,?,?,?,?,?,?,?,1)');
        $query->execute([$category, text_field($body,'grade',20) ?: null, $name, $contact, text_field($body,'target',160) ?: null, $mode, text_field($body,'time',120) ?: null, $message]);
        $id = $db->lastInsertId();
        $row = $db->query('SELECT created_at FROM consultation_requests WHERE id=' . (int)$id)->fetch();
        respond_json(['ok'=>true,'id'=>(string)$id,'storage'=>'mariadb','createdAt'=>$row['created_at']], 201);
    } catch (Throwable $e) {
        respond_json(['ok'=>false,'error'=>'consultation_storage_failed','message'=>'상담 접수 저장소에 연결하지 못했어요. 입력 내용은 유지되며, 연결 후 다시 신청할 수 있습니다.'], 503);
    }
}

function outcome_candidates(): void {
    $scale = (string)($_GET['scale'] ?? '');
    if (!in_array($scale, ['5','9'], true)) respond_json(['error'=>'grade_scale_required'],400);
    $data = read_dataset('comparison-' . $scale . '.json');
    $key = (string)($_GET['formulaKey'] ?? '');
    $raw = trim((string)($_GET['grade'] ?? ''));
    if ($key === '' || $raw === '') respond_json(['formulas'=>$data['formulas'],'candidates'=>[],'message'=>'전체 평균을 입력하면 공시 입결 참고 비교를 먼저 볼 수 있습니다. 대학 산식 환산등급을 알고 있다면 해당 산식을 선택해 더 엄격하게 비교하세요.']);
    $grade = is_numeric($raw) ? (float)$raw : NAN;
    if (!is_finite($grade) || $grade < 1 || $grade > (int)$scale) respond_json(['error'=>'converted_grade_invalid'],400);
    $formula = null;
    foreach ($data['formulas'] as $f) if ($f['key'] === $key) { $formula=$f; break; }
    if (!$formula) respond_json(['error'=>'formula_key_invalid'],400);
    $group = $data['groups'][$key];
    $items=[];
    foreach ($group['items'] as $item) {
        $min=$item['grade70Range']['min']; $max=$item['grade70Range']['max'];
        $item['studentGrade']=$grade;
        $item['differenceFromMedian']=floor(($grade-$item['referenceMedian'])*100+0.5)/100;
        $distance=$grade<$min ? $min-$grade : ($grade>$max ? $grade-$max : 0);
        $item['rangeDistance']=floor($distance*100+0.5)/100;
        $item['relation']=$grade<$min ? '입력한 등급이 과거 70% 기준 범위보다 낮습니다.' : ($grade>$max ? '입력한 등급이 과거 70% 기준 범위보다 높습니다.' : '입력한 등급이 과거 70% 기준 범위 안에 있습니다.');
        $items[]=$item;
    }
    usort($items, static function(array $a,array $b): int {
        return ($a['rangeDistance'] <=> $b['rangeDistance']) ?: (abs($a['differenceFromMedian']) <=> abs($b['differenceFromMedian'])) ?: ($b['dataYears'] <=> $a['dataYears']) ?: ($a['_nameOrder'] <=> $b['_nameOrder']);
    });
    $seen=[]; $result=[];
    foreach ($items as $item) {
        if (isset($seen[$item['universityId']])) continue;
        $seen[$item['universityId']]=true; unset($item['_nameOrder']); $result[]=$item;
        if (count($result) === 3) break;
    }
    $reference=$key==='__published_grade_reference__';
    $message = $result ? ($reference ? '1~3순위는 지원 자격이 제한된 특별전형을 제외하고, 공시된 최종등록자 70% 기준을 최근 3~5개년·학과·전형별로 비교한 참고 순위입니다. 대학별 산출식이 확인되지 않은 자료를 섞어 개인 합격확률로 해석하지 않습니다.' : '1~3순위는 동일 산식·동일 등급체계·최근 3~5개년 공식 70% 기준 범위와 입력한 환산등급의 거리로 정렬한 성적 비교 후보입니다. 합격 예측이나 합격 보장이 아닙니다.') : '현재 수집된 자료에서는 입력한 산식·등급체계로 최근 3개년 이상 동일 비교 조건을 충족한 후보를 찾지 못했습니다.';
    respond_json(['formulas'=>$data['formulas'],'candidates'=>$result,'comparison'=>['mode'=>$formula['comparisonMode'] ?? 'unknown','label'=>$formula['label'] ?? '','comparableSeries'=>count($group['items']),'comparableUniversityCount'=>$group['universityCount'],'uniqueCandidates'=>count($result)],'message'=>$message]);
}
