import type { GMetrics } from "./google";

// 구글 애즈 결제 요약: 결제일부터 날마다 광고비를 빼 나가다가 남은 애즈 머니가 1,000원 이하가 되면 그 결제는 '소진'.
// 결제 금액은 VAT 포함이고 광고비는 VAT 별도이므로, 쓸 수 있는 돈 = 결제 금액 ÷ 1.1.
// 앞 결제에서 남은 돈은 다음 결제로 이어진다. 소진 판정은 하루 단위(매체 일별 집계 기준).

export type Payment = { date: string; amount: number }; // date: YYYY-MM-DD, amount: VAT 포함 원
export type DailyMetrics = GMetrics & { date: string };
export type PaymentReport = GMetrics & {
  date: string;
  amount: number;
  endDate: string | null; // 마지막으로 광고비가 집계된 날 (아직 없으면 null)
  done: boolean; // 남은 애즈 머니 1,000원 이하
  remaining: number; // 남은 애즈 머니 (VAT 별도, 추정)
};

const VAT = 1.1;
export const DONE_BELOW = 1000;

export function paymentReports(payments: Payment[], daily: DailyMetrics[]): PaymentReport[] {
  const pays = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  const days = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  let balance = 0;
  return pays.map((p, i) => {
    const next = pays[i + 1]?.date;
    balance += p.amount / VAT;
    const r: PaymentReport = { ...p, endDate: null, done: false, remaining: 0, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
    for (const d of days) {
      if (d.date < p.date) continue;
      if (next && d.date >= next) break;
      r.impressions += d.impressions;
      r.clicks += d.clicks;
      r.cost += d.cost;
      r.conversions += d.conversions;
      balance -= d.cost;
      if (d.cost > 0) r.endDate = d.date;
      if (balance <= DONE_BELOW) {
        r.done = true;
        break;
      }
    }
    r.remaining = balance;
    return r;
  });
}

// 500000 → "50만원", 113636 → "11만4천원" (천 원 단위 반올림)
export function manwon(v: number): string {
  const r = Math.round(v / 1000) * 1000;
  if (r === 0) return `${Math.round(v).toLocaleString("ko-KR")}원`;
  const man = Math.floor(r / 10000);
  const cheon = (r % 10000) / 1000;
  return `${man ? `${man.toLocaleString("ko-KR")}만` : ""}${cheon ? `${cheon}천` : ""}원`;
}

const md = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

export function reportText(r: PaymentReport): string {
  const head = `${md(r.date)} ${manwon(r.amount)} 결제 이후 ${r.endDate ? `${md(r.endDate)} 자정까지` : "아직"} 광고가 진행되었으며, ` +
    `총 ${r.clicks.toLocaleString("ko-KR")} 클릭수, ${Math.round(r.conversions).toLocaleString("ko-KR")}건 전환 있었습니다.`;
  const db = r.conversions > 0 ? `DB 1건당 비용은 ${manwon(r.cost / r.conversions)}이며` : "전환은 아직 없으며";
  const cpc = r.clicks > 0 ? `평균 CPC는 ${Math.round(r.cost / r.clicks).toLocaleString("ko-KR")}원 입니다.` : "클릭은 없었습니다.";
  return `애즈 결제 내용 요약\n\n${head}\n${db} ${cpc}`;
}
