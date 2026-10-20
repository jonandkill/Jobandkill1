# 잡앤킬 운영 검증 패키지 v2 후보

외부 게시 기능이 없는 표준 Python 라이브러리 패키지다. 기존 캐러셀 저장소·Library 대장에 설치되거나 GitHub에서 실행된 상태가 아니다. 현재 폴더를 저장소에 통합할 때 부모 출력 구조 `outputs/topics_v2.json`, `outputs/research_sources.json`도 함께 유지한다. Python 3.12 이상을 권장하며 로컬 Python 3.14에서 테스트했다.

## 실행

저장소 루트에서 다음 명령을 사용한다.

```text
python -m unittest discover -s outputs/system_v2 -p "test_*.py" -v
python outputs/system_v2/jobkill_guard.py validate --topics outputs/topics_v2.json --sources outputs/research_sources.json --manifest outputs/system_v2/question_manifest.json
python outputs/system_v2/jobkill_guard.py metrics outputs/system_v2/metrics_24h_7d_TEMPLATE.csv
```

`STRUCTURE_VALID_PUBLICATION_UNAPPROVED`는 구조가 유효한 편집 후보라는 뜻이다. 콘텐츠 정확성, 독립 편집 검수, 질문 수요 조사, 기존 이력 대조, 게시 승인을 대신하지 않는다. 66개 문자 유사도 후보는 사람이 목적과 행동을 대조할 작업 목록이다. 문자 유사도는 의미 중복 판정이 아니다.

## 원형 보존과 기존 자료 수입

`question_manifest.json`은 이번에 새로 만든 질문 원형의 SHA-256 기준점이다. 기존 150개 원본의 지문이라고 주장하지 않는다. 띄어쓰기까지 그대로 해시하므로 수정하면 검사가 실패한다. 의미 있는 수정은 원래 질문을 보존하고 별도 편집 필드를 추가하는 방식으로 검토한다. 편집 작업자가 기준점을 다시 생성하면 변경 탐지를 우회할 수 있으므로 Git 검토·보호 브랜치에서 manifest 변경을 별도로 승인해야 한다.

기존 CSV를 찾으면 아래처럼 **새로운 파일**로 가져온다. 기존 파일과 후보 데이터는 수정하지 않는다. 열 이름이 다르면 옵션으로 명시한다. 이 어댑터는 XLSX·Library 연결이나 이력 해석을 수행하지 않는다.

```text
python outputs/system_v2/import_originals.py historical.csv outputs/historical_import_NEW.json --id-column id --question-column original_question
```

원파일 바이트 해시, 각 행 원본, 원문 질문 지문을 함께 저장한다. 출력이 존재하면 거부한다. 가져온 뒤 기존 질문과 후보를 ID·문자 유사도·의미 검토로 연결하고 발행 이력은 별도로 검증한다.

## 충돌 방지 대장

`append_event(root, expected_revision, expected_hash, payload, protected_paths=...)`는 비교 후 추가(CAS)를 수행한다. 로컬 파일시스템의 독점 생성 잠금을 획득하고 현재 이벤트 체인을 검증한 뒤 revision과 base hash가 모두 같은 경우에만 새 번호 이벤트를 독점 생성한다. 기존 이벤트를 덮어쓰는 코드가 없다. 기록 후 파일을 flush·fsync한다. 기존 대장의 위치를 `protected_paths`에 명시하여 새 대장 위치와 겹치면 거부한다.

원격·공유 파일시스템에서의 잠금 보장은 시험하지 않았다. 중간 장애로 남은 잠금과 불완전한 이벤트는 자동 삭제·수정하지 않고 중단한다. 운영자는 원인을 확인하고 백업·감사 기록을 남긴 뒤 복구해야 한다. 쓰기 권한을 가진 사용자가 파일을 직접 변조하는 것을 막는 보안 저장소가 아니라 코드 경로의 충돌 방지 장치다.

## 게시 차단

`publish_plan`은 승인 파일이 없으면 항상 거부한다. 승인 파일은 정확한 주제 데이터 파일의 바이트 SHA-256, 선택 ID 목록, 승인자 선언, 승인·만료 시각, `sns_publish` 범위에 묶인다. 일부 문장 수정·다른 주제·기한 만료도 거부한다. **승인에 성공해도 로컬 검토 계획만 반환하며 SNS API는 호출하지 않는다.**

`approval_TEMPLATE_UNAPPROVED.json`은 미승인 템플릿이다. 테스트 승인 선언은 임시 디렉터리에서만 생성되고 운영 승인으로 저장되지 않는다. 로컬 JSON의 승인자 이름은 사람의 신원을 인증하지 않는다. 향후 실제 게시 연동 시 사용자 본인의 명시적 승인과 인증된 승인 기록·최종 이미지 및 캡션 지문을 추가로 연결해야 한다. 현재 시스템은 사용자 승인 없는 업로드·예약을 지원하지 않는다.

## 24시간·7일 지표

`metrics_24h_7d_TEMPLATE.csv`에는 헤더만 있으며 실적 0건이다. 공개 후 실제 권한 있는 관측값을 복사한 별도 CSV를 만든다. 같은 post_id와 variant_id에 `24h`·`7d` 행을 각각 기록한다. UTC 시각에는 시간대를 포함한다. 24h는 발행 후 최소 24시간, 7d는 최소 168시간이 지나야 한다. 실제 관측 시각을 보존하므로 정확히 같은 관측 시간을 가정하지 않는다. 7일 이후 값을 24시간으로 표기하면 거부한다.

reach는 필수, 기타 미제공 지표는 빈칸이다. 미제공과 관측 0을 섞지 않는다. 저장률 등을 계산할 때 도달 0의 비율은 미정으로 둔다. 서로 다른 게시물의 단순 수치 차이를 제목의 인과 효과로 단정하지 않는다. 계정 규모·게시 시간·주제·노출량을 함께 통제하고 표본이 작으면 방향 가설만 기록한다. 실제 플랫폼별 정의·중복 집계 가능성은 발행 도구의 내보내기 기준을 확인해야 한다.

## GitHub 후보

`.github/workflows/jobkill-validate.yml`은 저장소 루트의 `.github/workflows/`로 검토 후 옮길 후보다. 수동·push·PR 검증만 담고 일정 실행은 주석 처리했다. 이 위치에서는 자동으로 활성화되지 않는다. workflow 자체 검증·원격 실행·저장소 설치는 수행하지 않았다. SNS 권한·시크릿·배포 단계는 없다. 주석의 15분 주기는 가능성 조사용이며 보장된 실행 주기가 아니다.

