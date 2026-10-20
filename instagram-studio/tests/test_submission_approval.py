"""Approval regression tests; all receipts and media are synthetic, no network."""
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import types
import unittest
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

SCRIPTS=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(SCRIPTS))
from approval_guard import require_submission_approval


class SubmissionApprovalTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)
        self.now=datetime(2026,10,21,tzinfo=timezone.utc)
        self.payload=b'synthetic final ZIP bytes'
        self.receipt={'approved':True,'approved_by':'synthetic test fixture',
            'scope':'studio_upload_and_schedule','content_id':'deck-39',
            'bundle_sha256':hashlib.sha256(self.payload).hexdigest(),
            'studio_base_url':'https://studio.example',
            'approved_at_utc':(self.now-timedelta(minutes=1)).isoformat(),
            'expires_at_utc':(self.now+timedelta(minutes=5)).isoformat()}

    def path(self,changes=None):
        p=self.folder/'receipt.json'
        p.write_text(json.dumps({**self.receipt,**(changes or {})}),encoding='utf-8')
        return p

    def test_missing_receipt_denied(self):
        with self.assertRaises(ValueError):
            require_submission_approval(self.payload,'deck-39','https://studio.example',None,self.now)

    def test_exact_approved_bundle(self):
        self.assertTrue(require_submission_approval(self.payload,'deck-39','https://studio.example/',self.path(),self.now)['approved'])

    def test_mutated_bytes_denied(self):
        with self.assertRaises(ValueError):
            require_submission_approval(self.payload+b'changed','deck-39','https://studio.example',self.path(),self.now)

    def test_wrong_id_or_destination_denied(self):
        for ident,base in [('other','https://studio.example'),('deck-39','https://wrong.example')]:
            with self.subTest(ident=ident,base=base),self.assertRaises(ValueError):
                require_submission_approval(self.payload,ident,base,self.path(),self.now)

    def test_unapproved_and_wrong_scope_denied(self):
        for delta in [{'approved':False},{'scope':'read_only'},{'approved_by':''}]:
            with self.subTest(delta=delta),self.assertRaises(ValueError):
                require_submission_approval(self.payload,'deck-39','https://studio.example',self.path(delta),self.now)

    def test_expiry_future_naive_and_long_duration_denied(self):
        for delta in [{'expires_at_utc':self.now.isoformat()},
            {'approved_at_utc':(self.now+timedelta(minutes=1)).isoformat()},
            {'approved_at_utc':'2026-10-20T23:59:00'},
            {'expires_at_utc':(self.now+timedelta(days=2)).isoformat()}]:
            with self.subTest(delta=delta),self.assertRaises(ValueError):
                require_submission_approval(self.payload,'deck-39','https://studio.example',self.path(delta),self.now)

    def test_submit_denies_before_http_client(self):
        bundle=self.folder/'fake.zip'
        with zipfile.ZipFile(bundle,'w') as z:
            for i in range(1,7): z.writestr(f'{i:02}.png',b'synthetic media')
            slides=[{'body':'연습'} for _ in range(6)]
            slides[-1]['body']='잡앤킬 팔로우'
            z.writestr('문구.json',json.dumps({'decks':[{'title':'시험','caption':'시험 게시글','slides':slides}]}))
        fake=types.ModuleType('httpx')
        def forbidden(*args,**kwargs): raise AssertionError('HTTP client must not be created')
        fake.Client=forbidden
        spec=importlib.util.spec_from_file_location('test_only_submit_carousel',SCRIPTS/'submit_carousel.py')
        module=importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules,{'httpx':fake}): spec.loader.exec_module(module)
        with self.assertRaises(ValueError):
            module.submit('https://studio.example','synthetic-key-abcdefghijklmnopqrstuvwxyz','deck-39',bundle)


if __name__=='__main__': unittest.main()

