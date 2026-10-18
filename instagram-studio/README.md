# JOB&KILL SNS Studio — 인스타그램 캐러셀 자동 게시 관리 프로그램

**자체 자동 게시 프로그램 v1.2**입니다. Metricool 서비스나 유료 구독에 의존하지 않고, Meta의 **Instagram API with Instagram Login**을 직접 사용합니다. 비공개 관리자 대시보드, 6장 콘텐츠 등록, 정기 예약, 실행 이력, 중복 게시·불확실한 결과 관리, Meta OAuth 흐름이 포함됩니다.

> 현재 본 소스의 실제 Instagram 게시 시험은 수행하지 않았습니다. 기본값으로 게시 기능이 잠겨 있으며, Meta 앱 등록·인스타그램 전문가 계정 승인·공개 HTTPS 웹주소·안전한 이미지 저장소가 준비된 이후에만 게시됩니다. **프로그램이 있다고 해서 Meta 권한이나 게시 가능 계정이 자동 발급되는 것은 아닙니다.**

## 설치와 테스트

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
python -c "import secrets; print('SESSION_SECRET='+secrets.token_hex(32))"
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY='+Fernet.generate_key().decode())"
```

`.env.example`을 `.env`로 복사한 다음, **ADMIN_PASSWORD(12자 이상), SESSION_SECRET, ENCRYPTION_KEY**를 독립적으로 설정합니다. `.env`는 GitHub에 올리지 마세요. `python run.py`는 `.env`를 자동으로 읽습니다. Docker에서는 `--env-file`로 전달합니다.

macOS/Linux 예시:

```bash
set -a; source .env; set +a
python run.py
```

브라우저: **http://127.0.0.1:8000/login**. 같은 컴퓨터에서 보관·예약 기능을 테스트할 수 있습니다. 휴대폰에서는 배포한 HTTPS 주소로 접속합니다.

테스트: `pip install pytest beautifulsoup4 && python -m pytest -q`.

## 사용 방법

1. 휴대폰에서 PNG 6장을 고르고 순서를 바꾸거나, 잡앤킬 캐러셀 ZIP을 준비합니다. `01.png` ~ `06.png` 또는 `slide_01.png` ~ `slide_06.png`, 각각 **1080×1350px**. ZIP 내부에 `게시글.txt` 등이 함께 들어 있어도 괜찮습니다. 다만 게시글 내용은 업로드 폼에 붙여넣어야 합니다.
2. 관리자 화면에서 ZIP, 제목, 게시글을 등록합니다. 내부에서 Instagram API용 **JPEG** 6장으로 변환합니다(원본 PNG ZIP은 사용자 컴퓨터에 그대로 유지). 같은 이미지 6장을 다시 등록하려 하면 차단합니다.
3. **대기 원고를 하루 2편 자동 예약**을 누르면 한국시간 기준 **매일 12:00/19:00**에 선착순 예약됩니다. 특정 날짜·시간도 직접 지정할 수 있습니다. 자동 게시는 기존 ZIP을 준비한 뒤 등록한 콘텐츠에 대해서만 수행합니다. ChatGPT Library의 새 파일을 서버가 직접 읽는 기능은 포함하지 않았습니다. 별도의 자동화 프로그램에서 ZIP을 제출할 수 있도록 인증형 `/api/ingest` 수신 API를 제공합니다.
4. Meta 개발자 도구에서 Instagram Login용 앱을 생성하고 `instagram_business_basic`, `instagram_business_content_publish` 권한을 설정합니다. 앱 ID와 secret, OAuth redirect URI를 환경변수에 넣습니다. Meta 관리 화면에 등록할 callback 주소는 `https://YOUR-DOMAIN/oauth/callback`입니다. **개인 계정은 공식 게시 API 대상이 아니므로 전문가 계정이 필요**합니다.
5. 공개 HTTPS 도메인, 보존되는 데이터 디스크, 애플리케이션 비밀값이 설정된 단일 서버에 배포한 뒤, `PUBLIC_BASE_URL`, `EXPECTED_INSTAGRAM_USERNAME`을 잡앤킬 실제 계정에 맞춥니다. Dashboard에서 공식 로그인을 진행합니다.
6. 관리자 화면에서 연결된 계정을 직접 확인하고 승인한 후에만 서버의 `ENABLE_LIVE_PUBLISH=true`를 설정합니다. 이 값과 계정 확인 상태가 모두 true인 경우에만 게시가 시도됩니다. 두 조건이 없으면 예약만 보관됩니다.

