import { NextRequest, NextResponse } from "next/server";
import { getNaverRangeStats, naverConfigured } from "@/lib/naver";
import { isDate, pickDates, toRuns, type DayFilter } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 직접 고른 기간의 네이버 성과. 화면이 이미 가진 ID 목록을 보내면 그 ID들의 합계만 돌려준다.
export async function POST(req: NextRequest) {
  if (!naverConfigured()) return NextResponse.json({ error: "네이버 API 키가 없습니다." }, { status: 400 });
  const body = await req.json().catch(() => null);
  const { from, to, filter, ids } = body ?? {};
  if (!isDate(from) || !isDate(to) || from > to) return NextResponse.json({ error: "기간이 올바르지 않습니다." }, { status: 400 });
  if (!["all", "weekday", "weekend"].includes(filter)) return NextResponse.json({ error: "요일 조건이 올바르지 않습니다." }, { status: 400 });
  if (!Array.isArray(ids) || ids.length > 5000 || !ids.every((x) => typeof x === "string" && /^[a-z]{3}-[\w-]{1,60}$/i.test(x)))
    return NextResponse.json({ error: "ID 목록이 올바르지 않습니다." }, { status: 400 });
  const dates = pickDates(from, to, filter as DayFilter);
  if (dates.length > 92) return NextResponse.json({ error: "기간은 92일까지 볼 수 있습니다." }, { status: 400 });
  try {
    return NextResponse.json({ stats: await getNaverRangeStats(ids, toRuns(dates)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
