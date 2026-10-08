import crypto from "node:crypto";
import type {
  GMetrics, GRange, GoogleAdgroup, GoogleCampaign, GoogleKeyword, GoogleSearchTerm, GoogleSegment, GoogleSnapshot,
} from "./google";

// 구글 애즈 스크립트(scripts/google-ads-to-sheet.js)가 매시간 채우는 비공개 시트를
// 서비스 계정으로 읽는다. 시트는 서비스 계정에만 '보기' 공유되어 있다.

export function sheetConfigured() {
  return Boolean(process.env.GOOGLE_ADS_SHEET_ID && process.env.GOOGLE_SA_KEY_JSON);
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

async function serviceAccountToken(): Promise<string> {
  let key: { client_email?: string; private_key?: string };
  try {
    key = JSON.parse(process.env.GOOGLE_SA_KEY_JSON!);
  } catch {
    throw new Error("GOOGLE_SA_KEY_JSON 이 올바른 JSON이 아닙니다. 서비스 계정 키 파일 내용을 통째로 붙여넣었는지 확인하세요.");
  }
  if (!key.client_email || !key.private_key) throw new Error("GOOGLE_SA_KEY_JSON 에 client_email/private_key 가 없습니다.");

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`서비스 계정 인증 실패 ${res.status}: ${j.error ?? ""} ${j.error_description ?? ""}`);
  return j.access_token as string;
}

const TABS = ["meta", "campaigns", "adgroups", "keywords", "search_terms", "devices", "hours"] as const;
type Tab = (typeof TABS)[number];
type Row = Record<string, string>;

async function readTabs(): Promise<Record<Tab, Row[]>> {
  const token = await serviceAccountToken();
  const qs = new URLSearchParams(TABS.map((t) => ["ranges", t]));
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(process.env.GOOGLE_ADS_SHEET_ID!)}/values:batchGet?${qs}`,
    { cache: "no-store", headers: { Authorization: `Bearer ${token}` } },
  );
  const j = await res.json();
  if (!res.ok) {
    const msg = j?.error?.message ?? "";
    if (res.status === 403)
      throw new Error(`시트 읽기 권한 없음(403): 스크립트의 SERVICE_ACCOUNT_EMAIL 과 Google Sheets API 사용 설정을 확인하세요. ${msg}`);
    if (res.status === 404) throw new Error(`시트를 찾을 수 없음(404): GOOGLE_ADS_SHEET_ID 를 확인하세요. ${msg}`);
    throw new Error(`시트 읽기 실패 ${res.status}: ${msg}`);
  }
  const out = {} as Record<Tab, Row[]>;
  (j.valueRanges ?? []).forEach((vr: { values?: string[][] }, i: number) => {
    const [header = [], ...rows] = vr.values ?? [];
    out[TABS[i]] = rows.map((r) => Object.fromEntries(header.map((h, c) => [h, r[c] ?? ""])));
  });
  return out;
}

const num = (s?: string) => (s == null || s === "" ? undefined : Number(s));
const RANGE_KEYS: GRange[] = ["today", "yesterday", "last7days"];
const metricsOf = (r: Row): Partial<Record<GRange, GMetrics>> =>
  Object.fromEntries(
    RANGE_KEYS.map((k) => [
      k,
      {
        impressions: num(r[`${k}_impressions`]) ?? 0,
        clicks: num(r[`${k}_clicks`]) ?? 0,
        cost: num(r[`${k}_cost`]) ?? 0,
        conversions: num(r[`${k}_conversions`]) ?? 0,
      },
    ]),
  );
const flat = (r: Row) => ({
  impressions: num(r.impressions) ?? 0,
  clicks: num(r.clicks) ?? 0,
  cost: num(r.cost) ?? 0,
  conversions: num(r.conversions) ?? 0,
});

export async function getGoogleSheetSnapshot(): Promise<GoogleSnapshot> {
  const t = await readTabs();
  const meta = Object.fromEntries((t.meta ?? []).map((r) => [r.key, r.value]));
  const dataAt = num(meta.fetched_at);

  const campaigns: GoogleCampaign[] = (t.campaigns ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    primaryStatus: r.primary_status || undefined,
    primaryStatusReasons: r.primary_status_reasons ? r.primary_status_reasons.split("|") : undefined,
    channel: r.channel || undefined,
    bidding: r.bidding || undefined,
    budget: num(r.budget),
    impressionShare:
      r.is_7d || r.is_budget_lost_7d || r.is_rank_lost_7d
        ? { share: num(r.is_7d), budgetLost: num(r.is_budget_lost_7d), rankLost: num(r.is_rank_lost_7d) }
        : undefined,
    metrics: metricsOf(r),
  }));
  const adgroups: GoogleAdgroup[] = (t.adgroups ?? []).map((r) => ({
    id: r.id, campaignId: r.campaign_id, name: r.name, status: r.status, cpcBid: num(r.cpc_bid), metrics: metricsOf(r),
  }));
  const keywords: GoogleKeyword[] = (t.keywords ?? []).map((r) => ({
    id: r.id,
    adgroupId: r.adgroup_id,
    campaignId: r.campaign_id,
    text: r.text,
    matchType: r.match_type,
    status: r.status,
    servingStatus: r.serving_status || undefined,
    approvalStatus: r.approval_status || undefined,
    qualityScore: num(r.quality_score),
    cpcBid: num(r.cpc_bid),
    metrics: metricsOf(r),
  }));
  const searchTerms: GoogleSearchTerm[] = (t.search_terms ?? []).map((r) => ({
    term: r.term, status: r.status, campaign: r.campaign, adgroup: r.adgroup, ...flat(r),
  }));
  const seg = (rows: Row[] = [], key: string): GoogleSegment[] =>
    rows.map((r) => ({ range: r.range as GRange, key: r[key], ...flat(r) }));

  return {
    source: "sheet",
    fetchedAt: dataAt ? new Date(dataAt).toISOString() : new Date().toISOString(),
    account: meta.account_name ? { name: meta.account_name, currency: meta.currency, timeZone: meta.time_zone } : null,
    campaigns,
    adgroups,
    keywords,
    searchTerms,
    devices: seg(t.devices, "device"),
    hours: seg(t.hours, "hour"),
    errors: dataAt ? [] : ["시트에 아직 데이터가 없습니다. 구글 애즈 스크립트를 한 번 실행하세요."],
  };
}
