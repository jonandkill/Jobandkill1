import copy
import csv
import json
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from jobkill_guard import (GENESIS, METRIC_FIELDS, GateError, append_event, digest_bytes, exclusive_json, exclusive_lock, ledger_state, publish_plan, question_manifest, read_json, utcnow, validate_metrics, validate_topics)
from import_originals import import_csv

BASE=Path(__file__).resolve().parents[1]
class GuardsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.topics=read_json(BASE/'topics_v2.json');cls.sources=read_json(BASE/'research_sources.json')
        cls.manifest=question_manifest(cls.topics,'new candidate baseline; not historical originals')
    def validate(self,change=None):
        data=copy.deepcopy(self.topics)
        if change:change(data)
        return validate_topics(data,self.sources,self.manifest)
    def test_valid_structure_is_not_publication_approval(self):
        r=self.validate();self.assertEqual(r['errors'],[]);self.assertFalse(r['publication_approved'])
    def test_missing_source(self):
        r=self.validate(lambda d:d['items'][0].update(source_ids=['NOT_A_SOURCE']))
        self.assertTrue(any('unknown or missing source' in x for x in r['errors']))
    def test_four_hooks(self):
        r=self.validate(lambda d:d['items'][0]['hook_candidates'].pop())
        self.assertTrue(any('five hooks' in x for x in r['errors']))
    def test_hook_total_mutation(self):
        r=self.validate(lambda d:d['items'][0]['hook_candidates'][0].update(total=99))
        self.assertTrue(any('total mismatch' in x for x in r['errors']))
    def test_selected_title_must_be_candidate(self):
        r=self.validate(lambda d:d['items'][0].update(final_title='unreviewed title'))
        self.assertTrue(any('absent from hooks' in x for x in r['errors']))
    def test_duplicate_question_and_hash_mutation(self):
        r=self.validate(lambda d:d['items'][1].update(original_question=d['items'][0]['original_question']))
        self.assertIn('duplicate normalized questions',r['errors']);self.assertTrue(any('hash mismatch' in x for x in r['errors']))
    def test_question_whitespace_preserved_in_hash(self):
        r=self.validate(lambda d:d['items'][0].update(original_question=d['items'][0]['original_question']+' '))
        self.assertTrue(any('hash mismatch' in x for x in r['errors']))
    def test_wrong_slide_count(self):
        r=self.validate(lambda d:d['items'][0]['six_slides'].pop())
        self.assertTrue(any('six ordered slides' in x for x in r['errors']))
    def test_append_and_stale_revision(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'ledger';new=append_event(root,0,GENESIS,{'topic':'JK2-001','state':'candidate'})
            original=(root/'event-00000001.json').read_bytes()
            with self.assertRaises(GateError):append_event(root,0,GENESIS,{'state':'overwritten'})
            self.assertEqual(original,(root/'event-00000001.json').read_bytes());self.assertEqual(new,ledger_state(root))
    def test_base_hash_mismatch(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(GateError):append_event(temp,0,'wrong hash',{})
            self.assertEqual(list(Path(temp).glob('event-*.json')),[])
    def test_concurrent_lock_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with exclusive_lock(temp):
                with self.assertRaises(GateError):append_event(temp,0,GENESIS,{})
            self.assertFalse((Path(temp)/'.write.lock').exists())
    def test_existing_event_never_overwritten_and_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            append_event(temp,0,GENESIS,{'state':'candidate'})
            event=Path(temp)/'event-00000001.json'
            with self.assertRaises(FileExistsError):exclusive_json(event,{'bad':1})
            event.write_text('{"revision":1}',encoding='utf-8')
            with self.assertRaises(GateError):append_event(temp,1,GENESIS,{})
    def test_protected_legacy_overlap(self):
        with tempfile.TemporaryDirectory() as temp:
            legacy=Path(temp)/'old';legacy.mkdir()
            with self.assertRaises(GateError):append_event(legacy/'new',0,GENESIS,{},protected_paths=[legacy])
    def test_publish_default_deny(self):
        with self.assertRaises(GateError):publish_plan(BASE/'topics_v2.json',['JK2-001'])
    def approval(self,temp):
        now=utcnow();p=Path(temp)/'approval.json'
        value={'status':'approved','scope':'sns_publish','package_sha256':digest_bytes((BASE/'topics_v2.json').read_bytes()),'approved_by':'TEST HUMAN DECLARATION ONLY','confirmation':'I explicitly approve only the bound content and selected topic IDs.','topic_ids':['JK2-001'],'approved_at_utc':(now-timedelta(seconds=1)).isoformat(),'expires_at_utc':(now+timedelta(minutes=5)).isoformat()}
        exclusive_json(p,value);return p,value
    def test_bound_approval_returns_plan_without_network(self):
        with tempfile.TemporaryDirectory() as temp:
            p,_=self.approval(temp);r=publish_plan(BASE/'topics_v2.json',['JK2-001'],p)
            self.assertFalse(r['sns_action_executed']);self.assertEqual(r['status'],'APPROVED_LOCAL_PLAN_ONLY')
    def test_approval_hash_selection_and_expiry(self):
        with tempfile.TemporaryDirectory() as temp:
            p,value=self.approval(temp)
            with self.assertRaises(GateError):publish_plan(BASE/'topics_v2.json',['JK2-002'],p)
            with self.assertRaises(GateError):publish_plan(BASE/'topics_v2.json',['JK2-001'],p,now=utcnow()+timedelta(days=1))
            value['package_sha256']='wrong';p.write_text(json.dumps(value),encoding='utf-8')
            with self.assertRaises(GateError):publish_plan(BASE/'topics_v2.json',['JK2-001'],p)
    def test_metric_window_and_blank_vs_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'metrics.csv';start=utcnow()-timedelta(hours=25)
            row={k:'' for k in METRIC_FIELDS};row.update(topic_id='JK2-001',variant_id='A',post_id='TEST',published_at_utc=start.isoformat(),observed_at_utc=utcnow().isoformat(),window='24h',reach='0',source='TEST FIXTURE')
            def write():
                with path.open('w',encoding='utf-8-sig',newline='') as f:
                    w=csv.DictWriter(f,fieldnames=METRIC_FIELDS);w.writeheader();w.writerow(row)
            write();self.assertTrue(validate_metrics(path)['valid'])
            row['window']='7d';write();self.assertFalse(validate_metrics(path)['valid'])
            row['window']='24h';row['reach']='';write();self.assertFalse(validate_metrics(path)['valid'])
            row['reach']='4';row['saves']='-1';write();self.assertFalse(validate_metrics(path)['valid'])
    def test_original_import_preserves_text_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'original.csv';out=Path(temp)/'import.json';question='  원문 질문?  '
            with source.open('w',encoding='utf-8-sig',newline='') as f:
                writer=csv.writer(f);writer.writerow(['id','original_question','used']);writer.writerow(['OLD-01',question,'unknown'])
            before=source.read_bytes();result=import_csv(source,out)
            self.assertEqual(result['items'][0]['original_question'],question)
            self.assertEqual(result['source_file_sha256'],digest_bytes(before));self.assertEqual(before,source.read_bytes())
            with self.assertRaises(FileExistsError):import_csv(source,out)
    def test_original_import_duplicate_ids_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'original.csv';out=Path(temp)/'import.json'
            source.write_text('id,original_question\nx,question one\nx,question two\n',encoding='utf-8')
            with self.assertRaises(GateError):import_csv(source,out)
            self.assertFalse(out.exists())
if __name__=='__main__':unittest.main(verbosity=2)

