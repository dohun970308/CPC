// 구글 OAuth 동의 화면(브랜딩)에 등록하는 개인정보처리방침. 비밀번호 없이 열리도록 middleware에서 제외함.
export const metadata = { title: "개인정보처리방침 · 퍼스트 광고 계기판" };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", lineHeight: 1.7 }}>
      <h1>개인정보처리방침</h1>
      <p>시행일: 2026년 10월 1일</p>

      <h2>1. 이 앱이 하는 일</h2>
      <p>
        퍼스트 광고 계기판(이하 &ldquo;이 앱&rdquo;)은 운영자 본인의 네이버 검색광고·구글 광고 계정에서 광고 상태와 성과를 읽어
        운영자 한 사람에게만 보여주는 내부용 대시보드입니다. 일반 사용자를 대상으로 하지 않습니다.
      </p>

      <h2>2. 구글 사용자 데이터 이용</h2>
      <ul>
        <li>
          이 앱은 Google Ads API 권한(<code>https://www.googleapis.com/auth/adwords</code>)으로 운영자 본인 광고 계정의 캠페인 상태,
          예산, 노출·클릭·비용·전환 수치만 <strong>읽습니다</strong>.
        </li>
        <li>광고 설정을 변경하지 않으며, 이름·이메일·연락처 등 개인정보를 수집하지 않습니다.</li>
        <li>읽어온 데이터는 화면 표시에만 쓰이고 별도 데이터베이스에 저장하지 않습니다.</li>
        <li>데이터를 제3자에게 판매·공유·전송하지 않으며 광고나 프로파일링에 사용하지 않습니다.</li>
        <li>
          Google API에서 받은 정보의 사용은 제한적 사용 요건을 포함한{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API 서비스 사용자 데이터 정책</a>을
          따릅니다.
        </li>
      </ul>

      <h2>3. 인증 정보 보관</h2>
      <p>
        API 접근에 필요한 인증 정보(리프레시 토큰 등)는 호스팅 서비스(Vercel)의 암호화된 환경 변수에만 보관하며, 운영자 외에는 접근할 수
        없습니다.
      </p>

      <h2>4. 접근 철회</h2>
      <p>
        <a href="https://myaccount.google.com/permissions">Google 계정 &rsaquo; 서드 파티 액세스</a>에서 언제든 이 앱의 접근 권한을
        철회할 수 있습니다.
      </p>

      <h2>5. 문의</h2>
      <p>이 앱에 관한 문의는 구글 OAuth 동의 화면에 표시된 사용자 지원 이메일로 연락해 주세요.</p>
    </main>
  );
}
