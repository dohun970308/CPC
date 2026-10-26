// 직접 고른 기간(+ 평일만/주말만)을 날짜 목록과 '연속 구간'으로 바꾼다.
// 네이버는 구간별로 합계를 받아 더하고, 구글은 시트의 일별 행을 날짜 목록으로 골라 더한다.

export type DayFilter = "all" | "weekday" | "weekend";
export const DAY_FILTER_LABEL: Record<DayFilter, string> = { all: "모든 요일", weekday: "평일만", weekend: "주말만" };
export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const DAY = 864e5;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

// from~to (양 끝 포함) 중 조건에 맞는 날짜, YYYY-MM-DD
export function pickDates(from: string, to: string, filter: DayFilter): string[] {
  const out: string[] = [];
  for (let t = utc(from); t <= utc(to); t += DAY) {
    const w = new Date(t).getUTCDay(); // 0 일요일, 6 토요일
    const weekend = w === 0 || w === 6;
    if (filter === "all" || (filter === "weekend") === weekend) out.push(iso(t));
  }
  return out;
}

// 정렬된 날짜 목록 → 이어지는 날끼리 묶은 [시작, 끝] 구간
export function toRuns(dates: string[]): [string, string][] {
  const runs: [string, string][] = [];
  for (const d of dates) {
    const last = runs[runs.length - 1];
    if (last && utc(d) - utc(last[1]) === DAY) last[1] = d;
    else runs.push([d, d]);
  }
  return runs;
}

// 화면 표시용: "10/24(금)~10/26(일) · 주말만"
const WEEK = "일월화수목금토";
const short = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${WEEK[new Date(utc(d)).getUTCDay()]})`;
export const periodLabel = (from: string, to: string, filter: DayFilter) =>
  `${from === to ? short(from) : `${short(from)}~${short(to)}`}${filter === "all" ? "" : ` · ${DAY_FILTER_LABEL[filter]}`}`;
