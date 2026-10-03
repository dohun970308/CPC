"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Finding } from "@/lib/checks";

type Range = "today" | "yesterday" | "last7days";
const RANGE_LABEL: Record<Range, string> = { today: "오늘", yesterday: "어제", last7days: "최근 7일" };
const REFRESH_MS = 5 * 60 * 1000;

// 정렬: 캠페인·광고그룹·키워드 모두 같은 기준으로 (같은 단계 안에서) 정렬
type SortKey = "default" | "clk" | "imp" | "cost" | "conv";
const SORT_LABEL: Record<SortKey, string> = {
  default: "기본 순서",
  clk: "클릭 많은 순",
  imp: "노출 많은 순",
  cost: "광고비 많은 순",
  conv: "전환 많은 순",
};
const NAVER_FIELD = { clk: "clkCnt", imp: "impCnt", cost: "salesAmt", conv: "ccnt" } as const;
const GOOGLE_FIELD = { clk: "clicks", imp: "impressions", cost: "cost", conv: "conversions" } as const;

function sortBy<T>(items: T[], key: SortKey, value: (x: T, field: "clk" | "imp" | "cost" | "conv") => number | undefined) {
  if (key === "default") return items;
  // 같으면 노출 많은 쪽을 위로
  return [...items].sort((a, b) => (value(b, key) ?? 0) - (value(a, key) ?? 0) || (value(b, "imp") ?? 0) - (value(a, "imp") ?? 0));
}

const n = (v?: number) => (v == null ? "-" : Math.round(v).toLocaleString("ko-KR"));
const won = (v?: number) => (v == null ? "-" : `${n(v)}원`);
const pct = (a?: number, b?: number) => (!a || !b ? "-" : `${((a / b) * 100).toFixed(2)}%`);
const rank = (v?: number) => (!v ? "-" : `${v.toFixed(1)}위`);
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
  const [sort, setSort] = useState<SortKey>("clk");
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

      <div className="sticky">
        <div className="tabs">
          <span className="muted tablabel">기간</span>
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
          ))}
        </div>
        <div className="tabs">
          <span className="muted tablabel">정렬</span>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{SORT_LABEL[k]}</button>
          ))}
        </div>
      </div>

      <section className="card">
        <h2>전체 합계 · {RANGE_LABEL[range]}</h2>
        <div className="kpis">
          <Kpi label="노출" value={n(all.imp)} />
          <Kpi label="클릭" value={n(all.clk)} />
          <Kpi label="CTR (클릭률)" value={pct(all.clk, all.imp)} />
          <Kpi label="평균 CPC" value={all.clk ? won(all.cost / all.clk) : "-"} />
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

      <NaverSection data={naver} range={range} sort={sort} />
      <KeywordRanking data={naver} range={range} sort={sort} />
      <GoogleSection data={google} range={range} sort={sort} />
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

