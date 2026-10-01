// 구글 광고 API 리프레시 토큰 발급 (Windows PowerShell에서 실행)
//   $env:GOOGLE_ADS_CLIENT_ID="클라이언트ID"; $env:GOOGLE_ADS_CLIENT_SECRET="클라이언트보안비밀번호"; npm run google-token
// OAuth 클라이언트 유형은 '데스크톱 앱'이어야 합니다. 토큰은 이 PC 화면에만 출력되고 어디에도 저장되지 않습니다.
import http from "node:http";
import crypto from "node:crypto";

const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET 를 먼저 설정하세요.");
  process.exit(1);
}
const PORT = 8765;
const redirectUri = `http://127.0.0.1:${PORT}`;
const state = crypto.randomBytes(16).toString("hex");
const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state,
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  const code = url.searchParams.get("code");
  if (!code) { res.end("waiting..."); return; }
  if (url.searchParams.get("state") !== state) { res.end("state 불일치"); return; }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  if (j.refresh_token) {
    res.end("완료! PowerShell 창으로 돌아가세요.");
    console.log("\n리프레시 토큰 (Vercel의 GOOGLE_ADS_REFRESH_TOKEN 에 붙여넣으세요):\n");
    console.log(j.refresh_token + "\n");
  } else {
    res.end("실패: " + JSON.stringify(j));
    console.error("실패:", j);
  }
  server.close();
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("아래 주소를 Chrome에서 열고, 구글 광고 계정에 접근 권한이 있는 구글 계정으로 허용하세요:\n");
  console.log(authUrl + "\n");
});
