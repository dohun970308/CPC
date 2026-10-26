import { test } from "node:test";
import assert from "node:assert/strict";
import { periodLabel, pickDates, toRuns } from "../lib/dates.ts";

// 2026-10-19 월 ~ 2026-11-01 일 (2주)
test("주말만: 토·일 4일, 구간 2개", () => {
  const d = pickDates("2026-10-19", "2026-11-01", "weekend");
  assert.deepEqual(d, ["2026-10-24", "2026-10-25", "2026-10-31", "2026-11-01"]); // 월 경계도 이어짐
  assert.deepEqual(toRuns(d), [["2026-10-24", "2026-10-25"], ["2026-10-31", "2026-11-01"]]);
});

test("평일만: 10일, 구간 2개", () => {
  const d = pickDates("2026-10-19", "2026-11-01", "weekday");
  assert.equal(d.length, 10);
  assert.deepEqual(toRuns(d), [["2026-10-19", "2026-10-23"], ["2026-10-26", "2026-10-30"]]);
});

test("금~일 전체 요일은 구간 하나", () => {
  assert.deepEqual(toRuns(pickDates("2026-10-23", "2026-10-25", "all")), [["2026-10-23", "2026-10-25"]]);
  assert.equal(periodLabel("2026-10-23", "2026-10-25", "all"), "10/23(금)~10/25(일)");
  assert.equal(periodLabel("2026-10-19", "2026-11-01", "weekend"), "10/19(월)~11/1(일) · 주말만");
});

test("거꾸로 된 기간은 빈 목록", () => {
  assert.deepEqual(pickDates("2026-10-25", "2026-10-23", "all"), []);
});
