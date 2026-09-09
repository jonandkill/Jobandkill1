"""Conservative extraction of published Adiga grade-cut result tables.
Run: python scripts/collect-outcomes.py [--limit 20] [--workers 3]
Only explicitly labelled final-registrant grade columns are accepted. No inferred applicants/admissions.
HTML cache lives outside repository. Every accepted row retains official source and table/row coordinates.
"""
import argparse, concurrent.futures, gzip, hashlib, json, pathlib, re, subprocess
from datetime import date
from lxml import html
ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path('/tmp/adiga-outcomes'); CACHE.mkdir(exist_ok=True)
def norm(s): return re.sub(r'\s+', '', s or '')
def text(e): return ' '.join(''.join(e.itertext()).split())
def number(s):
    s = norm(s).replace(',', '').replace(':1', '')
    return float(s) if re.fullmatch(r'\d+(?:\.\d+)?', s) else None
def matrix(table):
    grid=[]; occupied={}
    for ri,tr in enumerate(table.xpath('./tr|./thead/tr|./tbody/tr')):
        row=[]; ci=0
        for cell in tr.xpath('./td|./th'):
            while (ri,ci) in occupied: ci+=1
            value=text(cell)
            rs=int(cell.get('rowspan','1')); cs=int(cell.get('colspan','1'))
            for r in range(ri,ri+rs):
                for c in range(ci,ci+cs): occupied[r,c]=value
            ci+=cs
        width=max([c+1 for r,c in occupied if r==ri],default=0)
        grid.append([occupied.get((ri,c),'') for c in range(width)])
    return grid
