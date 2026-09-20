# JOB&KILL 콘텐츠 운영

검색 수요 조사, 근거 기반 원고, 교수님 검토·승인, 채널별 콘텐츠 묶음, 상담·결제 성과 개선을 하나의 관리자 화면에서 다루는 초기 제품입니다.

## 현재 구현된 흐름

1. 네이버 데이터랩 검색 추세: 서버 환경변수 연결과 요청 검증
2. Google Trends: 공식 CSV 내보내기 파일 가져오기
3. 근거-초안-수정-승인-6개 채널 묶음 생성
4. 검색·상담·결제 성과 집계, 개선 우선순위, 실험 결과 분류
5. 오늘의 운영 대시보드, 근거 검토·승인 화면, 연결 상태 화면
6. PostgreSQL용 핵심 스키마 및 상태 전이 규칙

데모 수치는 실제 계정의 검색·상담·결제 수치가 아닙니다. 외부 채널의 게시 권한도 기본값으로 연결하지 않습니다.

## 실행

~~~bash
npm install
npm run dev
~~~

브라우저에서 http://127.0.0.1:3000 을 엽니다.

## 환경 변수

.env.example을 .env.local로 복사한 뒤 필요한 값만 서버 환경에 설정합니다.

- NAVER_DATALAB_CLIENT_ID
- NAVER_DATALAB_CLIENT_SECRET
- DATABASE_URL
- Google Search Console 연결 값

브라우저 코드나 Git 저장소에 비밀값을 넣지 않습니다.

## API

- GET /api/health
- GET /api/analytics/demo
- POST /api/trends/naver
- POST /api/trends/google-csv

## 검증

~~~bash
npm run typecheck
npm run lint
npm test
npm run build
~~~

## 다음 연동

기존 네이버 콘텐츠 자동화와 JOB&KILL 영상 스튜디오에는 아래 공통 데이터로 연결합니다.

- 주제 ID
- 승인된 원고 버전 ID
- 근거 자료 ID 목록
- 상품 ID
- 대상 채널

게시 연결은 실제 계정·권한·게시 결과 확인을 완료한 후 활성화합니다.
