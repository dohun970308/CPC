import type { MetadataRoute } from "next";

// 공개 페이지(홈·개인정보처리방침)는 검색 허용, 대시보드·API는 제외
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/privacy"], disallow: ["/dashboard", "/api/"] },
    sitemap: "https://cpc-bay-six.vercel.app/sitemap.xml",
  };
}
