import crypto from "node:crypto";

// 네이버 검색광고 API (공식 샘플: github.com/naver/searchad-apidoc)
const BASE_URL = "https://api.searchad.naver.com";

export function naverConfigured() {
  return Boolean(process.env.NAVER_API_KEY && process.env.NAVER_SECRET_KEY && process.env.NAVER_CUSTOMER_ID);
}

// 서명: "{timestamp}.{METHOD}.{uri}" 를 비밀키로 HMAC-SHA256 → Base64
export function naverSignature(timestamp: string, method: string, uri: string, secretKey: string) {
  return crypto.createHmac("sha256", secretKey).update(`${timestamp}.${method}.${uri}`).digest("base64");
}

type Query = Record<string, string | string[] | undefined>;

async function call<T>(uri: string, query: Query = {}): Promise<T> {
  const apiKey = process.env.NAVER_API_KEY!;
  const secret = process.env.NAVER_SECRET_KEY!;
  const customer = process.env.NAVER_CUSTOMER_ID!;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, v);
  }
  const url = `${BASE_URL}${uri}${qs.size ? `?${qs}` : ""}`;
  // 키워드 성과까지 조회하면 요청이 많아져 429(요청 과다)가 날 수 있으므로 잠시 쉬었다가 다시 시도
  for (let attempt = 1; ; attempt++) {
    const ts = String(Date.now());
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": ts,
        "X-API-KEY": apiKey,
        "X-Customer": customer,
        "X-Signature": naverSignature(ts, "GET", uri, secret),
      },
    });
    const text = await res.text();
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 700 * attempt));
      continue;
    }
    if (!res.ok) throw new Error(`네이버 ${uri} ${res.status}: ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : null) as T;
  }
}

export type NaverCampaign = {
  nccCampaignId: string;
  name: string;
  campaignTp?: string;
  dailyBudget?: number;
  useDailyBudget?: boolean;
  userLock?: boolean;
  status?: string;
  statusReason?: string;
};

export type NaverAdgroup = {
  nccAdgroupId: string;
  nccCampaignId: string;
  name: string;
  bidAmt?: number;
  dailyBudget?: number;
  useDailyBudget?: boolean;
  userLock?: boolean;
  status?: string;
  statusReason?: string;
};

export type NaverKeyword = {
  nccKeywordId: string;
  nccAdgroupId: string;
  keyword: string;
  bidAmt?: number;
  useGroupBidAmt?: boolean;
  userLock?: boolean;
  status?: string;
  statusReason?: string;
  inspectStatus?: string;
};

export type NaverStat = {
  id: string;
  impCnt?: number;
  clkCnt?: number;
  salesAmt?: number;
  ctr?: number;
  cpc?: number;
  ccnt?: number;
  avgRnk?: number; // 평균 노출 순위
};

export const STAT_PRESETS = ["today", "yesterday", "last7days"] as const;
export type Preset = (typeof STAT_PRESETS)[number];

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const BASE_FIELDS = ["impCnt", "clkCnt", "salesAmt", "ctr", "cpc", "ccnt"];
// 평균 노출 순위(avgRnk)를 API가 거부하면(400) 이후로는 빼고 조회해서 나머지 성과는 계속 보이게 한다
let rankSupported = true;

async function getStatsChunk(ids: string[], preset: Preset): Promise<NaverStat[]> {
  const fetchWith = (fields: string[]) =>
    call<{ data?: NaverStat[] }>("/stats", { ids, fields: JSON.stringify(fields), datePreset: preset });
  if (rankSupported) {
    try {
      return (await fetchWith([...BASE_FIELDS, "avgRnk"]))?.data ?? [];
    } catch (e) {
      if (!/ 400:/.test((e as Error).message)) throw e;
      rankSupported = false;
    }
  }
  return (await fetchWith(BASE_FIELDS))?.data ?? [];
}

const chunks = <T,>(xs: T[], size: number) =>
  Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, i * size + size));

export async function getNaverSnapshot() {
  const errors: string[] = [];
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
      return fallback;
    }
  };

  const bizmoney = await safe(
    "비즈머니",
    () => call<{ bizmoney?: number; budgetLock?: boolean; refundLock?: boolean }>("/billing/bizmoney"),
    null,
  );
  const campaigns = await safe("캠페인", () => call<NaverCampaign[]>("/ncc/campaigns"), [] as NaverCampaign[]);
  const adgroups = await safe("광고그룹", () => call<NaverAdgroup[]>("/ncc/adgroups"), [] as NaverAdgroup[]);
  const keywordLists = await pool(adgroups, 6, (g) =>
    safe(`키워드(${g.name})`, () => call<NaverKeyword[]>("/ncc/keywords", { nccAdgroupId: g.nccAdgroupId }), [] as NaverKeyword[]),
  );
  const keywords = keywordLists.flat();

  // /stats 는 한 요청 안의 ID가 모두 같은 종류여야 하므로 캠페인·광고그룹·키워드를 따로, 50개씩 나눠 조회
  const idGroups = [
    campaigns.map((c) => c.nccCampaignId),
    adgroups.map((g) => g.nccAdgroupId),
    keywords.map((k) => k.nccKeywordId),
  ].filter((g) => g.length);
  const jobs = STAT_PRESETS.flatMap((p) => idGroups.flatMap((ids) => chunks(ids, 50).map((c) => ({ p, ids: c }))));
  const results = await pool(jobs, 4, (j) => safe(`성과(${j.p})`, () => getStatsChunk(j.ids, j.p), [] as NaverStat[]));
  const stats: Partial<Record<Preset, Record<string, NaverStat>>> = {};
  jobs.forEach((j, i) => {
    const map = (stats[j.p] ??= {});
    for (const s of results[i]) map[s.id] = s;
  });

  return { fetchedAt: new Date().toISOString(), bizmoney, campaigns, adgroups, keywords, stats, errors: [...new Set(errors)] };
}

export type NaverSnapshot = Awaited<ReturnType<typeof getNaverSnapshot>>;
