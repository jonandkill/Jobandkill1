"""Import the official data.go.kr undergraduate registry without treating old names as active admissions.

Usage: python scripts/import-education-registry.py /path/to/official-response.json
Omit the argument to download the public JSON used by the portal's download button.
The portal includes graduate schools and historical names; neither is automatically
promoted to a current admission candidate.
"""
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.data.go.kr/data/15107736/standard.do'

if len(sys.argv) > 1:
    raw = Path(sys.argv[1]).read_bytes()
    expected = None
else:
    header_url = 'https://www.data.go.kr/download/columList.json?pk=15107736&ext=JSON'
    with urllib.request.urlopen(header_url, timeout=45) as response:
        header = json.load(response)
    expected = int(header['totalCount'])
    params = {'publicDataPk': '15107736', 'colNmList': header['tableVO']['colNmList'],
              'totalCount': expected, 'svcTableNm': header['tableVO']['svcTableNm'],
              'perPage': 10000, 'page': 1}
    if expected > 10000:
        raise ValueError('Source grew beyond one download page; update pagination before importing.')
    endpoint = 'https://www.data.go.kr/download/standard.json?' + urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(endpoint, timeout=45) as response:
        raw = response.read()

rows = json.loads(raw)
if not isinstance(rows, list) or not rows:
    raise ValueError('Source must be a non-empty JSON array')
if expected is not None and len(rows) != expected:
    raise ValueError('Partial source download; existing registry not changed')
required = {'SCHL_NM', 'MAINBRANCH_NM', 'UNIV_SE_NM', 'SCHL_SE_NM', 'CRTR_YR', 'CRTR_YMD'}
if not all(required <= row.keys() for row in rows):
    raise ValueError('Official source schema changed; existing registry not changed')

existing = json.loads((ROOT / 'data/universities.json').read_text())['universities']
source_rows = [row for row in rows if row['UNIV_SE_NM'] != '대학원']
items = []
for row in source_rows:
    identity = '|'.join(str(row.get(k, '')) for k in ['SCHL_NM', 'MAINBRANCH_NM', 'SCHL_SE_NM'])
    exact = [school['id'] for school in existing if school['name'] == row['SCHL_NM']]
    items.append({
        'id': 'education-' + hashlib.sha256(identity.encode()).hexdigest()[:16],
        'sourceRecord': row,
        'existingNameMatchIds': exact,
        'matchStatus': 'name_only_requires_campus_review' if exact else 'unmatched_requires_review',
        'currentAdmissionsStatus': 'not_verified',
        'eligibilityImported': False
    })

output = {
    'metadata': {
        'sourceName': '한국대학교육협의회 전국대학및전문대학정보표준데이터',
        'sourceUrl': SOURCE,
        'collectedAt': datetime.now(timezone.utc).date().isoformat(),
        'sourceSha256': hashlib.sha256(raw).hexdigest(),
        'sourceTotalRows': len(rows),
        'excludedGraduateRows': len(rows) - len(items),
        'undergraduateRows': len(items),
        'uniqueSchoolNames': len({row['SCHL_NM'] for row in source_rows}),
        'nameUnmatchedRows': sum(not item['existingNameMatchIds'] for item in items),
        'sourceYears': sorted({row['CRTR_YR'] for row in source_rows}),
        'sourceRecordDates': sorted({row['CRTR_YMD'] for row in source_rows}),
        'schoolTypeCounts': dict(Counter(row['SCHL_SE_NM'] for row in source_rows)),
        'scopeNotice': '교육자료 원문 목록입니다. 폐교·통합 이전 교명과 사이버·기능대학을 포함하므로 현재 수시 모집대학 수가 아닙니다. 대학원은 제외했습니다. 이름이 일치해도 캠퍼스·전형을 자동 합치지 않습니다.'
    },
    'institutions': items
}
(ROOT / 'data/education-registry.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(output['metadata'], ensure_ascii=False))
