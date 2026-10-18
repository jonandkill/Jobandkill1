"""Owner-only web dashboard. This server never enables live publishing by default."""
import os, secrets, hmac, json, pathlib, threading, time, io, zipfile
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from urllib.parse import quote
from fastapi import FastAPI, Request, Form, UploadFile, File, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from . import core

BASE=pathlib.Path(__file__).resolve().parent
TEMPLATES=Jinja2Templates(directory=str(BASE/'templates'))

# Single process worker, DB conditional claiming prevents duplicate submissions if multiple workers exist.
_stop=threading.Event()
_login_attempts={}

def background_worker():
    while not _stop.wait(30):
        try:core.process_one()
        except Exception as exc:core.log('worker_error',detail=type(exc).__name__)

@asynccontextmanager
async def lifespan(app):
    if os.getenv('PUBLIC_BASE_URL','').startswith('https://'):
        secret=os.getenv('SESSION_SECRET','')
        if len(secret)<32 or 'CHANGE-THIS' in secret or secret.startswith('replace-'):
            raise RuntimeError('공개 HTTPS 서버에는 별도의 32자 이상 SESSION_SECRET이 필요합니다.')
        if len(os.getenv('ADMIN_PASSWORD',''))<12:
            raise RuntimeError('공개 HTTPS 서버에는 12자 이상 관리자 암호가 필요합니다.')
    core.init_db();_stop.clear()
    worker=threading.Thread(target=background_worker,daemon=True,name='jobkill-post-worker')
    if os.getenv('RUN_WORKER','true').lower()=='true':worker.start()
    yield
    _stop.set()