function NaverSection({ data, range, sort }: { data: any; range: Range; sort: SortKey }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const stats: Record<string, any> = data?.stats?.[range] ?? {};
  const val = (id: string) => (_: unknown, f: keyof typeof NAVER_FIELD) => stats[id]?.[NAVER_FIELD[f]];

  const kwByGroup = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const k of data?.keywords ?? []) {
      const list = m.get(k.nccAdgroupId) ?? [];
      list.push(k);
      m.set(k.nccAdgroupId, list);
    }
    return m;
  }, [data]);

  if (!data) return <section className="card"><NaverTitle /><div className="empty">불러오는 중…</div></section>;
  if (!data.configured)
    return (
      <section className="card">
        <NaverTitle />
        <NotConfigured name="네이버" keys={["NAVER_API_KEY", "NAVER_SECRET_KEY", "NAVER_CUSTOMER_ID"]} />
      </section>
    );

  const groupById = new Map<string, any>(data.adgroups.map((g: any) => [g.nccAdgroupId, g]));
  const allOpen = data.adgroups.length > 0 && open.size === data.adgroups.length;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tot = data.campaigns.reduce(
    (a: any, c: any) => {
      const s = stats[c.nccCampaignId] ?? {};
      return { imp: a.imp + (s.impCnt ?? 0), clk: a.clk + (s.clkCnt ?? 0), cost: a.cost + (s.salesAmt ?? 0) };
    },
    { imp: 0, clk: 0, cost: 0 },
  );
  const activeKw = data.keywords.filter((k: any) => !k.userLock && !groupById.get(k.nccAdgroupId)?.userLock);
  const shownKw = activeKw.filter((k: any) => (stats[k.nccKeywordId]?.impCnt ?? 0) > 0).length;

  return (
    <section className="card">
      <NaverTitle />
      <div className="kpis">
        <Kpi label="비즈머니 잔액" value={data.bizmoney?.bizmoney != null ? won(data.bizmoney.bizmoney) : "확인 불가"} />
        <Kpi label="캠페인 (켜짐/전체)" value={`${data.campaigns.filter((c: any) => !c.userLock).length} / ${data.campaigns.length}`} />
        <Kpi label="광고그룹 (켜짐/전체)" value={`${data.adgroups.filter((g: any) => !g.userLock).length} / ${data.adgroups.length}`} />
        <Kpi label={`노출된 키워드 / 켜진 키워드 · ${RANGE_LABEL[range]}`} value={`${n(shownKw)} / ${n(activeKw.length)}`} />
        <Kpi label={`네이버 클릭 · ${RANGE_LABEL[range]}`} value={n(tot.clk)} />
        <Kpi label={`네이버 광고비 · ${RANGE_LABEL[range]}`} value={won(tot.cost)} />
      </div>
      <div className="toolbar">
        <span className="muted">광고그룹 줄을 누르면 그 안의 키워드가 펼쳐집니다.</span>
        <button onClick={() => setOpen(allOpen ? new Set() : new Set(data.adgroups.map((g: any) => g.nccAdgroupId)))}>
          {allOpen ? "키워드 모두 접기" : "키워드 모두 펼치기"}
        </button>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th className="l">캠페인 › 광고그룹 › 키워드</th><th className="l">상태</th><th>하루예산</th><th>입찰가</th>
              <th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th><th>평균 순위</th>
            </tr>
          </thead>
          <tbody>
            {sortBy<any>(data.campaigns, sort, (c, f) => val(c.nccCampaignId)(c, f)).map((c: any) => {
              const s = stats[c.nccCampaignId] ?? {};
              const groups = sortBy<any>(
                data.adgroups.filter((g: any) => g.nccCampaignId === c.nccCampaignId),
                sort,
                (g, f) => val(g.nccAdgroupId)(g, f),
              );
              return [
                <tr key={c.nccCampaignId} className="camp">
                  <td>{c.name}</td>
                  <td className="l"><Status lock={c.userLock} status={c.status} /></td>
                  <td>{c.useDailyBudget ? won(c.dailyBudget) : "제한 없음"}</td><td>-</td>
                  <Cells imp={s.impCnt} clk={s.clkCnt} cost={s.salesAmt} conv={s.ccnt} />
                  <td>{rank(s.avgRnk)}</td>
                </tr>,
                ...groups.flatMap((g: any) => {
                  const gs = stats[g.nccAdgroupId] ?? {};
                  const kws: any[] = kwByGroup.get(g.nccAdgroupId) ?? [];
                  const isOpen = open.has(g.nccAdgroupId);
                  return [
                    <tr key={g.nccAdgroupId} className="sub clickable" onClick={() => toggle(g.nccAdgroupId)} aria-expanded={isOpen}>
                      <td>
                        <span className="caret">{isOpen ? "▾" : "▸"}</span>
                        {g.name} <span className="muted">({kws.length})</span>
                      </td>
                      <td className="l"><Status lock={g.userLock} status={g.status} /></td>
                      <td>{g.useDailyBudget ? won(g.dailyBudget) : "제한 없음"}</td>
                      <td>{won(g.bidAmt)}</td>
                      <Cells imp={gs.impCnt} clk={gs.clkCnt} cost={gs.salesAmt} conv={gs.ccnt} />
                      <td>{rank(gs.avgRnk)}</td>
                    </tr>,
                    ...(isOpen
                      ? kws.length === 0
                        ? [<tr key={`${g.nccAdgroupId}-empty`} className="kw"><td colSpan={11} className="l muted">키워드가 없습니다.</td></tr>]
                        : sortBy<any>(kws, sort, (k, f) => val(k.nccKeywordId)(k, f)).map((k: any) => (
                            <KeywordRow key={k.nccKeywordId} k={k} g={g} s={stats[k.nccKeywordId]} />
                          ))
                      : []),
                  ];
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NaverTitle() {
  return <h2><span className="dot" style={{ background: "var(--naver)" }} />네이버 파워링크</h2>;
}

function KeywordRow({ k, g, s = {} }: { k: any; g: any; s?: any }) {
  return (
    <tr className="kw">
      <td>{k.keyword}</td>
      <td className="l"><KeywordStatus k={k} /></td>
      <td>-</td>
      <td><Bid k={k} g={g} /></td>
      <Cells imp={s.impCnt} clk={s.clkCnt} cost={s.salesAmt} conv={s.ccnt} />
      <td>{rank(s.avgRnk)}</td>
    </tr>
  );
}

function KeywordStatus({ k }: { k: any }) {
  if (k.inspectStatus && /REJECT|DENY|DENIED/i.test(k.inspectStatus)) return <span className="badge b-치명">검수 반려</span>;
  return <Status lock={k.userLock} status={k.status} />;
}

// 키워드 자체 입찰가가 없으면 그룹 기본 입찰가를 쓴다
function Bid({ k, g }: { k: any; g?: any }) {
  if (k.useGroupBidAmt) return <span className="muted" title="키워드 입찰가 없이 그룹 기본 입찰가 사용">그룹 {won(g?.bidAmt)}</span>;
  return <>{won(k.bidAmt)}</>;
}

const PAGE = 50;

// 켜진 그룹의 키워드를 그룹 구분 없이 한 줄로 세워 보여준다 (기본: 클릭 많은 순)
function KeywordRanking({ data, range, sort }: { data: any; range: Range; sort: SortKey }) {
  const [q, setQ] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  if (!data?.configured) return null;

  const stats: Record<string, any> = data.stats?.[range] ?? {};
  const groupById = new Map<string, any>(data.adgroups.map((g: any) => [g.nccAdgroupId, g]));
  const campName = new Map<string, string>(data.campaigns.map((c: any) => [c.nccCampaignId, c.name]));
  const query = q.trim().toLowerCase();
  const rows = sortBy<any>(
    data.keywords.filter((k: any) => {
      if (hideZero && !(stats[k.nccKeywordId]?.impCnt > 0)) return false;
      if (!query) return true;
      const g = groupById.get(k.nccAdgroupId);
      return `${k.keyword} ${g?.name ?? ""}`.toLowerCase().includes(query);
    }),
    sort === "default" ? "clk" : sort,
    (k, f) => stats[k.nccKeywordId]?.[NAVER_FIELD[f]],
  );

  return (
    <section className="card">
      <h2>
        <span className="dot" style={{ background: "var(--naver)" }} />
        네이버 키워드 순위 · {RANGE_LABEL[range]} · {SORT_LABEL[sort === "default" ? "clk" : sort]}
      </h2>
      <div className="toolbar">
        <input
          type="search"
          placeholder="키워드·광고그룹 검색"
          value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
        />
        <label className="check">
          <input type="checkbox" checked={hideZero} onChange={(e) => { setHideZero(e.target.checked); setLimit(PAGE); }} />
          노출 0회 키워드 숨기기
        </label>
        <span className="muted">{n(rows.length)}개</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          {hideZero ? "이 기간에 노출된 키워드가 없습니다. '노출 0회 키워드 숨기기'를 끄면 전체 키워드를 볼 수 있습니다." : "조건에 맞는 키워드가 없습니다."}
        </div>
      ) : (
        <>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th className="l">키워드</th><th className="l">캠페인 › 광고그룹</th><th className="l">상태</th><th>입찰가</th>
                  <th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th><th>평균 순위</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((k: any, i: number) => {
                  const g = groupById.get(k.nccAdgroupId);
                  const s = stats[k.nccKeywordId] ?? {};
                  return (
                    <tr key={k.nccKeywordId}>
                      <td className="muted">{i + 1}</td>
                      <td className="l" style={{ fontWeight: 600 }}>{k.keyword}</td>
                      <td className="l muted">{campName.get(g?.nccCampaignId) ?? "?"} › {g?.name ?? "?"}</td>
                      <td className="l"><KeywordStatus k={k} /></td>
                      <td><Bid k={k} g={g} /></td>
                      <Cells imp={s.impCnt} clk={s.clkCnt} cost={s.salesAmt} conv={s.ccnt} />
                      <td>{rank(s.avgRnk)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="more">
              <button onClick={() => setLimit(limit + PAGE)}>{PAGE}개 더 보기 ({n(rows.length - limit)}개 남음)</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function GoogleSection({ data, range, sort }: { data: any; range: Range; sort: SortKey }) {
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
              {sortBy<any>(data.campaigns, sort, (c, f) => c.metrics?.[range]?.[GOOGLE_FIELD[f]]).map((c: any) => {
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
