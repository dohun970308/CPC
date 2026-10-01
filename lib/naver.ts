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
  const ts = String(Date.now());
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, v);
  }
  const url = `${BASE_URL}${uri}${qs.size ? `?${qs}` : ""}`;
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
  if (!res.ok) throw new Error(`네이버 ${uri} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
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

async function getStats(ids: string[], preset: Preset): Promise<Record<string, NaverStat>> {
  const map: Record<string, NaverStat> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await call<{ data?: NaverStat[] }>("/stats", {
      ids: chunk,
      fields: JSON.stringify(["impCnt", "clkCnt", "salesAmt", "ctr", "cpc", "ccnt"]),
      datePreset: preset,
    });
    for (const s of r?.data ?? []) map[s.id] = s;
  }
  return map;
}

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

  const ids = [...campaigns.map((c) => c.nccCampaignId), ...adgroups.map((g) => g.nccAdgroupId)];
  const stats: Partial<Record<Preset, Record<string, NaverStat>>> = {};
  if (ids.length) {
    for (const p of STAT_PRESETS) stats[p] = await safe(`성과(${p})`, () => getStats(ids, p), {});
  }

  return { fetchedAt: new Date().toISOString(), bizmoney, campaigns, adgroups, keywords, stats, errors };
}

export type NaverSnapshot = Awaited<ReturnType<typeof getNaverSnapshot>>;
