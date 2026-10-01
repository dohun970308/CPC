import { NextResponse } from "next/server";
import { getGoogleSnapshot, googleConfigured } from "@/lib/google";
import { checkGoogle } from "@/lib/checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!googleConfigured()) return NextResponse.json({ configured: false }, { status: 200 });
  const snap = await getGoogleSnapshot();
  return NextResponse.json({ configured: true, ...snap, findings: checkGoogle(snap) });
}
