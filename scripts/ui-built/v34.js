// ═══════════════════════════════════════════════════════════════════════
// LAS VEGAS VALLEY TURF TRACKER — UI FRAMEWORK v34
// baseline comparison: plots!!!! again!!!
// ═══════════════════════════════════════════════════════════════════════

// ─── NEW: CONFIGURATION OBJECT ──────────────────────────────────────
// All three main layers now support the 2019 Baseline view!
var LAYER_CONFIG = {
  greenspace:  { hasBaseline2019: true },
  temperature: { hasBaseline2019: true }, 
  water:       { hasBaseline2019: true }, 
  satellite:   { hasBaseline2019: false }
};

// ─── SECTION 0: STYLES & CONSTANTS ──────────────────────────────────

var COLORS = {
  primary:     '1B5E8A', primaryDark: '124261',
  green:       '3B6D11', greenLight:  'E2F0D5', greenMid:    '97C459',
  orange:      'D85A30', coral:       'D85A30', red:         'A32D2D',
  blue:        '378ADD',
  gray:        '888888', grayMid:     'DADADA', grayLight:   'F5F5F5', grayPanel:   'FAFAFA',
  white:       'FFFFFF', black:       '333333'
};

var UI_COLORS = {
  activeFill: '#' + COLORS.primary, activeText: '#FFFFFF',
  inactiveFill: '#FFFFFF', inactiveText: '#' + COLORS.black
};

var STYLES = {
  appTitle:   {fontSize: '18px', fontWeight: 'bold', color: COLORS.primary},
  title:      {fontSize: '15px', fontWeight: 'bold', color: COLORS.primary},
  subtitle:   {fontSize: '13px', fontWeight: 'bold', color: COLORS.black},
  body:       {fontSize: '12px', color: COLORS.black},
  muted:      {fontSize: '11px', color: COLORS.gray},
  statValue:  {fontSize: '20px', fontWeight: 'bold', color: COLORS.black},
  statLabel:  {fontSize: '11px', color: COLORS.gray},
  card: {backgroundColor: COLORS.white, padding: '10px', margin: '4px', border: '1px solid #' + COLORS.grayMid, stretch: 'horizontal'},
  section: {backgroundColor: COLORS.grayPanel, padding: '12px', margin: '0 0 8px 0', border: '1px solid #' + COLORS.grayMid, stretch: 'horizontal'}
};

// ─── SECTION 1: DATA LOADING ────────────────────────────────────────

var lasvegas_boundary = ee.FeatureCollection('projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary');
var roi = lasvegas_boundary.geometry();

var tracts = ee.FeatureCollection('TIGER/2020/TRACT')
  .filter(ee.Filter.eq('STATEFP', '32'))
  .filter(ee.Filter.eq('COUNTYFP', '003'))
  .filter(ee.Filter.lt('ALAND', 20000000))
  .filterBounds(roi);

var s2Collection   = ee.ImageCollection('projects/lv-turf-removal/assets/s2_collection');
var lstCollection  = ee.ImageCollection('projects/yg-casa-project-11365/assets/lst_monthly_collection');
var turfCollection = ee.ImageCollection('projects/lv-turf-removal/assets/turf_collection');
var etCollection   = ee.ImageCollection('projects/yg-casa-project-11365/assets/water_monthly_collection');

// ─── SECTION 2: VISUALIZATION PARAMS ────────────────────────────────

var s2_vis = { min: 0.0, max: 0.3, bands: ['B4', 'B3', 'B2'] };
var lst_vis = { min: 20, max: 60, palette: ['#313695','#4575B4','#ABD9E9','#00A6FF','#00CC66','#FFFF00','#FFA500','#FF0000','#A50026'] };
var fvc_vis = { min: 0, max: 0.7, palette: ['#F5F5DC','#C5E1A5','#66BB6A','#2E7D32','#1B5E20'] };
var et_vis = { min: 0, max: 150, palette: ['#ffffff','#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#4292c6','#2171b5','#084594'] };

var et_diff_vis = { min: -45, max: 45, palette: ['#2c7bb6','#abd9e9','#ffffbf','#fdae61','#d7191c'] };
var fvc_diff_vis = { min: -0.15, max: 0.06, palette: ['#A50026','#F46D43','#FEE090','#E0F3DB','#1B7837'] };
var lst_diff_vis = { min: -3.5, max: 3.5, palette: ['#2C7BB6','#ABD9E9','#FFFFBF','#FDAE61','#D7191C'] };

// ─── SECTION 3: COMPOSITE FUNCTIONS ─────────────────────────────────

function getS2Composite(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  return s2Collection.filterDate(start, start.advance(1, 'month')).first().clip(roi);
}

// -- FVC --
function getFVCImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  return turfCollection.filterDate(start, start.advance(1, 'month')).first().select(['veg'], ['FVC']).clip(roi);
}
function getVegDiffImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  return turfCollection.filterDate(start, start.advance(1, 'month')).first().select(['veg_diff']).clip(roi);
}

// -- LST --
function getLSTImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  return lstCollection.filterDate(start, start.advance(1, 'month')).first().select([0], ['LST']).clip(roi);
}
function getLSTDiffImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  return lstCollection.filterDate(start, start.advance(1, 'month')).first().select(['LST_diff_2019']).clip(roi);
}

// -- ET (Water) --
function getETImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  return etCollection.filterDate(start, start.advance(1, 'month')).first().select(['et_actual']).clip(roi);
}
function getETDiffImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  return etCollection.filterDate(start, start.advance(1, 'month')).first().select(['et_diff_2019']).clip(roi);
}

// ─── SECTION 3A: MONTHLY TIMESERIES HELPERS (Standard) ──────────────

function getOrderedDateRange() {
  var fromDate = ee.Date.fromYMD(state.fromYear, state.fromMonth, 1);
  var toDate   = ee.Date.fromYMD(state.toYear, state.toMonth, 1);
  var start = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), fromDate, toDate));
  var end   = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), toDate, fromDate));
  return { start: start, end: end };
}