def extract(raw, university, page_year):
    doc=html.fromstring(raw); accepted=[]; skipped=[]
    for ti,table in enumerate(doc.xpath('//table')):
        grid=matrix(table)
        if len(grid)<4: continue
        joined=norm(text(table))
        if '70%' not in joined or '학생부등급' not in joined or '모집단위' not in joined: continue
        # The result year is explicitly printed in the nearest preceding result heading.
        previous=table.xpath('preceding::p[not(ancestor::table)]')
        year=None
        sections=table.xpath('ancestor::li[contains(@class,"accordionItem")]')
        if sections:
            match=re.search(r'(20\d{2})학년도전형결과',norm(text(sections[-1]))[:200])
            if match: year=int(match.group(1))
        for p in reversed(previous):
            if year is not None:break
            value=norm(text(p))
            match=re.search(r'(20\d{2})학년도.*전형결과',value)
            if match: year=int(match.group(1)); break
        if year!=page_year-1:
            skipped.append({'table':ti,'reason':'explicit_result_year_missing'}); continue
        # A named admission track must be present in the header, not guessed from navigation.
        header=grid[0]
        program_col=next((i for i,v in enumerate(header) if norm(v)=='모집단위'),None)
        if program_col is None:
            skipped.append({'table':ti,'reason':'program_column_ambiguous'});continue
        track=next((v for v in header if '전형' in v and '모집' not in v and '000' not in v),None)
        if not track:
            track=next((v for v in header[program_col+1:] if re.match(r'^(KU|학생부|논술|지역균형|학교장|고교|일반고|특성화고|지역인재|자기추천|기회균형|교과|일반학생|농어촌|고른기회|기초생활|특수교육)',norm(v)) and 2<=len(v)<=50 and not any(x in norm(v) for x in ['모집','최종','학생부등급','대학별','경쟁','충원','평가','계열','000'])),None)
        if not track:
            for p in reversed(previous[-5:]):
                value=text(p).split('※')[0].strip(' ◈[]')
                if 3<=len(value)<=50 and '전형' in value and not any(x in value for x in ['결과','산출','모집단위']):
                    track=value;break
        if not track:
            skipped.append({'table':ti,'reason':'named_track_missing'}); continue
        first_data=None
        for ri,row in enumerate(grid[1:],1):
            if len(row)>program_col+1 and number(row[program_col+1]) is not None and row[program_col] not in ('모집단위','전형명'):
                first_data=ri;break
        if first_data is None or first_data>6: continue
        width=len(grid[first_data]); labels=[]
        for ci in range(width):
            labels.append(norm(' '.join(dict.fromkeys(row[ci] for row in grid[:first_data] if ci<len(row)))))
        def find_col(predicate): return next((i for i,l in enumerate(labels) if predicate(l)),None)
        c70=find_col(lambda l:'70%' in l and '학생부등급' in l and '환산점수' not in l)
        c50=find_col(lambda l:'50%' in l and '학생부등급' in l and '환산점수' not in l)
        cq=find_col(lambda l:'모집인원' in l)
        cc=find_col(lambda l:'경쟁률' in l)
        ca=find_col(lambda l:'지원인원' in l)
        ce=find_col(lambda l:'입학인원' in l or '등록인원' in l)
        if c70 is None or cq is None:
            skipped.append({'table':ti,'reason':'grade_column_ambiguous'});continue
        if '최종등록자' in labels[c70]:
            metric='final_registered_grade';metric_label='최종등록자 학생부등급'
        elif '입학자' in labels[c70]:
            metric='enrolled_student_grade';metric_label='입학자 학생부등급'
        else:
            skipped.append({'table':ti,'reason':'grade_population_ambiguous'});continue
        for ri,row in enumerate(grid[first_data:],first_data):
            if len(row)!=width: continue
            program=row[program_col]; quota=number(row[cq]); g70=number(row[c70]); g50=number(row[c50]) if c50 is not None else None
            if not program or quota is None or not quota.is_integer() or g70 is None or not 1<=g70<=9: continue
            if g50 is not None and not 1<=g50<=9: continue
            # Reject obvious aggregate/explanation rows and unsupported transformed scores.
            if any(x in norm(program) for x in ['전형별','합계','소계','모집단위','평가방법']):continue
            applicants=number(row[ca]) if ca is not None else None
            enrolled=number(row[ce]) if ce is not None else None
            applicants=int(applicants) if applicants is not None and applicants.is_integer() else None
            enrolled=int(enrolled) if enrolled is not None and enrolled.is_integer() else None
            uid=university['id']; url=f'https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&unvCd={uid}&searchSyr={page_year}'
            ident=hashlib.sha256(f'{uid}|{year}|{track}|{program}'.encode()).hexdigest()[:16]
            accepted.append({'id':f'adiga-{ident}','universityId':uid,'universityName':university['name'],'program':program,'track':track,'academicYear':year,'quota':int(quota),'competitionRatio':number(row[cc]) if cc is not None else None,'grade50':g50,'grade70':g70,'gradeMean':None,'metric':metric,'metricLabel':metric_label,'scale':'9','formulaKey':None,'formulaLabel':f'대학 공개 {metric_label}(대학별 산출 방식)','formulaVerification':'pending','applicants':None,'admitted':None,'applicantCountVerified':False,'admissionCountVerified':False,'sourceUrl':url,'sourceTitle':f'어디가 {university["name"]} {year}학년도 전형 결과','sourceTableIndex':ti,'sourceRowIndex':ri,'verifiedAt':'2026-09-09','verificationMethod':'explicit_table_headers','comparabilityNote':'동일 명칭의 대학·모집단위·전형 자료입니다. 연도별 교과 반영 방식 및 지원 자격의 동일성은 추가 검수 중이므로 단순 합격확률이나 개인 성적 차이로 환산하지 않습니다.'})
            accepted[-1].update(applicants=applicants,applicantCountVerified=applicants is not None,enrolled=enrolled,enrolledCountVerified=enrolled is not None)
            accepted[-1]['verifiedAt']=date.today().isoformat()
    unique={};conflicts=set()
    for row in accepted:
        key=row['id']
        if key in unique and any(unique[key].get(k)!=row.get(k) for k in ['quota','competitionRatio','grade50','grade70','metric']):
            conflicts.add(key)
        else:unique[key]=row
    for key in conflicts:
        unique.pop(key,None);skipped.append({'rowId':key,'reason':'conflicting_duplicate_program_track'})
    return list(unique.values()),skipped
