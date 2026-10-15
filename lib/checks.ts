import type { NaverSnapshot } from "./naver";
import type { GoogleSnapshot } from "./google";

export type Level = "치명" | "주의" | "참고";
export type Finding = { level: Level; channel: "네이버" | "구글"; where: string; message: string };

const won = (n?: number) => (n == null ? "-" : `${Math.round(n).toLocaleString("ko-KR")}원`);

// 계정 상태 자동 점검. 계획값(키워드 전략)과의 대조는 plan/plan.json 이 채워지면 추가합니다.
export function checkNaver(s: NaverSnapshot): Finding[] {
  const f: Finding[] = [];
  const add = (level: Level, where: string, message: string) => f.push({ level, channel: "네이버", where, message });

  const activeCampaigns = s.campaigns.filter((c) => !c.userLock);
  const dailySum = activeCampaigns.reduce((a, c) => a + (c.useDailyBudget ? c.dailyBudget ?? 0 : 0), 0);

  if (s.bizmoney?.bizmoney != null) {
    if (s.bizmoney.bizmoney <= 0) add("치명", "계정", "비즈머니 잔액이 0원입니다. 광고가 노출되지 않습니다.");
    else if (dailySum > 0 && s.bizmoney.bizmoney < dailySum * 3)
      add("주의", "계정", `비즈머니 ${won(s.bizmoney.bizmoney)} — 켜진 캠페인 하루예산 합계(${won(dailySum)})의 3일치 미만입니다.`);
  }

  // 꺼둔(OFF) 캠페인은 일부러 쉬는 것이므로 캠페인과 그 안의 그룹·키워드 모두 점검하지 않음
  for (const c of activeCampaigns)
    if (c.status && c.status !== "ELIGIBLE") add("치명", c.name, `캠페인 노출 불가: ${c.status}${c.statusReason ? ` (${c.statusReason})` : ""}`);

  const campOn = new Set(activeCampaigns.map((c) => c.nccCampaignId));
  const campName = new Map(s.campaigns.map((c) => [c.nccCampaignId, c.name]));
  const groupById = new Map(s.adgroups.filter((g) => campOn.has(g.nccCampaignId)).map((g) => [g.nccAdgroupId, g]));
  for (const g of groupById.values()) {
    const where = `${campName.get(g.nccCampaignId) ?? "?"} › ${g.name}`;
    if (g.name !== g.name.trim()) add("참고", where, "그룹 이름 앞뒤에 공백이 있습니다.");
    if (g.userLock) continue;
    if (g.status && g.status !== "ELIGIBLE") add("치명", where, `그룹 노출 불가: ${g.status}${g.statusReason ? ` (${g.statusReason})` : ""}`);
    const kws = s.keywords.filter((k) => k.nccAdgroupId === g.nccAdgroupId);
    if (kws.length === 0) add("치명", where, "켜진 그룹인데 키워드가 없습니다.");
    const todayImp = s.stats.today?.[g.nccAdgroupId]?.impCnt;
    if (todayImp === 0 && kws.length > 0) add("참고", where, "오늘 노출이 0회입니다.");
  }

  for (const k of s.keywords) {
    const g = groupById.get(k.nccAdgroupId);
    if (!g || g.userLock || k.userLock) continue;
    const where = `${g.name} › ${k.keyword}`;
    if (k.inspectStatus && /REJECT|DENY|DENIED/i.test(k.inspectStatus)) add("치명", where, `키워드 검수 반려: ${k.inspectStatus}`);
    else if (k.inspectStatus && k.inspectStatus !== "APPROVED") add("참고", where, `키워드 검수 상태: ${k.inspectStatus}`);
    if (k.useGroupBidAmt && (g.bidAmt ?? 0) <= 70)
      add("치명", where, `키워드별 입찰가 없이 그룹 기본 입찰가(${won(g.bidAmt)})로 입찰 중입니다.`);
    else if (k.status && k.status !== "ELIGIBLE") add("주의", where, `키워드 노출 불가: ${k.status}${k.statusReason ? ` (${k.statusReason})` : ""}`);
  }

  const totalConv = s.campaigns.reduce((a, c) => a + (s.stats.last7days?.[c.nccCampaignId]?.ccnt ?? 0), 0);
  const totalClk = s.campaigns.reduce((a, c) => a + (s.stats.last7days?.[c.nccCampaignId]?.clkCnt ?? 0), 0);
  if (totalClk >= 30 && totalConv === 0) add("주의", "계정", `최근 7일 클릭 ${totalClk}회, 전환 0건 — 전환 추적 설치를 확인하세요.`);

  for (const e of s.errors) add("주의", "API", e);
  return f;
}

