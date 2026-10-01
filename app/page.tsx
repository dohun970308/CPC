// 공개 홈페이지: 구글 OAuth 브랜드 인증 요건(로그인 없이 앱 이름·목적 확인 가능)을 위해 비밀번호 없이 공개.
// 실제 대시보드는 /dashboard (비밀번호 보호).
export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 16px", lineHeight: 1.7 }}>
      <h1>퍼스트 광고 계기판</h1>
      <p>
        <strong>퍼스트 광고 계기판</strong>은 운영자 본인의 네이버 검색광고와 구글 광고(Google Ads) 계정의 현재 상태와 성과를 한
        화면에 모아 보여주는 내부용 광고 모니터링 대시보드입니다.
      </p>

      <h2>앱의 목적</h2>
      <ul>
        <li>캠페인·광고그룹의 켜짐/꺼짐, 예산, 노출 가능 여부를 한눈에 확인</li>
        <li>오늘·어제·최근 7일의 노출, 클릭, 광고비, 전환 수치 비교</li>
        <li>예산 소진, 노출 불가, 검수 반려 같은 문제를 자동 점검해 알림</li>
      </ul>

      <h2>구글 계정 데이터 이용</h2>
      <p>
        이 앱은 Google Ads API로 운영자 본인 광고 계정의 데이터를 <strong>읽기만</strong> 합니다. 광고 설정을 변경하지 않으며,
        데이터를 저장하거나 제3자와 공유하지 않습니다. 자세한 내용은 <a href="/privacy">개인정보처리방침</a>을 확인하세요.
      </p>

      <p style={{ marginTop: 32 }}>
        <a href="/dashboard">대시보드 열기</a> (운영자 전용, 비밀번호 필요) · <a href="/privacy">개인정보처리방침</a>
      </p>
    </main>
  );
}
