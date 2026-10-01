"use client";

import { useCallback, useEffect, useState } from "react";
import type { Finding } from "@/lib/checks";

type Range = "today" | "yesterday" | "last7days";
const RANGE_LABEL: Record<Range, string> = { today: "오늘", yesterday: "어제", last7days: "최근 7일" };
const REFRESH_MS = 5 * 60 * 1000;

const n = (v?: number) => (v == null ? "-" : Math.round(v).toLocaleString("ko-KR"));
const won = (v?: number) => (v == null ? "-" : `${n(v)}원`);
const pct = (a?: number, b?: number) => (!a || !b ? "-" : `${((a / b) * 100).toFixed(2)}%`);
const time = (iso?: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");

async function getJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

export default function Page() {
  const [naver, setNaver] = useState<any>(null);
  const [google, setGoogle] = useState<any>(null);
  const [range, setRange] = useState<Range>("today");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [a, b] = await Promise.allSettled([getJson("/api/naver"), getJson("/api/google")]);
    if (a.status === "fulfilled") setNaver(a.value); else setErr(String(a.reason));
    if (b.status === "fulfilled") setGoogle(b.value); else setErr(String(b.reason));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // 합계 (선택 기간)
  const nStats = naver?.stats?.[range] ?? {};
  const nTot = (naver?.campaigns ?? []).reduce(
    (a: any, c: any) => {
      const s = nStats[c.nccCampaignId] ?? {};
      return { imp: a.imp + (s.impCnt ?? 0), clk: a.clk + (s.clkCnt ?? 0), cost: a.cost + (s.salesAmt ?? 0), conv: a.conv + (s.ccnt ?? 0) };
    },
    { imp: 0, clk: 0, cost: 0, conv: 0 },
  );
  const gTot = (google?.campaigns ?? []).reduce(
    (a: any, c: any) => {
      const m = c.metrics?.[range] ?? {};
      return { imp: a.imp + (m.impressions ?? 0), clk: a.clk + (m.clicks ?? 0), cost: a.cost + (m.cost ?? 0), conv: a.conv + (m.conversions ?? 0) };
    },
    { imp: 0, clk: 0, cost: 0, conv: 0 },
  );
  const all = { imp: nTot.imp + gTot.imp, clk: nTot.clk + gTot.clk, cost: nTot.cost + gTot.cost, conv: nTot.conv + gTot.conv };

  const findings: Finding[] = [...(naver?.findings ?? []), ...(google?.findings ?? [])];
  const order = { 치명: 0, 주의: 1, 참고: 2 } as const;
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const count = (l: string) => findings.filter((f) => f.level === l).length;

  return (
    <main>
      <div className="top">
        <div>
          <h1>퍼스트 광고 계기판</h1>
          <div className="muted">
            네이버 {time(naver?.fetchedAt)} · 구글 {time(google?.fetchedAt)} 기준 · 5분마다 자동 갱신 (매체 집계는 수십 분~몇 시간 늦을 수 있음)
          </div>
        </div>
        <button onClick={load} disabled={loading}>{loading ? "불러오는 중…" : "새로고침"}</button>
      </div>
      {err && <div className="card b-치명">불러오기 오류: {err}</div>}

      <div className="tabs">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
        ))}
      </div>

      <section className="card">
        <h2>전체 합계 · {RANGE_LABEL[range]}</h2>
        <div className="kpis">
          <Kpi label="노출" value={n(all.imp)} />
          <Kpi label="클릭" value={n(all.clk)} />
          <Kpi label="광고비 (VAT 별도)" value={won(all.cost)} />
          <Kpi label="전환(DB)" value={n(all.conv)} />
          <Kpi label="DB 1건당 비용" value={all.conv ? won(all.cost / all.conv) : "-"} />
        </div>
        <div className="muted">네이버 전환은 전환 추적(프리미엄 로그분석) 설치 후부터 집계됩니다.</div>
      </section>

      <section className="card">
        <h2>
          자동 점검
          <span className="badge b-치명">치명 {count("치명")}</span>
          <span className="badge b-주의">주의 {count("주의")}</span>
          <span className="badge b-참고">참고 {count("참고")}</span>
        </h2>
        {findings.length === 0 ? (
          <div className="empty">
            {!naver && !google
              ? "데이터를 불러오는 중입니다."
              : !naver?.configured && !google?.configured
                ? "API 키가 연결되지 않아 점검할 수 없습니다."
                : `발견된 문제가 없습니다.${!naver?.configured ? " (네이버는 미연결)" : ""}${!google?.configured ? " (구글은 미연결)" : ""}`}
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th className="l">심각도</th><th className="l">매체</th><th className="l">위치</th><th className="l">내용</th></tr></thead>
              <tbody>
                {findings.map((f, i) => (
                  <tr key={i}>
                    <td><span className={`badge b-${f.level}`}>{f.level}</span></td>
                    <td className="l">{f.channel}</td>
                    <td className="l">{f.where}</td>
                    <td className="l" style={{ whiteSpace: "normal" }}>{f.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NaverSection data={naver} range={range} />
      <GoogleSection data={google} range={range} />
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function NotConfigured({ name, keys }: { name: string; keys: string[] }) {
  return (
    <div className="empty">
      {name} API 키가 아직 없습니다. Vercel → Settings → Environment Variables 에{" "}
      {keys.map((k) => <code key={k} style={{ marginRight: 4 }}>{k}</code>)} 를 넣고 다시 배포하세요.
    </div>
  );
}

function NaverSection({ data, range }: { data: any; range: Range }) {
  return (
    <section className="card">
      <h2><span className="dot" style={{ background: "var(--naver)" }} />네이버 파워링크</h2>
      {!data ? (
        <div className="empty">불러오는 중…</div>
      ) : !data.configured ? (
        <NotConfigured name="네이버" keys={["NAVER_API_KEY", "NAVER_SECRET_KEY", "NAVER_CUSTOMER_ID"]} />
      ) : (
        <>
          <div className="kpis">
            <Kpi label="비즈머니 잔액" value={data.bizmoney?.bizmoney != null ? won(data.bizmoney.bizmoney) : "확인 불가"} />
            <Kpi label="캠페인 (켜짐/전체)" value={`${data.campaigns.filter((c: any) => !c.userLock).length} / ${data.campaigns.length}`} />
            <Kpi label="광고그룹 (켜짐/전체)" value={`${data.adgroups.filter((g: any) => !g.userLock).length} / ${data.adgroups.length}`} />
            <Kpi label="키워드" value={n(data.keywords.length)} />
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th className="l">캠페인 › 광고그룹</th><th className="l">상태</th><th>하루예산</th><th>기본 입찰가</th>
                  <th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c: any) => {
                  const s = data.stats?.[range]?.[c.nccCampaignId] ?? {};
                  const groups = data.adgroups.filter((g: any) => g.nccCampaignId === c.nccCampaignId);
                  return [
                    <tr key={c.nccCampaignId} style={{ fontWeight: 600 }}>
                      <td>{c.name}</td>
                      <td className="l"><Status lock={c.userLock} status={c.status} /></td>
                      <td>{c.useDailyBudget ? won(c.dailyBudget) : "제한 없음"}</td><td>-</td>
                      <Cells imp={s.impCnt} clk={s.clkCnt} cost={s.salesAmt} conv={s.ccnt} />
                    </tr>,
                    ...groups.map((g: any) => {
                      const gs = data.stats?.[range]?.[g.nccAdgroupId] ?? {};
                      return (
                        <tr key={g.nccAdgroupId} className="sub">
                          <td>{g.name}</td>
                          <td className="l"><Status lock={g.userLock} status={g.status} /></td>
                          <td>{g.useDailyBudget ? won(g.dailyBudget) : "제한 없음"}</td>
                          <td>{won(g.bidAmt)}</td>
                          <Cells imp={gs.impCnt} clk={gs.clkCnt} cost={gs.salesAmt} conv={gs.ccnt} />
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function GoogleSection({ data, range }: { data: any; range: Range }) {
  return (
    <section className="card">
      <h2><span className="dot" style={{ background: "var(--google)" }} />구글 검색광고{data?.account?.name ? ` · ${data.account.name}` : ""}</h2>
      {!data ? (
        <div className="empty">불러오는 중…</div>
      ) : !data.configured ? (
        <NotConfigured name="구글" keys={["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"]} />
      ) : data.campaigns.length === 0 ? (
        <div className="empty">캠페인이 없거나 불러오지 못했습니다. 위 자동 점검의 API 오류를 확인하세요.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th className="l">캠페인</th><th className="l">상태</th><th>하루예산</th>
                <th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c: any) => {
                const m = c.metrics?.[range] ?? {};
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="l">{c.status === "PAUSED" ? <span className="off">일시중지</span> : <span className={c.primaryStatus === "ELIGIBLE" ? "on" : ""}>{c.primaryStatus ?? c.status}</span>}</td>
                    <td>{won(c.budget)}</td>
                    <Cells imp={m.impressions} clk={m.clicks} cost={m.cost} conv={m.conversions} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Status({ lock, status }: { lock?: boolean; status?: string }) {
  if (lock) return <span className="off">OFF</span>;
  return <span className={status === "ELIGIBLE" ? "on" : ""}>{status === "ELIGIBLE" ? "노출 가능" : status ?? "-"}</span>;
}

function Cells({ imp, clk, cost, conv }: { imp?: number; clk?: number; cost?: number; conv?: number }) {
  return (
    <>
      <td>{n(imp ?? 0)}</td>
      <td>{n(clk ?? 0)}</td>
      <td>{pct(clk, imp)}</td>
      <td>{clk ? won((cost ?? 0) / clk) : "-"}</td>
      <td>{won(cost ?? 0)}</td>
      <td>{conv == null ? "-" : conv.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}</td>
    </>
  );
}
