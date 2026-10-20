"""Portable candidate validation and local gates; never calls an SNS API."""
import argparse
import csv
import hashlib
import json
import os
import re
import secrets
from contextlib import contextmanager
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

GENESIS = hashlib.sha256(b'JOBKILL_V2_GENESIS').hexdigest()
METRIC_FIELDS = ['topic_id','variant_id','post_id','published_at_utc','observed_at_utc','window','reach','impressions','saves','shares','comments','profile_visits','follows','source','notes']
class GateError(ValueError): pass
def canonical(obj): return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
def digest_bytes(value): return hashlib.sha256(value).hexdigest()
def digest(obj): return digest_bytes(canonical(obj))
def question_hash(text): return digest_bytes(text.encode('utf-8'))
def read_json(path): return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def utcnow(): return datetime.now(timezone.utc)
def dt(s):
    value=datetime.fromisoformat(s.replace('Z','+00:00'))
    if value.tzinfo is None: raise GateError('timezone required')
    return value.astimezone(timezone.utc)
def exclusive_json(path, data):
    path=Path(path)
    with path.open('x',encoding='utf-8',newline='\n') as stream:
        json.dump(data,stream,ensure_ascii=False,indent=2)
        stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
def question_manifest(data, provenance):
    items=data['items']
    if len({r['id'] for r in items})!=len(items): raise GateError('duplicate ids')
    return {'version':1,'provenance':provenance,'normalization':'none; original UTF-8 question bytes','question_sha256':{r['id']:question_hash(r['original_question']) for r in items}}

def validate_topics(data, sources, manifest):
    errors=[]; warnings=[]; items=data.get('items',[])
    if not isinstance(items,list): return {'errors':['items must be a list'],'warnings':[],'status':'INVALID'}
    valid_sources={s['id'] for s in sources.get('sources',[])}
    if len(items)!=150: errors.append('expected exactly 150 items')
    ids=[]; questions=[]; pairs=[]
    normalized=lambda q:re.sub(r'[^가-힣a-z0-9]','',q.lower())
    for item in items:
        if not isinstance(item,dict):errors.append('item must be an object');continue
        ident=item.get('id','<missing>'); ids.append(ident)
        for field in ['category','original_question','target','priority','hook_candidates','final_title','answer_structure','answer_example','six_slides','source_ids','evidence_status']:
            if field not in item: errors.append(f'{ident}: missing {field}')
        q=item.get('original_question','')
        if not isinstance(q,str) or not q.strip(): errors.append(f'{ident}: question must be nonempty text'); q=''
        questions.append(normalized(q))
        if manifest.get('question_sha256',{}).get(ident)!=question_hash(q): errors.append(f'{ident}: original question hash mismatch')
        hooks=item.get('hook_candidates',[])
        if not isinstance(hooks,list) or len(hooks)!=5: errors.append(f'{ident}: exactly five hooks required'); hooks=[]
        for hook in hooks:
            if not isinstance(hook,dict):errors.append(f'{ident}: hook must be an object');continue
            scores=hook.get('evaluation',{})
            names={'specificity','relevance','curiosity','honesty','clarity'}
            if not isinstance(scores,dict) or set(scores)!=names or any(type(v) is not int or v not in range(3) for v in scores.values()): errors.append(f'{ident}: invalid hook criteria')
            elif hook.get('total')!=sum(scores.values()): errors.append(f'{ident}: hook total mismatch')
            if not hook.get('rationale'): errors.append(f'{ident}: hook rationale missing')
        if item.get('final_title') not in [h.get('text') for h in hooks if isinstance(h,dict)]: errors.append(f'{ident}: final title absent from hooks')
        answers=item.get('answer_structure',[])
        if not isinstance(answers,list) or len(answers)!=4 or any(not isinstance(a,dict) or not a.get('action') for a in answers): errors.append(f'{ident}: four nonempty answer steps required')
        if not isinstance(item.get('answer_example'),str) or not item.get('answer_example','').startswith('가상 연습:'): errors.append(f'{ident}: unlabeled practice example')
        slides=item.get('six_slides',[])
        if not isinstance(slides,list) or any(not isinstance(s,dict) for s in slides):errors.append(f'{ident}: slide list must contain objects');slides=[]
        if len(slides)!=6 or [s.get('slide') for s in slides]!=list(range(1,7)): errors.append(f'{ident}: six ordered slides required')
        if any(not s.get('role') or not s.get('summary') for s in slides): errors.append(f'{ident}: empty slide plan')
        refs=item.get('source_ids',[])
        if not refs or not isinstance(refs,list) or any(not isinstance(x,str) for x in refs) or not set(refs)<=valid_sources: errors.append(f'{ident}: unknown or missing source')
        if item.get('priority') not in [1,2,3]: errors.append(f'{ident}: invalid priority')
    if len(set(ids))!=len(ids): errors.append('duplicate ids')
    if len(set(questions))!=len(questions): errors.append('duplicate normalized questions')
    if set(manifest.get('question_sha256',{}))!=set(ids): errors.append('manifest id set differs')
    for i,q in enumerate(questions):
        for j in range(i+1,len(questions)):
            similarity=SequenceMatcher(None,q,questions[j]).ratio()
            if similarity>=.55:pairs.append({'a':ids[i],'b':ids[j],'character_similarity':round(similarity,3)})
    warnings.append('Category-level sources do not verify individual question demand, answer effectiveness or hook performance.')
    warnings.append('Character similarity is a review queue, not semantic deduplication or permission to publish.')
    return {'status':'INVALID' if errors else 'STRUCTURE_VALID_PUBLICATION_UNAPPROVED','errors':errors,'warnings':warnings,'items':len(items),'similarity_candidates':pairs,'publication_approved':False}

