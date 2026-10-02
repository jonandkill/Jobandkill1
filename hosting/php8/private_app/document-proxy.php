<?php
declare(strict_types=1);

function document_target(string $url, string $approvedHost): array {
    $parts=parse_url($url);
    if (!$parts || ($parts['scheme'] ?? '')!=='https' || ($parts['host'] ?? '')!==$approvedHost || isset($parts['user']) || isset($parts['pass']) || (isset($parts['port']) && $parts['port']!==443)) throw new RuntimeException('source_redirect_restricted');
    $addresses=gethostbynamel($approvedHost) ?: [];
    if (!$addresses) throw new RuntimeException('source_unavailable');
    foreach($addresses as $address) if(!filter_var($address,FILTER_VALIDATE_IP,FILTER_FLAG_IPV4|FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)) throw new RuntimeException('source_address_restricted');
    return [$approvedHost,$addresses[0]];
}

function redirect_target(string $base, string $location): string {
    if (strpos($location,'https://')===0) return $location;
    $parts=parse_url($base);$origin='https://'.$parts['host'];
    if (strpos($location,'//')===0) return 'https:'.$location;
    if (strpos($location,'/')===0) return $origin.$location;
    if (preg_match('~^[a-zA-Z][a-zA-Z0-9+.-]*:~',$location)) throw new RuntimeException('source_redirect_restricted');
    return $origin.rtrim(dirname($parts['path'] ?? '/'),'/').'/'.$location;
}

function serve_document(string $id): void {
    $map=read_dataset('document-map.json');
    if(!isset($map[$id]))respond_json(['error'=>'document_not_registered'],404);
    $item=$map[$id];
    if(!function_exists('curl_init'))respond_json(['error'=>'document_reader_not_configured','sourceUrl'=>$item['url']],503);
    $cacheDir=__DIR__.'/storage/documents';
    if(!is_dir($cacheDir))@mkdir($cacheDir,0750,true);
    $cache=$cacheDir.'/'.hash('sha256',$id.'|'.$item['url']).'.pdf';
    $temp=null;
    try {
        if (!is_file($cache) || time()-filemtime($cache) > (int)site_config()['document_cache_seconds']) {
            $temp=tempnam(is_writable($cacheDir)?$cacheDir:sys_get_temp_dir(),'admissions-');
            if($temp===false)throw new RuntimeException('document_unavailable');
            $url=$item['url'];$host=parse_url($url,PHP_URL_HOST);$ready=false;
            for($redirect=0;$redirect<=3;$redirect++) {
                [$host,$address]=document_target($url,$host);
                $file=fopen($temp,'wb');$bytes=0;$location='';
                $curl=curl_init($url);
                curl_setopt_array($curl,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>25,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_RESOLVE=>[$host.':443:'.$address],CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4,CURLOPT_HTTPHEADER=>['Accept: application/pdf'],CURLOPT_USERAGENT=>'Jobandkill-Admissions-DocumentReader/1.0',CURLOPT_WRITEFUNCTION=>static function($curl,string $chunk)use($file,&$bytes):int{$bytes+=strlen($chunk);if($bytes>40*1024*1024)return 0;return fwrite($file,$chunk);},CURLOPT_HEADERFUNCTION=>static function($curl,string $header)use(&$location):int{if(stripos($header,'Location:')===0)$location=trim(substr($header,9));return strlen($header);}]);
                $ok=curl_exec($curl);$code=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);$error=curl_errno($curl);curl_close($curl);fclose($file);
                if(!$ok)throw new RuntimeException($bytes>40*1024*1024?'document_too_large':($error===CURLE_OPERATION_TIMEDOUT?'source_timeout':'source_unavailable'));
                if(in_array($code,[301,302,303,307,308],true)){if(!$location)throw new RuntimeException('source_redirect_invalid');$url=redirect_target($url,$location);continue;}
                if($code<200 || $code>=300)throw new RuntimeException('source_unavailable');
                if(strpos(file_get_contents($temp,false,null,0,1024),'%PDF-')===false)throw new RuntimeException('source_is_not_pdf');
                $ready=true;break;
            }
            if(!$ready)throw new RuntimeException('too_many_redirects');
            if(is_writable($cacheDir) && rename($temp,$cache))$temp=null;else $cache=$temp;
        }
        header('Content-Type: application/pdf');header('X-Content-Type-Options: nosniff');header('Cache-Control: public, max-age=3600');header('Content-Length: '.filesize($cache));
        $name=preg_replace('/[^a-zA-Z0-9_-]/','_',$id).'.pdf';
        header('Content-Disposition: '.(($_GET['download'] ?? '')==='1'?'attachment':'inline').'; filename="'.$name.'"');
        readfile($cache);if($temp!==null && is_file($temp))unlink($temp);exit;
    } catch(Throwable $e) {
        if($temp!==null && is_file($temp))unlink($temp);
        respond_json(['error'=>$e->getMessage(),'sourceUrl'=>$item['url']],502);
    }
}