function updateTrendCharts(tractGeom) {
  var range = getOrderedDateRange();
  var startDate = range.start; var endDate = range.end;
  var months = ee.List.sequence(0, endDate.difference(startDate, 'month').round());

  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m); var monthStart = startDate.advance(m, 'month'); var monthEnd = monthStart.advance(1, 'month');

    var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
    var fvcMean = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg').rename('FVC').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('FVC'), null);

    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var lstMean = ee.Algorithms.If(lstImg, ee.Image(lstImg).select([0], ['LST']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST'), null);

    var etImg = etCollection.filterDate(monthStart, monthEnd).first();
    var etMean = ee.Algorithms.If(etImg, ee.Image(etImg).select(['et_actual']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_actual'), null);

    return ee.Feature(null, {'date': monthStart.format('YYYY-MM'), 'system:time_start': monthStart.millis(), 'FVC': fvcMean, 'LST': lstMean, 'ET': etMean });
  }));

  var sortedTable = monthlyTable.sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({features: sortedTable, xProperty: 'date', yProperties: ['FVC']}).setChartType('LineChart').setOptions({title: 'Monthly FVC trend', hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, vAxis: {title: 'Mean FVC / NDVI proxy', viewWindow: {min: -1, max: 1}}, legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, colors: ['#2E7D32'], chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11});
  var lstChart = ui.Chart.feature.byFeature({features: sortedTable, xProperty: 'date', yProperties: ['LST']}).setChartType('LineChart').setOptions({title: 'Monthly LST trend', hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, vAxis: {title: 'Mean surface temperature (°C)', viewWindow: {min: 15, max: 70}}, legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, colors: ['#D85A30'], chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11});
  var etChart = ui.Chart.feature.byFeature({features: sortedTable, xProperty: 'date', yProperties: ['ET']}).setChartType('LineChart').setOptions({title: 'Monthly Water Consumption trend', hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, vAxis: {title: 'Mean water consumption estimation (mm)', viewWindow: {min: 0, max: 200}}, legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, colors: ['#2171b5'], chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11});

  trendPanel.widgets().reset([
    ui.Label('Trend over time', STYLES.subtitle),
    ui.Label('Monthly mean values for the selected tract over the selected date range.', {fontSize: '11px', color: COLORS.gray, margin: '0 0 6px 0'}),
    ui.Panel([fvcChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'}),
    ui.Panel([lstChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'}),
    ui.Panel([etChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'})
  ]);
}

function buildCompareMonthlyTable(tractGeomA, tractGeomB) {
  var range = getOrderedDateRange(); var startDate = range.start; var endDate = range.end;
  var months = ee.List.sequence(0, endDate.difference(startDate, 'month').round());

  return ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m); var monthStart = startDate.advance(m, 'month'); var monthEnd = monthStart.advance(1, 'month');

    var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var etImg2 = etCollection.filterDate(monthStart, monthEnd).first();

    var fvcA = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg').rename('FVC').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomA, scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('FVC'), null);
    var fvcB = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg').rename('FVC').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomB, scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('FVC'), null);
    var lstA = ee.Algorithms.If(lstImg, ee.Image(lstImg).select([0], ['LST']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomA, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST'), null);
    var lstB = ee.Algorithms.If(lstImg, ee.Image(lstImg).select([0], ['LST']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomB, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST'), null);
    var etA = ee.Algorithms.If(etImg2, ee.Image(etImg2).select(['et_actual']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomA, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_actual'), null);
    var etB = ee.Algorithms.If(etImg2, ee.Image(etImg2).select(['et_actual']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomB, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_actual'), null);

    return ee.Feature(null, { 'date': monthStart.format('YYYY-MM'), 'system:time_start': monthStart.millis(), 'FVC_A': fvcA, 'FVC_B': fvcB, 'LST_A': lstA, 'LST_B': lstB, 'ET_A': etA, 'ET_B': etB });
  }));
}

function makeCompareTrendCharts(tractA, tractB) {
  var geoidA = tractA.geoid; var geoidB = tractB.geoid;
  var colorA = '#' + tractA.color; var colorB = '#' + tractB.color;
  var table = buildCompareMonthlyTable(tractA.feature.geometry(), tractB.feature.geometry()).sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({features: table, xProperty: 'date', yProperties: ['FVC_A', 'FVC_B']}).setChartType('LineChart').setOptions({title: 'Monthly Greenness Trend\nTract ' + geoidA + ' vs Tract ' + geoidB, hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, vAxis: {title: 'Mean FVC', viewWindow: {min: 0, max: 0.3}}, legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}}, chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11});
  var lstChart = ui.Chart.feature.byFeature({features: table, xProperty: 'date', yProperties: ['LST_A', 'LST_B']}).setChartType('LineChart').setOptions({title: 'Monthly Land Surface Temperature\nTract ' + geoidA + ' vs Tract ' + geoidB, hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, vAxis: {title: 'LST Celsius', viewWindow: {min: 15, max: 70}}, legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}}, chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11});
  var etCompareChart = ui.Chart.feature.byFeature({features: table, xProperty: 'date', yProperties: ['ET_A', 'ET_B']}).setChartType('LineChart').setOptions({title: 'Monthly Water Consumption\nTract ' + geoidA + ' vs Tract ' + geoidB, hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, vAxis: {title: 'Mean water consumption (mm)', viewWindow: {min: 0, max: 200}}, legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}}, chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11});

  return [
    ui.Panel([fvcChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'}),
    ui.Panel([lstChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'}),
    ui.Panel([etCompareChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'})
  ];
}


// ─── SECTION 3B: BASELINE CHARTING FUNCTIONS ────────────────────────

function buildBaselineTrendCharts(tractGeom, targetYear) {
  var months = ee.List.sequence(1, 12);
  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m);
    var s2019 = ee.Date.fromYMD(2019, m, 1);
    var sTarg = ee.Date.fromYMD(targetYear, m, 1);
    
    // Fetch FVC
    var i19_fvc = turfCollection.filterDate(s2019, s2019.advance(1, 'month')).first();
    var iTg_fvc = turfCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var v19_fvc = ee.Algorithms.If(i19_fvc, ee.Image(i19_fvc).select('veg').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('veg'), null);
    var vTg_fvc = ee.Algorithms.If(iTg_fvc, ee.Image(iTg_fvc).select('veg').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('veg'), null);

    // Fetch LST
    var i19_lst = lstCollection.filterDate(s2019, s2019.advance(1, 'month')).first();
    var iTg_lst = lstCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var v19_lst = ee.Algorithms.If(i19_lst, ee.Image(i19_lst).select([0], ['LST']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'), null);
    var vTg_lst = ee.Algorithms.If(iTg_lst, ee.Image(iTg_lst).select([0], ['LST']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'), null);

    // Fetch ET
    var i19_et = etCollection.filterDate(s2019, s2019.advance(1, 'month')).first();
    var iTg_et = etCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var v19_et = ee.Algorithms.If(i19_et, ee.Image(i19_et).select('et_actual').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'), null);
    var vTg_et = ee.Algorithms.If(iTg_et, ee.Image(iTg_et).select('et_actual').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'), null);

    return ee.Feature(null, {
      'month_label': s2019.format('MMM'), 'month_index': m,
      'FVC_2019': v19_fvc, 'FVC_Target': vTg_fvc,
      'LST_2019': v19_lst, 'LST_Target': vTg_lst,
      'ET_2019': v19_et, 'ET_Target': vTg_et
    });
  }));

  var makeChart = function(yProps, title, vAxisTitle, mainColor) {
    var chart = ui.Chart.feature.byFeature({features: monthlyTable.sort('month_index'), xProperty: 'month_label', yProperties: yProps})
      .setChartType('LineChart').setOptions({
        title: title, vAxis: {title: vAxisTitle}, hAxis: {title: 'Month'},
        series: { 0: {color: COLORS.gray, lineDashStyle: [4, 4], labelInLegend: '2019 Baseline'}, 1: {color: mainColor, labelInLegend: targetYear} },
        lineWidth: 3, pointSize: 0, chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11, legend: {position: 'top'}
      });
    return ui.Panel([chart], null, {backgroundColor: '#FFF', border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
  };

  return [
    ui.Label('Trends: ' + targetYear + ' vs 2019', STYLES.subtitle),
    makeChart(['FVC_2019', 'FVC_Target'], 'FVC: 2019 vs ' + targetYear, 'Mean FVC', '#' + COLORS.green),
    makeChart(['LST_2019', 'LST_Target'], 'LST: 2019 vs ' + targetYear, 'Mean LST (°C)', '#' + COLORS.orange),
    makeChart(['ET_2019', 'ET_Target'], 'Water: 2019 vs ' + targetYear, 'Mean ET (mm)', '#' + COLORS.blue)
  ];
}

function buildBaselineCompareTrendCharts(tractA, tractB, targetYear) {
  var months = ee.List.sequence(1, 12);
  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m); var sTarg = ee.Date.fromYMD(targetYear, m, 1);

    var imgFVC = turfCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var dA_fvc = ee.Algorithms.If(imgFVC, ee.Image(imgFVC).select('veg_diff').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'), null);
    var dB_fvc = ee.Algorithms.If(imgFVC, ee.Image(imgFVC).select('veg_diff').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'), null);

    var imgLST = lstCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var dA_lst = ee.Algorithms.If(imgLST, ee.Image(imgLST).select('LST_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019'), null);
    var dB_lst = ee.Algorithms.If(imgLST, ee.Image(imgLST).select('LST_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019'), null);

    var imgET = etCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var dA_et = ee.Algorithms.If(imgET, ee.Image(imgET).select('et_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019'), null);
    var dB_et = ee.Algorithms.If(imgET, ee.Image(imgET).select('et_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019'), null);

    return ee.Feature(null, {
      'month_label': sTarg.format('MMM'), 'month_index': m,
      'FVC_A': dA_fvc, 'FVC_B': dB_fvc, 'LST_A': dA_lst, 'LST_B': dB_lst, 'ET_A': dA_et, 'ET_B': dB_et
    });
  }));

  var makeChart = function(yProps, title, vAxisTitle) {
    var chart = ui.Chart.feature.byFeature({features: monthlyTable.sort('month_index'), xProperty: 'month_label', yProperties: yProps})
      .setChartType('LineChart').setOptions({
        title: title, vAxis: {title: vAxisTitle}, hAxis: {title: 'Month'},
        series: { 0: {color: '#' + tractA.color, labelInLegend: 'Tract ' + tractA.geoid}, 1: {color: '#' + tractB.color, labelInLegend: 'Tract ' + tractB.geoid} },
        lineWidth: 3, pointSize: 0, chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11, legend: {position: 'top'}
      });
    return ui.Panel([chart], null, {backgroundColor: '#FFF', border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
  };

  return [
    makeChart(['FVC_A', 'FVC_B'], targetYear + ' FVC Difference vs 2019', 'FVC Diff'),
    makeChart(['LST_A', 'LST_B'], targetYear + ' LST Difference vs 2019', 'LST Diff (°C)'),
    makeChart(['ET_A', 'ET_B'], targetYear + ' Water Difference vs 2019', 'Water Diff (mm)')
  ];
}

// ─── SECTION 3C: DIFF TREND CHARTS (date-range + relative data) ────

// Single tract: diff bands plotted over the selected date range
function buildDiffTrendCharts(tractGeom) {
  var range = getOrderedDateRange();
  var startDate = range.start; var endDate = range.end;
  var months = ee.List.sequence(0, endDate.difference(startDate, 'month').round());

  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m);
    var monthStart = startDate.advance(m, 'month');
    var monthEnd   = monthStart.advance(1, 'month');

    var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
    var fvcDiff = ee.Algorithms.If(fvcImg,
      ee.Image(fvcImg).select('veg_diff').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('veg_diff'), null);

    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var lstDiff = ee.Algorithms.If(lstImg,
      ee.Image(lstImg).select('LST_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST_diff_2019'), null);

    var etImg = etCollection.filterDate(monthStart, monthEnd).first();
    var etDiff = ee.Algorithms.If(etImg,
      ee.Image(etImg).select('et_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_diff_2019'), null);

    return ee.Feature(null, {
      'date': monthStart.format('YYYY-MM'), 'system:time_start': monthStart.millis(),
      'FVC_diff': fvcDiff, 'LST_diff': lstDiff, 'ET_diff': etDiff
    });
  }));

  var sorted = monthlyTable.sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({features: sorted, xProperty: 'date', yProperties: ['FVC_diff']})
    .setChartType('LineChart').setOptions({
      title: 'FVC Change vs 2019 Baseline',
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'FVC Difference from 2019', baseline: 0, baselineColor: '#333333', gridlines: {color: '#e0e0e0'}},
      legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true,
      colors: ['#2E7D32'], chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11
    });

  var lstChart = ui.Chart.feature.byFeature({features: sorted, xProperty: 'date', yProperties: ['LST_diff']})
    .setChartType('LineChart').setOptions({
      title: 'LST Change vs 2019 Baseline',
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'LST Difference (°C)', baseline: 0, baselineColor: '#333333', gridlines: {color: '#e0e0e0'}},
      legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true,
      colors: ['#D85A30'], chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11
    });

  var etChart = ui.Chart.feature.byFeature({features: sorted, xProperty: 'date', yProperties: ['ET_diff']})
    .setChartType('LineChart').setOptions({
      title: 'Water Consumption Change vs 2019 Baseline',
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'Water Difference (mm)', baseline: 0, baselineColor: '#333333', gridlines: {color: '#e0e0e0'}},
      legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true,
      colors: ['#2171b5'], chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11
    });

  return [
    ui.Label('Change vs 2019 baseline over time', STYLES.subtitle),
    ui.Label('Each point shows how much that month differs from the same calendar month in 2019. Zero = no change.', {fontSize: '11px', color: COLORS.gray, margin: '0 0 6px 0'}),
    ui.Panel([fvcChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'}),
    ui.Panel([lstChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'}),
    ui.Panel([etChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'})
  ];
}

// Two tracts: diff bands plotted over the selected date range
function buildDiffCompareTrendCharts(tractA, tractB) {
  var range = getOrderedDateRange();
  var startDate = range.start; var endDate = range.end;
  var months = ee.List.sequence(0, endDate.difference(startDate, 'month').round());

  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m);
    var monthStart = startDate.advance(m, 'month');
    var monthEnd   = monthStart.advance(1, 'month');

    var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
    var dA_fvc = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg_diff').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('veg_diff'), null);
    var dB_fvc = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg_diff').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('veg_diff'), null);

    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var dA_lst = ee.Algorithms.If(lstImg, ee.Image(lstImg).select('LST_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST_diff_2019'), null);
    var dB_lst = ee.Algorithms.If(lstImg, ee.Image(lstImg).select('LST_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST_diff_2019'), null);

    var etImg = etCollection.filterDate(monthStart, monthEnd).first();
    var dA_et = ee.Algorithms.If(etImg, ee.Image(etImg).select('et_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_diff_2019'), null);
    var dB_et = ee.Algorithms.If(etImg, ee.Image(etImg).select('et_diff_2019').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_diff_2019'), null);

    return ee.Feature(null, {
      'date': monthStart.format('YYYY-MM'), 'system:time_start': monthStart.millis(),
      'FVC_A': dA_fvc, 'FVC_B': dB_fvc, 'LST_A': dA_lst, 'LST_B': dB_lst, 'ET_A': dA_et, 'ET_B': dB_et
    });
  }));

  var sorted = monthlyTable.sort('system:time_start');
  var colorA = '#' + tractA.color; var colorB = '#' + tractB.color;

  var makeChart = function(yProps, title, vAxisTitle) {
    var chart = ui.Chart.feature.byFeature({features: sorted, xProperty: 'date', yProperties: yProps})
      .setChartType('LineChart').setOptions({
        title: title,
        hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
        vAxis: {title: vAxisTitle, baseline: 0, baselineColor: '#333333', gridlines: {color: '#e0e0e0'}},
        series: { 0: {color: colorA, labelInLegend: 'Tract ' + tractA.geoid}, 1: {color: colorB, labelInLegend: 'Tract ' + tractB.geoid} },
        lineWidth: 3, pointSize: 0, interpolateNulls: true,
        chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11, legend: {position: 'top'}
      });
    return ui.Panel([chart], null, {backgroundColor: '#FFF', border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'});
  };

  return [
    makeChart(['FVC_A', 'FVC_B'], 'FVC Change vs 2019 Baseline', 'FVC Diff'),
    makeChart(['LST_A', 'LST_B'], 'LST Change vs 2019 Baseline', 'LST Diff (°C)'),
    makeChart(['ET_A', 'ET_B'], 'Water Change vs 2019 Baseline', 'Water Diff (mm)')
  ];
}


// ─── SECTION 4: APP STATE ───────────────────────────────────────────

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026'];

// update in v31
var state = {
  currentView:   'explore', activeLayer:   'greenspace', 
  timeMode:      'compare', dataType:      'actual', 
  splitEnabled:  true, fromYear:  2020, fromMonth: 6, toYear:    2023, toMonth:   6,
  selectedTract: null, compareTracts: []
};

// ─── SECTION 5: UI HELPERS ──────────────────────────────────────────

function makeSectionTitle(text) { return ui.Label(text, STYLES.subtitle); }
function makeSeparator() { return ui.Panel(null, null, {height: '1px', backgroundColor: '#' + COLORS.grayMid, margin: '8px 0'}); }
function makeStatCard(label) { var valLabel = ui.Label('—', STYLES.statValue); var nameLabel = ui.Label(label, STYLES.statLabel); var deltaLabel = ui.Label('', {fontSize: '11px'}); return {panel: ui.Panel([nameLabel, valLabel, deltaLabel], null, STYLES.card), name: nameLabel, val: valLabel, delta: deltaLabel}; }
function styleTabButton(btn, active) { btn.style().set({backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill, color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText, border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid, padding: '8px 16px', margin: '0 6px 0 0', fontSize: '12px', fontWeight: active ? 'bold' : 'normal'}); }
function stylePillButton(btn, active) { btn.style().set({backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill, color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText, border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid, padding: '6px 12px', margin: '2px 6px 2px 0', fontSize: '11px', fontWeight: active ? 'bold' : 'normal'}); }

// ─── SECTION 6: MAPS ────────────────────────────────────────────────

ui.root.clear();
var leftMap = ui.Map(); var rightMap = ui.Map();
[leftMap, rightMap].forEach(function(m) { m.setControlVisibility({all: false, zoomControl: true, scaleControl: true, mapTypeControl: true}); m.setOptions('Custom', {Custom: [{stylers: [{saturation: -75}]}, {featureType: 'poi', stylers: [{visibility: 'off'}]}, {featureType: 'transit', stylers: [{visibility: 'off'}]}]}); });
var mapLinker = ui.Map.Linker([leftMap, rightMap]);
var leftDateLabel = ui.Label('Jun 2020', {fontSize: '15px', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.95)', padding: '6px 14px', position: 'top-left', border: '1px solid rgba(0,0,0,0.12)'});
var rightDateLabel = ui.Label('Jun 2023', {fontSize: '15px', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.95)', padding: '6px 14px', position: 'top-right', border: '1px solid rgba(0,0,0,0.12)'});
leftMap.add(leftDateLabel); rightMap.add(rightDateLabel);
var splitPanel = ui.SplitPanel({firstPanel: leftMap, secondPanel: rightMap, orientation: 'horizontal', wipe: true, style: {stretch: 'both'}});
var mapContainer = ui.Panel([splitPanel], null, {stretch: 'both', backgroundColor: '#' + COLORS.white});

// ─── SECTION 6A: MAP LEGENDS ────────────────────────────────────────

function makeLSTLegend(position) { var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}}); legend.add(ui.Label('LST variation °C', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'})); legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: lst_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}})); legend.add(ui.Panel([ui.Label(String(lst_vis.min), {fontSize: '12px', margin: '0'}), ui.Label('40', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label(String(lst_vis.max), {fontSize: '12px', margin: '0'})], ui.Panel.Layout.flow('horizontal'))); return legend; }
function makeFVCLegend(position) { var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}}); legend.add(ui.Label('Greenness (FVC)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'})); legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: fvc_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}})); legend.add(ui.Panel([ui.Label('0', {fontSize: '11px', margin: '0'}), ui.Label('0.35', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('0.7', {fontSize: '11px', margin: '0'})], ui.Panel.Layout.flow('horizontal'))); return legend; }
function makeETLegend(position) { var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}}); legend.add(ui.Label('Water consumption (mm)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'})); legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: et_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}})); legend.add(ui.Panel([ui.Label('0 mm', {fontSize: '12px', margin: '0'}), ui.Label('75', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('150 mm', {fontSize: '12px', margin: '0'})], ui.Panel.Layout.flow('horizontal'))); return legend; }