## 구현 기능

| 기능 | 상태 |
|---|---|
| 관리자 로그인·보안 세션·CSRF | 구현 |
| 모바일 PWA·사진 6장 선택/순서 변경·전체 슬라이드 미리보기 | 구현 |
| 6장 PNG ZIP 검사 및 JPEG 변환 | 구현 |
| 원본 1080×1350 검증, 중복 SHA-256 검사 | 구현 |
| 월별 20회 제한 없는 자체 예약 DB | 구현 *(Meta의 플랫폼 사용량 제한은 적용됨)* |
| 매일 12시·19시 빈 시간 자동 배정 | 구현 |
| Meta Instagram OAuth 및 암호화 토큰 보관 | 구현, 앱 정보 및 실계정 인증 필요 |
| 6장 carousel media container·status polling·publish | 구현, 실계정 검증 필요 |
| 모의 검수·게시 이력·중복 제출 방지 | 구현 |
| 업로드 후 완전 자동 콘텐츠 생성·Library 동기화 | 미구현 |
| 인사이트·경쟁계정 분석·댓글 관리 | 미구현 |
| Instagram 실제 게시 및 인증 완료 | 미실행 |

## 배포와 보안 유의사항

- 인스타그램은 게시할 이미지 URL을 Meta 서버에서 다운로드하므로, **서버가 HTTPS로 접근 가능**해야 합니다. 게시 시점에만 접근 가능한 서명 URL을 생성하며, 유효기간 1시간입니다. 이미지 파일은 서버 데이터 디스크에 보관됩니다.
- `DATA_DIR`이 일시 저장소이면 배포 때 예약과 이미지, 토큰이 삭제될 수 있습니다. Render 등에서 유료 영구 디스크를 사용하거나 안정적인 데이터베이스/오브젝트 스토리지로 이관하세요. 무료 호스팅만으로 24시간 안정 게시를 보장하지 않습니다.
- 앱 관리자 암호 및 `ENCRYPTION_KEY`, `SESSION_SECRET`, `INSTAGRAM_APP_SECRET`을 절대 코드·로그·메신저에 넣지 않습니다. 토큰은 Fernet으로 암호화 저장됩니다.
- 테스트 배포 시 `ENABLE_LIVE_PUBLISH=false`를 반드시 유지하세요. 공개 서버에서 인증을 연결하기 전에 Meta 개발자 권한·앱 모드·테스트 유저/앱 검수 조건을 확인해야 합니다.
- 소유한 계정에만 게시하고, 서비스 운영 정책이나 게시 제한을 회피하려 하지 않습니다. 게시 요청은 Meta 공식 API를 사용하며 해당 플랫폼의 사용 조건과 한도를 따릅니다.
- 서버 시간대는 내부적으로 UTC, 예약 입력·자동 배정은 `Asia/Seoul`입니다. 두 개 이상 서버 프로세스는 사용하지 않는 것이 좋습니다. DB의 조건부 claim이 중복 작업을 억제하지만, Meta가 요청 후 응답을 잃는 경우 **uncertain**으로 표시하며 자동 재게시하지 않습니다.
- `uncertain` 상태는 자동 재게시하지 않습니다. 관리자가 게시물 ID를 입력하면 기존 컨테이너의 게시 상태와 연결 계정의 최근 게시물 100개 내 ID·캐러셀 형식·게시글·게시 시간을 조회합니다. 확인되지 않으면 상태를 유지합니다. 이 원격 검증은 모의 응답으로 시험했으며 실계정 시험이 남아 있습니다.
- `getBrandSettings`처럼 Metricool 플러그인과 직접 연동하지 않습니다. Metricool의 타사 과금 정책에 영향받지 않습니다.

## Meta 참고 문서

