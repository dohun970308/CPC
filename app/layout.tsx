import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "퍼스트 광고 계기판",
  description: "네이버 검색광고·구글 광고 계정의 상태와 성과를 한 화면에서 보는 내부용 광고 모니터링 대시보드",
  // Search Console 홈페이지 소유권 확인 (구글 OAuth 브랜드 인증용)
  verification: { google: "_si3lc_A_kyrihDcN8LUx6qkM22rj0d0r8F-L25clPE" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
