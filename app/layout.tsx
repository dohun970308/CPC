import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "퍼스트 광고 계기판", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