export function checkGoogle(s: GoogleSnapshot): Finding[] {
  const f: Finding[] = [];
  const add = (level: Level, where: string, message: string) => f.push({ level, channel: "구글", where, message });
  if (s.account?.status && s.account.status !== "ENABLED") add("치명", "계정", `계정 상태: ${s.account.status}`);
  for (const c of s.campaigns) {
    if (c.status === "PAUSED") continue; // 일부러 꺼둔 캠페인은 점검하지 않음
    if (c.primaryStatus && !["ELIGIBLE"].includes(c.primaryStatus)) {
      const lvl: Level = ["NOT_ELIGIBLE", "ENDED", "PENDING"].includes(c.primaryStatus) ? "치명" : "주의";
      add(lvl, c.name, `상태: ${c.primaryStatus}${c.primaryStatusReasons?.length ? ` (${c.primaryStatusReasons.join(", ")})` : ""}`);
    }
    const w = c.metrics.last7days;
    if (w && w.clicks >= 30 && w.conversions === 0) add("주의", c.name, `최근 7일 클릭 ${w.clicks}회, 전환 0건`);
    const is = c.impressionShare;
    if (is?.budgetLost != null && is.budgetLost >= 0.2)
      add("주의", c.name, `최근 7일 예산 부족으로 검색 노출의 ${pctOf(is.budgetLost)}를 놓쳤습니다. 하루 예산을 확인하세요.`);
    if (is?.rankLost != null && is.rankLost >= 0.5)
      add("참고", c.name, `최근 7일 광고 순위(입찰가·품질) 때문에 검색 노출의 ${pctOf(is.rankLost)}를 놓쳤습니다.`);
  }

  // 시트 방식: 스크립트가 멈추면 데이터가 오래된다
  if (s.source === "sheet") {
    const hours = (Date.now() - new Date(s.fetchedAt).getTime()) / 36e5;
    if (hours >= 3) add("주의", "데이터", `구글 데이터가 ${Math.floor(hours)}시간 전 것입니다. 구글 애즈 스크립트의 매시간 예약 실행을 확인하세요.`);
  }

  const campOn = new Set(s.campaigns.filter((c) => c.status === "ENABLED").map((c) => c.id));
  const groupOn = new Map(s.adgroups.filter((g) => g.status === "ENABLED" && campOn.has(g.campaignId)).map((g) => [g.id, g]));
  const groupName = new Map(s.adgroups.map((g) => [g.id, g.name]));
  const activeKw = s.keywords.filter((k) => k.status === "ENABLED" && groupOn.has(k.adgroupId));

  for (const g of groupOn.values())
    if (s.keywords.length && !activeKw.some((k) => k.adgroupId === g.id)) add("주의", g.name, "켜진 광고그룹에 켜진 키워드가 없습니다.");
  for (const k of activeKw) {
    const where = `${groupName.get(k.adgroupId) ?? "?"} › ${k.text}`;
    if (k.approvalStatus === "DISAPPROVED") add("치명", where, "키워드가 비승인되어 노출되지 않습니다.");
    else if (k.servingStatus === "RARELY_SERVED") add("참고", where, "검색량이 적어 거의 노출되지 않는 키워드입니다.");
    const cost7 = k.metrics.last7days?.cost ?? 0;
    if (k.qualityScore != null && k.qualityScore <= 4 && cost7 > 0)
      add("주의", where, `품질평가점수 ${k.qualityScore}/10 — 같은 순위에 더 비싸게 냅니다(최근 7일 ${won(cost7)}).`);
  }

  // 노출은 되는데 클릭이 0인 키워드 (최근 7일, 노출 20회 이상, 노출 많은 순 10개)
  const noClick = activeKw
    .filter((k) => (k.metrics.last7days?.impressions ?? 0) >= 20 && (k.metrics.last7days?.clicks ?? 0) === 0)
    .sort((a, b) => (b.metrics.last7days?.impressions ?? 0) - (a.metrics.last7days?.impressions ?? 0));
  for (const k of noClick.slice(0, 10)) {
    const imp = k.metrics.last7days?.impressions ?? 0;
    add(imp >= 100 ? "주의" : "참고", `${groupName.get(k.adgroupId) ?? "?"} › ${k.text}`,
      `최근 7일 노출 ${imp.toLocaleString("ko-KR")}회, 클릭 0회 — 광고 문구·검색 의도가 맞는지, 입찰 순위가 너무 낮지 않은지 확인하세요.`);
  }
  if (noClick.length > 10) add("참고", "키워드", `이 외에도 노출만 되고 클릭 0회인 키워드가 ${noClick.length - 10}개 더 있습니다.`);

  // 돈만 쓰고 전환 없는 실제 검색어 (최근 7일, 상위 5개). 꺼둔 캠페인의 검색어는 제외
  const campOnNames = new Set(s.campaigns.filter((c) => c.status === "ENABLED").map((c) => c.name));
  const wasted = s.searchTerms
    .filter((t) => campOnNames.has(t.campaign) && !t.blocked && t.conversions === 0 && t.cost >= 10000)
    .sort((a, b) => b.cost - a.cost);
  for (const t of wasted.slice(0, 5))
    add("주의", `검색어 "${t.term}"`, `최근 7일 ${won(t.cost)} 쓰고 전환 0건 — 제외 키워드 등록을 검토하세요.`);
  if (wasted.length > 5) add("참고", "검색어", `이 외에도 비용만 쓴 검색어가 ${wasted.length - 5}개 더 있습니다.`);

  for (const e of s.errors) add("주의", s.source === "sheet" ? "시트" : "API", e);
  return f;
}

const pctOf = (v: number) => `${Math.round(v * 100)}%`;