var leftFVCLegend = makeFVCLegend('bottom-left'); var rightFVCLegend = makeFVCLegend('bottom-left');
var leftLSTLegend = makeLSTLegend('bottom-left'); var rightLSTLegend = makeLSTLegend('bottom-left');
var leftETLegend  = makeETLegend('bottom-left');  var rightETLegend  = makeETLegend('bottom-left');
leftMap.add(leftFVCLegend); rightMap.add(rightFVCLegend); leftMap.add(leftLSTLegend); rightMap.add(rightLSTLegend); leftMap.add(leftETLegend); rightMap.add(rightETLegend);

function makeETDiffLegend(position) { var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}}); legend.add(ui.Label('Water consumption change (mm)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'})); legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: et_diff_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}})); legend.add(ui.Panel([ui.Label('-45 mm', {fontSize: '12px', margin: '0', color: COLORS.blue}), ui.Label('0', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('+45 mm', {fontSize: '11px', margin: '0', color: COLORS.coral})], ui.Panel.Layout.flow('horizontal'))); return legend; }
function makeFVCDiffLegend(position) { var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}}); legend.add(ui.Label('Greenness change (FVC)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'})); legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: fvc_diff_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}})); legend.add(ui.Panel([ui.Label('-0.15', {fontSize: '12px', margin: '0', color: COLORS.red}), ui.Label('0', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('+0.06', {fontSize: '12px', margin: '0', color: COLORS.green})], ui.Panel.Layout.flow('horizontal'))); return legend; }
function makeLSTDiffLegend(position) { var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}}); legend.add(ui.Label('Temperature change (°C)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'})); legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: lst_diff_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}})); legend.add(ui.Panel([ui.Label('-3.5°C', {fontSize: '12px', margin: '0', color: COLORS.blue}), ui.Label('0', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('+3.5°C', {fontSize: '12px', margin: '0', color: COLORS.red})], ui.Panel.Layout.flow('horizontal'))); return legend; }

var leftETDiffLegend  = makeETDiffLegend('bottom-left');  var rightETDiffLegend = makeETDiffLegend('bottom-left');
var leftFVCDiffLegend = makeFVCDiffLegend('bottom-left'); var rightFVCDiffLegend = makeFVCDiffLegend('bottom-left');
var leftLSTDiffLegend = makeLSTDiffLegend('bottom-left'); var rightLSTDiffLegend = makeLSTDiffLegend('bottom-left');
leftMap.add(leftETDiffLegend); rightMap.add(rightETDiffLegend); leftMap.add(leftFVCDiffLegend); rightMap.add(rightFVCDiffLegend); leftMap.add(leftLSTDiffLegend); rightMap.add(rightLSTDiffLegend);

function updateLegendVisibility() {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var actuallySplit = state.splitEnabled && (!isSameDate || state.timeMode === 'adjusted');
  var isDiff = !isSameDate && !actuallySplit && state.timeMode !== 'adjusted'; // Unified custom diff view

  var isTemp = state.activeLayer === 'temperature';
  var isTempDiff = isTemp && (isDiff || (state.timeMode === 'adjusted' && !actuallySplit));
  leftLSTLegend.style().set('shown', isTemp && !isTempDiff); rightLSTLegend.style().set('shown', isTemp && !isTempDiff);
  leftLSTDiffLegend.style().set('shown', isTempDiff); rightLSTDiffLegend.style().set('shown', isTempDiff);

  var isGreen = state.activeLayer === 'greenspace';
  var isGreenDiff = isGreen && (isDiff || (state.timeMode === 'adjusted' && !actuallySplit));
  leftFVCLegend.style().set('shown', isGreen && !isGreenDiff); rightFVCLegend.style().set('shown', isGreen && !isGreenDiff);
  leftFVCDiffLegend.style().set('shown', isGreenDiff); rightFVCDiffLegend.style().set('shown', isGreenDiff);

  var isWater = state.activeLayer === 'water';
  var isWaterDiff = isWater && (isDiff || (state.timeMode === 'adjusted' && !actuallySplit));
  leftETLegend.style().set('shown', isWater && !isWaterDiff); rightETLegend.style().set('shown', isWater && !isWaterDiff);
  leftETDiffLegend.style().set('shown', isWaterDiff); rightETDiffLegend.style().set('shown', isWaterDiff);
}

// update the whole section in v31
// ─── SECTION 7: LEFT SIDEBAR ────────────────────────────────────────

var appTitle = ui.Label('Las Vegas Valley Turf Tracker', STYLES.appTitle);
var appSubtitle = ui.Label('Urban turf change and surface heat explorer', STYLES.muted);
var headerPanel = ui.Panel([appTitle, appSubtitle], null, {padding: '14px 14px 10px 14px', backgroundColor: '#' + COLORS.white});

var tabExplore = ui.Button({label: 'Tract Profile', style: {border: '0px solid transparent'}});
var tabCompare = ui.Button({label: 'Compare Tracts', style: {border: '0px solid transparent'}});
var tabAbout = ui.Button({label: 'About', style: {border: '0px solid transparent'}});
var tabRow = ui.Panel([tabExplore, tabCompare, tabAbout], ui.Panel.Layout.flow('horizontal'), {padding: '0 14px 10px 14px', backgroundColor: '#' + COLORS.white, margin: '0 0 6px 0'});

// ─── TIME CONTROLS & DYNAMIC UI LOGIC ───

// 1. Data Type Dropdown
var dataTypeSel = ui.Select({
  items: ['Actual data', 'Seasonally adjusted data'], 
  value: 'Actual data', 
  style: {fontSize: '13px', margin: '4px 8px 8px 0', stretch: 'horizontal'}
});

// 2. Time Mode Dropdown
var timeModeSel = ui.Select({
  items: ['Single month', 'Compare two months'], 
  value: 'Compare two months', 
  style: {fontSize: '13px', margin: '4px 8px 8px 0', stretch: 'horizontal'}
});

var fromMonthSel = ui.Select({items: MONTHS, value: 'Jun', style: {width: '75px', fontSize: '13px'}});
var fromYearSel  = ui.Select({items: YEARS,  value: '2020', style: {width: '80px', fontSize: '13px'}});
var toMonthSel   = ui.Select({items: MONTHS, value: 'Jun', style: {width: '75px', fontSize: '13px'}});
var toYearSel    = ui.Select({items: YEARS,  value: '2023', style: {width: '80px', fontSize: '13px'}});

var fromLabel = ui.Label('From', {fontSize: '12px', color: COLORS.gray, width: '40px', margin: '10px 8px'});
var toLabel   = ui.Label('To', {fontSize: '12px', color: COLORS.gray, width: '40px', margin: '10px 8px'});
var fromRow = ui.Panel([fromLabel, fromMonthSel, fromYearSel], ui.Panel.Layout.flow('horizontal'));
var toRow   = ui.Panel([toLabel, toMonthSel, toYearSel], ui.Panel.Layout.flow('horizontal'));

function updateTimeModeUI() {
  var config = LAYER_CONFIG[state.activeLayer];
  
  if (config.hasBaseline2019) {
    dataTypeSel.setDisabled(false);
  } else {
    dataTypeSel.setValue('Actual data', false); 
    state.dataType = 'actual';
    dataTypeSel.setDisabled(true); 
  }

  if (state.timeMode === 'single') {
    fromLabel.setValue('Date'); fromRow.style().set('shown', true); toRow.style().set('shown', false);
  } else if (state.timeMode === 'compare') {
    fromLabel.setValue('From'); fromRow.style().set('shown', true); toRow.style().set('shown', true);
  }
}

function makeLayerPill(label, key) {
  var btn = ui.Button(label, function() { state.activeLayer = key; updateLayerPills(); updateTimeModeUI(); refreshMap(); });
  btn._key = key; btn.style().set({fontSize: '11px', padding: '6px 12px', margin: '2px 6px 2px 0', border: '0px solid transparent'}); return btn;
}

