"""Merge successfully collected factual records without marking full coverage."""
import json, pathlib, datetime, re, html, urllib.parse

ROOT=pathlib.Path(__file__).resolve().parents[1]
records=json.loads(pathlib.Path('/tmp/jobnkill-adiga-details/collection.json').read_text())
universities=json.loads((ROOT/'data/universities.json').read_text())['universities']
university_map={u['id']:u for u in universities}
details=json.loads((ROOT/'data/details.json').read_text())
by_id={d['universityId']:d for d in details}
for r in records:
    if r['status']!='collected': continue
    uid=r['universityId']; u=university_map[uid]
    cached=pathlib.Path('/tmp/jobnkill-adiga-details')/(uid+'.html')
    observed=r.get('observedAt') or datetime.datetime.fromtimestamp(cached.stat().st_mtime,datetime.timezone.utc).date().isoformat()
    d=by_id.get(uid)
    if d is None:
        d={'universityId':uid,'academicYear':2027,'verifiedAt':observed,
           'overview':f"{u['displayName']} · {u['region']} · {u['institutionType']}. 공식 대학정보에서 소재지·입학 문의처와 공개된 과거 지원 현황을 수집했습니다. 모집단위 전체의 지원자격·평가방법 검수가 완료된 상태는 아닙니다.",
           'admissions':[],'sources':[]}
        details.append(d);by_id[uid]=d
    d['contact']=r['contact'];d['competitionTop10']=r['competitionTop10']
    raw=cached.read_text(errors='replace')
    file_list=re.search(r'<ul[^>]*id="fileResult"[^>]*>(.*?)</ul>',raw,re.S)
    documents=[]
    if file_list:
        for onclick,label in re.findall(r'<a[^>]+onclick="([^"]+)"[^>]*>\s*<span>(.*?)</span>',file_list.group(1),re.S):
            params=re.findall(r"'([^']*)'",html.unescape(onclick))
            title=html.unescape(re.sub(r'<[^>]*>','',label)).strip()
            if onclick.startswith('fnOpenNewUrl') and len(params)==1 and params[0].startswith(('https://','http://')):
                documents.append({'title':title,'academicYear':2027,'url':params[0],'status':'official_download_link_observed','downloadVerified':False})
                continue
            if len(params)!=5 or not onclick.startswith('fnUnvFileDownOne'):continue
            file_id,file_sn,log,unv,year=params
            query=urllib.parse.urlencode({'fileId':file_id,'fileSn':file_sn,'menuId':'PCUVTINF2000' if u['institutionType']=='일반대학' else 'PCUVTINF3000','downLogYn':log,'unvCd':unv,'searchSyr':year})
            documents.append({'title':title,'academicYear':int(year),'url':'https://www.adiga.kr/cmm/com/file/fileDown.do?'+query,'status':'official_download_link_observed','downloadVerified':False})
    d['officialDocuments']=documents
    d['collectionStatus']='partial'
    d['collectionVerification']={'method':'official_page_structured_extraction','observedAt':observed,'allFieldsHumanReviewed':False,'sourcePageYear':2027,'contactEffectiveYear':None,'competitionYearSource':'원서접수 TOP 10 표의 학년도 제목'}
    d['competitionNotice']='대입정보포털이 공개한 원서접수 TOP 10의 일부 모집단위입니다. 모집인원은 실제 합격자 수가 아니며, 경쟁률의 역수를 개인 합격확률로 사용하지 않습니다.'
    d['admissions']=[a for a in d['admissions'] if a.get('collectionKey')!='adiga_main']
    c=r['contact']
    if c.get('address'):
        d['admissions'].append({'title':'대학 위치·입학 문의','text':f"소재지: {c['address']}. 입학 문의: {c.get('phone','공개 전화번호 없음')}.",'collectionKey':'adiga_main'})
    early=[row for row in r['competitionTop10'] if row['period']=='수시'][:3]
    if early:
        facts=' / '.join(f"{x['department']} {x['track']}: 모집 {x['quota']}명, 지원 {x['applicants']}명, {x['competitionRate']}:1" for x in early)
        d['admissions'].append({'title':f"{early[0]['academicYear']}학년도 수시 지원 현황 일부",'text':facts+'. 해당 연도 공식 공개 상위 경쟁률 항목이며 현재 지원 가능 여부 또는 합격률을 뜻하지 않습니다.','collectionKey':'adiga_main'})
    if not any(s['url']==r['sourceUrl'] for s in d['sources']):
        d['sources'].append({'title':'대입정보포털 대학정보 · 소재지·입학문의·연도별 표기 지원현황','url':r['sourceUrl']})
details.sort(key=lambda d:university_map[d['universityId']]['displayName'])
(ROOT/'data/details.json').write_text(json.dumps(details,ensure_ascii=False,indent=2)+'\n')
coverage=json.loads((ROOT/'data/coverage.json').read_text())
for item in coverage['universities']:
    d=by_id.get(item['universityId'])
    if not d: continue
    item['hasSummary']=True;item['status']='partial';item['complete']=False
    for key in ['overview','source']:
        if key not in item['partialDetailFields'] and key not in item['verifiedDetailFields']:item['partialDetailFields'].append(key)
        if key in item['missingDetailFields']:item['missingDetailFields'].remove(key)
    item['publicCompetitionRows']=len(d.get('competitionTop10',[]))
    item['contactCollected']=bool(d.get('contact'))
coverage['totals']['universitiesWithSummary']=len(details)
coverage['totals']['universitiesWithContact']=sum(bool(d.get('contact')) for d in details)
coverage['totals']['publicCompetitionRows']=sum(len(d.get('competitionTop10',[])) for d in details)
coverage['totals']['officialDocumentLinks']=sum(len(d.get('officialDocuments',[])) for d in details)
coverage['collection']={'source':'어디가 공식 공개 대학 상세 페이지','attempted':len(records),'successful':sum(r['status']=='collected' for r in records),'failed':[{'universityId':r['universityId'],'status':r['status']} for r in records if r['status']!='collected'],'scope':'기본 연락처와 공개 TOP 10 지원 현황. 전국 전형별 모든 상세안내 완료 아님.'}
rows=[row for r in records for row in r.get('competitionTop10',[])]
coverage['collection']['integrityChecks']={'rowCount':len(rows),'unexpectedRatioRows':sum(bool(row['quota']) and abs(row['applicants']/row['quota']-row['competitionRate'])>0.021 for row in rows),'humanReviewedAllRows':False}
(ROOT/'data/coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(coverage['totals'],ensure_ascii=False))
