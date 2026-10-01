import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "퍼스트 광고 계기판",
  robots: { index: false, follow: false },
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
