"""Safe queue, Instagram Graph API and content ingest for one-owner JOB&KILL studio."""
from __future__ import annotations
import os, json, hashlib, hmac, secrets, sqlite3, zipfile, io, pathlib, time, re
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
from typing import Protocol
from PIL import Image, UnidentifiedImageError
from cryptography.fernet import Fernet
import httpx

ROOT=pathlib.Path(__file__).resolve().parent.parent
DATA=pathlib.Path(os.getenv('DATA_DIR',str(ROOT/'data'))).resolve()
DB=DATA/'studio.sqlite3'
IMG=DATA/'media'
TZ=ZoneInfo(os.getenv('TIMEZONE','Asia/Seoul'))
MEDIA_MAX_BYTES=30*1024*1024
MAX_ENTRIES=40


def utcnow(): return datetime.now(timezone.utc)
def iso(dt): return dt.astimezone(timezone.utc).isoformat(timespec='seconds')
def nowstr(): return iso(utcnow())
def env_bool(name): return os.getenv(name,'').lower() in ('yes','true','1','on')

def connect_db():
    DATA.mkdir(parents=True,exist_ok=True); IMG.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(DB,timeout=20,isolation_level=None)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA busy_timeout=20000')
    return db

def init_db():
    with connect_db() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL, caption TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft', scheduled_at TEXT,
          paths TEXT NOT NULL, sha256 TEXT NOT NULL UNIQUE,
          remote_id TEXT, permalink TEXT, error TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          submitted_at TEXT
        );
        CREATE INDEX IF NOT EXISTS ix_posts_schedule ON posts(status,scheduled_at);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, val TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, post_id INTEGER, event TEXT NOT NULL, detail TEXT);
        ''')
        columns={x['name'] for x in db.execute('PRAGMA table_info(posts)')}
        for name in ('content_id','ingest_fingerprint','published_at','container_id'):
            if name not in columns: db.execute(f'ALTER TABLE posts ADD COLUMN {name} TEXT')
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS ix_posts_content_id ON posts(content_id) WHERE content_id IS NOT NULL')

def setting(key,default=''):
    with connect_db() as db:
        x=db.execute('SELECT val FROM settings WHERE key=?',(key,)).fetchone()
        return x['val'] if x else default

def put_setting(key,val):
    with connect_db() as db: db.execute('INSERT INTO settings(key,val) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET val=excluded.val',(key,val))

def log(event,post_id=None,detail=''):
    # Never log access tokens, OAuth secrets, raw credentials or request URLs.
    with connect_db() as db:
        db.execute('INSERT INTO audit(ts,post_id,event,detail) VALUES(?,?,?,?)',(nowstr(),post_id,event,str(detail)[:600]))

def list_posts(limit=100):
    with connect_db() as db:
        return [dict(x) for x in db.execute('SELECT * FROM posts ORDER BY COALESCE(scheduled_at,created_at) DESC LIMIT ?', (limit,)).fetchall()]

def get_post(post_id):
    with connect_db() as db:
        row=db.execute('SELECT * FROM posts WHERE id=?',(post_id,)).fetchone()
        return dict(row) if row else None

def clean_filename(name):
    # Never allow ZIP paths / symlinks to escape.
    return pathlib.PurePosixPath(name.replace('\\','/')).name

def ingest_fingerprint(blob,caption,title):
    return hashlib.sha256(blob+json.dumps([title.strip()[:180],caption.strip()],ensure_ascii=False).encode()).hexdigest()

def get_post_by_content_id(content_id):
    with connect_db() as db:
        row=db.execute('SELECT * FROM posts WHERE content_id=?',(content_id,)).fetchone()
        return dict(row) if row else None

class ContentConflict(ValueError): pass

def ingest_zip(blob:bytes, caption:str, title:str,content_id:str|None=None)->int:
    if len(blob)>MEDIA_MAX_BYTES: raise ValueError('ZIP 용량은 30MB 이하여야 합니다.')
    if not caption.strip(): raise ValueError('게시글이 비었습니다.')
    if len(caption)>2200: raise ValueError('인스타그램 게시글은 2,200자를 초과할 수 없습니다.')
    if not title.strip(): raise ValueError('제목이 비었습니다.')
    if content_id is not None and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{2,79}',content_id):
        raise ValueError('콘텐츠 ID 형식이 올바르지 않습니다.')
    fingerprint=ingest_fingerprint(blob,caption,title)
    if content_id:
        existing=get_post_by_content_id(content_id)
        if existing:
            if existing['ingest_fingerprint']!=fingerprint:
                raise ContentConflict('동일 콘텐츠 ID의 다른 판본입니다. 기존 예약을 확인해야 합니다.')
            return existing['id']
    output=[]
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            entries=z.infolist()
            if len(entries)>MAX_ENTRIES: raise ValueError('ZIP의 파일이 너무 많습니다.')
            pictures=[]
            for e in entries:
                if e.is_dir(): continue
                if e.file_size>15*1024*1024: raise ValueError('개별 이미지 크기가 너무 큽니다.')
                if e.filename.lower().endswith('.png') and clean_filename(e.filename).lower() not in ('cover.png',):
                    # prevent zip bombs and accept only numbered 6-slide PNGs
                    name=clean_filename(e.filename)
                    m=re.match(r'^(?:slide[_-]?)?0?([1-6])\.png$',name,re.I)
                    if m: pictures.append((int(m.group(1)),e))
            pictures.sort(key=lambda p:p[0]);nums=[n for n,_ in pictures]
            if nums!=[1,2,3,4,5,6]: raise ValueError('01.png ~ 06.png (또는 slide_01.png ~ slide_06.png)가 정확히 필요합니다.')
            for _,item in pictures:
                raw=z.read(item)
                if len(raw)>15*1024*1024: raise ValueError('압축 해제 크기 제한 초과')
                with Image.open(io.BytesIO(raw)) as im:
                    im.load()
                    if im.size!=(1080,1350): raise ValueError(f'{clean_filename(item.filename)}: 1080×1350 규격이 아닙니다.')
                    if im.format!='PNG': raise ValueError('실제 형식은 PNG여야 합니다.')
                    photo=im.convert('RGB')
                    buffer=io.BytesIO();photo.save(buffer,format='JPEG',quality=92,optimize=True,subsampling=0)
                    output.append(buffer.getvalue())
    except (zipfile.BadZipFile,UnidentifiedImageError,OSError) as e:
        raise ValueError('유효한 PNG 6장 ZIP을 확인해 주세요.') from e
    digest=hashlib.sha256(b''.join(output)).hexdigest()
    paths=[]
    with connect_db() as db:
        db.execute('BEGIN IMMEDIATE')
        try:
            existing=db.execute('SELECT * FROM posts WHERE content_id=?',(content_id,)).fetchone() if content_id else None
            if existing:
                if existing['ingest_fingerprint']!=fingerprint: raise ContentConflict('동일 콘텐츠 ID의 다른 판본입니다.')
                db.execute('COMMIT');return existing['id']
            if db.execute('SELECT 1 FROM posts WHERE sha256=?',(digest,)).fetchone(): raise ContentConflict('동일한 6장 이미지는 이미 등록되어 있습니다.')
            cur=db.execute('INSERT INTO posts(title,caption,paths,sha256,status,created_at,updated_at,content_id,ingest_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)',(title.strip()[:180],caption.strip(),json.dumps([]),digest,'draft',nowstr(),nowstr(),content_id,fingerprint))
            pid=cur.lastrowid
            folder=IMG/str(pid);folder.mkdir(mode=0o700,exist_ok=False)
            for i,data in enumerate(output,1):
                filename=f'{i:02d}.jpg';(folder/filename).write_bytes(data);paths.append(f'{pid}/{filename}')
            db.execute('UPDATE posts SET paths=? WHERE id=?',(json.dumps(paths),pid))
            db.execute('COMMIT')
        except Exception:
            db.execute('ROLLBACK');raise
    log('ingested',pid,'PNG 6장 검사 및 API용 JPEG 변환')
    return pid

def schedule_post(pid, local_time:str):
    try: scheduled=datetime.fromisoformat(local_time)
    except ValueError: raise ValueError('날짜·시간 형식이 올바르지 않습니다.')
    if scheduled.tzinfo is None: scheduled=scheduled.replace(tzinfo=TZ)
    when=scheduled.astimezone(timezone.utc)
    if when<=utcnow()+timedelta(seconds=5): raise ValueError('현재보다 미래의 시간을 선택하세요.')
    with connect_db() as db:
        db.execute('BEGIN IMMEDIATE')
        day=when.astimezone(TZ).date()
        existing=db.execute("SELECT id,scheduled_at FROM posts WHERE id!=? AND status IN ('scheduled','processing','submitting','uncertain','published') AND scheduled_at IS NOT NULL",(pid,)).fetchall()
        count=sum(datetime.fromisoformat(x['scheduled_at']).astimezone(TZ).date()==day for x in existing)
        if count>=2:
            db.execute('ROLLBACK')
            raise ValueError('하루 최대 2편까지만 예약할 수 있습니다.')
        cur=db.execute("UPDATE posts SET status='scheduled',scheduled_at=?,updated_at=?,error=NULL WHERE id=? AND status IN ('draft','scheduled','failed')",(iso(when),nowstr(),pid))
        if not cur.rowcount: db.execute('ROLLBACK');raise ValueError('예약할 수 없는 상태입니다.')
        db.execute('COMMIT')
    log('scheduled',pid,iso(when))

def cancel_post(pid):
    with connect_db() as db:
        cur=db.execute("UPDATE posts SET status='draft',scheduled_at=NULL,updated_at=? WHERE id=? AND status='scheduled'",(nowstr(),pid))
        if not cur.rowcount: raise ValueError('예약 상태의 게시물만 취소할 수 있습니다.')
    log('cancelled',pid)

def claim_due():
    with connect_db() as db:
        db.execute('BEGIN IMMEDIATE')
        # One publish transaction at a time, including the external request.
        if db.execute("SELECT 1 FROM posts WHERE status IN ('processing','submitting')").fetchone():
            db.execute('COMMIT');return None
        today=utcnow().astimezone(TZ).date()
        sent=db.execute("SELECT published_at,submitted_at,updated_at FROM posts WHERE status IN ('published','uncertain')").fetchall()
        used=sum(datetime.fromisoformat(x['published_at'] or x['submitted_at'] or x['updated_at']).astimezone(TZ).date()==today for x in sent)
        if used>=2: db.execute('COMMIT');return None
        row=db.execute("SELECT id FROM posts WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at,id LIMIT 1",(nowstr(),)).fetchone()
        if not row: db.execute('COMMIT');return None
        pid=row['id']
        cur=db.execute("UPDATE posts SET status='processing',updated_at=? WHERE id=? AND status='scheduled'",(nowstr(),pid))
        db.execute('COMMIT')
        return pid if cur.rowcount else None

def set_post(pid,status,**changes):
    valid={'published','failed','uncertain','submitting','processing','scheduled','draft'}
    if status not in valid: raise ValueError('알 수 없는 상태')
    whitelist={'remote_id','permalink','error','submitted_at','published_at','container_id'}
    fields=['status=?','updated_at=?'];values=[status,nowstr()]
    for k,v in changes.items():
        if k not in whitelist:raise ValueError('알 수 없는 필드')
        fields.append(k+'=?');values.append(v)
    values.append(pid)
    with connect_db() as db:db.execute('UPDATE posts SET '+','.join(fields)+' WHERE id=?',values)


def encryption():
    key=os.getenv('ENCRYPTION_KEY','')
    if not key: raise RuntimeError('ENCRYPTION_KEY가 없습니다. 토큰을 저장할 수 없습니다.')
    return Fernet(key.encode())

def save_ig(account_id,username,access_token,expires_at):
    put_setting('ig_account_id',str(account_id));put_setting('ig_username',username)
    put_setting('ig_token',encryption().encrypt(access_token.encode()).decode())
    put_setting('ig_expires_at',str(int(expires_at)))
    put_setting('live_confirmed','false')
    log('instagram_connected',detail='@'+username)

def current_token():
    value=setting('ig_token');return encryption().decrypt(value.encode()).decode() if value else None

def ready_for_live():
    expected=os.getenv('EXPECTED_INSTAGRAM_USERNAME','').strip().lstrip('@').lower()
    return (env_bool('ENABLE_LIVE_PUBLISH') and setting('live_confirmed')=='true'
            and bool(setting('ig_account_id')) and bool(setting('ig_token'))
            and bool(expected) and expected==setting('ig_username').lower()
            and bool(os.getenv('PUBLIC_BASE_URL','').startswith('https://')))

def readiness():
    expected=os.getenv('EXPECTED_INSTAGRAM_USERNAME','').strip().lstrip('@').lower()
    checks={
        'https':os.getenv('PUBLIC_BASE_URL','').startswith('https://'),
        'meta_app':bool(os.getenv('INSTAGRAM_APP_ID') and os.getenv('INSTAGRAM_APP_SECRET')),
        'account_connected':bool(setting('ig_account_id') and setting('ig_token')),
        'target_account':bool(expected) and expected==setting('ig_username').lower(),
        'owner_confirmed':setting('live_confirmed')=='true',
        'publishing_enabled':env_bool('ENABLE_LIVE_PUBLISH'),
    }
    return {'ready':bool(ready_for_live()),'checks':checks,'username':setting('ig_username'),
            'missing':[k for k,v in checks.items() if not v],'schedule':{'timezone':str(TZ),'hours':[12,19],'max_per_day':2}}

def signed_media_url(path:str,lifetime=3600):
    if not re.fullmatch(r'[0-9]+/0[1-6]\.jpg',path):raise ValueError('Invalid path')
    exp=int(time.time())+lifetime
    key=os.getenv('SESSION_SECRET','')
    if len(key)<24:raise RuntimeError('SESSION_SECRET가 필요합니다.')
    mac=hmac.new(key.encode(),f'{path}:{exp}'.encode(),'sha256').hexdigest()
    return os.environ['PUBLIC_BASE_URL'].rstrip('/')+f'/media/{path}?exp={exp}&sig={mac}'

def verify_media_sig(path,exp,sig):
    if not re.fullmatch(r'[0-9]+/0[1-6]\.jpg',path):return False
    try:
        if int(exp)<time.time() or int(exp)>time.time()+86400:return False
        key=os.getenv('SESSION_SECRET','')
        expected=hmac.new(key.encode(),f'{path}:{exp}'.encode(),'sha256').hexdigest()
        return hmac.compare_digest(expected,sig)
    except Exception:return False

class InstagramClient:
    def __init__(self,token,account_id,version=None,client=None):
        self.token=token;self.account_id=str(account_id)
        self.base=f'https://graph.instagram.com/{version or os.getenv("META_API_VERSION","v25.0")}'
        self.client=client or httpx.Client(timeout=25)
    def post(self,endpoint,fields):
        r=self.client.post(f'{self.base}/{endpoint}',data=fields,headers={'Authorization':'Bearer '+self.token})
        r.raise_for_status();data=r.json()
        if 'error' in data:raise RuntimeError('Meta API에서 오류를 반환했습니다.')
        return data
    def get(self,endpoint,params):
        r=self.client.get(f'{self.base}/{endpoint}',params=params,headers={'Authorization':'Bearer '+self.token})
        r.raise_for_status();data=r.json()
        if 'error' in data:raise RuntimeError('Meta API에서 오류를 반환했습니다.')
        return data
    def wait_ready(self,id):
        for _ in range(12):
            state=self.get(id,{'fields':'status_code'}).get('status_code','')
            if state=='FINISHED':return
            if state in ('ERROR','EXPIRED'):raise RuntimeError('Meta의 미디어 처리에 실패했습니다.')
            time.sleep(2)
        raise RuntimeError('Meta의 미디어 준비 시간이 초과됐습니다. 게시 여부 확인 필요')
    def create_carousel(self,paths,caption):
        ids=[]
        for path in paths:
            child=self.post(f'{self.account_id}/media',{'image_url':signed_media_url(path),'is_carousel_item':'true'})
            ids.append(child['id'])
        for cid in ids:self.wait_ready(cid)
        container=self.post(f'{self.account_id}/media',{'media_type':'CAROUSEL','children':','.join(ids),'caption':caption})
        self.wait_ready(container['id'])
        return container['id']
    def publish(self,container_id):
        return self.post(f'{self.account_id}/media_publish',{'creation_id':container_id})['id']
    def permalink(self,media_id):
        return self.get(media_id,{'fields':'permalink'}).get('permalink','')
    def confirm_publication(self,remote_id,caption,container_id):
        if not container_id or self.get(container_id,{'fields':'status_code'}).get('status_code')!='PUBLISHED':
            raise ValueError('해당 캐러셀의 게시 완료를 Meta에서 확인하지 못했습니다.')
        recent=self.get(f'{self.account_id}/media',{'fields':'id,caption,media_type,timestamp,permalink','limit':100})
        item=next((m for m in recent.get('data',[]) if str(m.get('id'))==str(remote_id)),None)
        if not item or item.get('media_type')!='CAROUSEL_ALBUM' or item.get('caption','').strip()!=caption.strip():
            raise ValueError('연결 계정의 최근 캐러셀과 게시글이 일치하지 않습니다.')
        if not item.get('timestamp'):raise ValueError('실제 게시 시간을 확인하지 못했습니다.')
        return item

def refresh_token_if_needed():
    expiry=int(setting('ig_expires_at','0'))
    if expiry>time.time()+10*86400:return
    token=current_token()
    if not token:return
    with httpx.Client(timeout=25) as c:
        r=c.get('https://graph.instagram.com/refresh_access_token',params={'grant_type':'ig_refresh_token','access_token':token})
        r.raise_for_status();data=r.json()
    if not data.get('access_token'):raise RuntimeError('Instagram 토큰 갱신 실패')
    save_ig(setting('ig_account_id'),setting('ig_username'),data['access_token'],time.time()+int(data.get('expires_in',5184000)))
    # Reconfirmation not needed for same account token refresh.
    put_setting('live_confirmed','true')

def publish_claimed(pid:int,client:InstagramClient|None=None):
    post=get_post(pid)
    if not post or post['status']!='processing':raise ValueError('게시 처리 상태가 아닙니다.')
    if not ready_for_live():
        set_post(pid,'scheduled',error='연결 또는 발행 승인 대기')
        return 'blocked'
    expected=os.getenv('EXPECTED_INSTAGRAM_USERNAME','').strip().lstrip('@').lower()
    if not expected or expected!=setting('ig_username').lower():
        set_post(pid,'scheduled',error='예약 대상 계정 확인 필요')
        return 'blocked'
    try:
        refresh_token_if_needed()
        api=client or InstagramClient(current_token(),setting('ig_account_id'))
        container_id=api.create_carousel(json.loads(post['paths']),post['caption'])
    except Exception as ex:
        set_post(pid,'failed',error='미디어 준비 실패: '+type(ex).__name__)
        log('publish_failed_pre_submit',pid,type(ex).__name__)
        return 'failed'
    # Critical idempotency boundary. A timed out media_publish MUST NOT auto-retry.
    set_post(pid,'submitting',submitted_at=nowstr(),container_id=container_id,error=None)
    try:
        remote=api.publish(container_id)
    except Exception as ex:
        set_post(pid,'uncertain',error='발행 결과 미확인. 인스타그램 확인 후 처리: '+type(ex).__name__)
        log('publish_uncertain',pid,type(ex).__name__)
        return 'uncertain'
    # Persist acknowledgement before a separate permalink request can fail.
    set_post(pid,'published',remote_id=remote,published_at=nowstr(),error=None)
    try:
        link=api.permalink(remote)
        if link:set_post(pid,'published',permalink=link)
    except Exception:pass
    log('published',pid,'ID='+str(remote))
    return 'published'

def process_one():
    if not ready_for_live():return 'blocked'
    recover_interrupted()
    defer_overdue()
    pid=claim_due()
    if pid is None:return 'idle'
    return publish_claimed(pid)

def recover_interrupted():
    cutoff=iso(utcnow()-timedelta(minutes=30))
    with connect_db() as db:
        db.execute("UPDATE posts SET status='uncertain',error='서버 재시작 후 게시 결과 확인 필요',updated_at=? WHERE status='submitting' AND updated_at<?",(nowstr(),cutoff))
        db.execute("UPDATE posts SET status='failed',error='미디어 준비 중 실행 중단. 재예약 전에 확인 필요',updated_at=? WHERE status='processing' AND updated_at<?",(nowstr(),cutoff))

def defer_overdue():
    # Do not send an old backlog in a burst after reconnecting an account.
    cutoff=iso(utcnow()-timedelta(minutes=60))
    with connect_db() as db:
        changed=db.execute("UPDATE posts SET status='draft',scheduled_at=NULL,updated_at=?,error='지난 예약을 다음 빈 시간으로 이동' WHERE status='scheduled' AND scheduled_at<?",(nowstr(),cutoff)).rowcount
    if changed:auto_slot_posts()
    return changed


def oauth_url(state,redirect):
    if not os.getenv('INSTAGRAM_APP_ID'):raise ValueError('Meta 앱 ID가 없습니다.')
    params={'client_id':os.environ['INSTAGRAM_APP_ID'],'redirect_uri':redirect,
            'scope':'instagram_business_basic,instagram_business_content_publish',
            'response_type':'code','state':state,'enable_fb_login':'0'}
    return 'https://www.instagram.com/oauth/authorize?'+urlencode(params)

def exchange_oauth(code,redirect):
    with httpx.Client(timeout=30) as client:
        response=client.post('https://api.instagram.com/oauth/access_token',data={
          'client_id':os.environ['INSTAGRAM_APP_ID'],
          'client_secret':os.environ['INSTAGRAM_APP_SECRET'],
          'grant_type':'authorization_code','redirect_uri':redirect,'code':code})
        response.raise_for_status()
        body=response.json();short=body.get('access_token')
        if not short:raise RuntimeError('Instagram OAuth 액세스 토큰이 없습니다.')
        long=client.get('https://graph.instagram.com/access_token',params={
          'grant_type':'ig_exchange_token','client_secret':os.environ['INSTAGRAM_APP_SECRET'],'access_token':short})
        long.raise_for_status();tokeninfo=long.json()
        token=tokeninfo['access_token']
        profile=client.get('https://graph.instagram.com/'+os.getenv('META_API_VERSION','v25.0')+'/me',
                           params={'fields':'id,user_id,username','access_token':token})
        profile.raise_for_status();person=profile.json()
        account_id=person.get('user_id') or person.get('id')
        if not account_id or not person.get('username'):raise RuntimeError('프로필을 확인할 수 없습니다.')
        save_ig(account_id,person['username'],token,time.time()+int(tokeninfo.get('expires_in',5184000)))
        return person

def auto_slot_posts(only_ids=None):
    """Assign draft posts to 12:00/19:00 Asia/Seoul, never more than 2 per day."""
    start=utcnow().astimezone(TZ)
    with connect_db() as db:
        db.execute('BEGIN IMMEDIATE')
        occupied=set();day_counts={}
        for r in db.execute("SELECT scheduled_at FROM posts WHERE status IN ('scheduled','processing','submitting','uncertain','published') AND scheduled_at IS NOT NULL"):
            try:
                d=datetime.fromisoformat(r['scheduled_at']).astimezone(TZ)
                occupied.add((d.date().isoformat(),d.hour))
                day_counts[d.date().isoformat()]=day_counts.get(d.date().isoformat(),0)+1
            except (ValueError,TypeError):pass
        drafts=db.execute("SELECT id FROM posts WHERE status='draft' ORDER BY id ASC").fetchall()
        count=0
        for row in drafts:
            if only_ids is not None and row['id'] not in only_ids:continue
            target=None
            for day in range(90):
                date=(start+timedelta(days=day)).date()
                if day_counts.get(date.isoformat(),0)>=2:continue
                for hour in [12,19]:
                    local=datetime(date.year,date.month,date.day,hour,0,tzinfo=TZ)
                    if local<=start+timedelta(minutes=5):continue
                    key=(date.isoformat(),hour)
                    if key not in occupied:
                        occupied.add(key);day_counts[date.isoformat()]=day_counts.get(date.isoformat(),0)+1;target=iso(local);break
                if target:break
            if not target:break
            db.execute("UPDATE posts SET status='scheduled',scheduled_at=?,updated_at=? WHERE id=? AND status='draft'",(target,nowstr(),row['id']))
            count+=1
        db.execute('COMMIT')
    if count:log('batch_auto_schedule',detail=f'{count} posts')
    return count


def mark_reconciled(pid, remote_id, client=None):
    """Owner selects the ID; verify it on the connected account before recording."""
    if not re.fullmatch('[0-9]{8,30}',str(remote_id)):raise ValueError('Meta 게시물 ID를 확인해 주세요.')
    post=get_post(pid)
    if not post or post['status']!='uncertain':raise ValueError('확인 필요 상태의 게시물만 처리할 수 있습니다.')
    try:
        api=client or InstagramClient(current_token(),setting('ig_account_id'))
        item=api.confirm_publication(remote_id,post['caption'],post['container_id'])
        published=iso(datetime.fromisoformat(item['timestamp'].replace('Z','+00:00')))
    except ValueError:raise
    except Exception as exc:raise ValueError('Meta에서 게시 결과를 확인하지 못했습니다. 확인 필요 상태를 유지합니다.') from exc
    with connect_db() as db:
        cur=db.execute("UPDATE posts SET status='published',remote_id=?,published_at=?,permalink=?,error=NULL,updated_at=? WHERE id=? AND status='uncertain'",(str(remote_id),published,item.get('permalink',''),nowstr(),pid))
        if cur.rowcount!=1:raise ValueError('확인 필요 상태의 게시물만 처리할 수 있습니다.')
    log('manual_reconciled',pid,'ID='+str(remote_id)+' verified with connected account')
