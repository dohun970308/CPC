import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 키 값은 절대 내보내지 않고, 입력 여부(true/false)만 보여줍니다.
export async function GET() {
  const has = (k: string) => Boolean(process.env[k]);
  return NextResponse.json({
    naver: { NAVER_API_KEY: has("NAVER_API_KEY"), NAVER_SECRET_KEY: has("NAVER_SECRET_KEY"), NAVER_CUSTOMER_ID: has("NAVER_CUSTOMER_ID") },
    google: {
      GOOGLE_ADS_CLIENT_ID: has("GOOGLE_ADS_CLIENT_ID"),
      GOOGLE_ADS_CLIENT_SECRET: has("GOOGLE_ADS_CLIENT_SECRET"),
      GOOGLE_ADS_REFRESH_TOKEN: has("GOOGLE_ADS_REFRESH_TOKEN"),
      GOOGLE_ADS_CUSTOMER_ID: has("GOOGLE_ADS_CUSTOMER_ID"),
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: has("GOOGLE_ADS_LOGIN_CUSTOMER_ID"),
    },
    passwordProtected: has("DASHBOARD_PASSWORD"),
  });
}