def fetch(task, allow_network=True):
    university,year=task; path=CACHE/f'{university["id"]}-{year}.html'
    url=f'https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&unvCd={university["id"]}&searchSyr={year}'
    try:
        if not path.exists() or path.stat().st_size<2000:
            if not allow_network:return [],{'universityId':university['id'],'pageYear':year,'status':'cache_incomplete'}
            r=subprocess.run(['curl','--fail','-L','--max-time','35','-sS',url,'-o',str(path)],capture_output=True)
            if r.returncode: return [],{'universityId':university['id'],'pageYear':year,'status':'fetch_failed','curlExitCode':r.returncode,'reason':r.stderr.decode(errors='replace')[-240:]}
        rows,skipped=extract(path.read_text(),university,year)
        return rows,{'universityId':university['id'],'pageYear':year,'resultYear':year-1,'status':'parsed' if rows else 'no_unambiguous_grade_table','accepted':len(rows),'skipped':skipped,'sourceUrl':url}
    except Exception as e:return [],{'universityId':university['id'],'pageYear':year,'status':'parse_failed','reason':str(e)[:160]}
def main():
    p=argparse.ArgumentParser();p.add_argument('--limit',type=int,default=0);p.add_argument('--workers',type=int,default=3);p.add_argument('--offline',action='store_true');p.add_argument('--retry-failed',action='store_true');args=p.parse_args()
    universities=json.loads((ROOT/'data/universities.json').read_text())['universities']
    universities=[u for u in universities if u['institutionType']=='일반대학' and u['id']!='0000158']
    priority=['0000146','0000052','0000066','0000100','0000014','0000005']
    universities.sort(key=lambda u:priority.index(u['id']) if u['id'] in priority else 100)
    if args.limit: universities=universities[:args.limit]
    canonical=ROOT/'data/outcomes.json'
    existing=json.loads(canonical.read_text() if canonical.exists() else gzip.decompress((ROOT/'data/outcomes.json.gz').read_bytes()).decode())
    byid={r['id']:r for r in existing if args.retry_failed or not r['id'].startswith('adiga-')}
    audit=[];tasks=[(u,y) for u in universities for y in (2024,2025,2026,2027)]
    audit_path=ROOT/'data/outcome-source-audit.json'
    prior_audit=json.loads(audit_path.read_text()) if audit_path.exists() else []
    if args.retry_failed:
        failed={(r['universityId'],r['pageYear']) for r in prior_audit if 'failed' in r['status']}
        tasks=[(u,y) for u,y in tasks if (u['id'],y) in failed]
        audit=[r for r in prior_audit if (r['universityId'],r['pageYear']) not in failed]
    if args.offline:
        available={(u['id'],y) for u,y in tasks if (CACHE/f'{u["id"]}-{y}.html').exists()}
        tasks=[(u,y) for u,y in tasks if (u['id'],y) in available]
        audit=[r for r in prior_audit if (r['universityId'],r['pageYear']) not in available]
    def save():
        for filename,value in [('outcomes.json',list(byid.values())),('outcome-source-audit.json',audit)]:
            tmp=ROOT/'data'/f'{filename}.tmp'
            encoded=json.dumps(value,ensure_ascii=False,separators=(',',':')) if filename=='outcomes.json' else json.dumps(value,ensure_ascii=False,indent=2)
            tmp.write_text(encoded+'\n');tmp.replace(ROOT/'data'/filename)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i,(rows,record) in enumerate(pool.map(lambda task:fetch(task,not args.offline),tasks),1):
            for row in rows:byid[row['id']]=row
            audit.append(record)
            if i%3==0:
                if not args.offline and i%12==0:save()
                print(f'{i}/{len(tasks)} pages; {len(byid)} total records',flush=True)
    save()
if __name__=='__main__':main()
