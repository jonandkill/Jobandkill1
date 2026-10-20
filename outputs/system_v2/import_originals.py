"""Preserve a historical CSV exactly; produce a separate immutable baseline.
This adapter does not merge, overwrite candidates or infer publication history.
"""
import argparse,csv
from pathlib import Path
from jobkill_guard import GateError,digest_bytes,exclusive_json,question_manifest

def import_csv(source,out,id_column='id',question_column='original_question'):
    raw=Path(source).read_bytes();items=[]
    with Path(source).open(encoding='utf-8-sig',newline='') as f:
        for row in csv.DictReader(f):
            if not row.get(id_column) or not row.get(question_column):raise GateError('missing id/question; do not infer or normalize originals')
            items.append({'id':row[id_column],'original_question':row[question_column],'original_record':row})
    dataset={'source_file_sha256':digest_bytes(raw),'source_path':str(Path(source).resolve()),'items':items,'status':'historical source import only; usage history unverified'}
    dataset['original_manifest']=question_manifest(dataset,'historical CSV exact text import; not merged with v2 candidates')
    exclusive_json(out,dataset)
    return dataset
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source');p.add_argument('out');p.add_argument('--id-column',default='id');p.add_argument('--question-column',default='original_question');a=p.parse_args()
    import_csv(a.source,a.out,a.id_column,a.question_column)

