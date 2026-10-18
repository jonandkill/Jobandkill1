"""Submit one approved six-slide bundle; never automatically repeat an unknown POST."""
from __future__ import annotations
import argparse, hashlib, io, json, os, re, sys, zipfile
from pathlib import Path
from urllib.parse import urlparse
import httpx

def read_bundle(path:Path, content_id:str):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{2,79}',content_id):
        raise ValueError('유효한 회차 ID가 필요합니다.')
    payload=path.read_bytes()
    if len(payload)>30*1024*1024:raise ValueError('6장 ZIP이 30MB를 넘습니다.')
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        entries=archive.infolist()
        candidates=[p for p in entries if Path(p.filename).name=='문구.json']
        if len(candidates)!=1 or candidates[0].file_size>1024*1024:
            raise ValueError('한 편의 문구.json이 포함된 6장 ZIP이 필요합니다.')
        raw=json.loads(archive.read(candidates[0]))
        decks=raw.get('decks',[])
        if len(decks)!=1 or len(decks[0].get('slides',[]))!=6:raise ValueError('원고는 한 편, 정확히 6장이어야 합니다.')
        deck=decks[0]
        title=deck.get('title','').strip();caption=deck.get('caption','').strip()
        if not title or not caption or len(caption)>2200:raise ValueError('제목 또는 게시글을 확인하세요.')
        if '팔로우' not in ' '.join(str(deck['slides'][5].get(k,'')) for k in ('title','body','bridge')):
            raise ValueError('마지막 장의 팔로우 안내가 빠져 있어 자동 등록을 보류합니다.')
        pictures=[x for x in entries if re.fullmatch(r'0[1-6]\.png',Path(x.filename).name)]
        if sorted(Path(x.filename).name for x in pictures)!=[f'{i:02}.png' for i in range(1,7)]:
            raise ValueError('번호순 PNG 6장을 확인하세요.')
    fingerprint=hashlib.sha256(payload+json.dumps([title[:180],caption],ensure_ascii=False).encode()).hexdigest()
    return payload,title,caption,fingerprint

def submit(base,key,content_id,bundle,transport=None):
    parsed=urlparse(base)
    if parsed.scheme!='https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('서버 주소는 인증정보가 없는 HTTPS 주소여야 합니다.')
    if len(key)<24:raise ValueError('API_INGEST_KEY 설정이 필요합니다.')
    payload,title,caption,fingerprint=read_bundle(Path(bundle),content_id)
    with httpx.Client(timeout=60,follow_redirects=False,transport=transport,headers={'X-Jobkill-Api-Key':key}) as client:
        # Always resolve an earlier accepted/uncertain submission before POST.
        check=client.get(base.rstrip('/')+'/api/posts',params={'content_id':content_id})
        if check.status_code==200:
            data=check.json();post=data['post']
            if post['ingest_fingerprint']!=fingerprint:raise ValueError('같은 회차의 다른 판본이 등록되어 있습니다.')
            return {'result':'already_registered','post':post}
        if check.status_code!=404:raise RuntimeError(f'등록 상태 확인 실패: HTTP {check.status_code}')
        try:
            response=client.post(base.rstrip('/')+'/api/ingest',data={'content_id':content_id,'title':title,'caption':caption},files={'media':(Path(bundle).name,payload,'application/zip')})
        except httpx.TransportError:
            return {'result':'submission_uncertain','content_id':content_id,'action':'같은 회차 ID로 상태 조회 후 이어갑니다. POST를 자동 반복하지 않습니다.'}
        if response.status_code!=200:raise RuntimeError(f'등록 응답 확인 필요: HTTP {response.status_code}')
        data=response.json()
        if not data.get('ok'):raise RuntimeError('서버가 등록 성공을 확인하지 않았습니다.')
        return {'result':'registered','post':data['post'],'publishing_ready':data['publishing_ready']}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle',type=Path,required=True)
    parser.add_argument('--content-id',required=True)
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    try:
        if args.dry_run:
            blob,title,caption,fingerprint=read_bundle(args.bundle,args.content_id)
            result={'result':'validated_only','content_id':args.content_id,'title':title,'caption_characters':len(caption),'bytes':len(blob),'fingerprint':fingerprint,'sent':False}
        else:result=submit(os.getenv('STUDIO_BASE_URL',''),os.getenv('API_INGEST_KEY',''),args.content_id,args.bundle)
        print(json.dumps(result,ensure_ascii=False,indent=2))
    except (ValueError,RuntimeError,KeyError,zipfile.BadZipFile,httpx.HTTPError) as exc:
        # Network exception strings may contain a credential-bearing URL.
        print(json.dumps({'result':'blocked','reason':str(exc) if isinstance(exc,(ValueError,RuntimeError)) else type(exc).__name__},ensure_ascii=False))
        return 2
    return 0

if __name__=='__main__':sys.exit(main())