@contextmanager
def exclusive_lock(root):
    root=Path(root); root.mkdir(parents=True,exist_ok=True)
    lock=root/'.write.lock'; owner=secrets.token_hex(16)
    try: exclusive_json(lock,{'owner':owner,'created_at':utcnow().isoformat()})
    except FileExistsError as exc: raise GateError('writer lock exists; no automatic stale-lock removal') from exc
    try: yield
    finally:
        if read_json(lock).get('owner')==owner: lock.unlink()

def ledger_state(root):
    root=Path(root); revision=0; previous=GENESIS
    if not root.exists(): return {'revision':0,'hash':GENESIS}
    for path in sorted(root.glob('event-*.json')):
        record=read_json(path); stored=record.pop('record_hash',None)
        if record.get('revision')!=revision+1 or record.get('base_hash')!=previous or digest(record)!=stored: raise GateError('ledger chain invalid; stop without repairing or overwriting')
        if path.name!=f'event-{record["revision"]:08d}.json': raise GateError('ledger filename invalid')
        revision+=1;previous=stored
    return {'revision':revision,'hash':previous}

def append_event(root, expected_revision, expected_hash, payload, protected_paths=()):
    root=Path(root).resolve()
    for legacy in protected_paths:
        legacy=Path(legacy).resolve()
        if root==legacy or root in legacy.parents or legacy in root.parents: raise GateError('ledger path overlaps protected legacy location')
    with exclusive_lock(root):
        current=ledger_state(root)
        if current!={'revision':expected_revision,'hash':expected_hash}: raise GateError('CAS revision/base hash mismatch; reload and review')
        record={'revision':current['revision']+1,'base_hash':current['hash'],'created_at_utc':utcnow().isoformat(),'payload':payload}
        record['record_hash']=digest(record)
        exclusive_json(root/f'event-{record["revision"]:08d}.json',record)
        return {'revision':record['revision'],'hash':record['record_hash']}

