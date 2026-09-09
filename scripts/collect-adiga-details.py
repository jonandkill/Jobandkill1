"""Collect factual public university contact and admission competition tables.

No authentication, CAPTCHA bypass, or unadvertised endpoint guessing. Requests use
the official detail URLs already held in the registry. Cached HTML is kept outside
the repository. Competition is explicitly not an individual admission probability.
"""
import concurrent.futures, html, json, pathlib, re, subprocess, time, threading, datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path('/tmp/jobnkill-adiga-details')
CACHE.mkdir(exist_ok=True)
STOP_REQUESTS=threading.Event()

def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()

def collect(u):
    if STOP_REQUESTS.is_set():
        return {'universityId':u['id'],'status':'not_attempted_after_rate_limit'}
    p = CACHE / (u['id'] + '.html')
    if not p.exists():
        r = subprocess.run(['curl','--fail','-L','--max-time','35','-sS',u['officialInfoUrl'],'-o',str(p)], capture_output=True)
        if r.returncode:
            p.unlink(missing_ok=True)
            if b'429' in r.stderr or b'403' in r.stderr:
                STOP_REQUESTS.set()
            return {'universityId':u['id'], 'status':'fetch_failed', 'reason':r.stderr.decode()[:160]}
        time.sleep(.4)
    raw = p.read_text(errors='replace')
    actual_id=re.search(r'id="unvCd"[^>]*value="([^"]+)"',raw)
    if not actual_id or actual_id.group(1)!=u['id'] or 'titleInfoBox' not in raw:
        return {'universityId':u['id'], 'status':'unrecognized_page'}
    contact = {}
    for label,key in [('주소','address'),('전화','phone'),('팩스','fax')]:
        m = re.search(r'<li>\s*<span>'+label+r'</span>(.*?)</li>',raw,re.S)
        if m: contact[key]=clean(m.group(1))
    for call,label in re.findall(r'<a[^>]+onclick="(fnOpenNewUrl.*?)"[^>]*>(.*?)</a>',raw,re.S):
        decoded=html.unescape(call)
        m=re.search(r'fnOpenNewUrl\("(.*?)"\)',decoded)
        if not m: continue
        value=m.group(1).replace('\\/','/')
        if not value.startswith(('http://','https://')): value='https://'+value
        if clean(label)=='입시홈페이지': contact['admissionsUrl']=value
        elif clean(label)=='홈페이지': contact['homepageUrl']=value
    yearmatch=re.search(r'(20\d{2})학년도 원서접수 TOP',raw)
    rows=[]
    if yearmatch:
        for table in re.findall(r'<table class="uniReceiptTable">(.*?)</table>',raw,re.S):
            period='수시' if re.search(r'>수시</th>',table) else '정시'
            for row in re.findall(r'<tr[^>]*>(.*?)</tr>',table,re.S):
                cells=re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)
                if len(cells) not in (5,6): continue
                vals=[clean(re.sub(r'<span class="tableNumber">.*?</span>','',x)) for x in cells]
                if len(vals)==6: vals=vals[1:]
                try:
                    quota=int(vals[2].replace(',','')); applicants=int(vals[3].replace(',',''))
                    rate=float(vals[4].split(':')[0].strip().replace(',',''))
                except ValueError: continue
                rows.append({'academicYear':int(yearmatch.group(1)),'period':period,'department':vals[0],'track':vals[1],'quota':quota,'applicants':applicants,'competitionRate':rate})
    if not contact and not rows: return {'universityId':u['id'],'status':'no_factual_fields'}
    observed=datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).date().isoformat()
    return {'universityId':u['id'],'status':'collected','sourceUrl':u['officialInfoUrl'],'observedAt':observed,'contact':contact,'competitionTop10':rows}

if __name__ == '__main__':
    universities=json.loads((ROOT/'data/universities.json').read_text())['universities']
    collected=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for result in pool.map(collect,universities):
            collected.append(result)
            (CACHE/'collection.json').write_text(json.dumps(collected,ensure_ascii=False,indent=2))
            print(len(collected),result['universityId'],result['status'],flush=True)
