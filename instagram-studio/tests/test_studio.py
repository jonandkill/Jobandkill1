import os,io,zipfile,sqlite3,hashlib,json
from datetime import datetime,timedelta
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from app import core

@pytest.fixture(autouse=True)
def storage(tmp_path,monkeypatch):
    monkeypatch.setattr(core,'DATA',tmp_path)
    monkeypatch.setattr(core,'DB',tmp_path/'s.sqlite3')
    monkeypatch.setattr(core,'IMG',tmp_path/'media')
    monkeypatch.setenv('SESSION_SECRET','this-is-a-test-key-with-over-32-bytes')
    monkeypatch.setenv('ADMIN_PASSWORD','sample-super-secret-admin-password')
    monkeypatch.setenv('PUBLIC_BASE_URL','https://jobkill.example.com')
    monkeypatch.setenv('EXPECTED_INSTAGRAM_USERNAME','jobandkill')
    monkeypatch.setenv('ENCRYPTION_KEY','w3Fs7-sO4CTHFA6PnVQwxykZnN0PO7wbNhQZ5uf2YVQ=')
    monkeypatch.setenv('ENABLE_LIVE_PUBLISH','false')
    monkeypatch.setenv('RUN_WORKER','false')
    core.init_db()

def zip6(seed=1,n=6,size=(1080,1350)):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for k in range(1,n+1):
            im=Image.new('RGB',size,(seed*13%256,k*37%256,70))
            b=io.BytesIO();im.save(b,format='PNG')
            z.writestr(f'{k:02d}.png',b.getvalue())
        z.writestr('게시글.txt','공지')
    return stream.getvalue()

def test_upload_and_dedup():
    pid=core.ingest_zip(zip6(),'개요\n#면접','테스트')
    p=core.get_post(pid)
    assert len(json.loads(p['paths']))==6
    assert p['status']=='draft'
    with pytest.raises(ValueError,match='동일한'):core.ingest_zip(zip6(),'문구2','중복')
    with pytest.raises(ValueError,match='정확히'):core.ingest_zip(zip6(n=5),'abc','부족')
    with pytest.raises(ValueError,match='규격'):core.ingest_zip(zip6(seed=4,size=(500,500)),'abc','틀린규격')

def test_slots_no_dup_and_boundaries():
    a=core.ingest_zip(zip6(1),'aaa','첫번째')
    b=core.ingest_zip(zip6(2),'bbb','두번째')
    c=core.ingest_zip(zip6(3),'ccc','세번째')
    assert core.auto_slot_posts()==3
    assert core.auto_slot_posts()==0
    ts=[datetime.fromisoformat(core.get_post(pid)['scheduled_at']).astimezone(core.TZ) for pid in (a,b,c)]
    assert all(v.hour in (12,19) and v.minute==0 for v in ts)
    assert len(set(ts))==3
    assert max(len([t for t in ts if t.date()==day]) for day in set(t.date() for t in ts))<=2
    assert core.process_one()=='blocked'
    assert all(core.get_post(pid)['status']=='scheduled' for pid in (a,b,c))

def test_publish_guard_and_uncertain(monkeypatch):
    pid=core.ingest_zip(zip6(5),'hello','Publish fake')
    core.schedule_post(pid,(datetime.now(core.TZ)+timedelta(minutes=30)).isoformat())
    assert core.process_one()=='blocked'
    core.put_setting('ig_account_id','123456789');core.put_setting('ig_username','jobandkill')
    core.put_setting('ig_token','placeholder');core.put_setting('ig_expires_at','9999999999');core.put_setting('live_confirmed','true')
    monkeypatch.setenv('ENABLE_LIVE_PUBLISH','true')
    # direct manual claim mimics due scheduler; never touches external network
    core.set_post(pid,'processing')
    class Fake:
        def create_carousel(self,paths,caption):assert len(paths)==6;return 'container1'
        def publish(self,cid):raise TimeoutError('network response lost')
    assert core.publish_claimed(pid,Fake())=='uncertain'
    assert core.get_post(pid)['status']=='uncertain'
    assert core.claim_due() is None
    class Verified:
        def confirm_publication(self,remote_id,caption,container_id):
            assert container_id=='container1'
            return {'timestamp':core.nowstr(),'permalink':'https://www.instagram.com/p/test'}
    core.mark_reconciled(pid,'12345678901234',Verified())
    assert core.get_post(pid)['status']=='published'

def test_publish_success_mock(monkeypatch):
    pid=core.ingest_zip(zip6(6),'caption','Success fake')
    core.put_setting('ig_account_id','1234');core.put_setting('ig_username','jobandkill')
    core.put_setting('ig_token','cipherplaceholder');core.put_setting('ig_expires_at','9999999999');core.put_setting('live_confirmed','true')
    monkeypatch.setenv('ENABLE_LIVE_PUBLISH','true')
    monkeypatch.setattr(core,'refresh_token_if_needed',lambda:None)
    core.set_post(pid,'processing')
    class Fake:
        def create_carousel(self,paths,caption):return 'abc'
        def publish(self,cid):return '8765432112345'
        def permalink(self,id):return 'https://www.instagram.com/p/fake'
    assert core.publish_claimed(pid,Fake())=='published'
    assert core.get_post(pid)['remote_id']=='8765432112345'

def test_media_urls_signature():
    pid=core.ingest_zip(zip6(7),'caption','Signed')
    from urllib.parse import urlparse,parse_qs
    url=core.signed_media_url(f'{pid}/01.jpg')
    q=parse_qs(urlparse(url).query)
    assert core.verify_media_sig(f'{pid}/01.jpg',q['exp'][0],q['sig'][0])
    assert not core.verify_media_sig(f'{pid}/02.jpg',q['exp'][0],q['sig'][0])
    assert not core.verify_media_sig('../secret','99','123')

def test_web_ui_login_and_upload():
    from app.main import app
    with TestClient(app,base_url='https://testserver') as client:
        r=client.get('/')
        assert r.status_code==401
        page=client.get('/login')
        assert page.status_code==200
        assert '잡앤킬 콘텐츠 제작실' in page.text
        from bs4 import BeautifulSoup
        soup=BeautifulSoup(page.text,'html.parser')
        csrf=soup.find('input',{'name':'csrf'})['value']
        client.post('/login',data={'csrf':csrf,'password':'sample-super-secret-admin-password'})
        dash=client.get('/')
        assert dash.status_code==200 and '새 캐러셀 등록' in dash.text
        csrf=BeautifulSoup(dash.text,'html.parser').find('input',{'name':'csrf'})['value']
        resp=client.post('/upload',data={'csrf':csrf,'title':'Test','caption':'한글 시험'},files={'media':('six.zip',zip6(8),'application/zip')},follow_redirects=True)
        assert resp.status_code==200
        assert 'Test' in resp.text
        assert client.get('/preview/1/1').status_code==200


def test_automation_ingest_api(monkeypatch):
    from app.main import app
    monkeypatch.setenv('API_INGEST_KEY','very-long-development-test-ingest-secret-token')
    with TestClient(app) as client:
        body={'title':'Automation','caption':'게시 대기'}
        binary={'media':('six.zip',zip6(11),'application/zip')}
        assert client.post('/api/ingest',data=body,files=binary).status_code==401
        r=client.post('/api/ingest',data=body,files=binary,headers={'X-Jobkill-Api-Key':'very-long-development-test-ingest-secret-token'})
        assert r.status_code==200 and r.json()['status']=='scheduled'
        assert core.get_post(r.json()['post_id'])['status']=='scheduled'
