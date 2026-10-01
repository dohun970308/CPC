// 구글 광고 API (REST) — https://developers.google.com/google-ads/api/rest/common/search
// 개발자 토큰은 2026-09-09 지원 종료. 접근 수준은 OAuth 클라이언트를 만든 Google Cloud 프로젝트 기준.
// https://developers.google.com/google-ads/api/docs/api-policy/developer-token

export function googleConfigured() {
  const e = process.env;
  return Boolean(
    e.GOOGLE_ADS_CLIENT_ID && e.GOOGLE_ADS_CLIENT_SECRET &&
      e.GOOGLE_ADS_REFRESH_TOKEN && e.GOOGLE_ADS_CUSTOMER_ID,
  );
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

export type GoogleCampaign = {
  id: string;
  name: string;
  status: string;
  primaryStatus?: string;
  primaryStatusReasons?: string[];
  channel?: string;
  budget?: number; // 원
  metrics: Partial<Record<GRange, { impressions: number; clicks: number; cost: number; conversions: number }>>;
};

export async function getGoogleSnapshot() {
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
  return { fetchedAt: new Date().toISOString(), account, campaigns: [...campaigns.values()], errors };
}

export type GoogleSnapshot = Awaited<ReturnType<typeof getGoogleSnapshot>>;
