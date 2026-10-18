import io, json
from pathlib import Path
from PIL import Image
from bs4 import BeautifulSoup
import pytest
from fastapi.testclient import TestClient
from app import core
from app.main import app,zip_mobile_six

@pytest.fixture(autouse=True)
def storage(tmp_path,monkeypatch):
    monkeypatch.setattr(core,'DATA',tmp_path)
    monkeypatch.setattr(core,'DB',tmp_path/'s.sqlite3')
    monkeypatch.setattr(core,'IMG',tmp_path/'media')
    monkeypatch.setenv('SESSION_SECRET','this-is-a-test-key-with-over-32-bytes')
    monkeypatch.setenv('ADMIN_PASSWORD','sample-super-secret-admin-password')
    monkeypatch.setenv('ENABLE_LIVE_PUBLISH','false')
    core.init_db()

def photo(num):
    im=Image.new('RGB',(1080,1350),(num*20,40,140))
    b=io.BytesIO();im.save(b,format='PNG');return b.getvalue()

def login(client):
    p=client.get('/login')
    token=BeautifulSoup(p.text,'html.parser').select_one('[name=csrf]')['value']
    r=client.post('/login',data={'csrf':token,'password':'sample-super-secret-admin-password'},follow_redirects=False)
    assert r.status_code==303
    return BeautifulSoup(client.get('/').text,'html.parser').select_one('[name=csrf]')['value']

def test_mobile_manifest_and_auth():
    with TestClient(app,base_url='https://example.test') as c:
        assert c.get('/').status_code==401
        assert c.get('/preview/1/1').status_code==401
        m=c.get('/manifest.webmanifest').json()
        assert m['display']=='standalone' and m['lang']=='ko'
        assert len(m['icons'])==2
        assert c.get('/static/icon-192.png').status_code==200
        assert c.get('/static/mobile.js').status_code==200
        sw=c.get('/sw.js').text
        assert '/preview/' not in sw and '/login' not in sw and "STATIC.includes(u.pathname)" in sw
        csrf=login(c)
        html=c.get('/').text
        assert 'photos' in html and 'mobile-dock' in html and 'carousel-dialog' in html
        assert '새 캐러셀 등록' in html

def test_six_phone_images_order_and_dedup():
    with TestClient(app,base_url='https://example.test') as c:
        csrf=login(c)
        files=[('photos',(f'gallery_{i}.png',photo(i),'image/png')) for i in range(1,7)]
        r=c.post('/upload',data={'csrf':csrf,'title':'모바일 테스트','caption':'자연스러운 게시글','media_order':json.dumps([5,4,3,2,1,0])},files=files,follow_redirects=True)
        assert r.status_code==200
        assert '모바일 테스트' in r.text
        p=core.get_post(1)
        assert p and p['status']=='draft' and len(json.loads(p['paths']))==6
        assert c.get('/preview/1/1').status_code==200
        with Image.open(io.BytesIO(c.get('/preview/1/1').content)) as img:
            px=img.getpixel((400,300))
            assert px[0]>110  # reverse order: last submitted image is first
        repeat=c.post('/upload',data={'csrf':csrf,'title':'중복','caption':'중복 글','media_order':json.dumps([5,4,3,2,1,0])},files=files,follow_redirects=True)
        assert '이미 등록' in repeat.text
        assert len(core.list_posts())==1
        # can read through 6 slides
        assert all(c.get(f'/preview/1/{i}').status_code==200 for i in range(1,7))

def test_mobile_bad_files():
    pngs=[(f'{i}.png',photo(i)) for i in range(1,7)]
    with pytest.raises(ValueError,match='정확히'):zip_mobile_six(pngs[:5])
    with pytest.raises(ValueError,match='순서'):zip_mobile_six(pngs,'[0,0,0,0,0,0]')
    with pytest.raises(ValueError,match='PNG'):zip_mobile_six([(f'{i}.jpg',photo(i)) for i in range(1,7)])
    with TestClient(app,base_url='https://example.test') as c:
        csrf=login(c)
        bad=[('photos',(f'{i}.png',photo(i),'image/png')) for i in range(1,6)]
        r=c.post('/upload',data={'csrf':csrf,'title':'실패','caption':'테스트'},files=bad,follow_redirects=True)
        assert '6장을 정확히' in r.text
        assert core.list_posts()==[]

def test_mobile_security_and_scheduling():
    with TestClient(app,base_url='https://example.test') as c:
        csrf=login(c)
        assert c.get('/history').status_code==200
        # PWA must not enable live publishing
        assert not core.ready_for_live()
        assert c.get('/health').json()['ok']
        assert c.post('/fill',data={'csrf':'bad'}).status_code==403
