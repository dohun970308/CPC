// 결제 요약 계산 확인: npm test  (Node 22.18+ 는 .ts 를 바로 읽음)
import { test } from "node:test";
import assert from "node:assert/strict";
import { manwon, paymentReports, reportText } from "../lib/payments.ts";

const day = (date, cost, clicks = 0, conversions = 0) => ({ date, impressions: clicks * 10, clicks, cost, conversions });

test("50만원 결제가 소진되는 날 보고서가 완성된다 (VAT 빼고 454,545원)", () => {
  const daily = [
    day("2026-10-17", 9999, 99, 9), // 결제 전날은 안 셈
    day("2026-10-18", 100000, 160, 1),
    day("2026-10-19", 100000, 160, 1),
    day("2026-10-20", 100000, 160, 1),
    day("2026-10-21", 100000, 160, 0),
    day("2026-10-22", 54000, 87, 1), // 누적 454,000 → 545원 남음
    day("2026-10-23", 0),
  ];
  const [r] = paymentReports([{ date: "2026-10-18", amount: 500000 }], daily);
  assert.equal(r.done, true);
  assert.equal(r.endDate, "2026-10-22");
  assert.equal(r.clicks, 727);
  assert.equal(r.conversions, 4);
  assert.ok(r.remaining > 0 && r.remaining <= 1000);
  assert.equal(
    reportText(r),
    "애즈 결제 내용 요약\n\n10월 18일 50만원 결제 이후 10월 22일 자정까지 광고가 진행되었으며, 총 727 클릭수, 4건 전환 있었습니다.\n" +
      "DB 1건당 비용은 11만4천원이며 평균 CPC는 624원 입니다.",
  );
});

test("남은 돈이 1,000원 넘으면 진행 중, 다음 결제로 이월된다", () => {
  const daily = [day("2026-10-01", 50000, 50), day("2026-10-05", 100000, 100), day("2026-10-06", 60000, 60)];
  const [a, b] = paymentReports(
    [{ date: "2026-10-05", amount: 110000 }, { date: "2026-10-01", amount: 110000 }], // 순서 섞여도 날짜순
  daily);
  assert.equal(a.date, "2026-10-01");
  assert.equal(a.done, false); // 10만원 중 5만원 사용, 다음 결제일 전까지
  assert.equal(Math.round(a.remaining), 50000);
  assert.equal(b.done, true); // 이월 5만 + 10만 = 15만, 10/5·10/6 에 16만 사용
  assert.equal(b.endDate, "2026-10-06");
});

test("만원 표기", () => {
  assert.equal(manwon(500000), "50만원");
  assert.equal(manwon(113636), "11만4천원");
  assert.equal(manwon(1234567), "123만5천원");
  assert.equal(manwon(400), "400원");
});
