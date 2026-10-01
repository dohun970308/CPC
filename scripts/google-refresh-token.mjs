// 구글 광고 API 리프레시 토큰 발급 (Windows PowerShell에서 실행)
//   npm run google-token  (실행하면 클라이언트 ID와 보안 비밀번호를 물어봅니다)
// OAuth 클라이언트 유형은 '데스크톱 앱'이어야 합니다. 토큰은 이 PC 화면에만 출력되고 어디에도 저장되지 않습니다.
import http from "node:http";
import crypto from "node:crypto";

import readline from "node:readline";

// 환경변수가 없거나 예시 문구 그대로면 직접 붙여넣도록 물어봄
const looksReal = (v) => v && /^[\x21-\x7e]+$/.test(v);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  process.stdout.write(q);
  return ((await lines.next()).value ?? "").trim();
};
const clientId = looksReal(process.env.GOOGLE_ADS_CLIENT_ID)
  ? process.env.GOOGLE_ADS_CLIENT_ID
  : await ask("클라이언트 ID를 붙여넣고 Enter: ");
const clientSecret = looksReal(process.env.GOOGLE_ADS_CLIENT_SECRET)
  ? process.env.GOOGLE_ADS_CLIENT_SECRET
  : await ask("클라이언트 보안 비밀번호를 붙여넣고 Enter: ");
rl.close();
if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret) {
  console.error("클라이언트 ID는 '.apps.googleusercontent.com' 으로 끝나야 합니다. 다시 확인하세요.");
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
