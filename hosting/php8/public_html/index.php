<?php
declare(strict_types=1);
require __DIR__ . '/../private_app/bootstrap.php';

try {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
    if ($base && strpos($path, $base . '/') === 0) $path = substr($path, strlen($base));
    if ($path === '/api/consultations') accept_consultation();
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_json(['error'=>'method_not_allowed'],405);
    if ($path === '/api/catalog') send_dataset('catalog.json');
    if ($path === '/api/health') {
        $health=read_dataset('health.json');
        try { database()->query('SELECT 1 FROM consultation_requests LIMIT 1'); $health['consultationsReady']=true; }
        catch(Throwable $e) { $health['consultationsReady']=false; }
        $health['runtime']='php-8-compatible';$health['storage']='verified-file';
        respond_json($health);
    }
    if ($path === '/api/exams') send_dataset('exams.json');
    if ($path === '/api/report') respond_json(['error'=>'client_generated_report_only'],405);
    if ($path === '/api/integrations') {
        $url=site_config()['resume_writer_url'];
        respond_json(['resumeWriter'=>['url'=>preg_match('~^https://~',$url) ? $url : null,'label'=>'잡앤킬 자기소개서 작성']]);
    }
    if ($path === '/api/outcome-candidates') outcome_candidates();
    if ($path === '/api/outcomes') {
        $id=(string)($_GET['universityId'] ?? '');
        $supplements=read_dataset('supplemental-ids.json');
        if (in_array($id,$supplements,true)) respond_json([]);
        if (!preg_match('/^\d{7}$/D',$id)) respond_json(['error'=>'university_id_required'],400);
        if (!is_file(__DIR__.'/../private_app/data/outcomes/'.$id.'.json')) respond_json([]);
        send_dataset('outcomes/'.$id.'.json');
    }
    if ($path === '/api/departments') {
        $id=(string)($_GET['universityId'] ?? '');
        if ($id !== '') {
            if (in_array($id,read_dataset('supplemental-ids.json'),true)) respond_json(null);
            if (!preg_match('/^\d{7}$/D',$id)) respond_json(['error'=>'university_id_invalid'],400);
            if (!is_file(__DIR__.'/../private_app/data/departments/'.$id.'.json')) respond_json(null);
            send_dataset('departments/'.$id.'.json');
        }
        $q=trim((string)($_GET['query'] ?? ''));$offset=max(0,(int)($_GET['offset'] ?? 0));
        $items=read_dataset('department-search.json');
        if ($q !== '') $items=array_values(array_filter($items,static function(array $d) use($q): bool {foreach (['name','category','searchUniversityName'] as $k) if(strpos((string)($d[$k] ?? ''),$q)!==false)return true;return false;}));
        $total=count($items);$slice=array_slice($items,$offset,50);
        foreach($slice as &$item) unset($item['searchUniversityName']);unset($item);
        respond_json(['total'=>$total,'offset'=>$offset,'items'=>$slice,'nextOffset'=>$offset+50<$total?$offset+50:null]);
    }
    if (preg_match('~^/api/documents/([^/]+)$~',$path,$m)) {
        require __DIR__ . '/../private_app/document-proxy.php';
        serve_document(rawurldecode($m[1]));
    }
    $publicFiles=['essay-rubrics.json','practice-questions.json','interviews.json','essay-standards.json','education-registry.json','essay-universities.json','official-question-bank.json','authored-question-bank.json'];
    if (strpos($path,'/data/')===0 && in_array(substr($path,6),$publicFiles,true)) send_dataset(substr($path,6));
    if ($path === '/' || $path === '/index.php' || $path === '/index.html') {
        header('Content-Type: text/html; charset=utf-8');readfile(__DIR__.'/index.html');exit;
    }
    respond_json(['error'=>'not_found'],404);
} catch(Throwable $e) {
    respond_json(['error'=>'service_unavailable'],503);
}
