# 퍼스트 광고 계기판 (네이버 · 구글 CPC)

네이버 검색광고 API와 구글 광고 API에서 **현재 광고 상태와 성과**를 읽어 한 화면에 보여주고, 자동 점검(치명/주의/참고)을 합니다.
읽기 전용입니다. 이 대시보드는 광고 설정을 바꾸지 않습니다.

## 화면 구성
- 전체 합계(오늘/어제/최근 7일): 노출·클릭·광고비·전환·DB 1건당 비용
- 자동 점검: 비즈머니 부족, 꺼진/노출 불가 캠페인·그룹, 키워드 없는 그룹, 그룹 기본 입찰가(70원)로 입찰 중인 키워드, 검수 반려, 클릭은 있는데 전환 0건 등
- 네이버: 캠페인 › 광고그룹별 상태·예산·기본 입찰가·성과
- 구글: 캠페인별 상태·예산·성과
- 5분마다 자동 갱신 (매체 집계 자체는 수십 분~몇 시간 늦을 수 있음)

## 키 넣는 곳 (Vercel)
Vercel → 이 프로젝트 → **Settings → Environment Variables** 에 아래 이름으로 넣고 **Redeploy** 합니다.
키는 GitHub나 채팅에 올리지 마세요. 입력 여부는 `/api/health` 에서 true/false로만 확인됩니다.

| 이름 | 값 | 받는 곳 |
|---|---|---|
| `DASHBOARD_PASSWORD` | 대시보드 접속 비밀번호 (아이디는 아무거나) | 직접 정함 |
| `NAVER_API_KEY` | 액세스 라이선스 | 네이버 광고 → 도구 → API 사용 관리 |
| `NAVER_SECRET_KEY` | 비밀키 | 같은 곳 |
| `NAVER_CUSTOMER_ID` | CUSTOMER_ID (숫자) | 같은 곳 |
| `GOOGLE_ADS_CLIENT_ID` | OAuth 클라이언트 ID | Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보 (유형: 데스크톱 앱) |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth 클라이언트 보안 비밀번호 | 같은 곳 |
| `GOOGLE_ADS_REFRESH_TOKEN` | 리프레시 토큰 | 아래 '구글 리프레시 토큰 발급' |
| `GOOGLE_ADS_CUSTOMER_ID` | 광고 계정 ID 10자리 (하이픈 없이) | 구글 광고 화면 오른쪽 위 |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | 관리자(MCC) 계정 ID — MCC로 접근할 때만 | 구글 광고 관리자 계정 |

> 구글 개발자 토큰은 2026-09-09에 지원이 종료되었습니다. API 접근 수준은 OAuth 클라이언트를 만든 **Google Cloud 프로젝트** 기준이며,
> Google Cloud 콘솔의 **Google Ads API 개요 페이지**에서 신청·관리합니다. ([공식 문서](https://developers.google.com/google-ads/api/docs/api-policy/developer-token))

## 구글 리프레시 토큰 발급 (Windows PowerShell)
Node.js가 설치돼 있어야 합니다. 저장소를 받은 폴더에서:

```powershell
npm install
$env:GOOGLE_ADS_CLIENT_ID="여기에_클라이언트_ID"
$env:GOOGLE_ADS_CLIENT_SECRET="여기에_클라이언트_보안_비밀번호"
npm run google-token
```

출력된 주소를 Chrome에서 열고, 구글 광고 계정 권한이 있는 구글 계정으로 허용하면 PowerShell에 리프레시 토큰이 출력됩니다.
그 값을 Vercel의 `GOOGLE_ADS_REFRESH_TOKEN` 에 넣으세요.

## 내 PC에서 실행 (Windows PowerShell)
```powershell
Copy-Item .env.example .env.local   # 메모장으로 .env.local 을 열어 값 입력
npm install
npm run dev                          # http://localhost:3000
```

## 계획값(키워드 전략) 대조
`plan/plan.json` 은 비어 있습니다. 키워드 전략이 확정되면 여기에 채워 넣고, 계획 대비 점검을 추가합니다.

## 참고 문서
- 네이버 검색광고 API 공식 샘플: https://github.com/naver/searchad-apidoc
- 구글 광고 API 검색(REST): https://developers.google.com/google-ads/api/rest/common/search
