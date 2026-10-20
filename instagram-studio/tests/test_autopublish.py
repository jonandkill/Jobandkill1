import io,json,zipfile,hashlib
from datetime import datetime,timedelta,timezone
import httpx,pytest
from fastapi.testclient import TestClient
from app import core
from test_studio import storage,zip6
from scripts.submit_carousel import submit,read_bundle


def make_post(seed=20,status='scheduled',age=1):
    pid=core.ingest_zip(zip6(seed),'테스트 게시글',f'테스트 {seed}',f'test-{seed}')
    with core.connect_db() as db:
        db.execute('UPDATE posts SET status=?,scheduled_at=? WHERE id=?',(status,core.iso(core.utcnow()-timedelta(minutes=age)),pid))
    return pid


def turn_on(monkeypatch):
    monkeypatch.setenv('ENABLE_LIVE_PUBLISH','true')
    core.put_setting('ig_account_id','123456789');core.put_setting('ig_username','jobandkill')
    core.put_setting('ig_token','not-real');core.put_setting('live_confirmed','true')
    monkeypatch.setattr(core,'refresh_token_if_needed',lambda:None)


def bundle(tmp_path,cta=True):
    p=tmp_path/'carousel.zip'
    with zipfile.ZipFile(io.BytesIO(zip6(39))) as source,zipfile.ZipFile(p,'w') as dest:
        for n in source.namelist():dest.writestr(n,source.read(n))
        slides=[{'title':'첫 장','body':'한글'} for _ in range(6)]
        slides[-1]['body']='잡앤킬 팔로우' if cta else '끝'
        dest.writestr('문구.json',json.dumps({'decks':[{'title':'한글 제목','caption':'게시글입니다.','slides':slides}]},ensure_ascii=False))
    return p


def test_approval_receipt(tmp_path, path):
    """Synthetic local test fixture; never a production owner approval."""
    receipt=tmp_path/'test-only-approval.json'
    now=datetime.now(timezone.utc)
    receipt.write_text(json.dumps({'approved':True,'approved_by':'synthetic test fixture',
        'scope':'studio_upload_and_schedule','content_id':'deck-39',
        'bundle_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'studio_base_url':'https://studio.example',
        'approved_at_utc':(now-timedelta(minutes=1)).isoformat(),
        'expires_at_utc':(now+timedelta(minutes=5)).isoformat()}),encoding='utf-8')
    return receipt

test_approval_receipt.__test__ = False


def test_ingest_retry_and_changed_revision_conflict(monkeypatch):
    from app.main import app
    token='long-test-ingest-key-abcdefghijkl'
    monkeypatch.setenv('API_INGEST_KEY',token)
    headers={'X-Jobkill-Api-Key':token}
    media={'media':('six.zip',zip6(21),'application/zip')}
    body={'content_id':'jobkill-21','title':'등록 시험','caption':'게시글'}
    with TestClient(app) as c:
        a=c.post('/api/ingest',data=body,files=media,headers=headers)
        b=c.post('/api/ingest',data=body,files=media,headers=headers)
        assert a.status_code==b.status_code==200
        assert a.json()['post_id']==b.json()['post_id']
        assert len(core.list_posts())==1 and b.json()['newly_scheduled_count']==0
        assert a.json()['publishing_ready'] is False
        assert c.get('/api/posts',params={'content_id':'jobkill-21'},headers=headers).json()['post']['status']=='scheduled'
        assert c.post('/api/ingest',data={**body,'caption':'바뀐 게시글'},files=media,headers=headers).status_code==409


def test_worker_key_is_separate(monkeypatch):
    from app.main import app
    monkeypatch.setenv('API_INGEST_KEY','ingest-abcdefghijklmnopqrstuvwxyz')
    monkeypatch.setenv('API_WORKER_KEY','worker-abcdefghijklmnopqrstuvwxyz')
    with TestClient(app) as c:
        assert c.get('/api/readiness').status_code==401
        assert c.post('/api/tick',headers={'X-Jobkill-Api-Key':'ingest-abcdefghijklmnopqrstuvwxyz'}).status_code==401
        r=c.post('/api/tick',headers={'X-Jobkill-Api-Key':'worker-abcdefghijklmnopqrstuvwxyz'})
        assert r.json()['result']=='blocked'


def test_wrong_target_account_is_visible(monkeypatch):
    turn_on(monkeypatch)
    monkeypatch.setenv('EXPECTED_INSTAGRAM_USERNAME','different_account')
    state=core.readiness()
    assert not state['ready'] and 'target_account' in state['missing']