var pillGreen     = makeLayerPill('Greenness', 'greenspace');
var pillTemp      = makeLayerPill('Heat', 'temperature');
var pillWater     = makeLayerPill('Water Consumption', 'water');

function updateLayerPills() { 
  [pillGreen, pillTemp, pillWater].forEach(function(p) { 
    stylePillButton(p, p._key === state.activeLayer); 
  }); 
}

function onTimeChange() {
  if (state.timeMode === 'single') {
    state.fromMonth = MONTHS.indexOf(fromMonthSel.getValue()) + 1; state.fromYear  = parseInt(fromYearSel.getValue(), 10); state.toMonth = state.fromMonth; state.toYear  = state.fromYear;
  } else {
    state.fromMonth = MONTHS.indexOf(fromMonthSel.getValue()) + 1; state.fromYear  = parseInt(fromYearSel.getValue(), 10); state.toMonth = MONTHS.indexOf(toMonthSel.getValue()) + 1; state.toYear  = parseInt(toYearSel.getValue(), 10);
  }
  refreshMap();
  if (state.currentView === 'explore' && state.selectedTract) updateSidePanel(state.selectedTract);
  else if (state.currentView === 'compare' && state.compareTracts.length === 2) updateCompareView();
}

fromMonthSel.onChange(onTimeChange); fromYearSel.onChange(onTimeChange); toMonthSel.onChange(onTimeChange); toYearSel.onChange(onTimeChange);


dataTypeSel.onChange(function(val) {
  state.dataType = (val === 'Actual data') ? 'actual' : 'adjusted';
  // Hides or shows the distribution charts instantly
  chartsPanel.style().set('shown', state.dataType !== 'adjusted'); 
  onTimeChange();
});


timeModeSel.onChange(function(val) {
  state.timeMode = (val === 'Single month') ? 'single' : 'compare';
  updateTimeModeUI(); onTimeChange();
});

var splitCheck = ui.Checkbox('Split view', true); splitCheck.style().set({fontSize: '13px', color: '#' + COLORS.black}); splitCheck.onChange(function(v) { state.splitEnabled = v; refreshMap(); });



// BOX 1: Map controls
var controlsPanel = ui.Panel([
  makeSectionTitle('Map controls'), 
  ui.Label('Layer', STYLES.muted), 
  ui.Panel([pillGreen, pillTemp, pillWater], ui.Panel.Layout.flow('horizontal'))
], null, STYLES.section);

// BOX 2: Analysis modes
var analysisPanel = ui.Panel([makeSectionTitle('Analysis modes'), ui.Label('Data type', STYLES.muted), dataTypeSel, makeSeparator(), ui.Label('Time frame', STYLES.muted), timeModeSel, fromRow, toRow, makeSeparator(), splitCheck], null, STYLES.section);