- [Instagram API with Instagram Login — Meta 공식 Postman](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00)
- [Content Publishing — Meta 공식 문서](https://developers.facebook.com/documentation/instagram-platform/content-publishing)

2026-10-18 공식 원문 접근 시 HTTP 429가 발생해 최신 전체 명세를 다시 읽지 못했습니다. 현재 버전의 실제 권한·계정·API 호환성은 연결 후 소유 계정으로 검증해야 합니다.

### 비용

자체 프로그램 사용료는 없습니다. 그러나 실제 인터넷 게시를 위해 필요한 **도메인·항시 실행 서버·보존 디스크**, 경우에 따라 Meta 앱 심사/운영 과정의 간접 비용은 별도입니다. '완전 무료로 월 60편 보장'은 아닙니다.

### Docker 서버 실행

```bash
docker build -t jobkill-sns-studio .
docker run --env-file .env -p 8000:8000 -v "$PWD/data:/app/data" -e DATA_DIR=/app/data jobkill-sns-studio
```

`.env`의 `PUBLIC_BASE_URL`에는 배포 후 실제 HTTPS 주소를 지정합니다. Docker 예시는 **로컬 테스트용**이며, 공개 HTTPS·방화벽·데이터 백업·Meta 권한은 자동 제공하지 않습니다. 실제 운영 시 리버스 프록시(TLS)와 단일 프로세스·영구 데이터 저장소가 필요합니다.


### 새로운 캐러셀 제작 → 예약 자동 연동 API

`.env`에 `API_INGEST_KEY`를 24자 이상의 임의 암호로 지정하면 신뢰한 외부 제작 프로그램이 **POST `/api/ingest`** 에 ZIP·제목·게시글을 제출할 수 있습니다. 등록 즉시 비어 있는 12:00/19:00 슬롯에 예약됩니다. OAuth·계정 확인이 없으면 실제 인스타그램으로 나가지 않습니다.

```bash
curl -X POST 'https://YOUR-DOMAIN/api/ingest' \
  -H 'X-Jobkill-Api-Key: YOUR_LONG_PRIVATE_TOKEN' \
  -F 'content_id=S01-E001' \
  -F 'title=직무 역량 경험 정리' \
  -F 'caption=내 경험으로 다시 말해 보세요. #잡앤킬' \
  -F 'media=@my_carousel.zip;type=application/zip'
```

**주의:** 이 API는 외부 제작기가 부를 수 있는 연결 지점입니다. 현재 ChatGPT Library 자동 수집이나 정기 제작 작업과의 실연동은 완료되지 않았습니다. 별도 연결이 필요합니다. 이 API 키는 절대로 공개 Github 저장소·클라이언트 웹 화면에 노출하지 않습니다.


## v1.1 자동화 연결

새 기능: 회차 ID로 중복 등록 방지, 같은 회차의 다른 판본 차단, 등록 결과 조회, 게시 처리 직렬화, 실제 게시일 기준 하루 최대 2편, 오래 지난 예약의 재배치, 중단된 실행 복구, 게시 ID 응답 뒤 부가 링크 조회 실패 시 완료 기록 유지.

제작된 한 편의 ZIP에는 번호순 PNG 6장과 `문구.json`이 있어야 합니다. `문구.json`은 `decks` 배열 한 개 안에 제목 `title`, 게시글 `caption`, 6장 `slides`를 담습니다. 마지막 장에 팔로우 안내가 없는 묶음은 제출 프로그램이 보류합니다. 이미지와 문구 일치, 하단 고지 제거, 개인정보·사실성 검수는 제작 단계에서 별도로 완료해야 합니다.

```bash
# 서버 주소와 키는 실행 환경의 비밀 설정에서 주입합니다.
# STUDIO_BASE_URL=https://실제-서버-주소
# API_INGEST_KEY=<서버와 동일한 비밀값>
python scripts/submit_carousel.py --bundle 한편.zip --content-id S01-E005 --dry-run
python scripts/submit_carousel.py --bundle 한편.zip --content-id S01-E005
```

제출 전에 같은 회차의 등록 여부를 조회합니다. 이미 등록됐으면 예약 번호만 반환합니다. 제출 요청의 응답이 끊기면 POST를 곧바로 반복하지 않으며, 다음 실행에서 같은 회차 ID로 다시 조회합니다. `registered`는 서버 등록, `scheduled`는 예약입니다. 실제 게시 완료를 뜻하지 않습니다.

인증 API:
- `GET /api/readiness`: 현재 계정·활성화·HTTPS 설정 확인. `API_INGEST_KEY` 필요.
- `GET /api/posts?content_id=회차ID`: 등록·예약·게시 결과 조회. `API_INGEST_KEY` 필요.
- `POST /api/ingest`: 등록 후 다음 빈 12시/19시 슬롯 배정. `API_INGEST_KEY` 필요.
- `POST /api/tick`: 기한이 된 한 편 처리. 별도의 `API_WORKER_KEY` 필요. 기본 서버는 30초마다 자체 실행하므로 외부 호출은 선택입니다.

`API_INGEST_KEY`와 `API_WORKER_KEY`는 서로 다르게 24자 이상으로 설정합니다. 토큰·앱 Secret은 문서와 자동화 프롬프트에 넣지 않습니다. `python scripts/check_ready.py`는 서버 구성만 점검하며 Instagram을 호출하지 않습니다.

## v1.2 배포 구성

휴대폰 화면과 자동 게시 API를 하나로 합쳤습니다. 기존 파일 등록·사진 순서 변경·전체 미리보기를 유지하면서, 재요청 중복 방지와 하루 최대 2편 제한을 적용합니다.

저장소 루트의 `render.yaml`은 별도 `jobandkill-instagram-studio` 서비스를 정의합니다. 기존 서비스와 기본 브랜치는 수정하지 않습니다. Python 단일 프로세스, Singapore, 최소 유료 컴퓨트 `0.5c-512mb`, 1GB 영구 디스크 `/var/data` 구성입니다.

- `python start.py`가 Render의 `RENDER_EXTERNAL_URL` 또는 `RENDER_EXTERNAL_HOSTNAME`을 읽어 HTTPS 주소를 설정한 뒤 서버를 시작합니다. 세션 보안과 인증 callback에 같은 주소를 사용합니다.
- `REQUIRE_PERSISTENT_DATA=true`일 때 디스크가 연결되지 않았으면 서버 시작을 멈춥니다. 예약·이미지·암호화된 토큰을 일시 저장소에 두지 않습니다.
- 최초 서비스 생성 시 관리자 암호를 Render의 비밀 설정에 직접 입력합니다. 세션·암호화·API 비밀값은 각각 생성하며, GitHub에 넣지 않습니다.
- 기본 배포는 `ENABLE_LIVE_PUBLISH=false`입니다. Meta 앱 설정과 계정 인증 완료 후 활성화합니다.
- `autoDeployTrigger: off`로 준비했습니다. 코드 반영 시 검증한 버전을 명시적으로 배포합니다.
- 27개 모의/로컬 시험 통과. 실제 Render 배포·Meta OAuth·인스타그램 게시 시험을 했다는 뜻은 아닙니다.

### 필요한 연결 값

호스팅 서비스의 비밀 설정에 `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `EXPECTED_INSTAGRAM_USERNAME`을 저장합니다. Meta 앱에 실제 서버 주소 + `/oauth/callback`을 등록합니다. 토큰이나 앱 Secret을 게시글·소스·작업 프롬프트에 넣지 않습니다.

콘텐츠 제출 실행 환경에는 실제 `STUDIO_BASE_URL`과 서버의 `API_INGEST_KEY`를 연결합니다. 서버 주소만 생겨도 콘텐츠 수집이나 Instagram 인증이 완료되는 것은 아닙니다.

### 운영 비용과 상태

2026-10-18 확인한 Render 공식 안내 기준 기본 비용은 서버 월 7달러와 1GB 디스크 월 0.25달러, 합계 월 7.25달러입니다. 세금, 워크스페이스의 기존 요금, 사용량 초과 비용은 별도입니다. 서비스 생성·유료 결제·Instagram 계정 연결은 이 소스 저장만으로 실행되지 않습니다.

출처: [컴퓨트 공식 가격 설명](https://render.com/articles/production-rails-hosting-guide), [영구 디스크 공식 가격 설명](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses), [Blueprint 명세](https://render.com/docs/blueprint-spec).

매시간 콘텐츠 제작과 매일 12시·19시 게시 일정은 별개입니다. 서버의 30초 간격 점검은 예약 시각 확인이며, 게시 빈도를 늘리지 않습니다. 실제 게시 완료 여부는 Meta가 반환한 게시물 ID와 게시 상태로 기록합니다.
