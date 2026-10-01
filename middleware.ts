import { NextRequest, NextResponse } from "next/server";

// DASHBOARD_PASSWORD 가 있으면 브라우저 기본 로그인 창으로 보호 (아이디는 아무거나)
export function middleware(req: NextRequest) {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      if (decoded.slice(decoded.indexOf(":") + 1) === pw) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("인증이 필요합니다", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="FIRST CPC", charset="UTF-8"' },
  });
}

// /privacy 는 구글 OAuth 브랜딩 등록용이라 비밀번호 없이 공개
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|privacy$).*)"] };