var instructionPanel = ui.Panel([makeSectionTitle('How to use'), ui.Label('1. Choose a layer and date range in Map controls.\n2. In Tract Profile, click one tract on the map to view its stats and charts.\n3. In Compare Tracts, click two tracts on the map to compare them.\n4. Use Split view to see two selected months side by side with different date range.', {fontSize: '12px', color: '#' + COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0 0 0'})], null, STYLES.section);

var promptPanel = ui.Panel([makeSectionTitle('Select a Tract'), ui.Label('Click any census tract on the map to view its local green space changes, surface temperature shifts, and distribution metrics.', {fontSize: '12px', color: COLORS.gray, whiteSpace: 'pre-wrap'})], null, STYLES.section);

var cardGreen = makeStatCard('Green space change'); var cardTemp  = makeStatCard('Surface temperature'); var cardFVC   = makeStatCard('Vegetation fraction'); var cardET    = makeStatCard('Water consumption');
var statsGrid1 = ui.Panel([cardGreen.panel, cardTemp.panel], ui.Panel.Layout.flow('horizontal'));
var statsGrid2 = ui.Panel([cardFVC.panel], ui.Panel.Layout.flow('horizontal'));
var statsGrid3 = ui.Panel([cardET.panel], ui.Panel.Layout.flow('horizontal'));

var plainEnglish = ui.Label('', {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '6px 0'});
var tractGeoidLabel = ui.Label('', {fontSize: '14px', fontWeight: 'bold', color: '#' + COLORS.primary, padding: '4px 0 0 0'});
var tractAreaLabel = ui.Label('', {fontSize: '12px', color: '#' + COLORS.black, padding: '0 0 4px 0'});

var resetSelectionBtn = ui.Button('Reset selected tract', function() { resetSelectedTract(); }); resetSelectionBtn.style().set({fontSize: '11px', color: '#' + COLORS.red, backgroundColor: '#FFFFFF', margin: '8px 0 0 0', padding: '6px 8px', border: '1px solid #' + COLORS.red});

var tractProfileTitle = makeSectionTitle('Selected Tract');
var tractHeaderPanel = ui.Panel([tractProfileTitle, tractGeoidLabel, tractAreaLabel, resetSelectionBtn], null, STYLES.section); tractHeaderPanel.style().set('shown', false);

var chartTitle = ui.Label('Selected area distributions', STYLES.subtitle); var chartNote = ui.Label('Histograms update after you click a tract.', {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'});
var fvcChartHolder = ui.Panel([ui.Label('FVC distribution chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
var lstChartHolder = ui.Panel([ui.Label('LST distribution chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
var etChartHolder  = ui.Panel([ui.Label('Water consumption chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
var chartsPanel = ui.Panel([chartTitle, chartNote, fvcChartHolder, lstChartHolder, etChartHolder], null, STYLES.section);

var statsTitleLabel = makeSectionTitle('What changed?');
var statsPanel = ui.Panel([statsTitleLabel, statsGrid1, statsGrid2, statsGrid3], null, STYLES.section);


// update the whole section 8 in v31
// ─── SECTION 8: TAB SWITCHING ───────────────────────────────────────

function setActiveTab(tab) {
  state.currentView = tab;
  
  styleTabButton(tabExplore, tab === 'explore'); 
  styleTabButton(tabCompare, tab === 'compare'); 
  styleTabButton(tabAbout, tab === 'about');
  
  controlsPanel.style().set('shown', tab !== 'about'); 
  analysisPanel.style().set('shown', tab !== 'about'); 
  instructionPanel.style().set('shown', tab !== 'about');
  
  // Use the new split panels for the Explore view
  exploreTop.style().set('shown', tab === 'explore'); 
  exploreBottom.style().set('shown', tab === 'explore'); 
  
  compareContent.style().set('shown', tab === 'compare'); 
  aboutContent.style().set('shown', tab === 'about');
  
  tractHeaderPanel.style().set('shown', tab === 'explore' && state.selectedTract !== null); 
  promptPanel.style().set('shown', tab === 'explore' && state.selectedTract === null); 
  comparePromptPanel.style().set('shown', tab === 'compare');
  
  if (tab === 'explore') refreshMap(); 
  if (tab === 'compare') updateCompareView(); 
  updateHighlightLayer();
}

tabExplore.onClick(function() { setActiveTab('explore'); }); 
tabCompare.onClick(function() { setActiveTab('compare'); }); 
tabAbout.onClick(function() { setActiveTab('about'); });



// ─── SECTION 9: RESET SELECTED TRACT ────────────────────────────────

function resetSelectedTract() {
  state.selectedTract = null;
  promptPanel.style().set('shown', true); statsPanel.style().set('shown', false); tractHeaderPanel.style().set('shown', false); plainEnglish.setValue('');
  fvcChartHolder.widgets().reset([ui.Label('FVC distribution chart will appear here.', STYLES.muted)]); lstChartHolder.widgets().reset([ui.Label('LST distribution chart will appear here.', STYLES.muted)]); etChartHolder.widgets().reset([ui.Label('Water consumption chart will appear here.', STYLES.muted)]);
  trendPanel.widgets().reset([]); updateHighlightLayer();
}

function updateHighlightLayer() {
  [leftMap, rightMap].forEach(function(m) {
    var layers = m.layers(); var layersToRemove = [];
    layers.forEach(function(l) { var name = l.getName(); if (name === 'Selected tract' || (name && name.indexOf('Compare tract:') !== -1)) { layersToRemove.push(l); } });
    layersToRemove.forEach(function(l) { layers.remove(l); });
  });

  if (state.currentView === 'compare') {
    state.compareTracts.forEach(function(t) {
      var compStyle = ee.FeatureCollection([ee.Feature(t.feature.geometry())]).style({color: t.color, fillColor: t.color + '40', width: 3});
      leftMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid); if (state.splitEnabled) rightMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
    });
  }

  if (state.currentView === 'explore' && state.selectedTract) {
    var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())]).style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2});
    leftMap.addLayer(highlightStyle, {}, 'Selected tract'); if (state.splitEnabled) rightMap.addLayer(highlightStyle, {}, 'Selected tract');
  }
}

// ─── SECTION 10: MAP REFRESH ────────────────────────────────────────

var mapInitialized = false; var containerMode  = null; 

function refreshMap() {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var isBaseline = (state.timeMode === 'adjusted');

  splitCheck.style().set('shown', !isSameDate || isBaseline);
  var actuallySplit = state.splitEnabled && (!isSameDate || isBaseline);

  var fromStr = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear; var toStr = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
  leftDateLabel.setValue(isBaseline ? 'Baseline 2019' : (isSameDate || actuallySplit ? fromStr : fromStr + ' → ' + toStr)); rightDateLabel.setValue(toStr);
  leftMap.layers().reset(); rightMap.layers().reset();

  if (actuallySplit) {
    if (containerMode !== 'split') { mapContainer.widgets().reset([splitPanel]); containerMode = 'split'; }
    rightDateLabel.style().set('shown', true);

    if (state.activeLayer === 'greenspace') { leftMap.addLayer(getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC Before'); rightMap.addLayer(getFVCImage(state.toYear, state.toMonth), fvc_vis, 'FVC After'); }
    else if (state.activeLayer === 'temperature') { leftMap.addLayer(getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST Before'); rightMap.addLayer(getLSTImage(state.toYear, state.toMonth), lst_vis, 'LST After'); }
    else if (state.activeLayer === 'water') { leftMap.addLayer(getETImage(state.fromYear, state.fromMonth), et_vis, 'Water Before'); rightMap.addLayer(getETImage(state.toYear, state.toMonth), et_vis, 'Water After'); }
    else { leftMap.addLayer(getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'S2 Before'); rightMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'S2 After'); }
  } else {
    if (containerMode !== 'single') { mapContainer.widgets().reset([leftMap]); containerMode = 'single'; }
    rightDateLabel.style().set('shown', false);

    if (isSameDate && !isBaseline) {
      if (state.activeLayer === 'greenspace') leftMap.addLayer(getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC');
      else if (state.activeLayer === 'temperature') leftMap.addLayer(getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST');
      else if (state.activeLayer === 'water') leftMap.addLayer(getETImage(state.fromYear, state.fromMonth), et_vis, 'Water');
      else leftMap.addLayer(getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'Satellite');
    } else {
      if (state.activeLayer === 'greenspace') {
        var fvcDiff = isBaseline ? getVegDiffImage(state.toYear, state.toMonth) : getFVCImage(state.toYear, state.toMonth).subtract(getFVCImage(state.fromYear, state.fromMonth));
        leftMap.addLayer(fvcDiff, fvc_diff_vis, 'FVC change');
      } else if (state.activeLayer === 'temperature') {
        var lstDiff = isBaseline ? getLSTDiffImage(state.toYear, state.toMonth) : getLSTImage(state.toYear, state.toMonth).subtract(getLSTImage(state.fromYear, state.fromMonth));
        leftMap.addLayer(lstDiff, lst_diff_vis, 'LST change');
      } else if (state.activeLayer === 'water') {
        var etDiff = isBaseline ? getETDiffImage(state.toYear, state.toMonth) : getETImage(state.toYear, state.toMonth).subtract(getETImage(state.fromYear, state.fromMonth));
        leftMap.addLayer(etDiff, et_diff_vis, 'Water change');
      } else { leftMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'Current view'); }
    }
  }

  var tractStyle = tracts.style({color: COLORS.primary + '99', fillColor: '00000000', width: 0.8}); leftMap.addLayer(tractStyle, {}, 'Census tracts'); if (state.splitEnabled) rightMap.addLayer(tractStyle, {}, 'Census tracts');
  var boundaryStyle = lasvegas_boundary.style({color: COLORS.primary, fillColor: '00000000', width: 2}); leftMap.addLayer(boundaryStyle, {}, 'Study area'); if (state.splitEnabled) rightMap.addLayer(boundaryStyle, {}, 'Study area');

  state.compareTracts.forEach(function(t) { var compStyle = ee.FeatureCollection([ee.Feature(t.feature.geometry())]).style({color: t.color, fillColor: t.color + '40', width: 3}); leftMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid); if (state.splitEnabled) rightMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid); });
  if (state.selectedTract) { var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())]).style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2}); leftMap.addLayer(highlightStyle, {}, 'Selected tract'); if (state.splitEnabled) rightMap.addLayer(highlightStyle, {}, 'Selected tract'); }

  updateLegendVisibility(); if (!mapInitialized) { leftMap.centerObject(roi, 11); mapInitialized = true; }
}

// ─── SECTION 11: MAP CLICK → SIDEBAR + CHARTS ───────────────────────

function handleMapClick(coords) {
  if (state.currentView === 'about') return; 
  var point = ee.Geometry.Point(coords.lon, coords.lat); var clicked = tracts.filterBounds(point).first();
  clicked.evaluate(function(f) { if (!f) return; var tract = ee.Feature(f); if (state.currentView === 'explore') updateSidePanel(tract); else if (state.currentView === 'compare') handleCompareClick(tract); });
}
leftMap.onClick(handleMapClick); rightMap.onClick(handleMapClick);

function handleCompareClick(tract) {
  if (state.compareTracts.length >= 2) state.compareTracts = [];
  tract.get('GEOID').evaluate(function(geoid) {
    var already = state.compareTracts.some(function(t) { return t.geoid === geoid; });
    if (!already) { state.compareTracts.push({geoid: geoid, feature: tract, color: [COLORS.blue, COLORS.coral][state.compareTracts.length]}); updateCompareView(); updateHighlightLayer(); }
  });
}

function updateDistributionCharts(tractGeom) {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var isBaseline = (state.timeMode === 'adjusted');

  if (isBaseline) {
      var vegDiffImg = getVegDiffImage(state.toYear, state.toMonth);
      var lstDiffImg = getLSTDiffImage(state.toYear, state.toMonth);
      var etDiffImg = getETDiffImage(state.toYear, state.toMonth);

      var fvcChart = ui.Chart.image.histogram({image: vegDiffImg.rename('Difference vs 2019'), region: tractGeom, scale: 10, maxPixels: 1e7}).setOptions({title: 'FVC Shift vs 2019 Baseline', hAxis: { title: 'veg_diff value', format: '0.00' }, series: { 0: {color: '#1B5E20'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
      var lstChart = ui.Chart.image.histogram({image: lstDiffImg.rename('Difference vs 2019'), region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'LST Shift vs 2019 Baseline', hAxis: { title: 'LST_diff_2019 (°C)', format: '#.#' }, series: { 0: {color: '#D95F0E'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
      var etChart  = ui.Chart.image.histogram({image: etDiffImg.rename('Difference vs 2019'), region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'Water Shift vs 2019 Baseline', hAxis: { title: 'et_diff_2019 (mm)', format: '#.#' }, series: { 0: {color: '#2171b5'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
      
      fvcChartHolder.widgets().reset([fvcChart]); lstChartHolder.widgets().reset([lstChart]); etChartHolder.widgets().reset([etChart]); return;
  }

  var fvcBefore = getFVCImage(state.fromYear, state.fromMonth).updateMask(getFVCImage(state.fromYear, state.fromMonth).gt(0.01)); var lstBefore = getLSTImage(state.fromYear, state.fromMonth); var etBefore  = getETImage(state.fromYear, state.fromMonth);
  var fvcChart, lstChart, etChart; 

  if (isSameDate) {
    var dateLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
    
    fvcChart = ui.Chart.image.histogram({image: fvcBefore.rename(dateLabel), region: tractGeom, scale: 10, maxPixels: 1e7}).setOptions({title: 'FVC distribution: ' + dateLabel, hAxis: { title: 'Fractional Vegetation Cover (FVC)', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#1B5E20'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});

    lstChart = ui.Chart.image.histogram({image: lstBefore.rename(dateLabel), region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'LST distribution: ' + dateLabel, hAxis: { title: 'Temperature (°C)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#D95F0E'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
    
    // etChart = ui.Chart.image.histogram({image: etBefore.rename(dateLabel), region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'Water consumption distribution: ' + dateLabel, hAxis: { title: 'Water consumption (mm)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#2171b5'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
    
    etChart = ui.Chart.image.histogram({
      image: etBefore.rename(dateLabel), 
      region: tractGeom, 
      scale: 30, 
      minBucketWidth: 1.5, // Groups the narrow data points together
      maxPixels: 1e7
    }).setOptions({
      title: 'Water consumption distribution: ' + dateLabel, 
      hAxis: { title: 'Water consumption (mm)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, 
      vAxis: {title: 'Pixel count'}, 
      series: { 0: {color: '#2171b5'} }, 
      bar: { groupWidth: '100%' }, // Removes empty space between pillars
      legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });


  } else {
    var fromLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear; var toLabel   = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
    var fvcAfter  = getFVCImage(state.toYear, state.toMonth).updateMask(getFVCImage(state.toYear, state.toMonth).gt(0.01)); var lstAfter  = getLSTImage(state.toYear, state.toMonth); var etAfter   = getETImage(state.toYear, state.toMonth);
    var fvcStack = fvcBefore.rename('Before').addBands(fvcAfter.rename('After')); var lstStack = lstBefore.rename('Before').addBands(lstAfter.rename('After')); var etStack  = etBefore.rename('Before').addBands(etAfter.rename('After'));

    // fvcChart = ui.Chart.image.histogram({image: fvcStack, region: tractGeom, scale: 10, maxPixels: 1e7}).setOptions({title: 'FVC distribution: ' + fromLabel + ' vs ' + toLabel, hAxis: { title: 'FVC distribution: ', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#8FBF73'}, 1: {color: '#1B5E20'} }, legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
    
    fvcChart = ui.Chart.image.histogram({image: fvcStack, region: tractGeom, scale: 10, maxPixels: 1e7}).setOptions({title: 'FVC distribution: ' + fromLabel + ' vs ' + toLabel, hAxis: { title: 'Fractional Vegetation Cover (FVC)', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#8FBF73'}, 1: {color: '#1B5E20'} }, legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});

    // change colors to shallow red (#EF9A9A) and dark red (#B71C1C), and added bar grouping
    lstChart = ui.Chart.image.histogram({image: lstStack, region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({
      title: 'LST distribution: ' + fromLabel + ' vs ' + toLabel, 
      hAxis: { title: 'Temperature (°C)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, 
      vAxis: {title: 'Pixel count'}, 
      series: { 0: {color: '#EF9A9A'}, 1: {color: '#B71C1C'} }, 
      bar: { groupWidth: '100%' }, // Merges the columns visually
      legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });

    // add bucketSize and groupWidth to create the solid "shadow" effect instead of thin pillars
    etChart = ui.Chart.image.histogram({
      image: etStack, 
      region: tractGeom, 
      scale: 30, 
      minBucketWidth: 1.5, // Groups the narrow data points together
      maxPixels: 1e7
    }).setOptions({
      title: 'Water consumption distribution: ' + fromLabel + ' vs ' + toLabel, 
      hAxis: { title: 'Water consumption (mm)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, 
      vAxis: {title: 'Pixel count'}, 
      series: { 0: {color: '#9ecae1'}, 1: {color: '#2171b5'} }, 
      bar: { groupWidth: '100%' }, // Removes empty space between pillars
      legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });

    
  }

  fvcChartHolder.widgets().reset([fvcChart]); lstChartHolder.widgets().reset([lstChart]); etChartHolder.widgets().reset([etChart]);
}




// function updateSidePanel(tract) {
//   state.selectedTract = tract; promptPanel.style().set('shown', false); statsPanel.style().set('shown', true);
  
//   // double-check visibility just in case
//   chartsPanel.style().set('shown', state.dataType !== 'adjusted');

//   var tractGeom = tract.geometry(); var geoid = tract.get('GEOID'); var aland = ee.Number(tract.get('ALAND'));
//   var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

//   if (state.dataType === 'adjusted') {
//     // ── Adjusted / Relative mode: fetch diff band values for the "to" month ──
//     var fvcDiffImg = getVegDiffImage(state.toYear, state.toMonth);
//     var lstDiffImg = getLSTDiffImage(state.toYear, state.toMonth);
//     var etDiffImg  = getETDiffImage(state.toYear, state.toMonth);

//     ee.Dictionary({
//       fDiff: fvcDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('veg_diff'),
//       lDiff: lstDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST_diff_2019'),
//       eDiff: etDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_diff_2019'),
//       aland: aland, geoid: geoid
//     }).evaluate(function(v) {
//       if (!v) { plainEnglish.setValue('Error loading data for this tract.'); return; }
//       var fD = v.fDiff || 0; var lD = v.lDiff || 0; var eD = v.eDiff || 0;
//       var alandSqm = v.aland || 0; var alandAcres = alandSqm / 4046.86;
//       var monthLabel = MONTHS[state.toMonth - 1] + ' ' + state.toYear;

//       statsTitleLabel.setValue('Comparison to 2019');
//       statsGrid2.style().set('shown', false);
//       statsGrid3.style().set('shown', true);

//       cardGreen.name.setValue('Greenness vs 2019');
//       cardGreen.val.setValue((fD * 100).toFixed(1) + '%');
//       cardGreen.delta.setValue(monthLabel + ' vs same month in 2019');
//       cardGreen.delta.style().set('color', fD < 0 ? COLORS.red : COLORS.green);

//       cardTemp.name.setValue('Temperature vs 2019');
//       cardTemp.val.setValue((lD > 0 ? '+' : '') + lD.toFixed(1) + '°C');
//       cardTemp.delta.setValue(monthLabel + ' vs same month in 2019');
//       cardTemp.delta.style().set('color', lD > 0 ? COLORS.red : COLORS.green);

//       cardET.name.setValue('Water vs 2019');
//       cardET.val.setValue((eD > 0 ? '+' : '') + eD.toFixed(1) + ' mm');
//       cardET.delta.setValue(monthLabel + ' vs same month in 2019');
//       cardET.delta.style().set('color', eD > 0 ? COLORS.red : COLORS.green);

//       if (isSameDate) {
//         // Single month: metrics only, no trend to plot
//         trendPanel.widgets().reset([]);
//       } else {
//         // Date range: diff time-series with zero baseline
//         trendPanel.widgets().reset(buildDiffTrendCharts(tractGeom));
//       }

//       tractGeoidLabel.setValue('● Tract ' + (v.geoid || 'Unknown'));
//       tractAreaLabel.setValue('Area: ' + alandAcres.toFixed(1) + ' acres (' + (alandSqm / 1e6).toFixed(2) + ' km²)');
//       tractHeaderPanel.style().set('shown', true); updateHighlightLayer();
//     });

//   } else {
//     // ── Actual data mode: unchanged logic ──
//     var fvcBefore = getFVCImage(state.fromYear, state.fromMonth); var fvcAfter  = getFVCImage(state.toYear, state.toMonth);
//     var lstBefore = getLSTImage(state.fromYear, state.fromMonth); var lstAfter  = getLSTImage(state.toYear, state.toMonth);
//     var etBefore  = getETImage(state.fromYear, state.fromMonth);  var etAfter   = getETImage(state.toYear, state.toMonth);

//     ee.Dictionary({
//       fvcStart: fvcBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'), fvcEnd: fvcAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
//       lstStart: lstBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'), lstEnd: lstAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
//       etStart: etBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'), etEnd: etAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'),
//       aland: aland, geoid: geoid
//     }).evaluate(function(v) {
//       if (!v) { plainEnglish.setValue('Error loading data for this tract.'); return; }
//       var fS = v.fvcStart || 0; var fE = v.fvcEnd || 0; var lS = v.lstStart || 0; var lE = v.lstEnd || 0; var eS = v.etStart || 0; var eE = v.etEnd || 0; var alandSqm = v.aland || 0; var alandAcres = alandSqm / 4046.86;

//       if (isSameDate) {
//         statsTitleLabel.setValue('Monthly summary'); statsGrid2.style().set('shown', false); statsGrid3.style().set('shown', true);
//         cardGreen.name.setValue('Mean greenness (FVC)'); cardGreen.val.setValue(fS.toFixed(3)); cardGreen.delta.setValue('mean value'); cardGreen.delta.style().set('color', COLORS.gray);
//         cardTemp.name.setValue('Surface temperature'); cardTemp.val.setValue(lS.toFixed(1) + '°C'); cardTemp.delta.setValue('mean value'); cardTemp.delta.style().set('color', COLORS.gray);
//         cardET.name.setValue('Water consumption'); cardET.val.setValue(eS.toFixed(1) + ' mm'); cardET.delta.setValue('mean this month'); cardET.delta.style().set('color', COLORS.gray);
//         trendPanel.widgets().reset([]); 
//       } else {
//         statsTitleLabel.setValue('What changed?'); statsGrid2.style().set('shown', true); statsGrid3.style().set('shown', true);
//         var fvcChangePct  = fS > 0 ? ((fE - fS) / fS * 100) : 0; var turfLossAcres = Math.abs(fE - fS) * alandAcres; var lstChange = lE - lS; var fvcAbsChange  = fE - fS; var etChange = eE - eS;
//         cardGreen.name.setValue('Green space change'); cardGreen.val.setValue(fvcChangePct.toFixed(1) + '%'); cardGreen.delta.setValue(turfLossAcres.toFixed(1) + ' acres'); cardGreen.delta.style().set('color', fvcChangePct < 0 ? COLORS.red : COLORS.green);
//         cardTemp.name.setValue('Surface temperature'); cardTemp.val.setValue((lstChange >= 0 ? '+' : '') + lstChange.toFixed(1) + '°C'); cardTemp.delta.setValue('between selected dates'); cardTemp.delta.style().set('color', lstChange > 0 ? COLORS.red : COLORS.green);
//         cardFVC.val.setValue(fvcAbsChange.toFixed(3)); cardFVC.delta.setValue('mean FVC change'); cardFVC.delta.style().set('color', fvcAbsChange < 0 ? COLORS.red : COLORS.green);
//         cardET.name.setValue('Water consumption'); cardET.val.setValue((etChange >= 0 ? '+' : '') + etChange.toFixed(1) + ' mm'); cardET.delta.setValue('mean change'); cardET.delta.style().set('color', etChange < 0 ? COLORS.green : COLORS.red);
//         trendPanel.widgets().reset([]); 
//       }
      
//       tractGeoidLabel.setValue('● Tract ' + (v.geoid || 'Unknown')); tractAreaLabel.setValue('Area: ' + alandAcres.toFixed(1) + ' acres (' + (alandSqm / 1e6).toFixed(2) + ' km²)'); tractHeaderPanel.style().set('shown', true); updateHighlightLayer();
//     });
    
//     updateDistributionCharts(tractGeom);
//   }
// }

function updateSidePanel(tract) {
  state.selectedTract = tract; 
  promptPanel.style().set('shown', false); 
  statsPanel.style().set('shown', true);
  
  // double-check visibility just in case
  chartsPanel.style().set('shown', state.dataType !== 'adjusted');

  // ── NEW FIX: Clear all grids before reassigning widgets ──
  // This prevents the "Widgets can only be added to one panel at a time" error.
  statsGrid1.widgets().reset([]);
  statsGrid2.widgets().reset([]);
  statsGrid3.widgets().reset([]);

  var tractGeom = tract.geometry(); 
  var geoid = tract.get('GEOID'); 
  var aland = ee.Number(tract.get('ALAND'));
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

  if (state.dataType === 'adjusted') {
    // ── Adjusted / Relative mode: fetch diff band values ──
    var fvcDiffImgTo = getVegDiffImage(state.toYear, state.toMonth);
    var lstDiffImgTo = getLSTDiffImage(state.toYear, state.toMonth);
    var etDiffImgTo  = getETDiffImage(state.toYear, state.toMonth);

    // Build the dictionary — include "from" diffs only when date range is selected
    var dictObj = {
      fTo: fvcDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('veg_diff'),
      lTo: lstDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST_diff_2019'),
      eTo: etDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_diff_2019'),
      aland: aland, geoid: geoid
    };
    if (!isSameDate) {
      var fvcDiffImgFrom = getVegDiffImage(state.fromYear, state.fromMonth);
      var lstDiffImgFrom = getLSTDiffImage(state.fromYear, state.fromMonth);
      var etDiffImgFrom  = getETDiffImage(state.fromYear, state.fromMonth);
      dictObj.fFrom = fvcDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('veg_diff');
      dictObj.lFrom = lstDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST_diff_2019');
      dictObj.eFrom = etDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_diff_2019');
    }

    ee.Dictionary(dictObj).evaluate(function(v) {
      if (!v) { plainEnglish.setValue('Error loading data for this tract.'); return; }
      var alandSqm = v.aland || 0; var alandAcres = alandSqm / 4046.86;
      var toLabel   = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
      var fromLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;

      statsTitleLabel.setValue('Comparison to 2019');
      statsGrid1.widgets().reset([cardGreen.panel]);
      statsGrid2.widgets().reset([cardTemp.panel]);
      statsGrid3.widgets().reset([cardET.panel]);
      statsGrid1.style().set('shown', true);
      statsGrid2.style().set('shown', true);
      statsGrid3.style().set('shown', true);

      if (isSameDate) {
        // ── Single month: show "to" diff only ──
        var fD = v.fTo || 0; var lD = v.lTo || 0; var eD = v.eTo || 0;

        cardGreen.name.setValue('Greenness vs 2019');
        cardGreen.val.setValue((fD * 100).toFixed(1) + '%');
        cardGreen.delta.setValue(toLabel + ' vs same month in 2019');
        cardGreen.delta.style().set('color', fD < 0 ? COLORS.red : COLORS.green);

        cardTemp.name.setValue('Temperature vs 2019');
        cardTemp.val.setValue((lD > 0 ? '+' : '') + lD.toFixed(1) + '°C');
        cardTemp.delta.setValue(toLabel + ' vs same month in 2019');
        cardTemp.delta.style().set('color', lD > 0 ? COLORS.red : COLORS.green);

        cardET.name.setValue('Water vs 2019');
        cardET.val.setValue((eD > 0 ? '+' : '') + eD.toFixed(1) + ' mm');
        cardET.delta.setValue(toLabel + ' vs same month in 2019');
        cardET.delta.style().set('color', eD > 0 ? COLORS.red : COLORS.green);

        trendPanel.widgets().reset([]);
      } else {
        // ── Date range: show "from → to" contextual diff ──
        var fFrom = v.fFrom || 0; var fTo = v.fTo || 0;
        var lFrom = v.lFrom || 0; var lTo = v.lTo || 0;
        var eFrom = v.eFrom || 0; var eTo = v.eTo || 0;

        cardGreen.name.setValue('Greenness vs 2019');
        cardGreen.val.setValue((fFrom * 100).toFixed(1) + '% → ' + (fTo * 100).toFixed(1) + '%');
        cardGreen.delta.setValue(fromLabel + ' → ' + toLabel);
        cardGreen.delta.style().set('color', fTo < fFrom ? COLORS.red : COLORS.green);

        cardTemp.name.setValue('Temperature vs 2019');
        cardTemp.val.setValue((lFrom > 0 ? '+' : '') + lFrom.toFixed(1) + '°C → ' + (lTo > 0 ? '+' : '') + lTo.toFixed(1) + '°C');
        cardTemp.delta.setValue(fromLabel + ' → ' + toLabel);
        cardTemp.delta.style().set('color', lTo > lFrom ? COLORS.red : COLORS.green);

        cardET.name.setValue('Water vs 2019');
        cardET.val.setValue((eFrom > 0 ? '+' : '') + eFrom.toFixed(1) + ' → ' + (eTo > 0 ? '+' : '') + eTo.toFixed(1) + ' mm');
        cardET.delta.setValue(fromLabel + ' → ' + toLabel);
        cardET.delta.style().set('color', eTo > eFrom ? COLORS.red : COLORS.green);

        trendPanel.widgets().reset(buildDiffTrendCharts(tractGeom));
      }

      tractGeoidLabel.setValue('● Tract ' + (v.geoid || 'Unknown'));
      tractAreaLabel.setValue('Area: ' + alandAcres.toFixed(1) + ' acres (' + (alandSqm / 1e6).toFixed(2) + ' km²)');
      tractHeaderPanel.style().set('shown', true); updateHighlightLayer();
    });

  } else {
    // ── Actual data mode ──
    // ── NEW FIX: Adjust layout based on whether it is a single month or comparison ──
    if (isSameDate) {
      // Line-by-line layout for single month Actual Data
      statsGrid1.widgets().reset([cardGreen.panel]);
      statsGrid2.widgets().reset([cardTemp.panel]);
      statsGrid3.widgets().reset([cardET.panel]);
    } else {
      // Side-by-side layout for Actual Data date-range comparisons
      statsGrid1.widgets().reset([cardGreen.panel, cardTemp.panel]);
      statsGrid2.widgets().reset([cardFVC.panel]);
      statsGrid3.widgets().reset([cardET.panel]);
    }
    
    var fvcBefore = getFVCImage(state.fromYear, state.fromMonth); var fvcAfter  = getFVCImage(state.toYear, state.toMonth);
    var lstBefore = getLSTImage(state.fromYear, state.fromMonth); var lstAfter  = getLSTImage(state.toYear, state.toMonth);
    var etBefore  = getETImage(state.fromYear, state.fromMonth);  var etAfter   = getETImage(state.toYear, state.toMonth);

    ee.Dictionary({
      fvcStart: fvcBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'), fvcEnd: fvcAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
      lstStart: lstBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'), lstEnd: lstAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
      etStart: etBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'), etEnd: etAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'),
      aland: aland, geoid: geoid
    }).evaluate(function(v) {
      if (!v) { plainEnglish.setValue('Error loading data for this tract.'); return; }
      var fS = v.fvcStart || 0; var fE = v.fvcEnd || 0; var lS = v.lstStart || 0; var lE = v.lstEnd || 0; var eS = v.etStart || 0; var eE = v.etEnd || 0; var alandSqm = v.aland || 0; var alandAcres = alandSqm / 4046.86;

      if (isSameDate) {
        statsTitleLabel.setValue('Monthly summary'); 
        // ── NEW FIX: Ensure grids 1, 2, and 3 are all shown so the temperature card doesn't vanish ──
        statsGrid1.style().set('shown', true); 
        statsGrid2.style().set('shown', true); 
        statsGrid3.style().set('shown', true);

        cardGreen.name.setValue('Mean greenness (FVC)'); cardGreen.val.setValue(fS.toFixed(3)); cardGreen.delta.setValue('mean value'); cardGreen.delta.style().set('color', COLORS.gray);
        cardTemp.name.setValue('Surface temperature'); cardTemp.val.setValue(lS.toFixed(1) + '°C'); cardTemp.delta.setValue('mean value'); cardTemp.delta.style().set('color', COLORS.gray);
        cardET.name.setValue('Water consumption'); cardET.val.setValue(eS.toFixed(1) + ' mm'); cardET.delta.setValue('mean this month'); cardET.delta.style().set('color', COLORS.gray);
        trendPanel.widgets().reset([]); 
      } else {
        statsTitleLabel.setValue('What changed?'); 
        statsGrid1.style().set('shown', true); 
        statsGrid2.style().set('shown', true); 
        statsGrid3.style().set('shown', true);

        var fvcChangePct  = fS > 0 ? ((fE - fS) / fS * 100) : 0; var turfLossAcres = Math.abs(fE - fS) * alandAcres; var lstChange = lE - lS; var fvcAbsChange  = fE - fS; var etChange = eE - eS;
        cardGreen.name.setValue('Green space change'); cardGreen.val.setValue(fvcChangePct.toFixed(1) + '%'); cardGreen.delta.setValue(turfLossAcres.toFixed(1) + ' acres'); cardGreen.delta.style().set('color', fvcChangePct < 0 ? COLORS.red : COLORS.green);
        cardTemp.name.setValue('Surface temperature'); cardTemp.val.setValue((lstChange >= 0 ? '+' : '') + lstChange.toFixed(1) + '°C'); cardTemp.delta.setValue('between selected dates'); cardTemp.delta.style().set('color', lstChange > 0 ? COLORS.red : COLORS.green);
        cardFVC.val.setValue(fvcAbsChange.toFixed(3)); cardFVC.delta.setValue('mean FVC change'); cardFVC.delta.style().set('color', fvcAbsChange < 0 ? COLORS.red : COLORS.green);
        cardET.name.setValue('Water consumption'); cardET.val.setValue((etChange >= 0 ? '+' : '') + etChange.toFixed(1) + ' mm'); cardET.delta.setValue('mean change'); cardET.delta.style().set('color', etChange < 0 ? COLORS.green : COLORS.red);
        trendPanel.widgets().reset([]); 
      }
      
      tractGeoidLabel.setValue('● Tract ' + (v.geoid || 'Unknown')); tractAreaLabel.setValue('Area: ' + alandAcres.toFixed(1) + ' acres (' + (alandSqm / 1e6).toFixed(2) + ' km²)'); tractHeaderPanel.style().set('shown', true); updateHighlightLayer();
    });
    
    updateDistributionCharts(tractGeom);
  }
}



// ─── SECTION 12: COMPARE VIEW ───────────────────────────────────────

var resetCompareBtn = ui.Button('Reset comparison', function() { state.compareTracts = []; updateCompareView(); updateHighlightLayer(); });
resetCompareBtn.style().set({fontSize: '11px', color: '#' + COLORS.red, backgroundColor: '#FFFFFF', margin: '4px 0 8px 0', padding: '6px 8px', border: '2px solid #' + COLORS.red});



// function updateCompareView() {
//   var n = state.compareTracts.length;

//   if (n === 0) { comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('Click a census tract directly on the map to select your first area for comparison.', {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'})]); 
//   compareContent.widgets().reset([]); return; }
//   if (n === 1) { comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('● Tract ' + state.compareTracts[0].geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + state.compareTracts[0].color, padding: '4px 0'}), resetCompareBtn, ui.Label('Click a second tract on the map to compare against.', {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'})]); 
//   compareContent.widgets().reset([]); return; }

//   var tractA = state.compareTracts[0]; var tractB = state.compareTracts[1];
//   var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

//   comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('● Tract ' + tractA.geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + tractA.color, padding: '4px 0 2px 0'}), ui.Label('● Tract ' + tractB.geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + tractB.color, padding: '0 0 8px 0'}), resetCompareBtn]);
//   compareContent.widgets().reset([ui.Label(isSameDate ? 'Calculating differences...' : 'Generating comparison...', {fontSize: '11px', color: '#' + COLORS.gray, fontStyle: 'italic', padding: '12px 0'})]);

//   // updated to check state.dataType instead of state.timeMode
//   if (state.dataType === 'adjusted') {
//       var fvcDiffImg = getVegDiffImage(state.toYear, state.toMonth);
//       var lstDiffImg = getLSTDiffImage(state.toYear, state.toMonth);
//       var etDiffImg  = getETDiffImage(state.toYear, state.toMonth);

//       ee.Dictionary({
//         fA: fvcDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'),
//         fB: fvcDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'),
//         lA: lstDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019'),
//         lB: lstDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019'),
//         eA: etDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019'),
//         eB: etDiffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019')
//       }).evaluate(function(v) {
//         var monthLabel = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
//         var fvcCardA = ui.Panel([ ui.Label('Tract ' + tractA.geoid + ' FVC vs 2019', STYLES.statLabel), ui.Label(((v.fA||0)*100).toFixed(1) + '%', STYLES.statValue) ], null, STYLES.card);
//         var fvcCardB = ui.Panel([ ui.Label('Tract ' + tractB.geoid + ' FVC vs 2019', STYLES.statLabel), ui.Label(((v.fB||0)*100).toFixed(1) + '%', STYLES.statValue) ], null, STYLES.card);
//         var lstCardA = ui.Panel([ ui.Label('Tract ' + tractA.geoid + ' Heat vs 2019', STYLES.statLabel), ui.Label(((v.lA||0)>0?'+':'')+(v.lA||0).toFixed(1) + '°C', STYLES.statValue) ], null, STYLES.card);
//         var lstCardB = ui.Panel([ ui.Label('Tract ' + tractB.geoid + ' Heat vs 2019', STYLES.statLabel), ui.Label(((v.lB||0)>0?'+':'')+(v.lB||0).toFixed(1) + '°C', STYLES.statValue) ], null, STYLES.card);
//         var etCardA  = ui.Panel([ ui.Label('Tract ' + tractA.geoid + ' Water vs 2019', STYLES.statLabel), ui.Label(((v.eA||0)>0?'+':'')+(v.eA||0).toFixed(1) + ' mm', STYLES.statValue) ], null, STYLES.card);
//         var etCardB  = ui.Panel([ ui.Label('Tract ' + tractB.geoid + ' Water vs 2019', STYLES.statLabel), ui.Label(((v.eB||0)>0?'+':'')+(v.eB||0).toFixed(1) + ' mm', STYLES.statValue) ], null, STYLES.card);

//         if (isSameDate) {
//           // Single month + adjusted: stat cards only, no trend
//           compareContent.widgets().reset([
//             ui.Label('Differences vs 2019 for ' + monthLabel, {fontSize: '11px', color: COLORS.gray, padding: '0 0 4px 0'}),
//             ui.Panel([fvcCardA, fvcCardB], ui.Panel.Layout.flow('horizontal')),
//             ui.Panel([lstCardA, lstCardB], ui.Panel.Layout.flow('horizontal')),
//             ui.Panel([etCardA, etCardB], ui.Panel.Layout.flow('horizontal'))
//           ]);
//         } else {
//           // Date range + adjusted: stat cards + diff time-series with zero baseline
//           var charts = buildDiffCompareTrendCharts(tractA, tractB);
//           compareContent.widgets().reset([
//             ui.Label('Differences vs 2019 for ' + monthLabel + ' (trend over selected range below)', {fontSize: '11px', color: COLORS.gray, padding: '0 0 4px 0'}),
//             ui.Panel([fvcCardA, fvcCardB], ui.Panel.Layout.flow('horizontal')),
//             ui.Panel([lstCardA, lstCardB], ui.Panel.Layout.flow('horizontal')),
//             ui.Panel([etCardA, etCardB], ui.Panel.Layout.flow('horizontal')),
//             charts[0], charts[1], charts[2]
//           ]);
//         }
//       });
      
//   } else if (isSameDate) {
//     var fvcImg = getFVCImage(state.fromYear, state.fromMonth); var lstImg = getLSTImage(state.fromYear, state.fromMonth); var etImg  = getETImage(state.fromYear, state.fromMonth);
//     ee.Dictionary({
//       fA: fvcImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('FVC'), fB: fvcImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('FVC'),
//       lA: lstImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('LST'), lB: lstImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('LST'),
//       eA: etImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('et_actual'), eB: etImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('et_actual')
//     }).evaluate(function(v) {
//       if (!v) return;
//       var fvcDiff = (v.fB || 0) - (v.fA || 0); 
//       var lstDiff = (v.lB || 0) - (v.lA || 0); 
//       var etDiff  = (v.eB || 0) - (v.eA || 0);

// // Helper function to build the colored subtitle
//       var makeCompareSubtitle = function() {
//         return ui.Panel([
//           ui.Label(tractB.geoid, {fontSize: '11px', fontWeight: 'bold', color: '#' + tractB.color, margin: '0 4px 0 0'}),
//           ui.Label('minus', {fontSize: '11px', color: '#' + COLORS.gray, margin: '0 4px 0 0'}),
//           ui.Label(tractA.geoid, {fontSize: '11px', fontWeight: 'bold', color: '#' + tractA.color, margin: '0'})
//         ], ui.Panel.Layout.flow('horizontal'), {margin: '4px 0 0 0'}); 
//       };

//       var fvcCard = ui.Panel([ui.Label('FVC Difference', STYLES.statLabel), ui.Label((fvcDiff > 0 ? '+' : '') + fvcDiff.toFixed(3), STYLES.statValue), makeCompareSubtitle()], null, STYLES.card);
//       var lstCard = ui.Panel([ui.Label('Temp Difference', STYLES.statLabel), ui.Label((lstDiff > 0 ? '+' : '') + lstDiff.toFixed(1) + '°C', STYLES.statValue), makeCompareSubtitle()], null, STYLES.card);
//       var etCard  = ui.Panel([ui.Label('Water Consumption Difference', STYLES.statLabel), ui.Label((etDiff > 0 ? '+' : '') + etDiff.toFixed(1) + ' mm', STYLES.statValue), makeCompareSubtitle()], null, STYLES.card);
      
//     //   compareContent.widgets().set(0, ui.Label('Comparison for ' + MONTHS[state.fromMonth - 1] + ' ' + state.fromYear + '.', {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 8px 0'}));
//     //   compareContent.add(ui.Panel([fvcCard, lstCard], ui.Panel.Layout.flow('horizontal'))); 
//     //   compareContent.add(ui.Panel([etCard], ui.Panel.Layout.flow('horizontal')));
//       compareContent.widgets().set(0, ui.Label('Comparison for ' + MONTHS[state.fromMonth - 1] + ' ' + state.fromYear + '.', {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 8px 0'}));
//       // Group all three cards in a single horizontal panel
//       compareContent.add(ui.Panel([fvcCard, lstCard, etCard], ui.Panel.Layout.flow('vertical')));
//     });
    
//   } else {
//     // For Actual Data + Date Range: Restore the standard continuous trend charts
//     var chartPanels = makeCompareTrendCharts(tractA, tractB);
//     compareContent.widgets().reset([
//       ui.Label('Overlay monthly trends for the two selected tracts over the selected date range.', {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 8px 0'}),
//       chartPanels[0], chartPanels[1], chartPanels[2]
//     ]);
//   }
// }

function updateCompareView() {
  var n = state.compareTracts.length;

  if (n === 0) { comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('Click a census tract directly on the map to select your first area for comparison.', {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'})]); 
  compareContent.widgets().reset([]); return; }
  if (n === 1) { comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('● Tract ' + state.compareTracts[0].geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + state.compareTracts[0].color, padding: '4px 0'}), resetCompareBtn, ui.Label('Click a second tract on the map to compare against.', {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'})]); 
  compareContent.widgets().reset([]); return; }

  var tractA = state.compareTracts[0]; var tractB = state.compareTracts[1];
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

  comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('● Tract ' + tractA.geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + tractA.color, padding: '4px 0 2px 0'}), ui.Label('● Tract ' + tractB.geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + tractB.color, padding: '0 0 8px 0'}), resetCompareBtn]);
  compareContent.widgets().reset([ui.Label(isSameDate ? 'Calculating differences...' : 'Generating comparison...', {fontSize: '11px', color: '#' + COLORS.gray, fontStyle: 'italic', padding: '12px 0'})]);

  if (state.dataType === 'adjusted') {
      var fvcDiffImgTo = getVegDiffImage(state.toYear, state.toMonth);
      var lstDiffImgTo = getLSTDiffImage(state.toYear, state.toMonth);
      var etDiffImgTo  = getETDiffImage(state.toYear, state.toMonth);

      // Build dictionary — add "from" diffs when date range is selected
      var dictObj = {
        fATo: fvcDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'),
        fBTo: fvcDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'),
        lATo: lstDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019'),
        lBTo: lstDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019'),
        eATo: etDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019'),
        eBTo: etDiffImgTo.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019')
      };
      if (!isSameDate) {
        var fvcDiffImgFrom = getVegDiffImage(state.fromYear, state.fromMonth);
        var lstDiffImgFrom = getLSTDiffImage(state.fromYear, state.fromMonth);
        var etDiffImgFrom  = getETDiffImage(state.fromYear, state.fromMonth);
        dictObj.fAFrom = fvcDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff');
        dictObj.fBFrom = fvcDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff');
        dictObj.lAFrom = lstDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019');
        dictObj.lBFrom = lstDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('LST_diff_2019');
        dictObj.eAFrom = etDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019');
        dictObj.eBFrom = etDiffImgFrom.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('et_diff_2019');
      }

      ee.Dictionary(dictObj).evaluate(function(v) {
        var toLabel   = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
        var fromLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
        
        // Card builder that handles both single-month and from→to range
        var makeAdjustedCard = function(tractObj, metricLabel, valFrom, valTo, valFormatter, isReverseColor) {
            var toSafe   = valTo || 0;
            var fromSafe = valFrom || 0;
            var isRange  = !isSameDate;
            
            var titleRow = ui.Panel([
                ui.Label('Tract ' + tractObj.geoid, {fontSize: '11px', fontWeight: 'bold', color: '#' + tractObj.color, margin: '0 4px 0 0'}),
                ui.Label(metricLabel + ' vs 2019', {fontSize: '11px', color: '#' + COLORS.gray, margin: '0'})
            ], ui.Panel.Layout.flow('horizontal'), {margin: '0 0 6px 0'});

            // Value: single or from → to
            var valText = isRange
              ? valFormatter(fromSafe) + ' → ' + valFormatter(toSafe)
              : valFormatter(toSafe);
            var valLabel = ui.Label(valText, STYLES.statValue);
            
            // Color logic: for range, based on trajectory (getting worse?); for single, based on sign
            var deltaColor;
            if (isRange) {
              deltaColor = isReverseColor
                ? (toSafe > fromSafe ? COLORS.red : COLORS.green)
                : (toSafe < fromSafe ? COLORS.red : COLORS.green);
            } else {
              deltaColor = isReverseColor
                ? (toSafe > 0 ? COLORS.red : COLORS.green)
                : (toSafe < 0 ? COLORS.red : COLORS.green);
            }
            
            var subtextLabel = ui.Label(
              isRange ? fromLabel + ' → ' + toLabel : toLabel + ' vs same month in 2019',
              {fontSize: '11px', color: '#' + deltaColor, margin: '4px 0 0 0'}
            );
            
            return ui.Panel([titleRow, valLabel, subtextLabel], null, STYLES.card);
        };

        var fmtFVC = function(x){ return (x * 100).toFixed(1) + '%'; };
        var fmtLST = function(x){ return (x > 0 ? '+' : '') + x.toFixed(1) + '°C'; };
        var fmtET  = function(x){ return (x > 0 ? '+' : '') + x.toFixed(1) + ' mm'; };

        var fvcCardA = makeAdjustedCard(tractA, 'Greenness', v.fAFrom, v.fATo, fmtFVC, false);
        var fvcCardB = makeAdjustedCard(tractB, 'Greenness', v.fBFrom, v.fBTo, fmtFVC, false);
        var lstCardA = makeAdjustedCard(tractA, 'Temperature', v.lAFrom, v.lATo, fmtLST, true);
        var lstCardB = makeAdjustedCard(tractB, 'Temperature', v.lBFrom, v.lBTo, fmtLST, true);
        var etCardA  = makeAdjustedCard(tractA, 'Water', v.eAFrom, v.eATo, fmtET, true);
        var etCardB  = makeAdjustedCard(tractB, 'Water', v.eBFrom, v.eBTo, fmtET, true);

        if (isSameDate) {
          compareContent.widgets().reset([
            ui.Label('Differences vs 2019 for ' + toLabel, {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 4px 0'}),
            ui.Panel([fvcCardA, fvcCardB, lstCardA, lstCardB, etCardA, etCardB], ui.Panel.Layout.flow('vertical'))
          ]);
        } else {
          var charts = buildDiffCompareTrendCharts(tractA, tractB);
          compareContent.widgets().reset([
            ui.Label('Change vs 2019 baseline: ' + fromLabel + ' → ' + toLabel, {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 4px 0'}),
            ui.Panel([fvcCardA, fvcCardB, lstCardA, lstCardB, etCardA, etCardB], ui.Panel.Layout.flow('vertical')),
            charts[0], charts[1], charts[2]
          ]);
        }
      });
      
  } else if (isSameDate) {
    var fvcImg = getFVCImage(state.fromYear, state.fromMonth); var lstImg = getLSTImage(state.fromYear, state.fromMonth); var etImg  = getETImage(state.fromYear, state.fromMonth);
    ee.Dictionary({
      fA: fvcImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('FVC'), fB: fvcImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('FVC'),
      lA: lstImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('LST'), lB: lstImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('LST'),
      eA: etImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('et_actual'), eB: etImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('et_actual')
    }).evaluate(function(v) {
      if (!v) return;
      var fvcDiff = (v.fB || 0) - (v.fA || 0); 
      var lstDiff = (v.lB || 0) - (v.lA || 0); 
      var etDiff  = (v.eB || 0) - (v.eA || 0);

      var makeCompareSubtitle = function() {
        return ui.Panel([
          ui.Label(tractB.geoid, {fontSize: '11px', fontWeight: 'bold', color: '#' + tractB.color, margin: '0 4px 0 0'}),
          ui.Label('minus', {fontSize: '11px', color: '#' + COLORS.gray, margin: '0 4px 0 0'}),
          ui.Label(tractA.geoid, {fontSize: '11px', fontWeight: 'bold', color: '#' + tractA.color, margin: '0'})
        ], ui.Panel.Layout.flow('horizontal'), {margin: '4px 0 0 0'}); 
      };

      var fvcCard = ui.Panel([ui.Label('FVC Difference', STYLES.statLabel), ui.Label((fvcDiff > 0 ? '+' : '') + fvcDiff.toFixed(3), STYLES.statValue), makeCompareSubtitle()], null, STYLES.card);
      var lstCard = ui.Panel([ui.Label('Temp Difference', STYLES.statLabel), ui.Label((lstDiff > 0 ? '+' : '') + lstDiff.toFixed(1) + '°C', STYLES.statValue), makeCompareSubtitle()], null, STYLES.card);
      var etCard  = ui.Panel([ui.Label('Water Consumption Difference', STYLES.statLabel), ui.Label((etDiff > 0 ? '+' : '') + etDiff.toFixed(1) + ' mm', STYLES.statValue), makeCompareSubtitle()], null, STYLES.card);
      
      compareContent.widgets().set(0, ui.Label('Comparison for ' + MONTHS[state.fromMonth - 1] + ' ' + state.fromYear + '.', {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 8px 0'}));
      compareContent.add(ui.Panel([fvcCard, lstCard, etCard], ui.Panel.Layout.flow('vertical')));
    });
    
  } else {
    var chartPanels = makeCompareTrendCharts(tractA, tractB);
    compareContent.widgets().reset([
      ui.Label('Overlay monthly trends for the two selected tracts over the selected date range.', {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 8px 0'}),
      chartPanels[0], chartPanels[1], chartPanels[2]
    ]);
  }
}



// Define containers referenced in functions
var trendPanel = ui.Panel([], null, STYLES.section);

// Split the explore panel so controls can sit between the selection and the charts
var exploreTop = ui.Panel([promptPanel, tractHeaderPanel]);
var exploreBottom = ui.Panel([statsPanel, chartsPanel, trendPanel]);

var comparePromptPanel = ui.Panel([], null, STYLES.section);
var compareContent = ui.Panel([], null, STYLES.section);

var aboutContent = ui.Panel([
  makeSectionTitle('About the Tracker'),
  ui.Label('This tool allows users to explore changes in urban green space, surface temperature, and water consumption across the Las Vegas Valley over time.', STYLES.body)
], null, STYLES.section);

// Assemble the left sidebar in the new requested order
var leftSidebar = ui.Panel([
  headerPanel,           // "LV turf tracker"
  tabRow,                // Explore/Compare/About tabs
  instructionPanel,      // "How to use"
  exploreTop,            // "Select a tract" (Shows in Explore tab)
  comparePromptPanel,    // "Compare areas" (Shows in Compare tab) <--- MOVED UP HERE
  controlsPanel,         // "Map controls"
  analysisPanel,         // "Analysis settings"
  exploreBottom,         // Stats/trends (Explore tab)
  compareContent,        // Stats/trends (Compare tab)
  aboutContent           // About tab
], ui.Panel.Layout.flow('vertical'), {width: '400px', backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid});


// ─── SECTION 13: APP ASSEMBLY ───────────────────────────────────────

var contentRow = ui.Panel([leftSidebar, mapContainer], ui.Panel.Layout.flow('horizontal'), {stretch: 'both'});
ui.root.widgets().reset([contentRow]);

// ─── SECTION 14: INIT ───────────────────────────────────────────────

styleTabButton(tabExplore, true); styleTabButton(tabCompare, false); styleTabButton(tabAbout, false);
setActiveTab('explore'); updateTimeModeUI(); updateLayerPills(); refreshMap();

print('─── Las Vegas Valley Turf Tracker loaded ───');
print('Click a census tract on the map to view statistics.');
print('Change months with the dropdowns. Toggle split view on/off.');