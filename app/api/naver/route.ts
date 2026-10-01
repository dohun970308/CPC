import { NextResponse } from "next/server";
import { getNaverSnapshot, naverConfigured } from "@/lib/naver";
import { checkNaver } from "@/lib/checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!naverConfigured()) return NextResponse.json({ configured: false }, { status: 200 });
  const snap = await getNaverSnapshot();
  return NextResponse.json({ configured: true, ...snap, findings: checkNaver(snap) });
}
