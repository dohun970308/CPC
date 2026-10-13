# 광고 대시보드 API (카독.com 어드민 연동용)

퍼스트 광고 계기판(https://cpc-bay-six.vercel.app)의 네이버·구글 광고 데이터를 다른 서버에서 읽는 방법입니다.
**읽기 전용**이며, API 토큰이 있어야 합니다.

## 보안 규칙 (반드시 지킬 것)

1. 토큰은 **서버 환경변수에만** 둡니다. 이름은 `CPC_DASHBOARD_API_TOKEN` 처럼 짓고, `NEXT_PUBLIC_` 으로 시작하면 안 됩니다(브라우저로 새어 나감).
2. API 호출은 **서버에서만** 합니다 (Next.js 서버 컴포넌트, Route Handler, Server Action). 브라우저 `fetch` 로 직접 부르지 않습니다.
3. 데이터를 보여주는 `/admin` 페이지는 **로그인한 관리자만** 볼 수 있어야 합니다.
4. 토큰이 새었다고 의심되면 대시보드 쪽 Vercel 의 `DASHBOARD_API_TOKEN` 값을 바꾸면 즉시 무효가 됩니다.

## 호출 방법

```
GET https://cpc-bay-six.vercel.app/api/naver
GET https://cpc-bay-six.vercel.app/api/google
Authorization: Bearer <토큰>
```

- 성공: `200` + JSON
- 토큰 틀림: `401` `{ "error": "API 토큰이 올바르지 않습니다." }`
- 응답은 매번 실시간으로 만들어지므로 수 초 걸릴 수 있습니다. 1~5분 캐시를 권장합니다.

## 응답 구조

### `/api/naver`

```ts
{
  configured: boolean;          // false 면 나머지 필드 없음
  fetchedAt: string;            // ISO 시각
  bizmoney: { bizmoney?: number; budgetLock?: boolean; refundLock?: boolean } | null;  // 비즈머니 잔액(원)
  campaigns: { nccCampaignId: string; name: string; dailyBudget?: number; useDailyBudget?: boolean;
               userLock?: boolean /* true = OFF */; status?: string; statusReason?: string }[];
  adgroups:  { nccAdgroupId: string; nccCampaignId: string; name: string; bidAmt?: number;
               dailyBudget?: number; userLock?: boolean; status?: string }[];
  keywords:  { nccKeywordId: string; nccAdgroupId: string; keyword: string; bidAmt?: number;
               useGroupBidAmt?: boolean; userLock?: boolean; status?: string; inspectStatus?: string }[];
  // 기간별 성과. 키는 캠페인/광고그룹/키워드 ID
  stats: Record<"today" | "yesterday" | "last7days", Record<string, {
    impCnt?: number;   // 노출
    clkCnt?: number;   // 클릭
    salesAmt?: number; // 광고비(원, VAT 별도)
    ccnt?: number;     // 전환
    ctr?: number; cpc?: number; avgRnk?: number;
  }>>;
  findings: { level: "치명" | "주의" | "참고"; channel: "네이버"; where: string; message: string }[]; // 자동 점검
  errors: string[];
}
```

### `/api/google`

```ts
type Metrics = { impressions: number; clicks: number; cost: number /* 원 */; conversions: number };
type Range = "today" | "yesterday" | "last7days";

{
  configured: boolean;
  source: "sheet" | "api";
  fetchedAt: string;            // 데이터 기준 시각 (시트 방식은 최대 1시간 전)
  account: { name?: string; currency?: string } | null;
  campaigns: { id: string; name: string; status: "ENABLED" | "PAUSED" | string; primaryStatus?: string;
               budget?: number; impressionShare?: { share?: number; budgetLost?: number; rankLost?: number }; // 0~1, 최근 7일
               metrics: Partial<Record<Range, Metrics>> }[];
  adgroups:  { id: string; campaignId: string; name: string; status: string; cpcBid?: number; metrics: Partial<Record<Range, Metrics>> }[];
  keywords:  { id: string; adgroupId: string; campaignId: string; text: string; matchType: "EXACT" | "PHRASE" | "BROAD" | string;
               status: string; qualityScore?: number /* 1~10 */; cpcBid?: number; metrics: Partial<Record<Range, Metrics>> }[];
  searchTerms: (Metrics & { term: string; status: string; campaign: string; adgroup: string })[]; // 최근 7일 실제 검색어
  devices: (Metrics & { range: "today" | "last7days"; key: string /* MOBILE, DESKTOP… */; campaignId?: string })[];
  hours:   (Metrics & { range: "today" | "last7days"; key: string /* "0"~"23" */; campaignId?: string })[];
  findings: { level: "치명" | "주의" | "참고"; channel: "구글"; where: string; message: string }[];
  errors: string[];
}
```

`devices`·`hours` 는 캠페인별 행일 수 있으니 같은 `range`+`key` 끼리 더해서 쓰세요.

## Next.js 예시 (서버 컴포넌트)

```tsx
// app/admin/ads/page.tsx  — 반드시 관리자 로그인 확인 뒤에 렌더링
async function getAds(path: "naver" | "google") {
  const res = await fetch(`https://cpc-bay-six.vercel.app/api/${path}`, {
    headers: { Authorization: `Bearer ${process.env.CPC_DASHBOARD_API_TOKEN}` },
    next: { revalidate: 300 }, // 5분 캐시
  });
  if (!res.ok) throw new Error(`광고 데이터 ${path} ${res.status}`);
  return res.json();
}

export default async function AdsPage() {
  const [naver, google] = await Promise.all([getAds("naver"), getAds("google")]);
  // naver.stats.today[캠페인ID].clkCnt, google.campaigns[i].metrics.today.clicks … 로 화면 구성
}
```

## ChatGPT 에 붙여넣을 요청문 (예시)

> 우리 사이트 `/admin` 아래에 광고 대시보드 페이지를 만들어줘. 데이터는 외부 API에서 서버 쪽으로만 가져와야 해.
> 환경변수 `CPC_DASHBOARD_API_TOKEN` 을 서버에서만 쓰고(절대 `NEXT_PUBLIC_` 금지, 클라이언트 fetch 금지),
> 기존 관리자 로그인 확인을 통과한 사람만 볼 수 있게 해줘. 5분 캐시.
> API 명세는 아래 문서를 따라줘: (이 문서의 '호출 방법'~'Next.js 예시'를 붙여넣기)
> 화면: 기간 탭(오늘/어제/최근 7일), 전체 합계(노출·클릭·CTR·광고비·전환·전환당 비용),
> 자동 점검(findings, 치명→주의→참고 순), 네이버 캠페인›광고그룹›키워드 표, 구글 캠페인›광고그룹›키워드 표.
