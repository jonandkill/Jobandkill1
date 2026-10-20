"""Rebuild the review copy from readable category files; never publish."""
import argparse
import json
from pathlib import Path


def assemble(folder):
    folder=Path(folder)
    data=json.loads((folder/'topics_metadata.json').read_text(encoding='utf-8'))
    files=sorted((folder/'topics_by_category').glob('topics_*.json'))
    if len(files)!=15:raise ValueError('expected 15 category files')
    items=[]
    for path in files:
        part=json.loads(path.read_text(encoding='utf-8'))
        if len(part['items'])!=10:raise ValueError('expected 10 questions per category')
        items.extend(part['items'])
    if len(items)!=150 or len({x['id'] for x in items})!=150:raise ValueError('question ids/count differ')
    data['items']=items
    return data


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--folder',default='outputs');p.add_argument('--out',default='outputs/topics_v2.json');a=p.parse_args()
    data=assemble(a.folder)
    Path(a.out).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Assembled 150 editorial candidates; no publication action.')

