// 구글 애즈 → 구글 시트 내보내기 (Google Ads API 승인 없이 대시보드에 구글 데이터를 넣는 방법)
//
// 사용법
//   1) 아래 SERVICE_ACCOUNT_EMAIL 에 대시보드용 서비스 계정 이메일(…@….iam.gserviceaccount.com)을 넣습니다.
//   2) 구글 애즈 > 도구 > 일괄 작업 > 스크립트 > + 새 스크립트 에 이 파일 전체를 붙여넣고 승인 → 실행.
//   3) 로그에 나온 시트 ID 를 Vercel 의 GOOGLE_ADS_SHEET_ID 에 넣고, 스크립트 빈도를 '매시간'으로 예약합니다.
//
// 시트는 내 구글 드라이브에 비공개로 만들어지고, 서비스 계정에만 '보기' 권한을 줍니다(링크 공개 아님).
// 광고 설정은 읽기만 하고 바꾸지 않습니다.

var SERVICE_ACCOUNT_EMAIL = ''; // 예: cpc-dashboard@my-project.iam.gserviceaccount.com
var SHEET_NAME = '퍼스트 광고 계기판 - 구글 애즈 데이터';
var RANGES = { today: 'TODAY', yesterday: 'YESTERDAY', last7days: 'LAST_7_DAYS' };
var M = ['impressions', 'clicks', 'cost', 'conversions'];

function main() {
  var ss = openOrCreateSheet();
  var account = AdsApp.currentAccount();

  // 캠페인
  var camps = rowsOf(
    "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, " +
      "campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros " +
      "FROM campaign WHERE campaign.status != 'REMOVED'"
  );
  var campM = metricsByRange('campaign', 'campaign.id', function (r) { return r.campaign.id; },
    "campaign.status != 'REMOVED'");
  var share = {};
  try {
    rowsOf(
      'SELECT campaign.id, metrics.search_impression_share, metrics.search_budget_lost_impression_share, ' +
        "metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date DURING LAST_7_DAYS " +
        "AND campaign.status != 'REMOVED' AND campaign.advertising_channel_type = 'SEARCH'"
    ).forEach(function (r) {
      share[r.campaign.id] = [r.metrics.searchImpressionShare, r.metrics.searchBudgetLostImpressionShare,
        r.metrics.searchRankLostImpressionShare];
    });
  } catch (e) {
    Logger.log('노출 점유율 조회 실패(무시): ' + e);
  }
  writeTab(ss, 'campaigns',
    ['id', 'name', 'status', 'primary_status', 'primary_status_reasons', 'channel', 'bidding', 'budget',
      'is_7d', 'is_budget_lost_7d', 'is_rank_lost_7d'].concat(metricHeader()),
    camps.map(function (r) {
      var id = String(r.campaign.id);
      var s = share[id] || [];
      return [id, r.campaign.name, r.campaign.status, r.campaign.primaryStatus,
        (r.campaign.primaryStatusReasons || []).join('|'), r.campaign.advertisingChannelType,
        r.campaign.biddingStrategyType, micros(r.campaignBudget && r.campaignBudget.amountMicros),
        val(s[0]), val(s[1]), val(s[2])].concat(metricCells(campM, id));
    }));

  // 광고그룹
  var groups = rowsOf(
    'SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros, campaign.id ' +
      "FROM ad_group WHERE ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'"
  );
  var groupM = metricsByRange('ad_group', 'ad_group.id', function (r) { return r.adGroup.id; },
    "ad_group.status != 'REMOVED'");
  writeTab(ss, 'adgroups', ['id', 'campaign_id', 'name', 'status', 'cpc_bid'].concat(metricHeader()),
    groups.map(function (r) {
      var id = String(r.adGroup.id);
      return [id, r.campaign.id, r.adGroup.name, r.adGroup.status, micros(r.adGroup.cpcBidMicros)]
        .concat(metricCells(groupM, id));
    }));

  // 키워드 (제외 키워드 빼고)
  var kws = rowsOf(
    'SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
      'ad_group_criterion.status, ad_group_criterion.system_serving_status, ad_group_criterion.approval_status, ' +
      'ad_group_criterion.quality_info.quality_score, ad_group_criterion.effective_cpc_bid_micros, ad_group.id, campaign.id ' +
      "FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE " +
      "AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'"
  );
  var kwKey = function (r) { return r.adGroup.id + '~' + r.adGroupCriterion.criterionId; };
  var kwM = metricsByRange('keyword_view', 'ad_group.id, ad_group_criterion.criterion_id', kwKey,
    "ad_group_criterion.status != 'REMOVED'");
  writeTab(ss, 'keywords',
    ['id', 'adgroup_id', 'campaign_id', 'text', 'match_type', 'status', 'serving_status', 'approval_status',
      'quality_score', 'cpc_bid'].concat(metricHeader()),
    kws.map(function (r) {
      var c = r.adGroupCriterion;
      var key = kwKey(r);
      return [key, r.adGroup.id, r.campaign.id, c.keyword.text, c.keyword.matchType, c.status,
        c.systemServingStatus, c.approvalStatus, val(c.qualityInfo && c.qualityInfo.qualityScore),
        micros(c.effectiveCpcBidMicros)].concat(metricCells(kwM, key));
    }));

  // 실제 검색어 (최근 7일, 광고비 많은 순 300개)
  var terms = rowsOf(
    'SELECT search_term_view.search_term, search_term_view.status, campaign.name, ad_group.name, ' +
      'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view ' +
      'WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.cost_micros DESC LIMIT 300'
  );
  writeTab(ss, 'search_terms', ['term', 'status', 'campaign', 'adgroup'].concat(M),
    terms.map(function (r) {
      return [r.searchTermView.searchTerm, r.searchTermView.status, r.campaign.name, r.adGroup.name]
        .concat(metricValues(r.metrics));
    }));

  // 기기별·시간대별 (오늘, 최근 7일) — 대시보드에서 특정 캠페인을 뺄 수 있게 캠페인별로 기록
  var dev = [];
  var hour = [];
  ['today', 'last7days'].forEach(function (k) {
    var where = ' FROM campaign WHERE segments.date DURING ' + RANGES[k] + ' AND metrics.impressions > 0';
    rowsOf('SELECT campaign.id, segments.device, ' + metricFields() + where)
      .forEach(function (r) { dev.push([k, r.campaign.id, r.segments.device].concat(metricValues(r.metrics))); });
    rowsOf('SELECT campaign.id, segments.hour, ' + metricFields() + where)
      .forEach(function (r) { hour.push([k, r.campaign.id, r.segments.hour].concat(metricValues(r.metrics))); });
  });
  writeTab(ss, 'devices', ['range', 'campaign_id', 'device'].concat(M), dev);
  writeTab(ss, 'hours', ['range', 'campaign_id', 'hour'].concat(M), hour);

  // 메타 (마지막에 써서 '갱신 시각'이 실제 완료 시각이 되게)
  writeTab(ss, 'meta', ['key', 'value'], [
    ['fetched_at', String(Date.now())],
    ['account_name', account.getName()],
    ['customer_id', account.getCustomerId()],
    ['currency', account.getCurrencyCode()],
    ['time_zone', account.getTimeZone()],
  ]);

  Logger.log('완료: 캠페인 ' + camps.length + ', 광고그룹 ' + groups.length + ', 키워드 ' + kws.length +
    ', 검색어 ' + terms.length);
  Logger.log('Vercel 의 GOOGLE_ADS_SHEET_ID 에 넣을 값: ' + ss.getId());
}