def test_only_one_claim_in_flight():
    first=make_post(22);second=make_post(23)
    assert core.claim_due()==first
    assert core.claim_due() is None
    assert core.get_post(second)['status']=='scheduled'


def test_daily_limit_counts_actual_publish_and_uncertain():
    a=make_post(24);b=make_post(25);c=make_post(26)
    core.set_post(a,'published',published_at=core.nowstr(),remote_id='123456789')
    core.set_post(b,'uncertain',submitted_at=core.nowstr())
    assert core.claim_due() is None and core.get_post(c)['status']=='scheduled'


def test_overdue_backlog_rescheduled_not_claimed():
    a=make_post(27,age=120);b=make_post(28,age=90)
    assert core.defer_overdue()==2
    assert core.claim_due() is None
    times=[datetime.fromisoformat(core.get_post(i)['scheduled_at']) for i in (a,b)]
    assert all(t>core.utcnow() and t.astimezone(core.TZ).hour in (12,19) for t in times)
    assert len(set(times))==2


def test_restart_leaves_unknown_submission_unretried():
    a=make_post(29,status='submitting');b=make_post(30,status='processing')
    old=core.iso(core.utcnow()-timedelta(hours=1))
    with core.connect_db() as db:db.execute('UPDATE posts SET updated_at=?',(old,))
    core.recover_interrupted()
    assert core.get_post(a)['status']=='uncertain'
    assert core.get_post(b)['status']=='failed'
    assert core.claim_due() is None


def test_manual_slots_count_toward_daily_limit(monkeypatch):
    fixed=datetime(2030,1,1,0,tzinfo=timezone.utc)
    monkeypatch.setattr(core,'utcnow',lambda:fixed)
    ids=[core.ingest_zip(zip6(40+i),'내용',str(i)) for i in range(3)]
    for pid,hour in zip(ids[:2],(10,11)):
        core.schedule_post(pid,datetime(2030,1,1,hour,tzinfo=core.TZ).isoformat())
    core.auto_slot_posts()
    assert datetime.fromisoformat(core.get_post(ids[2])['scheduled_at']).astimezone(core.TZ).day==2


def test_publish_ack_survives_permalink_timeout(monkeypatch):
    turn_on(monkeypatch);pid=make_post(31,status='processing')
    class API:
        def create_carousel(self,paths,caption):return 'container'
        def publish(self,c):return '123456789012345'
        def permalink(self,m):raise TimeoutError()
    assert core.publish_claimed(pid,API())=='published'
    p=core.get_post(pid)
    assert p['remote_id']=='123456789012345' and p['published_at']


def test_reconciliation_rejects_unowned_media(monkeypatch):
    pid=make_post(32,status='uncertain')
    core.set_post(pid,'uncertain',container_id='container')
    def handler(r):
        return httpx.Response(200,json={'status_code':'PUBLISHED'} if r.url.path.endswith('/container') else {'data':[{'id':'999999999','caption':'테스트 게시글','media_type':'CAROUSEL_ALBUM'}]})
    api=core.InstagramClient('test-token','123',client=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(ValueError,match='일치'):core.mark_reconciled(pid,'888888888',api)
    assert core.get_post(pid)['status']=='uncertain'


def test_submission_unknown_is_not_reposted(tmp_path):
    path=bundle(tmp_path);methods=[]
    def handler(r):
        methods.append(r.method)
        if r.method=='GET':return httpx.Response(404)
        raise httpx.ReadTimeout('response lost',request=r)
    result=submit('https://studio.example','test-key-abcdefghijklmnopqrstuvwxyz','deck-39',path,httpx.MockTransport(handler),approval_path=test_approval_receipt(tmp_path,path))
    assert result['result']=='submission_uncertain' and methods==['GET','POST']


def test_submission_retry_reads_receipt_instead(tmp_path):
    path=bundle(tmp_path);fingerprint=read_bundle(path,'deck-39')[3];methods=[]
    def handler(r):
        methods.append(r.method)
        return httpx.Response(200,json={'post':{'ingest_fingerprint':fingerprint,'status':'scheduled','id':1}})
    result=submit('https://studio.example','test-key-abcdefghijklmnopqrstuvwxyz','deck-39',path,httpx.MockTransport(handler),approval_path=test_approval_receipt(tmp_path,path))
    assert result['result']=='already_registered' and methods==['GET']


def test_missing_follow_cta_blocks_handoff(tmp_path):
    with pytest.raises(ValueError,match='팔로우'):read_bundle(bundle(tmp_path,False),'deck-39')


