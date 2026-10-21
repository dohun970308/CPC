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
// 화면 탭: 한 번에 한 매체만 보여줘서 스크롤을 줄인다 (마지막 탭은 주소 #해시로 기억)
type View = "summary" | "naver" | "google";
const VIEW_LABEL: Record<View, string> = { summary: "요약", naver: "네이버", google: "구글" };
const NAVER_FIELD ={ clk: "clkCnt", imp: "impCnt", cost: "salesAmt", conv: "ccnt" } as const;
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
  const [view, setViewState] = useState<View>("summary");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = location.hash.slice(1) as View;
    if (h in VIEW_LABEL) setViewState(h);
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    history.replaceState(null, "", `#${v}`);
    window.scrollTo({ top: 0 });
  };

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
        <div className="viewtabs" role="tablist">
          {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
          ))}
        </div>
        <div className="tabs">
          <span className="muted tablabel">기간</span>
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
          ))}
          {view !== "summary" && (
            <>
              <span className="muted tablabel" style={{ marginLeft: 12 }}>정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {view === "summary" && (
        <>
          <ConversionKeywords naver={naver} google={google} />
          <section className="card">
            <h2>합계 · {RANGE_LABEL[range]}</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th className="l">매체</th><th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th><th>전환당 비용</th></tr>
                </thead>
                <tbody>
                  {([["전체", all], ["네이버", nTot], ["구글", gTot]] as const).map(([label, t]) => (
                    <tr key={label} className={label === "전체" ? "camp" : ""}>
                      <td className="l">{label}</td>
                      <Cells imp={t.imp} clk={t.clk} cost={t.cost} conv={t.conv} />
                      <td>{t.conv ? won(t.cost / t.conv) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted small">광고비는 VAT 별도. 네이버 전환은 프리미엄 로그분석 검수 후부터 집계됩니다.</div>
          </section>
          <SpendLeaks naver={naver} google={google} range={range} />
          <Checks findings={findings} naver={naver} google={google} />
        </>
      )}
      {view === "naver" && (
        <>
          <NaverSection data={naver} range={range} sort={sort} />
          <KeywordRanking data={naver} range={range} sort={sort} />
        </>
      )}
      {view === "google" && (
        <>
          <GoogleSection data={google} range={range} sort={sort} />
          <GoogleKeywordRanking data={google} range={range} sort={sort} />
        </>
      )}
    </main>
  );
}

// 두 매체 키워드를 한 모양으로: 기간별 성과를 꺼내는 함수를 같이 들고 다닌다
type KwRow = {
  key: string;
  channel: "네이버" | "구글";
  text: string;
  match?: string;
  where: string;
  m: (r: Range) => { imp: number; clk: number; cost: number; conv: number };
  terms?: string[]; // 구글: 이 키워드로 전환 난 실제 검색어 (최근 7일)
};

function keywordRows(naver: any, google: any): KwRow[] {
  const rows: KwRow[] = [];
  if (naver?.configured) {
    const g = new Map<string, any>((naver.adgroups ?? []).map((x: any) => [x.nccAdgroupId, x]));
    const c = new Map<string, string>((naver.campaigns ?? []).map((x: any) => [x.nccCampaignId, x.name]));
    for (const k of naver.keywords ?? []) {
      const grp = g.get(k.nccAdgroupId);
      rows.push({
        key: `n-${k.nccKeywordId}`,
        channel: "네이버",
        text: k.keyword,
        where: `${c.get(grp?.nccCampaignId) ?? "?"} › ${grp?.name ?? "?"}`,
        m: (r) => {
          const s = naver.stats?.[r]?.[k.nccKeywordId] ?? {};
          return { imp: s.impCnt ?? 0, clk: s.clkCnt ?? 0, cost: s.salesAmt ?? 0, conv: s.ccnt ?? 0 };
        },
      });
    }
  }
  if (google?.configured) {
    const g = new Map<string, any>((google.adgroups ?? []).map((x: any) => [x.id, x]));
    const c = new Map<string, string>((google.campaigns ?? []).map((x: any) => [x.id, x.name]));
    const convTerms = new Map<string, string[]>();
    for (const t of google.searchTerms ?? []) {
      if (!(t.conversions > 0) || !t.keyword) continue;
      const key = kwKey(t.adgroupId, t.keyword, t.keywordMatchType);
      convTerms.set(key, [...(convTerms.get(key) ?? []), t.term]);
    }
    for (const k of google.keywords ?? []) {
      rows.push({
        key: `g-${k.id}`,
        channel: "구글",
        text: k.text,
        match: G_MATCH[k.matchType] ?? k.matchType,
        where: `${c.get(k.campaignId) ?? "?"} › ${g.get(k.adgroupId)?.name ?? "?"}`,
        m: (r) => {
          const x = k.metrics?.[r] ?? {};
          return { imp: x.impressions ?? 0, clk: x.clicks ?? 0, cost: x.cost ?? 0, conv: x.conversions ?? 0 };
        },
        terms: convTerms.get(kwKey(k.adgroupId, k.text, k.matchType)),
      });
    }
  }
  return rows;
}

const convFmt = (v: number) => (v ? v.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "");

// 요약 맨 위: 전환이 난 키워드를 기간 상관없이 오늘·어제·최근 7일로 한 번에
function ConversionKeywords({ naver, google }: { naver: any; google: any }) {
  const rows = useMemo(() => keywordRows(naver, google), [naver, google]);
  if (!naver && !google) return <section className="card"><h2>전환 난 키워드</h2><div className="empty">불러오는 중…</div></section>;

  const hit = rows
    .filter((k) => k.m("today").conv > 0 || k.m("yesterday").conv > 0 || k.m("last7days").conv > 0)
    .sort((a, b) =>
      b.m("today").conv - a.m("today").conv || b.m("yesterday").conv - a.m("yesterday").conv || b.m("last7days").conv - a.m("last7days").conv);

  // 캠페인 합계 전환 중 키워드로 안 잡힌 것 (구글 일부 전환은 키워드 단위로 안 나뉠 수 있음)
  const campConv = (r: Range) =>
    (google?.campaigns ?? []).reduce((a: number, c: any) => a + (c.metrics?.[r]?.conversions ?? 0), 0) +
    (naver?.campaigns ?? []).reduce((a: number, c: any) => a + (naver.stats?.[r]?.[c.nccCampaignId]?.ccnt ?? 0), 0);
  const kwConv = (r: Range) => rows.reduce((a, k) => a + k.m(r).conv, 0);
  const headline = (r: Range) => {
    const list = hit.filter((k) => k.m(r).conv > 0);
    return list.length ? list.map((k) => `${k.text}(${k.channel} ${convFmt(k.m(r).conv)})`).join(", ") : "없음";
  };

  return (
    <section className="card highlight">
      <h2>전환 난 키워드</h2>
      <div className="convline">
        <div><b>오늘</b> {convFmt(campConv("today")) || "0"}건 — {headline("today")}</div>
        <div><b>어제</b> {convFmt(campConv("yesterday")) || "0"}건 — {headline("yesterday")}</div>
        <div><b>최근 7일</b> {convFmt(campConv("last7days")) || "0"}건</div>
      </div>
      {hit.length === 0 ? (
        <div className="empty">최근 7일 동안 전환이 난 키워드가 없습니다.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th className="l">매체</th><th className="l">키워드</th><th className="l">전환 난 실제 검색어</th><th className="l">캠페인 › 광고그룹</th>
                <th>오늘</th><th>어제</th><th>7일 전환</th><th>7일 클릭</th><th>7일 광고비</th><th>7일 전환당 비용</th>
              </tr>
            </thead>
            <tbody>
              {hit.map((k) => {
                const w = k.m("last7days");
                return (
                  <tr key={k.key}>
                    <td className="l"><span className={`chip ${k.channel === "구글" ? "g" : "n"}`}>{k.channel}</span></td>
                    <td className="l" style={{ fontWeight: 600 }}>{k.text} {k.match && <span className="muted" style={{ fontWeight: 400 }}>{k.match}</span>}</td>
                    <td className="l">{k.terms?.length ? k.terms.map((t) => `“${t}”`).join(", ") : <span className="muted">-</span>}</td>
                    <td className="l muted">{k.where}</td>
                    <td className="num-hi">{convFmt(k.m("today").conv)}</td>
                    <td className="num-hi">{convFmt(k.m("yesterday").conv)}</td>
                    <td>{convFmt(w.conv)}</td>
                    <td>{n(w.clk)}</td>
                    <td>{won(w.cost)}</td>
                    <td>{w.conv ? won(w.cost / w.conv) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(["yesterday", "last7days"] as Range[]).some((r) => campConv(r) - kwConv(r) >= 0.5) && (
        <div className="muted small">※ 캠페인 전환 중 일부는 매체가 키워드 단위로 나눠 주지 않아 이 표에 없을 수 있습니다.</div>
      )}
      <div className="muted small">구글 '실제 검색어'는 최근 7일 기준이고, 1시간마다 갱신됩니다. 네이버 키워드 전환은 프리미엄 로그분석 검수 후부터 잡힙니다.</div>
    </section>
  );
}

// 돈만 쓰고 전환 0인 키워드 상위 10개 (선택 기간)
function SpendLeaks({ naver, google, range }: { naver: any; google: any; range: Range }) {
  const rows = useMemo(() => keywordRows(naver, google), [naver, google]);
  const leaks = rows.filter((k) => k.m(range).cost > 0 && k.m(range).conv === 0).sort((a, b) => b.m(range).cost - a.m(range).cost);
  if (!leaks.length) return null;
  const total = leaks.reduce((a, k) => a + k.m(range).cost, 0);
  return (
    <section className="card">
      <h2>광고비만 쓰고 전환 0 · {RANGE_LABEL[range]} · 상위 10개</h2>
      <div className="muted small" style={{ marginBottom: 8 }}>전환 없는 키워드 {n(leaks.length)}개가 {won(total)}을 썼습니다.</div>
      <div className="tablewrap">
        <table>
          <thead><tr><th className="l">매체</th><th className="l">키워드</th><th className="l">캠페인 › 광고그룹</th><th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th></tr></thead>
          <tbody>
            {leaks.slice(0, 10).map((k) => {
              const m = k.m(range);
              return (
                <tr key={k.key}>
                  <td className="l"><span className={`chip ${k.channel === "구글" ? "g" : "n"}`}>{k.channel}</span></td>
                  <td className="l" style={{ fontWeight: 600 }}>{k.text} {k.match && <span className="muted" style={{ fontWeight: 400 }}>{k.match}</span>}</td>
                  <td className="l muted">{k.where}</td>
                  <Cells imp={m.imp} clk={m.clk} cost={m.cost} conv={m.conv} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// 자동 점검: 요약 탭 맨 아래. 참고는 접어 둔다
function Checks({ findings, naver, google }: { findings: Finding[]; naver: any; google: any }) {
  const [showAll, setShowAll] = useState(false);
  const count = (l: string) => findings.filter((f) => f.level === l).length;
  const shown = showAll ? findings : findings.filter((f) => f.level !== "참고");
  return (
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
            : `발견된 문제가 없습니다.${!naver?.configured ? " (네이버는 미연결)" : ""}${!google?.configured ? " (구글은 미연결)" : ""}`}
        </div>
      ) : (
        <>
          {shown.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead><tr><th className="l">심각도</th><th className="l">매체</th><th className="l">위치</th><th className="l">내용</th></tr></thead>
                <tbody>
                  {shown.map((f, i) => (
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
          {count("참고") > 0 && (
            <div className="more"><button onClick={() => setShowAll(!showAll)}>{showAll ? "참고 항목 접기" : `참고 ${count("참고")}개 더 보기`}</button></div>
          )}
        </>
      )}
    </section>
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

const PAGE = 20;

// 켜진 그룹의 키워드를 그룹 구분 없이 한 줄로 세워 보여준다 (기본: 클릭 많은 순)
function KeywordRanking({ data, range, sort }: { data: any; range: Range; sort: SortKey }) {
  const [q, setQ] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [noClick, setNoClick] = useState(false);
  const [convOnly, setConvOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  if (!data?.configured) return null;

  const stats: Record<string, any> = data.stats?.[range] ?? {};
  const groupById = new Map<string, any>(data.adgroups.map((g: any) => [g.nccAdgroupId, g]));
  const campName = new Map<string, string>(data.campaigns.map((c: any) => [c.nccCampaignId, c.name]));
  const query = q.trim().toLowerCase();
  const rows = sortBy<any>(
    data.keywords.filter((k: any) => {
      const s = stats[k.nccKeywordId];
      if (hideZero && !(s?.impCnt > 0)) return false;
      if (noClick && !(s?.impCnt > 0 && !s?.clkCnt)) return false;
      if (convOnly && !(s?.ccnt > 0)) return false;
      if (!query) return true;
      const g = groupById.get(k.nccAdgroupId);
      return `${k.keyword} ${g?.name ?? ""}`.toLowerCase().includes(query);
    }),
    convOnly ? "conv" : noClick ? "imp" : sort === "default" ? "clk" : sort, // 클릭 0만 볼 때는 노출 많은 순
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
        <label className="check">
          <input type="checkbox" checked={noClick} onChange={(e) => { setNoClick(e.target.checked); setLimit(PAGE); }} />
          노출은 있는데 클릭 0회인 키워드만
        </label>
        <label className="check">
          <input type="checkbox" checked={convOnly} onChange={(e) => { setConvOnly(e.target.checked); if (e.target.checked) setHideZero(false); setLimit(PAGE); }} />
          전환 있는 키워드만
        </label>
        <span className="muted">{n(rows.length)}개</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          {noClick
            ? `${RANGE_LABEL[range]} 노출됐는데 클릭이 0회인 키워드가 없습니다.`
            : hideZero ? "이 기간에 노출된 키워드가 없습니다. '노출 0회 키워드 숨기기'를 끄면 전체 키워드를 볼 수 있습니다." : "조건에 맞는 키워드가 없습니다."}
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

const G_STATUS: Record<string, string> = { ENABLED: "켜짐", PAUSED: "일시중지", REMOVED: "삭제됨" };
const G_PRIMARY: Record<string, string> = {
  ELIGIBLE: "노출 가능", PAUSED: "일시중지", LIMITED: "제한됨", NOT_ELIGIBLE: "노출 불가", PENDING: "대기 중",
  ENDED: "종료", MISCONFIGURED: "설정 오류", LEARNING: "학습 중",
};
const G_MATCH: Record<string, string> = { EXACT: "완전", PHRASE: "구문", BROAD: "확장" };
const G_DEVICE: Record<string, string> = { MOBILE: "모바일", DESKTOP: "PC", TABLET: "태블릿", CONNECTED_TV: "TV", OTHER: "기타" };
const share = (v?: number) => (v == null ? "-" : `${Math.round(v * 100)}%`);
const kwKey = (adgroupId?: string, text?: string, matchType?: string) => `${adgroupId}|${text}|${matchType}`;
const gVal = (x: any, range: Range, f: keyof typeof GOOGLE_FIELD) => x.metrics?.[range]?.[GOOGLE_FIELD[f]];

function GStatus({ status, primary }: { status?: string; primary?: string }) {
  if (status === "PAUSED") return <span className="off">일시중지</span>;
  if (primary) return <span className={primary === "ELIGIBLE" ? "on" : ""}>{G_PRIMARY[primary] ?? primary}</span>;
  return <span className={status === "ENABLED" ? "on" : ""}>{G_STATUS[status ?? ""] ?? status ?? "-"}</span>;
}

function GoogleTitle({ data }: { data: any }) {
  return (
    <h2>
      <span className="dot" style={{ background: "var(--google)" }} />
      구글 검색광고{data?.account?.name ? ` · ${data.account.name}` : ""}
      {data?.source === "sheet" && <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}> · 구글 애즈 스크립트 시트 (1시간마다 갱신)</span>}
    </h2>
  );
}

function GoogleSection({ data, range, sort }: { data: any; range: Range; sort: SortKey }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [openKw, setOpenKw] = useState<Set<string>>(new Set());
  const kwByGroup = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const k of data?.keywords ?? []) m.set(k.adgroupId, [...(m.get(k.adgroupId) ?? []), k]);
    return m;
  }, [data]);
  // 키워드별 실제 검색어 (확장·구문 검색 키워드가 실제로 어떤 검색어에 노출됐는지)
  const termsByKw = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const t of data?.searchTerms ?? []) {
      if (!t.keyword) continue;
      const key = kwKey(t.adgroupId, t.keyword, t.keywordMatchType);
      m.set(key, [...(m.get(key) ?? []), t]);
    }
    for (const list of m.values()) list.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    return m;
  }, [data]);
  const toggleKw = (id: string) =>
    setOpenKw((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!data) return <section className="card"><GoogleTitle data={data} /><div className="empty">불러오는 중…</div></section>;
  if (!data.configured)
    return (
      <section className="card">
        <GoogleTitle data={data} />
        <NotConfigured name="구글" keys={["GOOGLE_ADS_SHEET_ID", "GOOGLE_SA_KEY_JSON"]} />
      </section>
    );
  if (data.campaigns.length === 0)
    return (
      <section className="card">
        <GoogleTitle data={data} />
        <div className="empty">캠페인이 없거나 불러오지 못했습니다. 위 자동 점검의 오류를 확인하세요.</div>
      </section>
    );

  const adgroups: any[] = data.adgroups ?? [];
  const keywords: any[] = data.keywords ?? [];
  const allOpen = adgroups.length > 0 && open.size === adgroups.length;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const tot = data.campaigns.reduce(
    (a: any, c: any) => {
      const m = c.metrics?.[range] ?? {};
      return { clk: a.clk + (m.clicks ?? 0), cost: a.cost + (m.cost ?? 0) };
    },
    { clk: 0, cost: 0 },
  );
  const activeKw = keywords.filter((k) => k.status === "ENABLED");
  const shownKw = activeKw.filter((k) => (k.metrics?.[range]?.impressions ?? 0) > 0).length;
  const qs = activeKw.filter((k) => k.qualityScore != null);
  const avgQs = qs.length ? qs.reduce((a, k) => a + k.qualityScore, 0) / qs.length : undefined;

  return (
    <section className="card">
      <GoogleTitle data={data} />
      <div className="kpis">
        <Kpi label="캠페인 (켜짐/전체)" value={`${data.campaigns.filter((c: any) => c.status === "ENABLED").length} / ${data.campaigns.length}`} />
        <Kpi label="광고그룹 (켜짐/전체)" value={adgroups.length ? `${adgroups.filter((g) => g.status === "ENABLED").length} / ${adgroups.length}` : "-"} />
        <Kpi label={`노출된 키워드 / 켜진 키워드 · ${RANGE_LABEL[range]}`} value={keywords.length ? `${n(shownKw)} / ${n(activeKw.length)}` : "-"} />
        <Kpi label="평균 품질평가점수" value={avgQs == null ? "-" : `${avgQs.toFixed(1)} / 10`} />
        <Kpi label={`구글 클릭 · ${RANGE_LABEL[range]}`} value={n(tot.clk)} />
        <Kpi label={`구글 광고비 · ${RANGE_LABEL[range]}`} value={won(tot.cost)} />
      </div>
      {adgroups.length > 0 && (
        <div className="toolbar">
          <span className="muted">광고그룹 줄을 누르면 그 안의 키워드가 펼쳐집니다. 노출 점유율은 최근 7일 기준입니다.</span>
          <button onClick={() => setOpen(allOpen ? new Set() : new Set(adgroups.map((g) => g.id)))}>
            {allOpen ? "키워드 모두 접기" : "키워드 모두 펼치기"}
          </button>
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th className="l">캠페인 › 광고그룹 › 키워드</th><th className="l">상태</th><th>하루예산</th><th>입찰가</th><th>품질</th>
              <th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th><th>노출 점유율</th><th>예산 손실</th>
            </tr>
          </thead>
          <tbody>
            {sortBy<any>(data.campaigns, sort, (c, f) => gVal(c, range, f)).map((c: any) => {
              const m = c.metrics?.[range] ?? {};
              const groups = sortBy<any>(adgroups.filter((g) => g.campaignId === c.id), sort, (g, f) => gVal(g, range, f));
              return [
                <tr key={c.id} className="camp">
                  <td>{c.name}</td>
                  <td className="l"><GStatus status={c.status} primary={c.primaryStatus} /></td>
                  <td>{won(c.budget)}</td><td>-</td><td>-</td>
                  <Cells imp={m.impressions} clk={m.clicks} cost={m.cost} conv={m.conversions} />
                  <td>{share(c.impressionShare?.share)}</td>
                  <td className={c.impressionShare?.budgetLost >= 0.2 ? "warn" : ""}>{share(c.impressionShare?.budgetLost)}</td>
                </tr>,
                ...groups.flatMap((g: any) => {
                  const gm = g.metrics?.[range] ?? {};
                  const kws: any[] = kwByGroup.get(g.id) ?? [];
                  const isOpen = open.has(g.id);
                  return [
                    <tr key={g.id} className="sub clickable" onClick={() => toggle(g.id)} aria-expanded={isOpen}>
                      <td><span className="caret">{isOpen ? "▾" : "▸"}</span>{g.name} <span className="muted">({kws.length})</span></td>
                      <td className="l"><GStatus status={g.status} /></td>
                      <td>-</td><td>{won(g.cpcBid)}</td><td>-</td>
                      <Cells imp={gm.impressions} clk={gm.clicks} cost={gm.cost} conv={gm.conversions} />
                      <td>-</td><td>-</td>
                    </tr>,
                    ...(isOpen
                      ? kws.length === 0
                        ? [<tr key={`${g.id}-empty`} className="kw"><td colSpan={13} className="l muted">키워드가 없습니다.</td></tr>]
                        : sortBy<any>(kws, sort, (k, f) => gVal(k, range, f)).flatMap((k: any) => {
                            const km = k.metrics?.[range] ?? {};
                            const terms = termsByKw.get(kwKey(k.adgroupId, k.text, k.matchType)) ?? [];
                            const kwOpen = openKw.has(k.id);
                            return [
                              <tr key={k.id} className={terms.length ? "kw clickable" : "kw"} onClick={terms.length ? () => toggleKw(k.id) : undefined} aria-expanded={terms.length ? kwOpen : undefined}>
                                <td>
                                  {k.text} <span className="muted">{G_MATCH[k.matchType] ?? k.matchType}</span>
                                  {terms.length > 0 && <span className="termlink"> {kwOpen ? "▾" : "▸"} 실제 검색어 {terms.length}개</span>}
                                </td>
                                <td className="l">
                                  {k.approvalStatus === "DISAPPROVED" ? <span className="badge b-치명">비승인</span> : <GStatus status={k.status} />}
                                </td>
                                <td>-</td><td>{won(k.cpcBid)}</td>
                                <td className={k.qualityScore != null && k.qualityScore <= 4 ? "warn" : ""}>{k.qualityScore ?? "-"}</td>
                                <Cells imp={km.impressions} clk={km.clicks} cost={km.cost} conv={km.conversions} />
                                <td>-</td><td>-</td>
                              </tr>,
                              ...(kwOpen
                                ? terms.map((t: any, i: number) => (
                                    <tr key={`${k.id}-t${i}`} className="term">
                                      <td>“{t.term}”{t.blocked && <span className="badge b-참고" title="지금은 제외 키워드에 걸려 더 이상 노출되지 않습니다"> 제외 등록됨</span>}</td>
                                      <td className="l muted">최근 7일</td>
                                      <td>-</td><td>-</td><td>-</td>
                                      <Cells imp={t.impressions} clk={t.clicks} cost={t.cost} conv={t.conversions} />
                                      <td>-</td><td>-</td>
                                    </tr>
                                  ))
                                : []),
                            ];
                          })
                      : []),
                  ];
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <SearchTerms terms={data.searchTerms ?? []} sort={sort} />
      <Segments devices={data.devices ?? []} hours={data.hours ?? []} range={range} />
    </section>
  );
}

// 구글 키워드를 광고그룹 구분 없이 한 줄로 (네이버 키워드 순위와 같은 방식)
function GoogleKeywordRanking({ data, range, sort }: { data: any; range: Range; sort: SortKey }) {
  const [q, setQ] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [noClick, setNoClick] = useState(false);
  const [convOnly, setConvOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  if (!data?.configured || !(data.keywords ?? []).length) return null;

  const groupById = new Map<string, any>((data.adgroups ?? []).map((g: any) => [g.id, g]));
  const campById = new Map<string, any>(data.campaigns.map((c: any) => [c.id, c]));
  const query = q.trim().toLowerCase();
  const rows = sortBy<any>(
    data.keywords.filter((k: any) => {
      // 꺼진 캠페인·광고그룹의 키워드는 제외
      if (campById.get(k.campaignId)?.status !== "ENABLED" || groupById.get(k.adgroupId)?.status !== "ENABLED") return false;
      const m = k.metrics?.[range];
      if (hideZero && !(m?.impressions > 0)) return false;
      if (noClick && !(m?.impressions > 0 && !m?.clicks)) return false;
      if (convOnly && !(m?.conversions > 0)) return false;
      if (!query) return true;
      return `${k.text} ${groupById.get(k.adgroupId)?.name ?? ""}`.toLowerCase().includes(query);
    }),
    convOnly ? "conv" : noClick ? "imp" : sort === "default" ? "clk" : sort,
    (k, f) => gVal(k, range, f),
  );

  return (
    <section className="card">
      <h2>
        <span className="dot" style={{ background: "var(--google)" }} />
        구글 키워드 순위 · {RANGE_LABEL[range]} · {SORT_LABEL[convOnly ? "conv" : noClick ? "imp" : sort === "default" ? "clk" : sort]}
      </h2>
      <div className="toolbar">
        <input type="search" placeholder="키워드·광고그룹 검색" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        <label className="check">
          <input type="checkbox" checked={hideZero} onChange={(e) => { setHideZero(e.target.checked); setLimit(PAGE); }} />
          노출 0회 키워드 숨기기
        </label>
        <label className="check">
          <input type="checkbox" checked={noClick} onChange={(e) => { setNoClick(e.target.checked); setLimit(PAGE); }} />
          노출은 있는데 클릭 0회인 키워드만
        </label>
        <label className="check">
          <input type="checkbox" checked={convOnly} onChange={(e) => { setConvOnly(e.target.checked); if (e.target.checked) setHideZero(false); setLimit(PAGE); }} />
          전환 있는 키워드만
        </label>
        <span className="muted">{n(rows.length)}개</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          {noClick
            ? `${RANGE_LABEL[range]} 노출됐는데 클릭이 0회인 키워드가 없습니다.`
            : hideZero ? "이 기간에 노출된 키워드가 없습니다. '노출 0회 키워드 숨기기'를 끄면 전체 키워드를 볼 수 있습니다." : "조건에 맞는 키워드가 없습니다."}
        </div>
      ) : (
        <>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th className="l">키워드</th><th className="l">캠페인 › 광고그룹</th><th className="l">상태</th><th>입찰가</th><th>품질</th>
                  <th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((k: any, i: number) => {
                  const m = k.metrics?.[range] ?? {};
                  return (
                    <tr key={k.id}>
                      <td className="muted">{i + 1}</td>
                      <td className="l" style={{ fontWeight: 600 }}>{k.text} <span className="muted" style={{ fontWeight: 400 }}>{G_MATCH[k.matchType] ?? k.matchType}</span></td>
                      <td className="l muted">{campById.get(k.campaignId)?.name ?? "?"} › {groupById.get(k.adgroupId)?.name ?? "?"}</td>
                      <td className="l">{k.approvalStatus === "DISAPPROVED" ? <span className="badge b-치명">비승인</span> : <GStatus status={k.status} />}</td>
                      <td>{won(k.cpcBid)}</td>
                      <td className={k.qualityScore != null && k.qualityScore <= 4 ? "warn" : ""}>{k.qualityScore ?? "-"}</td>
                      <Cells imp={m.impressions} clk={m.clicks} cost={m.cost} conv={m.conversions} />
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

// 고객이 실제로 검색한 단어 (최근 7일 고정)
function SearchTerms({ terms, sort }: { terms: any[]; sort: SortKey }) {
  const [limit, setLimit] = useState(20);
  const [wasteOnly, setWasteOnly] = useState(false);
  const [convOnly, setConvOnly] = useState(false);
  const [q, setQ] = useState("");
  if (!terms.length) return null;
  const key = sort === "default" ? "cost" : sort;
  const query = q.trim().toLowerCase();
  const rows = sortBy<any>(
    terms.filter(
      (t) =>
        (!wasteOnly || (!t.blocked && t.conversions === 0 && t.cost > 0)) &&
        (!convOnly || t.conversions > 0) &&
        (!query || `${t.term} ${t.keyword ?? ""} ${t.adgroup}`.toLowerCase().includes(query)),
    ),
    key,
    (t, f) => t[GOOGLE_FIELD[f]],
  );
  const hasKw = terms.some((t) => t.keyword);
  return (
    <>
      <h3 id="sec-google-terms" className="anchor">실제 검색어 · 최근 7일 · {SORT_LABEL[key]}</h3>
      <div className="toolbar">
        <input type="search" placeholder="검색어·키워드 검색" value={q} onChange={(e) => { setQ(e.target.value); setLimit(20); }} />
        <label className="check">
          <input type="checkbox" checked={wasteOnly} onChange={(e) => { setWasteOnly(e.target.checked); setLimit(20); }} />
          비용만 쓰고 전환 0건인 검색어만
        </label>
        <label className="check">
          <input type="checkbox" checked={convOnly} onChange={(e) => { setConvOnly(e.target.checked); setLimit(20); }} />
          전환 난 검색어만
        </label>
        <span className="muted">{n(rows.length)}개 (최근 7일 상위 {n(terms.length)}개 중)</span>
      </div>
      {!hasKw && (
        <div className="muted" style={{ marginBottom: 8 }}>
          '걸린 키워드'를 보려면 구글 애즈 스크립트를 최신 버전으로 바꿔 넣으세요.
        </div>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th className="l">실제 검색어</th><th className="l">걸린 키워드</th><th className="l">캠페인 › 광고그룹</th><th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((t: any, i: number) => (
              <tr key={`${t.term}-${t.adgroup}-${t.keyword}-${i}`}>
                <td className="l" style={{ fontWeight: 600 }}>{t.term}{t.blocked && <span className="badge b-참고" title="지금은 제외 키워드에 걸려 더 이상 노출되지 않습니다"> 제외 등록됨</span>}</td>
                <td className="l">{t.keyword ? <>{t.keyword} <span className="muted">{G_MATCH[t.keywordMatchType] ?? t.keywordMatchType}</span></> : "-"}</td>
                <td className="l muted">{t.campaign} › {t.adgroup}</td>
                <Cells imp={t.impressions} clk={t.clicks} cost={t.cost} conv={t.conversions} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <div className="more"><button onClick={() => setLimit(limit + 20)}>20개 더 보기 ({n(rows.length - limit)}개 남음)</button></div>}
    </>
  );
}

// 기기별·시간대별. 시트에는 오늘·최근 7일만 있으므로 '어제'를 고르면 최근 7일을 보여준다
function Segments({ devices, hours, range }: { devices: any[]; hours: any[]; range: Range }) {
  if (!devices.length && !hours.length) return null;
  const r: Range = range === "yesterday" ? "last7days" : range;
  // 캠페인별 행을 기기·시간 단위로 합산
  const sum = (rows: any[]) => {
    const m = new Map<string, any>();
    for (const x of rows.filter((x) => x.range === r)) {
      const a = m.get(x.key) ?? { key: x.key, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
      a.impressions += x.impressions; a.clicks += x.clicks; a.cost += x.cost; a.conversions += x.conversions;
      m.set(x.key, a);
    }
    return [...m.values()];
  };
  const dev = sum(devices).sort((a, b) => b.cost - a.cost);
  const hr = sum(hours).sort((a, b) => Number(a.key) - Number(b.key));
  const maxClk = Math.max(1, ...hr.map((h) => h.clicks));
  return (
    <>
      <h3>기기별 · 시간대별 · {RANGE_LABEL[r]}{range === "yesterday" ? " (어제 데이터는 없어 최근 7일 표시)" : ""}</h3>
      <div className="tablewrap">
        <table>
          <thead><tr><th className="l">기기</th><th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th></tr></thead>
          <tbody>
            {dev.map((d) => (
              <tr key={d.key}><td className="l">{G_DEVICE[d.key] ?? d.key}</td><Cells imp={d.impressions} clk={d.clicks} cost={d.cost} conv={d.conversions} /></tr>
            ))}
          </tbody>
        </table>
      </div>
      {hr.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead><tr><th className="l">시간</th><th className="l">클릭 분포</th><th>노출</th><th>클릭</th><th>CTR</th><th>평균 CPC</th><th>광고비</th><th>전환</th></tr></thead>
            <tbody>
              {hr.map((h) => (
                <tr key={h.key}>
                  <td className="l">{h.key}시</td>
                  <td className="l"><span className="bar" style={{ width: `${(h.clicks / maxClk) * 100}%` }} /></td>
                  <Cells imp={h.impressions} clk={h.clicks} cost={h.cost} conv={h.conversions} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
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