function openOrCreateSheet() {
  var files = DriveApp.getFilesByName(SHEET_NAME);
  var ss = files.hasNext() ? SpreadsheetApp.openById(files.next().getId()) : SpreadsheetApp.create(SHEET_NAME);
  if (SERVICE_ACCOUNT_EMAIL) {
    var viewers = ss.getViewers().map(function (u) { return u.getEmail(); });
    if (viewers.indexOf(SERVICE_ACCOUNT_EMAIL) < 0) ss.addViewer(SERVICE_ACCOUNT_EMAIL);
  } else {
    Logger.log('주의: SERVICE_ACCOUNT_EMAIL 이 비어 있어 대시보드가 이 시트를 읽을 수 없습니다.');
  }
  return ss;
}

function rowsOf(query) {
  var out = [];
  var it = AdsApp.search(query);
  while (it.hasNext()) out.push(it.next());
  return out;
}

function metricFields() {
  return 'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions';
}

// 기간별 지표를 {key: {today: [...], yesterday: [...], last7days: [...]}} 로 모은다
function metricsByRange(resource, idFields, keyFn, where) {
  var out = {};
  for (var k in RANGES) {
    rowsOf('SELECT ' + idFields + ', ' + metricFields() + ' FROM ' + resource + ' WHERE segments.date DURING ' +
      RANGES[k] + ' AND ' + where).forEach(function (r) {
      var key = String(keyFn(r));
      (out[key] = out[key] || {})[k] = metricValues(r.metrics);
    });
  }
  return out;
}

function metricValues(m) {
  return [Number(m.impressions || 0), Number(m.clicks || 0), Number(m.costMicros || 0) / 1e6, Number(m.conversions || 0)];
}

function metricHeader() {
  var h = [];
  for (var k in RANGES) M.forEach(function (m) { h.push(k + '_' + m); });
  return h;
}

function metricCells(map, key) {
  var cells = [];
  for (var k in RANGES) cells = cells.concat((map[key] && map[key][k]) || [0, 0, 0, 0]);
  return cells;
}

function micros(v) {
  return v ? Number(v) / 1e6 : '';
}

function val(v) {
  return v == null ? '' : v;
}

function writeTab(ss, name, header, rows) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  var values = [header].concat(rows).map(function (row) {
    return row.map(function (v) { return v == null ? '' : String(v); });
  });
  var range = sheet.getRange(1, 1, values.length, header.length);
  range.setNumberFormat('@'); // 텍스트로 저장해 ID·숫자가 변형되지 않게
  range.setValues(values);
  var first = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
}
