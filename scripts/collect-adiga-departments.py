"""Read public, advertised department listings through their normal pagination.

Anonymous cookies/CSRF and raw HTML stay in /tmp. No authentication or access-control
bypass. HTTP 403/429 stops new requests. Source pages expose pagination.currentPage
and pagination.cntPerPage; the same read-only POST is used by their search controls.
"""
import concurrent.futures, datetime, html, json, pathlib, re, subprocess, threading, time, urllib.parse, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
MAIN=pathlib.Path('/tmp/jobnkill-adiga-details')
CACHE=pathlib.Path('/tmp/jobnkill-adiga-departments')
CACHE.mkdir(exist_ok=True)
STOP=threading.Event()
COOKIE=CACHE/'session.cookies'
TOKEN=''
CACHE_ONLY='--cache-only' in sys.argv

def text(value):
    return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',value))).strip()

def route(university):
    raw=(MAIN/(university['id']+'.html')).read_text()
    match=re.search(r'"(/ucp/uvt/(?:uni/univ|col/coll)DetailSubject\.do\?menuId=[^"&]+)&',raw)
    if not match:raise ValueError('No advertised department route')
    return 'https://www.adiga.kr'+match.group(1)

def init_session():
    global TOKEN
    output=CACHE/'session.html'
    url='https://www.adiga.kr/ucp/uvt/uni/univDetailSubject.do?menuId=PCUVTINF2000&unvCd=0000158&searchSyr=2027'
    subprocess.run(['curl','--fail','-L','--max-time','40','-sS','-c',str(COOKIE),url,'-o',str(output)],check=True)
    raw=output.read_text()
    TOKEN=re.search(r'<meta name="_csrf" content="([^"]+)"',raw)[1]
    # Both route families are advertised in their actual HTML. The general AJAX
    # endpoint is checked here; college AJAX is checked against the fetched sample.
    assert '/ucp/uvt/uni/univDetailSubjectAjax.do' in raw

def parse(raw):
    total=re.search(r'id="totRecordCnt" value="(\d+)"',raw)
    if not total:raise ValueError('No declared department count in response')
    items=[]
    for card in re.findall(r'<li class="boxMajor">(.*?)</a>',raw,re.S):
        decoded=html.unescape(card)
        key=re.search(r'fnDetailPage\("([^"]+)"\)',decoded)
        title=re.search(r'<span class="tit">(.*?)</span>\s*<span>(.*?)</span>',card,re.S)
        quota=re.search(r'<span class="desc">모집인원</span>\s*<span class="no">(.*?)</span>',card,re.S)
        if not key or not title:raise ValueError('Unrecognized department card')
        year=re.search(r'<span class="desc">(20\d{2})학년도</span>',card)
        rates={}
        for kind,number in re.findall(r'<span class="type">(수시|정시)</span>\s*([\d,.]+)\s*:\s*1',card):
            rates[kind]=float(number.replace(',',''))
        q=text(quota[1]).replace(',','') if quota else ''
        items.append({'id':key[1],'name':text(title[1]),'category':text(title[2]),'quota':int(q) if q.isdigit() else None,'quotaYear':None,'competitionYear':int(year[1]) if year else None,'earlyCompetitionRate':rates.get('수시'),'regularCompetitionRate':rates.get('정시')})
    return int(total[1]),items

def page(university,number):
    cache=CACHE/(university['id']+'-'+str(number)+'.html')
    if cache.exists():return cache.read_text()
    if CACHE_ONLY:raise RuntimeError('Source page not present in local collection cache')
    if STOP.is_set():raise RuntimeError('Collection stopped after access or rate limit response')
    url=route(university).replace('DetailSubject.do','DetailSubjectAjax.do')
    args=['curl','--fail','-L','--max-time','40','-sS','-b',str(COOKIE),'-H','X-CSRF-TOKEN: '+TOKEN,
          '--data-urlencode','unvCd='+university['id'],'--data-urlencode','searchSyr=2027','--data-urlencode','syr=2027',
          '--data-urlencode','pagination.currentPage='+str(number),'--data-urlencode','pagination.cntPerPage=100',url,'-o',str(cache)]
    result=subprocess.run(args,capture_output=True)
    if result.returncode:
        cache.unlink(missing_ok=True)
        reason=result.stderr.decode()[:160]
        if '403' in reason or '429' in reason:STOP.set()
        raise RuntimeError(reason)
    time.sleep(.3)
    return cache.read_text()

