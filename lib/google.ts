// 구글 광고 API (REST) — https://developers.google.com/google-ads/api/rest/common/search
// 개발자 토큰은 2026-09-09 지원 종료. 접근 수준은 OAuth 클라이언트를 만든 Google Cloud 프로젝트 기준.
// https://developers.google.com/google-ads/api/docs/api-policy/developer-token

// API 승인 전에는 구글 애즈 스크립트가 채우는 비공개 시트(lib/google-sheet.ts)를 대신 쓴다.
import { getGoogleSheetSnapshot, sheetConfigured } from "./google-sheet";
import type { DailyMetrics, Payment } from "./payments";

function apiConfigured() {
  const e = process.env;
  return Boolean(
    e.GOOGLE_ADS_CLIENT_ID && e.GOOGLE_ADS_CLIENT_SECRET &&
      e.GOOGLE_ADS_REFRESH_TOKEN && e.GOOGLE_ADS_CUSTOMER_ID,
  );
}

export function googleConfigured() {
  return sheetConfigured() || apiConfigured();
}

const digits = (s?: string) => (s ?? "").replace(/\D/g, "");

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`구글 인증 실패 ${res.status}: ${j.error ?? ""} ${j.error_description ?? ""}`);
  return j.access_token as string;
}

async function search(token: string, query: string): Promise<any[]> {
  const version = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const cid = digits(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  // 선택 사항(서버에서 무시됨). 예전 토큰이 있으면 그대로 보냄
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const login = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  if (login) headers["login-customer-id"] = login;

  const rows: any[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch(`https://googleads.googleapis.com/${version}/customers/${cid}/googleAds:search`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
    });
    const j = await res.json();
    if (!res.ok) {
      const detail = j?.error?.details?.[0]?.errors?.[0]?.message ?? j?.error?.message ?? "";
      throw new Error(`구글 API ${res.status}: ${detail}`);
    }
    rows.push(...(j.results ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return rows;
}

export const G_RANGES = { today: "TODAY", yesterday: "YESTERDAY", last7days: "LAST_7_DAYS" } as const;
export type GRange = keyof typeof G_RANGES;

export type GMetrics = { impressions: number; clicks: number; cost: number; conversions: number };

export type GoogleCampaign = {
  id: string;
  name: string;
  status: string;
  primaryStatus?: string;
  primaryStatusReasons?: string[];
  channel?: string;
  bidding?: string;
  budget?: number; // 원
  // 최근 7일 검색 노출 점유율(0~1): 받은 노출, 예산 부족으로 놓친 비율, 순위 때문에 놓친 비율
  impressionShare?: { share?: number; budgetLost?: number; rankLost?: number };
  metrics: Partial<Record<GRange, GMetrics>>;
};

export type GoogleAdgroup = { id: string; campaignId: string; name: string; status: string; cpcBid?: number; metrics: Partial<Record<GRange, GMetrics>> };

export type GoogleKeyword = {
  id: string;
  adgroupId: string;
  campaignId: string;
  text: string;
  matchType: string;
  status: string;
  servingStatus?: string;
  approvalStatus?: string;
  qualityScore?: number;
  cpcBid?: number;
  metrics: Partial<Record<GRange, GMetrics>>;
};

// keyword: 이 검색어를 노출시킨 내 키워드(확장·구문 검색이면 실제 검색어와 다름)
export type GoogleSearchTerm = GMetrics & {
  term: string;
  status: string;
  campaign: string;
  campaignId?: string;
  adgroup: string;
  adgroupId?: string;
  keyword?: string;
  keywordMatchType?: string;
  blocked?: boolean; // 지금 등록된 제외 키워드에 걸리는 검색어 (등록 전 7일 기록이 남은 것)
};
// 제외 키워드. adgroupId 가 없으면 캠페인 단위(공유 목록 포함)
export type GoogleNegative = { campaignId: string; adgroupId?: string; text: string; matchType: string };
// campaignId 가 있으면 캠페인별 행(제외 캠페인을 걸러낸 뒤 화면에서 합산), 없으면 계정 전체 행
export type GoogleSegment = GMetrics & { range: GRange; key: string; campaignId?: string };

export type GoogleSnapshot = {
  source: "api" | "sheet";
  fetchedAt: string;
  account: { name?: string; currency?: string; timeZone?: string; status?: string } | null;
  campaigns: GoogleCampaign[];
  adgroups: GoogleAdgroup[];
  keywords: GoogleKeyword[];
  searchTerms: GoogleSearchTerm[];
  negatives?: GoogleNegative[]; // 없으면 예전 스크립트라 모름
  devices: GoogleSegment[];
  hours: GoogleSegment[];
  daily?: DailyMetrics[]; // 계정 전체 일별 합계 (시트 방식만, 결제 요약용)
  payments?: Payment[]; // 시트 '결제' 탭 (없으면 탭이 아직 없는 것)
  errors: string[];
};

// 구글 제외 키워드 규칙(유사어 확장 없음): 확장=모든 단어 포함(순서 무관), 구문=단어가 그 순서로 연속, 완전=검색어 전체가 같음
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
export function matchesNegative(term: string, neg: Pick<GoogleNegative, "text" | "matchType">) {
  const t = words(term);
  const n = words(neg.text);
  if (!n.length) return false;
  if (neg.matchType === "EXACT") return t.join(" ") === n.join(" ");
  if (neg.matchType === "PHRASE") {
    for (let i = 0; i + n.length <= t.length; i++) if (n.every((w, j) => t[i + j] === w)) return true;
    return false;
  }
  return n.every((w) => t.includes(w));
}

function markBlocked(s: GoogleSnapshot): GoogleSnapshot {
  const negs = s.negatives ?? [];
  return {
    ...s,
    searchTerms: s.searchTerms.map((t) => ({
      ...t,
      blocked:
        t.status === "EXCLUDED" || t.status === "ADDED_EXCLUDED" ||
        negs.some((n) => n.campaignId === t.campaignId && (!n.adgroupId || n.adgroupId === t.adgroupId) && matchesNegative(t.term, n)),
    })),
  };
}

// 대시보드와 상관없는 캠페인 (이름 비교 시 대소문자·공백 무시)
const EXCLUDED_CAMPAIGNS = ["test 1"];
const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, "");
const excludedNames = new Set(EXCLUDED_CAMPAIGNS.map(norm));

function withoutExcluded(s: GoogleSnapshot): GoogleSnapshot {
  const out = new Set(s.campaigns.filter((c) => excludedNames.has(norm(c.name))).map((c) => c.id));
  if (!out.size) return s;
  const keep = <T extends { campaignId?: string }>(x: T) => !x.campaignId || !out.has(x.campaignId);
  return {
    ...s,
    campaigns: s.campaigns.filter((c) => !out.has(c.id)),
    adgroups: s.adgroups.filter(keep),
    keywords: s.keywords.filter(keep),
    searchTerms: s.searchTerms.filter((t) => !excludedNames.has(norm(t.campaign))),
    negatives: s.negatives?.filter(keep),
    devices: s.devices.filter(keep),
    hours: s.hours.filter(keep),
  };
}

export async function getGoogleSnapshot(): Promise<GoogleSnapshot> {
  if (sheetConfigured()) {
    try {
      return markBlocked(withoutExcluded(await getGoogleSheetSnapshot()));
    } catch (e) {
      if (!apiConfigured()) return { ...emptySnapshot("sheet"), errors: [(e as Error).message] };
    }
  }
  return markBlocked(withoutExcluded(await getGoogleApiSnapshot()));
}

function emptySnapshot(source: GoogleSnapshot["source"]): GoogleSnapshot {
  return { source, fetchedAt: new Date().toISOString(), account: null, campaigns: [], adgroups: [], keywords: [], searchTerms: [], devices: [], hours: [], errors: [] };
}

async function getGoogleApiSnapshot(): Promise<GoogleSnapshot> {
  const errors: string[] = [];
  let account: { name?: string; currency?: string; timeZone?: string; status?: string } | null = null;
  const campaigns = new Map<string, GoogleCampaign>();
  try {
    const token = await accessToken();
    const acc = await search(token, "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer");
    const c = acc[0]?.customer;
    account = c ? { name: c.descriptiveName, currency: c.currencyCode, timeZone: c.timeZone, status: c.status } : null;

    const list = await search(
      token,
      "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'",
    );
    for (const r of list) {
      campaigns.set(String(r.campaign.id), {
        id: String(r.campaign.id),
        name: r.campaign.name,
        status: r.campaign.status,
        primaryStatus: r.campaign.primaryStatus,
        primaryStatusReasons: r.campaign.primaryStatusReasons,
        channel: r.campaign.advertisingChannelType,
        budget: r.campaignBudget?.amountMicros ? Number(r.campaignBudget.amountMicros) / 1e6 : undefined,
        metrics: {},
      });
    }

    for (const [key, during] of Object.entries(G_RANGES) as [GRange, string][]) {
      try {
        const m = await search(
          token,
          `SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING ${during} AND campaign.status != 'REMOVED'`,
        );
        for (const r of m) {
          const camp = campaigns.get(String(r.campaign.id));
          if (!camp) continue;
          camp.metrics[key] = {
            impressions: Number(r.metrics.impressions ?? 0),
            clicks: Number(r.metrics.clicks ?? 0),
            cost: Number(r.metrics.costMicros ?? 0) / 1e6,
            conversions: Number(r.metrics.conversions ?? 0),
          };
        }
      } catch (e) {
        errors.push(`성과(${key}): ${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push((e as Error).message);
  }
  return { ...emptySnapshot("api"), account, campaigns: [...campaigns.values()], errors };
}