def publish_plan(package_path, topic_ids, approval_path=None, now=None):
    """Fail closed; an approved result is a plan only. No network or SNS API exists."""
    if not approval_path: raise GateError('publication denied: explicit human approval artifact required')
    approval=read_json(approval_path); now=now or utcnow()
    if not topic_ids or len(set(topic_ids))!=len(topic_ids): raise GateError('select unique topic ids')
    ids={x['id'] for x in read_json(package_path)['items']}
    required={'status':'approved','scope':'sns_publish','package_sha256':digest_bytes(Path(package_path).read_bytes())}
    if any(approval.get(k)!=v for k,v in required.items()): raise GateError('approval status, scope or content hash mismatch')
    if not approval.get('approved_by') or approval.get('confirmation')!='I explicitly approve only the bound content and selected topic IDs.': raise GateError('human approval declaration missing')
    if set(approval.get('topic_ids',[]))!=set(topic_ids) or not set(topic_ids)<=ids: raise GateError('approval topic selection mismatch')
    if not (dt(approval['approved_at_utc'])<=now<dt(approval['expires_at_utc'])): raise GateError('approval not yet valid or expired')
    return {'status':'APPROVED_LOCAL_PLAN_ONLY','package_sha256':required['package_sha256'],'topic_ids':topic_ids,'sns_action_executed':False,'note':'Local declaration is not identity authentication. An authorized operator must perform final review and any external action.'}

def validate_metrics(path):
    errors=[]; count=0
    with Path(path).open(encoding='utf-8-sig',newline='') as stream:
        reader=csv.DictReader(stream)
        if reader.fieldnames!=METRIC_FIELDS:return {'valid':False,'errors':['metric header mismatch'],'rows':0}
        for i,row in enumerate(reader,2):
            count+=1
            try:
                if any(not row[k] for k in ['topic_id','variant_id','post_id','source']):raise GateError('identity/source required')
                hours=(dt(row['observed_at_utc'])-dt(row['published_at_utc'])).total_seconds()/3600
                if row['window'] not in ['24h','7d']:raise GateError('window must be 24h or 7d')
                target=24 if row['window']=='24h' else 168
                if hours<target:raise GateError('snapshot taken before measurement window')
                if row['window']=='24h' and hours>=168:raise GateError('24h snapshot collected at or after 7d; use correct window')
                for key in METRIC_FIELDS[6:13]:
                    if row[key] and (not row[key].isdigit()):raise GateError(f'{key} must be nonnegative integer or blank if unavailable')
                if not row['reach']:raise GateError('reach required; blank unavailable metrics must not become zero')
            except (ValueError,KeyError,TypeError) as exc:errors.append(f'row {i}: {exc}')
    return {'valid':not errors,'rows':count,'errors':errors,'note':'Counts are snapshots, not causal A/B evidence. Empty template contains zero observations.'}

def main():
    parser=argparse.ArgumentParser(description=__doc__); sub=parser.add_subparsers(dest='command',required=True)
    v=sub.add_parser('validate');v.add_argument('--topics',required=True);v.add_argument('--sources',required=True);v.add_argument('--manifest',required=True)
    m=sub.add_parser('metrics');m.add_argument('path')
    h=sub.add_parser('manifest');h.add_argument('--topics',required=True);h.add_argument('--out',required=True);h.add_argument('--provenance',required=True)
    args=parser.parse_args()
    if args.command=='validate':
        result=validate_topics(read_json(args.topics),read_json(args.sources),read_json(args.manifest));print(json.dumps(result,ensure_ascii=False,indent=2));return 1 if result['errors'] else 0
    if args.command=='metrics':
        result=validate_metrics(args.path);print(json.dumps(result,ensure_ascii=False,indent=2));return 0 if result['valid'] else 1
    if args.command=='manifest':exclusive_json(args.out,question_manifest(read_json(args.topics),args.provenance));return 0
if __name__=='__main__':raise SystemExit(main())