def collect(university):
    source=route(university)+'&unvCd='+university['id']+'&searchSyr=2027'
    result={'academicYear':2027,'sourceUrl':source,'totalDeclared':None,'loadedCount':0,'complete':False,'status':'pending','items':[],
            'notice':'모집인원은 공식 학과목록 표시값입니다. 개별 수시전형 모집인원과 다를 수 있으며 표에 모집인원의 별도 기준연도가 명시되지 않아 quotaYear는 비워 둡니다. 경쟁률은 해당 값에 표시된 학년도로 구분합니다.'}
    try:
        total,items=parse(page(university,1));result['totalDeclared']=total
        source_file=CACHE/(university['id']+'-1.html')
        result['observedAt']=datetime.datetime.fromtimestamp(source_file.stat().st_mtime,datetime.timezone.utc).date().isoformat()
        result['items']=items;result['loadedCount']=len(items)
        previous_page=json.dumps(items,ensure_ascii=False,sort_keys=True)
        number=1
        while len(items)<total:
            number+=1
            new_total,more=parse(page(university,number))
            if new_total!=total:raise ValueError('Department total changed during pagination')
            current_page=json.dumps(more,ensure_ascii=False,sort_keys=True)
            if not more or current_page==previous_page:raise ValueError('Pagination repeated or returned no new departments')
            previous_page=current_page
            items.extend(more)
            result['loadedCount']=len(items)
        source_rows=len(items)
        grouped={}
        for item in items:
            grouped.setdefault((item['id'],item['name'],item['category']),[]).append(item)
        normalized=[]
        for variants in grouped.values():
            item=variants[0].copy()
            conflicts=[]
            for field in ['quota','competitionYear','earlyCompetitionRate','regularCompetitionRate']:
                if len({variant[field] for variant in variants})>1:
                    item[field]=None;conflicts.append(field)
            if len(variants)>1:
                item['sourceRowCount']=len(variants)
            if conflicts:
                item['conflictingFields']=conflicts
                item['sourceVariants']=[{field:v[field] for field in ['quota','competitionYear','earlyCompetitionRate','regularCompetitionRate']} for v in variants]
            normalized.append(item)
        items=normalized
        general=university['institutionType']=='일반대학'
        detail_path='/ucp/cls/uni/classUnivDetail.do' if general else '/ucp/cls/col/classColDetail.do'
        for item in items:
            item['officialInfoUrl']='https://www.adiga.kr'+detail_path+'?'+urllib.parse.urlencode({'menuId':'PCCLSINF2000' if general else 'PCCLSINF3000','unvCd':university['id'],'searchSyr':2027,'ruCd':item['id']})
        result.update({'items':items,'loadedCount':len(items),'sourceRowsLoaded':source_rows,'duplicateSourceRows':source_rows-len(items),'conflictingDepartmentRows':sum(bool(x.get('conflictingFields')) for x in items),'complete':source_rows==total,'status':'complete' if items else 'no_published_departments','pages':number})
    except Exception as error:
        result['status']='partial' if result['items'] else 'unavailable'
        result['reason']=str(error)[:180]
    return university['id'],result

def save(records):
    values=list(records.values())
    out={'metadata':{'collectedAt':datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'academicYear':2027,
         'scope':'어디가 목록의 352개 캠퍼스·기관코드에 대한 공식 설립구분과 설치학과 조회입니다. 폐교·통합 전 기관코드가 포함되어 현행 지원 가능한 대학 수와 같지 않습니다. 모든 전형 지원자격·평가방법 전체 검증을 뜻하지 않습니다.',
         'universities':len(values),'departmentCatalogsComplete':sum(x.get('departmentCatalog',{}).get('complete',False) for x in values),
         'departmentRows':sum(x.get('departmentCatalog',{}).get('loadedCount',0) for x in values),
         'sourceDepartmentRows':sum(x.get('departmentCatalog',{}).get('sourceRowsLoaded',0) for x in values),
         'duplicateSourceRows':sum(x.get('departmentCatalog',{}).get('duplicateSourceRows',0) for x in values),
         'conflictingDepartmentRows':sum(x.get('departmentCatalog',{}).get('conflictingDepartmentRows',0) for x in values),
         'verificationMethod':'공식 조회 응답의 구조화 추출 및 전체 원문 행 수 대조',
         'humanReviewedAllRows':False,
         'conflictPolicy':'동일 학과의 원문 카드 숫자가 서로 다르면 해당 숫자는 null로 표시하고 sourceVariants에 원래 값을 보존합니다.',
         'countDefinitions':{'loadedCount':'동일 대학·학과ID·학과명·계열을 합친 고유 학과 행 수','sourceRowsLoaded':'페이지에서 수집한 원문 카드 행 수, 중복 포함','totalDeclared':'공식 페이지에 표시된 전체 원문 행 수','complete':'sourceRowsLoaded와 totalDeclared가 일치할 때 참. 모든 전형 상세 검증과는 다름'},
         'staleApplicationTextsExcluded':True,'employmentTuitionValuesEmbedded':False},'universities':values}
    target=ROOT/'data/extra-details.json';tmp=target.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');tmp.replace(target)

if __name__=='__main__':
    universities=json.loads((ROOT/'data/universities.json').read_text())['universities']
    records={}
    for u in universities:
        raw=(MAIN/(u['id']+'.html')).read_text();start=raw.index('<div class="d-flex MenuTitle">')
        block=raw[start:raw.index('MenuList',start)]
        classification=re.search(r'<span[^>]*>([^<]+ / [^<]+)</span>',block)
        parts=html.unescape(classification[1]).split(' / ') if classification else []
        records[u['id']]={'universityId':u['id'],'schoolType':parts[1] if len(parts)>1 else None,'establishmentType':parts[2] if len(parts)>2 else None,'sourceUrl':u['officialInfoUrl']}
    save(records)
    if not CACHE_ONLY:init_session()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures=[pool.submit(collect,u) for u in universities]
        for done,future in enumerate(concurrent.futures.as_completed(futures),1):
            uid,result=future.result();records[uid]['departmentCatalog']=result
            save(records)
            print(done,uid,result['status'],result['loadedCount'],result['totalDeclared'],flush=True)
