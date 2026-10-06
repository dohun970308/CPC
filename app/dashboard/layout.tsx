import type { ReactNode } from "react";

// 홈·개인정보처리방침은 구글 브랜드 인증 검토를 위해 공개, 대시보드만 검색 제외
export const metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