app=FastAPI(title='잡앤킬 SNS Studio',version='1.2',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
app.add_middleware(SessionMiddleware,
  secret_key=os.getenv('SESSION_SECRET','local-development-secret-CHANGE-THIS-before-deploy'),
  session_cookie='jobkill_studio', same_site='lax',https_only=os.getenv('PUBLIC_BASE_URL','').startswith('https://'))
app.mount('/static',StaticFiles(directory=str(BASE/'static')),name='static')


def admin(request:Request):
    if not request.session.get('admin'):
        raise HTTPException(status_code=401,detail='로그인이 필요합니다.')
    return True

def csrf_token(request):
    if not request.session.get('csrf'):request.session['csrf']=secrets.token_urlsafe(32)
    return request.session['csrf']

def require_csrf(request,token):
    val=request.session.get('csrf','')
    if not val or not hmac.compare_digest(str(val),str(token)):raise HTTPException(403,'요청 검증에 실패했습니다.')

def redirect(msg=''):
    path='/' + ('?notice='+quote(msg) if msg else '')
    return RedirectResponse(path,status_code=303)

@app.get('/manifest.webmanifest')
def manifest():
    return FileResponse(BASE/'static'/'manifest.webmanifest',media_type='application/manifest+json')

@app.get('/sw.js')
def service_worker():
    return FileResponse(BASE/'static'/'sw.js',media_type='text/javascript',headers={'Cache-Control':'no-cache'})

@app.get('/health')
def health():return {'ok':True,'service':'jobkill-instagram-studio'}

@app.get('/login',response_class=HTMLResponse)
def login(request:Request):
    if request.session.get('admin'):
        return RedirectResponse('/', status_code=303)
    return TEMPLATES.TemplateResponse(request,'login.html',{'csrf':csrf_token(request),'error':''})

@app.post('/login',response_class=HTMLResponse)
def login_post(request:Request,password:str=Form(...),csrf:str=Form(...)):
    require_csrf(request,csrf)
    ip=(request.client.host if request.client else 'unknown')
    fails=_login_attempts.get(ip,[])
    fails=[ts for ts in fails if time.time()-ts<600]
    _login_attempts[ip]=fails
    if len(fails)>=6:
        return TEMPLATES.TemplateResponse(request,'login.html',{'csrf':csrf_token(request),'error':'로그인 시도가 많습니다. 10분 뒤 다시 시도하세요.'},status_code=429)
    expected=os.getenv('ADMIN_PASSWORD','')
    if not expected or len(expected)<12:
        return TEMPLATES.TemplateResponse(request,'login.html',{'csrf':csrf_token(request),'error':'관리자 암호를 12자 이상으로 설정해야 합니다.'},status_code=503)
    if not hmac.compare_digest(password.encode(),expected.encode()):
        _login_attempts[ip].append(time.time())
        return TEMPLATES.TemplateResponse(request,'login.html',{'csrf':csrf_token(request),'error':'암호를 확인해 주세요.'},status_code=401)
    _login_attempts.pop(ip,None)
    request.session.clear();request.session['admin']=True;csrf_token(request)
    return redirect()

@app.post('/logout')
def logout(request:Request,csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf);request.session.clear();return RedirectResponse('/login',303)

@app.get('/',response_class=HTMLResponse)
def dashboard(request:Request,_=Depends(admin)):
    posts=core.list_posts()
    local=lambda x: datetime.fromisoformat(x).astimezone(core.TZ).strftime('%Y-%m-%d %H:%M') if x else '미설정'
    for p in posts:p['display_schedule']=local(p['scheduled_at'])
    summary={s:sum(1 for p in posts if p['status']==s) for s in ['draft','scheduled','processing','submitting','uncertain','failed','published']}
    connected=bool(core.setting('ig_account_id'))
    return TEMPLATES.TemplateResponse(request,'dashboard.html',{
        'posts':posts,'summary':summary,'connected':connected,
        'username':core.setting('ig_username'),'ready':core.ready_for_live(),
        'live_env':core.env_bool('ENABLE_LIVE_PUBLISH'),
        'confirmed':core.setting('live_confirmed')=='true',
        'csrf':csrf_token(request),'notice':request.query_params.get('notice',''),
        'local':local,'version':'1.2','connection_status':core.readiness()})

def zip_mobile_six(files:list[tuple[str,bytes]], order:str='') -> bytes:
    """Pack a phone gallery selection into the same verified ingest path as ZIP.

    Only PNG input. Original image order is explicit; no resizing or text edits.
    """
    if len(files)!=6:raise ValueError('사진 6장을 정확히 선택해 주세요.')
    try:
        indices=json.loads(order) if order else list(range(6))
    except (ValueError,TypeError):raise ValueError('사진 순서 정보가 올바르지 않습니다.')
    if not isinstance(indices,list) or len(indices)!=6 or any(type(x)!=int for x in indices) or sorted(indices)!=list(range(6)):
        raise ValueError('사진 순서 정보가 올바르지 않습니다.')
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for position,index in enumerate(indices,1):
            filename,raw=files[index]
            if not filename.lower().endswith('.png') or not raw.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('PNG 이미지 6장만 업로드할 수 있습니다.')
            if len(raw)>15*1024*1024:raise ValueError('개별 PNG는 15MB 이하여야 합니다.')
            archive.writestr(f'{position:02d}.png',raw)
    if buffer.tell()>core.MEDIA_MAX_BYTES:raise ValueError('이미지 전체 크기는 30MB 이하여야 합니다.')
    return buffer.getvalue()

@app.post('/upload')
async def upload(request:Request,title:str=Form(...),caption:str=Form(...),csrf:str=Form(...),media:UploadFile|None=File(None),photos:list[UploadFile]|None=File(None),media_order:str=Form(''),_=Depends(admin)):
    require_csrf(request,csrf)
    selected=[f for f in (photos or []) if f.filename]
    has_zip=bool(media and media.filename)
    if has_zip==bool(selected):return redirect('ZIP 한 개 또는 PNG 6장 중 하나만 선택해 주세요.')
    try:
        if has_zip:
            if not media.filename.lower().endswith('.zip'):raise ValueError('ZIP 파일 형식을 확인해 주세요.')
            blob=await media.read(core.MEDIA_MAX_BYTES+1)
        else:
            if len(selected)!=6:raise ValueError('사진 6장을 정확히 선택해 주세요.')
            picked=[];total=0
            for photo in selected:
                raw=await photo.read(15*1024*1024+1)
                total+=len(raw)
                if total>core.MEDIA_MAX_BYTES:raise ValueError('사진 전체 크기는 30MB 이하여야 합니다.')
                picked.append((photo.filename,raw))
            blob=zip_mobile_six(picked,media_order)
        pid=core.ingest_zip(blob,caption,title)
    except (ValueError,OSError) as e:return redirect(str(e))
    return redirect(f'6장 캐러셀 #{pid} 등록 완료. 대기함에 저장했습니다.')

@app.post('/schedule/{pid}')
def schedule(request:Request,pid:int,when:str=Form(...),csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf)
    try:core.schedule_post(pid,when)
    except ValueError as e:return redirect(str(e))
    return redirect(f'#{pid} 예약 완료')

@app.post('/cancel/{pid}')
def cancel(request:Request,pid:int,csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf)
    try:core.cancel_post(pid)
    except ValueError as e:return redirect(str(e))
    return redirect(f'#{pid} 예약 취소')

@app.post('/fill')
def fill(request:Request,csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf)
    count=core.auto_slot_posts()
    return redirect(f'{count}편을 매일 12시·19시 빈 시간에 배정했습니다.')

@app.post('/test/{pid}')
def test_dry(request:Request,pid:int,csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf)
    p=core.get_post(pid)
    if not p:raise HTTPException(404)
    if len(json.loads(p['paths']))!=6:return redirect('6장 규격 확인 실패')
    core.log('dry_run',pid,'이미지 6장 확인, 외부 API 미호출')
    return redirect(f'#{pid} 모의 검수 완료(게시하지 않음)')

@app.get('/media/{pid}/{filename}')
def signed_file(pid:int,filename:str,exp:str='',sig:str=''):
    path=f'{pid}/{filename}'
    if not core.verify_media_sig(path,exp,sig):raise HTTPException(403,'만료된 미디어 주소입니다.')
    p=core.get_post(pid)
    if not p or path not in json.loads(p['paths']):raise HTTPException(404)
    destination=core.IMG/str(pid)/filename
    if not destination.is_file():raise HTTPException(404)
    return FileResponse(str(destination),media_type='image/jpeg',headers={'Cache-Control':'private,max-age=1200','X-Content-Type-Options':'nosniff'})

@app.get('/preview/{pid}/{page}')
def preview(pid:int,page:int,_=Depends(admin)):
    if page not in range(1,7):raise HTTPException(404)
    p=core.get_post(pid)
    if not p:raise HTTPException(404)
    img=core.IMG/str(pid)/f'{page:02d}.jpg'
    if not img.is_file():raise HTTPException(404)
    return FileResponse(str(img),media_type='image/jpeg')

@app.get('/oauth/start')
def oauth_start(request:Request,_=Depends(admin)):
    if not (os.getenv('INSTAGRAM_APP_ID') and os.getenv('INSTAGRAM_APP_SECRET') and os.getenv('ENCRYPTION_KEY')):
        return redirect('Meta 앱 ID·앱 Secret·암호화 키 설정이 필요합니다.')
    base=os.getenv('PUBLIC_BASE_URL','').rstrip('/')
    if not base.startswith('https://'):return redirect('Instagram 인증에는 공개 HTTPS 주소가 필요합니다.')
    redirect_uri=os.getenv('INSTAGRAM_REDIRECT_URI') or base+'/oauth/callback'
    state=secrets.token_urlsafe(32)
    request.session['oauth_state']=state
    return RedirectResponse(core.oauth_url(state,redirect_uri),status_code=303)

@app.get('/oauth/callback')
def oauth_callback(request:Request,code:str='',state:str='',error:str='',_=Depends(admin)):
    saved=request.session.pop('oauth_state','')
    if not state or not saved or not hmac.compare_digest(state,saved):return redirect('Instagram 인증 상태 검증 실패')
    if error or not code:return redirect('Instagram 인증이 취소됐습니다.')
    uri=os.getenv('INSTAGRAM_REDIRECT_URI') or os.environ['PUBLIC_BASE_URL'].rstrip('/')+'/oauth/callback'
    try:p=core.exchange_oauth(code,uri)
    except Exception as e:return redirect('Instagram 인증 실패: '+type(e).__name__)
    return redirect('@'+p['username']+' 연결됨. 계정을 확인하고 발행 허용을 별도로 켜세요.')

@app.post('/settings/activate')
def activate(request:Request,handle:str=Form(...),csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf)
    expected=os.getenv('EXPECTED_INSTAGRAM_USERNAME','').strip().lstrip('@').lower()
    verified=core.setting('ig_username','').lower()
    if not expected or expected!=verified or handle.strip().lstrip('@').lower()!=expected:
        return redirect('계정명이 일치하지 않아 발행을 활성화하지 않았습니다.')
    core.put_setting('live_confirmed','true')
    core.log('owner_confirmed_account',detail='@'+verified)
    return redirect('계정 확인 완료. 환경변수 ENABLE_LIVE_PUBLISH=true가 설정되어야 실제 발행됩니다.')

@app.post('/settings/deactivate')
def deactivate(request:Request,csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf);core.put_setting('live_confirmed','false')
    core.log('owner_disabled_live');return redirect('자동 발행을 중지했습니다.')

@app.post('/settings/disconnect')
def disconnect(request:Request,csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf)
    for k in ('ig_account_id','ig_username','ig_token','ig_expires_at','live_confirmed'):core.put_setting(k,'')
    core.log('instagram_disconnected');return redirect('계정 연결 정보 삭제 완료')

@app.post('/reconcile/{pid}')
def reconcile(request:Request,pid:int,remote_id:str=Form(...),csrf:str=Form(...),_=Depends(admin)):
    require_csrf(request,csrf)
    try:core.mark_reconciled(pid,remote_id)
    except ValueError as e:return redirect(str(e))
    return redirect('확인된 게시물 ID를 저장했습니다.')

@app.get('/history',response_class=HTMLResponse)
def history(request:Request,_=Depends(admin)):
    with core.connect_db() as db: rows=[dict(r) for r in db.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 150')]
    return TEMPLATES.TemplateResponse(request,'history.html',{'entries':rows,'csrf':csrf_token(request)})

def require_api_key(request,variable='API_INGEST_KEY'):
    expected=os.getenv(variable,'')
    received=request.headers.get('X-Jobkill-Api-Key','')
    if len(expected)<24 or not hmac.compare_digest(received.encode(),expected.encode()):
        raise HTTPException(401,'Unauthorized')

def post_receipt(post):
    return {k:post[k] for k in ('id','content_id','ingest_fingerprint','title','status','scheduled_at','published_at','remote_id','permalink','error')}

@app.get('/api/readiness')
def readiness_api(request:Request):
    require_api_key(request)
    return core.readiness()

@app.get('/api/posts')
def posts_api(request:Request,content_id:str=''):
    require_api_key(request)
    if content_id:
        post=core.get_post_by_content_id(content_id)
        if not post:raise HTTPException(404,'등록된 콘텐츠 ID가 없습니다.')
        return {'ok':True,'post':post_receipt(post)}
    return {'ok':True,'posts':[post_receipt(p) for p in core.list_posts(100)]}

@app.post('/api/tick')
def worker_tick(request:Request):
    require_api_key(request,'API_WORKER_KEY')
    return {'ok':True,'result':core.process_one()}

@app.post('/api/ingest')
async def ingest_external(request:Request, title:str=Form(...),caption:str=Form(...),media:UploadFile=File(...),content_id:str=Form('')):
    """Idempotent content handoff. Separate worker credentials own publishing."""
    require_api_key(request)
    if not media.filename.lower().endswith('.zip'):raise HTTPException(422,'ZIP required')
    try:
        pid=core.ingest_zip(await media.read(core.MEDIA_MAX_BYTES+1),caption,title,content_id=content_id or None)
        count=core.auto_slot_posts(only_ids=[pid])
    except core.ContentConflict as e:raise HTTPException(409,str(e)) from e
    except ValueError as e:raise HTTPException(422,str(e)) from e
    post=core.get_post(pid)
    return {'ok':True,'post_id':pid,'status':post['status'],'scheduled_at':post['scheduled_at'],'newly_scheduled_count':count,'post':post_receipt(post),'publishing_ready':core.ready_for_live()}
