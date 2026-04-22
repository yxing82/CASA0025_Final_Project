// ═══════════════════════════════════════════════════════════════════════
// LAS VEGAS VALLEY TURF TRACKER — UI FRAMEWORK v29
// Add seasonal comparison ("veg_diff") & dynamic UI config
// ═══════════════════════════════════════════════════════════════════════

// ─── NEW: CONFIGURATION OBJECT ──────────────────────────────────────
// Control which layers support the 2019 Baseline view.
var LAYER_CONFIG = {
  greenspace:  { hasBaseline2019: true },
  temperature: { hasBaseline2019: false }, // Change to true when lst_diff is ready!
  water:       { hasBaseline2019: false }, // Change to true when water_diff is ready!
  satellite:   { hasBaseline2019: false }
};

// ─── SECTION 0: STYLES & CONSTANTS ──────────────────────────────────

var COLORS = {
  primary:     '1B5E8A',
  primaryDark: '124261',
  green:       '3B6D11',
  greenLight:  'E2F0D5',
  greenMid:    '97C459',
  orange:      'D85A30',
  red:         'A32D2D',
  gray:        '888888',
  grayMid:     'DADADA',
  grayLight:   'F5F5F5',
  grayPanel:   'FAFAFA',
  white:       'FFFFFF',
  black:       '333333',
  blue:        '378ADD',
  coral:       'D85A30'
};

var UI_COLORS = {
  activeFill:     '#' + COLORS.primary,
  activeText:     '#FFFFFF',
  inactiveFill:   '#FFFFFF',
  inactiveText:   '#' + COLORS.black
};

var STYLES = {
  appTitle:   {fontSize: '18px', fontWeight: 'bold', color: COLORS.primary},
  title:      {fontSize: '15px', fontWeight: 'bold', color: COLORS.primary},
  subtitle:   {fontSize: '13px', fontWeight: 'bold', color: COLORS.black},
  body:       {fontSize: '12px', color: COLORS.black},
  muted:      {fontSize: '11px', color: COLORS.gray},
  statValue:  {fontSize: '20px', fontWeight: 'bold', color: COLORS.black},
  statLabel:  {fontSize: '11px', color: COLORS.gray},
  card: {
    backgroundColor: COLORS.white,
    padding: '10px',
    margin: '4px',
    border: '1px solid #' + COLORS.grayMid,
    stretch: 'horizontal'
  },
  section: {
    backgroundColor: COLORS.grayPanel,
    padding: '12px',
    margin: '0 0 8px 0',
    border: '1px solid #' + COLORS.grayMid,
    stretch: 'horizontal'
  }
};


// ─── SECTION 1: DATA LOADING ────────────────────────────────────────

var lasvegas_boundary = ee.FeatureCollection(
  'projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary'
);
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


// ─── SECTION 2: CLOUD MASKING & PROCESSING ──────────────────────────

var s2_vis = { min: 0.0, max: 0.3, bands: ['B4', 'B3', 'B2'] };

var lst_vis = {
  min: 20, max: 60,
  palette: ['#313695','#4575B4','#ABD9E9','#00A6FF','#00CC66','#FFFF00','#FFA500','#FF0000','#A50026']
};

var fvc_vis = {
  min: 0, max: 0.7,
  palette: ['#F5F5DC','#C5E1A5','#66BB6A','#2E7D32','#1B5E20']
};

var et_vis = {
  min: 0, max: 150,
  palette: ['#ffffff','#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#4292c6','#2171b5','#084594']
};

var et_diff_vis = {
  min: -45, max: 45,
  palette: ['#2c7bb6','#abd9e9','#ffffbf','#fdae61','#d7191c']
};

var fvc_diff_vis = {
  min: -0.15, max: 0.06,
  palette: ['#A50026','#F46D43','#FEE090','#E0F3DB','#1B7837']
};

var lst_diff_vis = {
  min: -3.5, max: 3.5,
  palette: ['#2C7BB6','#ABD9E9','#FFFFBF','#FDAE61','#D7191C']
};


// ─── SECTION 3: COMPOSITE FUNCTIONS ─────────────────────────────────

function getS2Composite(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  return s2Collection.filterDate(start, end).first().clip(roi);
}

function getFVCImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  return turfCollection.filterDate(start, end).first().select(['veg'], ['FVC']).clip(roi);
}

function getVegDiffImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  return turfCollection.filterDate(start, end).first().select(['veg_diff']).clip(roi);
}

function getLSTImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var img = lstCollection.filterDate(start, end).first();
  return img.select([0], ['LST']).clip(roi);
}

function getETImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  return etCollection.filterDate(start, end).first().select(['et_actual']).clip(roi);
}


// ─── SECTION 3A: MONTHLY TIMESERIES HELPERS ─────────────────────────

function getOrderedDateRange() {
  var fromDate = ee.Date.fromYMD(state.fromYear, state.fromMonth, 1);
  var toDate   = ee.Date.fromYMD(state.toYear, state.toMonth, 1);

  var start = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), fromDate, toDate));
  var end   = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), toDate, fromDate));

  return { start: start, end: end };
}

function updateTrendCharts(tractGeom) {
  var range = getOrderedDateRange();
  var startDate = range.start;
  var endDate   = range.end;

  var monthCount = endDate.difference(startDate, 'month').round();
  var months = ee.List.sequence(0, monthCount);

  var monthlyTable = ee.FeatureCollection(
    months.map(function(m) {
      m = ee.Number(m);
      var monthStart = startDate.advance(m, 'month');
      var monthEnd   = monthStart.advance(1, 'month');

      var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
      var fvcMean = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg').rename('FVC').reduceRegion({
        reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2
      }).get('FVC'), null);

      var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
      var lstMean = ee.Algorithms.If(lstImg, ee.Image(lstImg).select([0], ['LST']).reduceRegion({
        reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2
      }).get('LST'), null);

      var etImg = etCollection.filterDate(monthStart, monthEnd).first();
      var etMean = ee.Algorithms.If(etImg, ee.Image(etImg).select(['et_actual']).reduceRegion({
        reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2
      }).get('et_actual'), null);

      return ee.Feature(null, {
        'date': monthStart.format('YYYY-MM'),
        'system:time_start': monthStart.millis(),
        'FVC': fvcMean,
        'LST': lstMean,
        'ET': etMean 
      });
    })
  );

  var sortedTable = monthlyTable.sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({features: sortedTable, xProperty: 'date', yProperties: ['FVC']})
    .setChartType('LineChart').setOptions({
      title: 'Monthly FVC trend',
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'Mean FVC / NDVI proxy', viewWindow: {min: -1, max: 1}},
      legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, colors: ['#2E7D32'],
      chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11
    });

  var lstChart = ui.Chart.feature.byFeature({features: sortedTable, xProperty: 'date', yProperties: ['LST']})
    .setChartType('LineChart').setOptions({
      title: 'Monthly LST trend',
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'Mean surface temperature (°C)', viewWindow: {min: 15, max: 70}},
      legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, colors: ['#D85A30'],
      chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11
    });

  var etChart = ui.Chart.feature.byFeature({features: sortedTable, xProperty: 'date', yProperties: ['ET']})
    .setChartType('LineChart').setOptions({
      title: 'Monthly Water Consumption trend',
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'Mean water consumption estimation (mm)', viewWindow: {min: 0, max: 200}},
      legend: {position: 'none'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, colors: ['#2171b5'],
      chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11
    });

  trendPanel.widgets().reset([
    ui.Label('Trend over time', STYLES.subtitle),
    ui.Label('Monthly mean values for the selected tract over the selected date range.', {fontSize: '11px', color: COLORS.gray, margin: '0 0 6px 0'}),
    ui.Panel([fvcChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'}),
    ui.Panel([lstChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'}),
    ui.Panel([etChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'})
  ]);
}

function buildCompareMonthlyTable(tractGeomA, tractGeomB) {
  var range = getOrderedDateRange();
  var startDate = range.start;
  var endDate   = range.end;

  var monthCount = endDate.difference(startDate, 'month').round();
  var months = ee.List.sequence(0, monthCount);

  return ee.FeatureCollection(
    months.map(function(m) {
      m = ee.Number(m);
      var monthStart = startDate.advance(m, 'month');
      var monthEnd   = monthStart.advance(1, 'month');

      var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
      var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();

      var fvcA = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg').rename('FVC').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomA, scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('FVC'), null);
      var fvcB = ee.Algorithms.If(fvcImg, ee.Image(fvcImg).select('veg').rename('FVC').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomB, scale: 10, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('FVC'), null);

      var lstA = ee.Algorithms.If(lstImg, ee.Image(lstImg).select([0], ['LST']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomA, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST'), null);
      var lstB = ee.Algorithms.If(lstImg, ee.Image(lstImg).select([0], ['LST']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomB, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('LST'), null);

      var etImg2 = etCollection.filterDate(monthStart, monthEnd).first();
      var etA = ee.Algorithms.If(etImg2, ee.Image(etImg2).select(['et_actual']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomA, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_actual'), null);
      var etB = ee.Algorithms.If(etImg2, ee.Image(etImg2).select(['et_actual']).reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeomB, scale: 30, bestEffort: true, maxPixels: 1e7, tileScale: 2}).get('et_actual'), null);

      return ee.Feature(null, {
        'date': monthStart.format('YYYY-MM'), 'system:time_start': monthStart.millis(),
        'FVC_A': fvcA, 'FVC_B': fvcB, 'LST_A': lstA, 'LST_B': lstB, 'ET_A': etA, 'ET_B': etB
      });
    })
  );
}

function makeCompareTrendCharts(tractA, tractB) {
  var geoidA = tractA.geoid; var geoidB = tractB.geoid;
  var colorA = '#' + tractA.color; var colorB = '#' + tractB.color;
  var table = buildCompareMonthlyTable(tractA.feature.geometry(), tractB.feature.geometry()).sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({features: table, xProperty: 'date', yProperties: ['FVC_A', 'FVC_B']})
    .setChartType('LineChart').setOptions({
      title: 'Monthly Greenness Trend\nTract ' + geoidA + ' vs Tract ' + geoidB,
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'Mean NDVI proxy', viewWindow: {min: 0, max: 0.3}},
      legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true,
      series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}},
      chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11
    });

  var lstChart = ui.Chart.feature.byFeature({features: table, xProperty: 'date', yProperties: ['LST_A', 'LST_B']})
    .setChartType('LineChart').setOptions({
      title: 'Monthly Land Surface Temperature\nTract ' + geoidA + ' vs Tract ' + geoidB,
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'LST Celsius', viewWindow: {min: 15, max: 70}},
      legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true,
      series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}},
      chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11
    });

  var etCompareChart = ui.Chart.feature.byFeature({features: table, xProperty: 'date', yProperties: ['ET_A', 'ET_B']})
    .setChartType('LineChart').setOptions({
      title: 'Monthly Water Consumption\nTract ' + geoidA + ' vs Tract ' + geoidB,
      hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}},
      vAxis: {title: 'Mean water consumption (mm)', viewWindow: {min: 0, max: 200}},
      legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true,
      series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}},
      chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11
    });

  return [
    ui.Panel([fvcChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'}),
    ui.Panel([lstChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'}),
    ui.Panel([etCompareChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'})
  ];
}


// ─── SECTION 3B: NEW BASELINE CHARTING FUNCTIONS ────────────────────

function buildBaselineTrendChart(tractGeom, targetYear) {
  var months = ee.List.sequence(1, 12);
  
  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m);
    var s2019 = ee.Date.fromYMD(2019, m, 1);
    var sTarg = ee.Date.fromYMD(targetYear, m, 1);
    
    var img2019 = turfCollection.filterDate(s2019, s2019.advance(1, 'month')).first();
    var imgTarg = turfCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();

    var val2019 = ee.Algorithms.If(img2019, ee.Image(img2019).select('veg').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('veg'), null);
    var valTarg = ee.Algorithms.If(imgTarg, ee.Image(imgTarg).select('veg').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('veg'), null);

    return ee.Feature(null, {
      'month_index': m, 'month_label': s2019.format('MMM'),
      'FVC_2019': val2019, 'FVC_Target': valTarg
    });
  }));

  var chart = ui.Chart.feature.byFeature({features: monthlyTable, xProperty: 'month_label', yProperties: ['FVC_2019', 'FVC_Target']})
    .setChartType('LineChart').setOptions({
      title: 'Yearly Trend: 2019 vs ' + targetYear,
      vAxis: {title: 'Mean FVC'}, hAxis: {title: 'Month'},
      series: { 0: {color: COLORS.gray, lineDashStyle: [4, 4], labelInLegend: '2019 Baseline'}, 1: {color: COLORS.green, labelInLegend: targetYear} },
      lineWidth: 3, pointSize: 0, chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11, legend: {position: 'top'}
    });
  
  return ui.Panel([chart], null, {backgroundColor: '#FFF', border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
}

function buildBaselineCompareTrendChart(tractA, tractB, targetYear) {
  var months = ee.List.sequence(1, 12);
  
  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m);
    var sTarg = ee.Date.fromYMD(targetYear, m, 1);
    var diffImg = turfCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();

    var diffA = ee.Algorithms.If(diffImg, ee.Image(diffImg).select('veg_diff').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'), null);
    var diffB = ee.Algorithms.If(diffImg, ee.Image(diffImg).select('veg_diff').reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'), null);

    return ee.Feature(null, {
      'month_index': m, 'month_label': sTarg.format('MMM'), 'Diff_A': diffA, 'Diff_B': diffB
    });
  }));

  var chart = ui.Chart.feature.byFeature({features: monthlyTable, xProperty: 'month_label', yProperties: ['Diff_A', 'Diff_B']})
    .setChartType('LineChart').setOptions({
      title: targetYear + ' vs 2019 Baseline Difference Trajectory',
      vAxis: {title: 'FVC Difference vs 2019'}, hAxis: {title: 'Month'},
      series: { 0: {color: '#' + tractA.color, labelInLegend: 'Tract ' + tractA.geoid}, 1: {color: '#' + tractB.color, labelInLegend: 'Tract ' + tractB.geoid} },
      lineWidth: 3, pointSize: 0, chartArea: {left: 60, top: 40, width: '78%', height: '58%'}, fontSize: 11, legend: {position: 'top'}
    });
  
  return ui.Panel([chart], null, {backgroundColor: '#FFF', border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
}


// ─── SECTION 4: APP STATE ───────────────────────────────────────────

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026'];

var state = {
  currentView:   'explore',
  activeLayer:   'greenspace',
  timeMode:      'compare', // can be 'single', 'compare', or 'baseline2019'
  splitEnabled:  true,
  fromYear:  2020, fromMonth: 6,
  toYear:    2023, toMonth:   6,
  selectedTract: null,
  compareTracts: []
};


// ─── SECTION 5: UI HELPERS ──────────────────────────────────────────

function makeSectionTitle(text) { return ui.Label(text, STYLES.subtitle); }
function makeSeparator() { return ui.Panel(null, null, {height: '1px', backgroundColor: '#' + COLORS.grayMid, margin: '8px 0'}); }

function makeStatCard(label) {
  var valLabel   = ui.Label('—', STYLES.statValue);
  var nameLabel  = ui.Label(label, STYLES.statLabel);
  var deltaLabel = ui.Label('', {fontSize: '11px'});
  var card = ui.Panel([nameLabel, valLabel, deltaLabel], null, STYLES.card);
  return {panel: card, name: nameLabel, val: valLabel, delta: deltaLabel};
}

function styleTabButton(btn, active) {
  btn.style().set({
    backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill, color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText,
    border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid,
    padding: '8px 16px', margin: '0 6px 0 0', fontSize: '12px', fontWeight: active ? 'bold' : 'normal'
  });
}

function stylePillButton(btn, active) {
  btn.style().set({
    backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill, color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText,
    border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid,
    padding: '6px 12px', margin: '2px 6px 2px 0', fontSize: '11px', fontWeight: active ? 'bold' : 'normal'
  });
}


// ─── SECTION 6: MAPS ────────────────────────────────────────────────

ui.root.clear();

var leftMap = ui.Map();
var rightMap = ui.Map();

[leftMap, rightMap].forEach(function(m) {
  m.setControlVisibility({all: false, zoomControl: true, scaleControl: true, mapTypeControl: true});
  m.setOptions('Custom', {Custom: [{stylers: [{saturation: -75}]}, {featureType: 'poi', stylers: [{visibility: 'off'}]}, {featureType: 'transit', stylers: [{visibility: 'off'}]}]});
});

var mapLinker = ui.Map.Linker([leftMap, rightMap]);

var leftDateLabel = ui.Label('Jun 2020', {
  fontSize: '15px', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.95)',
  padding: '6px 14px', position: 'top-left', border: '1px solid rgba(0,0,0,0.12)'
});

var rightDateLabel = ui.Label('Jun 2023', {
  fontSize: '15px', fontWeight: 'bold', backgroundColor: 'rgba(255,255,255,0.95)',
  padding: '6px 14px', position: 'top-right', border: '1px solid rgba(0,0,0,0.12)'
});

leftMap.add(leftDateLabel);
rightMap.add(rightDateLabel);

var splitPanel = ui.SplitPanel({firstPanel: leftMap, secondPanel: rightMap, orientation: 'horizontal', wipe: true, style: {stretch: 'both'}});
var mapContainer = ui.Panel([splitPanel], null, {stretch: 'both', backgroundColor: '#' + COLORS.white});


// ─── SECTION 6A: MAP LEGENDS ────────────────────────────────────────

function makeLSTLegend(position) {
  var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}});
  legend.add(ui.Label('LST variation °C', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'}));
  legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: lst_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}}));
  legend.add(ui.Panel([ui.Label(String(lst_vis.min), {fontSize: '12px', margin: '0'}), ui.Label('40', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label(String(lst_vis.max), {fontSize: '12px', margin: '0'})], ui.Panel.Layout.flow('horizontal')));
  return legend;
}

function makeFVCLegend(position) {
  var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}});
  legend.add(ui.Label('Greenness (FVC)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'}));
  legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: fvc_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}}));
  legend.add(ui.Panel([ui.Label('0', {fontSize: '11px', margin: '0'}), ui.Label('0.35', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('0.7', {fontSize: '11px', margin: '0'})], ui.Panel.Layout.flow('horizontal')));
  return legend;
}

function makeETLegend(position) {
  var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}});
  legend.add(ui.Label('Water consumption (mm)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'}));
  legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: et_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}}));
  legend.add(ui.Panel([ui.Label('0 mm', {fontSize: '12px', margin: '0'}), ui.Label('75', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('150 mm', {fontSize: '12px', margin: '0'})], ui.Panel.Layout.flow('horizontal')));
  return legend;
}

var leftFVCLegend  = makeFVCLegend('bottom-left'); var rightFVCLegend = makeFVCLegend('bottom-left');
var leftLSTLegend  = makeLSTLegend('bottom-left'); var rightLSTLegend = makeLSTLegend('bottom-left');
var leftETLegend   = makeETLegend('bottom-left');  var rightETLegend  = makeETLegend('bottom-left');

leftMap.add(leftFVCLegend); rightMap.add(rightFVCLegend);
leftMap.add(leftLSTLegend); rightMap.add(rightLSTLegend);
leftMap.add(leftETLegend);  rightMap.add(rightETLegend);

function makeETDiffLegend(position) {
  var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}});
  legend.add(ui.Label('Water consumption change (mm)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'}));
  legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: et_diff_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}}));
  legend.add(ui.Panel([ui.Label('-45 mm', {fontSize: '12px', margin: '0', color: COLORS.blue}), ui.Label('0', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('+45 mm', {fontSize: '11px', margin: '0', color: COLORS.coral})], ui.Panel.Layout.flow('horizontal')));
  return legend;
}

function makeFVCDiffLegend(position) {
  var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}});
  legend.add(ui.Label('Greenness change (FVC)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'}));
  legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: fvc_diff_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}}));
  legend.add(ui.Panel([ui.Label('-0.15', {fontSize: '12px', margin: '0', color: COLORS.red}), ui.Label('0', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('+0.06', {fontSize: '12px', margin: '0', color: COLORS.green})], ui.Panel.Layout.flow('horizontal')));
  return legend;
}

function makeLSTDiffLegend(position) {
  var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}});
  legend.add(ui.Label('Temperature change (°C)', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'}));
  legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: lst_diff_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}}));
  legend.add(ui.Panel([ui.Label('-3.5°C', {fontSize: '12px', margin: '0', color: COLORS.blue}), ui.Label('0', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label('+3.5°C', {fontSize: '12px', margin: '0', color: COLORS.red})], ui.Panel.Layout.flow('horizontal')));
  return legend;
}

var leftETDiffLegend  = makeETDiffLegend('bottom-left');  var rightETDiffLegend = makeETDiffLegend('bottom-left');
var leftFVCDiffLegend = makeFVCDiffLegend('bottom-left'); var rightFVCDiffLegend = makeFVCDiffLegend('bottom-left');
var leftLSTDiffLegend = makeLSTDiffLegend('bottom-left'); var rightLSTDiffLegend = makeLSTDiffLegend('bottom-left');

leftMap.add(leftETDiffLegend);  rightMap.add(rightETDiffLegend);
leftMap.add(leftFVCDiffLegend); rightMap.add(rightFVCDiffLegend);
leftMap.add(leftLSTDiffLegend); rightMap.add(rightLSTDiffLegend);

function updateLegendVisibility() {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var actuallySplit = state.splitEnabled && (!isSameDate || state.timeMode === 'baseline2019');
  var isDiff = !isSameDate && !actuallySplit && state.timeMode !== 'baseline2019'; // Unified diff view

  var isTemp = state.activeLayer === 'temperature';
  leftLSTLegend.style().set('shown', isTemp && !isDiff); rightLSTLegend.style().set('shown', isTemp && !isDiff);
  leftLSTDiffLegend.style().set('shown', isTemp && isDiff); rightLSTDiffLegend.style().set('shown', isTemp && isDiff);

  var isGreen = state.activeLayer === 'greenspace';
  // If baseline2019 without split, it's a difference view
  var isGreenDiff = isGreen && (isDiff || (state.timeMode === 'baseline2019' && !actuallySplit));
  leftFVCLegend.style().set('shown', isGreen && !isGreenDiff); rightFVCLegend.style().set('shown', isGreen && !isGreenDiff);
  leftFVCDiffLegend.style().set('shown', isGreenDiff); rightFVCDiffLegend.style().set('shown', isGreenDiff);

  var isWater = state.activeLayer === 'water';
  leftETLegend.style().set('shown', isWater && !isDiff); rightETLegend.style().set('shown', isWater && !isDiff);
  leftETDiffLegend.style().set('shown', isWater && isDiff); rightETDiffLegend.style().set('shown', isWater && isDiff);
}


// ─── SECTION 7: LEFT SIDEBAR ────────────────────────────────────────

var appTitle = ui.Label('Las Vegas Valley Turf Tracker', STYLES.appTitle);
var appSubtitle = ui.Label('Urban turf change and surface heat explorer', STYLES.muted);
var headerPanel = ui.Panel([appTitle, appSubtitle], null, {padding: '14px 14px 10px 14px', backgroundColor: '#' + COLORS.white});

var tabExplore = ui.Button({label: 'Tract Profile', style: {border: '0px solid transparent'}});
var tabCompare = ui.Button({label: 'Compare Tracts', style: {border: '0px solid transparent'}});
var tabAbout = ui.Button({label: 'About', style: {border: '0px solid transparent'}});
var tabRow = ui.Panel([tabExplore, tabCompare, tabAbout], ui.Panel.Layout.flow('horizontal'), {padding: '0 14px 10px 14px', backgroundColor: '#' + COLORS.white, margin: '0 0 6px 0'});

// ─── TIME CONTROLS & DYNAMIC UI LOGIC ───

var timeModeSel = ui.Select({items: ['Single month', 'Compare two months', 'Compare to 2019'], value: 'Compare two months', style: {fontSize: '13px', margin: '4px 8px 8px 0', stretch: 'horizontal'}});
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
  var hasBaselineOpt = timeModeSel.items().length() === 3; // check the length of the dropdown list

  if (config.hasBaseline2019 && !hasBaselineOpt) {
    timeModeSel.items().reset(['Single month', 'Compare two months', 'Compare to 2019']);
    timeModeSel.setValue(state.timeMode === 'baseline2019' ? 'Compare to 2019' : (state.timeMode === 'single' ? 'Single month' : 'Compare two months'));
  } else if (!config.hasBaseline2019 && hasBaselineOpt) {
    timeModeSel.items().reset(['Single month', 'Compare two months']);
    if (state.timeMode === 'baseline2019') {
      state.timeMode = 'single';
      timeModeSel.setValue('Single month');
    }
  }

  if (state.timeMode === 'single') {
    fromLabel.setValue('Date');
    fromRow.style().set('shown', true);
    toRow.style().set('shown', false);
  } else if (state.timeMode === 'compare') {
    fromLabel.setValue('From');
    fromRow.style().set('shown', true);
    toRow.style().set('shown', true);
  } else if (state.timeMode === 'baseline2019') {
    toLabel.setValue('Target'); 
    fromRow.style().set('shown', false);
    toRow.style().set('shown', true);
  }
}

function makeLayerPill(label, key) {
  var btn = ui.Button(label, function() {
    state.activeLayer = key;
    updateLayerPills();
    updateTimeModeUI(); // Check config when layer changes
    refreshMap();
  });
  btn._key = key;
  btn.style().set({fontSize: '11px', padding: '6px 12px', margin: '2px 6px 2px 0', border: '0px solid transparent'});
  return btn;
}

var pillGreen     = makeLayerPill('Greenness', 'greenspace');
var pillTemp      = makeLayerPill('Heat', 'temperature');
var pillSatellite = makeLayerPill('Satellite', 'satellite');
var pillWater     = makeLayerPill('Water Consumption', 'water');

function updateLayerPills() {
  [pillGreen, pillTemp, pillWater, pillSatellite].forEach(function(p) { stylePillButton(p, p._key === state.activeLayer); });
}

function onTimeChange() {
  if (state.timeMode === 'single') {
    state.fromMonth = MONTHS.indexOf(fromMonthSel.getValue()) + 1;
    state.fromYear  = parseInt(fromYearSel.getValue(), 10);
    state.toMonth = state.fromMonth;
    state.toYear  = state.fromYear;
  } else if (state.timeMode === 'baseline2019') {
    state.toMonth = MONTHS.indexOf(toMonthSel.getValue()) + 1;
    state.toYear  = parseInt(toYearSel.getValue(), 10);
    state.fromMonth = state.toMonth; 
    state.fromYear = 2019; // Lock to 2019 equivalent
  } else {
    state.fromMonth = MONTHS.indexOf(fromMonthSel.getValue()) + 1;
    state.fromYear  = parseInt(fromYearSel.getValue(), 10);
    state.toMonth = MONTHS.indexOf(toMonthSel.getValue()) + 1;
    state.toYear  = parseInt(toYearSel.getValue(), 10);
  }

  refreshMap();

  if (state.currentView === 'explore' && state.selectedTract) updateSidePanel(state.selectedTract);
  else if (state.currentView === 'compare' && state.compareTracts.length === 2) updateCompareView();
}

fromMonthSel.onChange(onTimeChange); fromYearSel.onChange(onTimeChange);
toMonthSel.onChange(onTimeChange);   toYearSel.onChange(onTimeChange);

timeModeSel.onChange(function(val) {
  if (val === 'Single month') state.timeMode = 'single';
  else if (val === 'Compare two months') state.timeMode = 'compare';
  else if (val === 'Compare to 2019') state.timeMode = 'baseline2019';
  updateTimeModeUI();
  onTimeChange();
});

var splitCheck = ui.Checkbox('Split view', true);
splitCheck.style().set({fontSize: '13px', color: '#' + COLORS.black});
splitCheck.onChange(function(v) { state.splitEnabled = v; refreshMap(); });

var controlsPanel = ui.Panel([
  makeSectionTitle('Map controls'),
  ui.Label('Layer', STYLES.muted),
  ui.Panel([pillGreen, pillTemp, pillWater, pillSatellite], ui.Panel.Layout.flow('horizontal')),
  makeSeparator(),
  ui.Label('Analysis mode', STYLES.muted),
  timeModeSel, fromRow, toRow,
  makeSeparator(), splitCheck
], null, STYLES.section);

var instructionPanel = ui.Panel([
  makeSectionTitle('How to use'),
  ui.Label(
    '1. Choose a layer and date range in Map controls.\n2. In Tract Profile, click one tract on the map to view its stats and charts.\n3. In Compare Tracts, click two tracts on the map to compare them.\n4. Use Split view to see two selected months side by side with different date range.',
    {fontSize: '12px', color: '#' + COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0 0 0'}
  )
], null, STYLES.section);

// Explore content
var promptPanel = ui.Panel([
  makeSectionTitle('Select a Tract'),
  ui.Label('Click any census tract on the map to view its local green space changes, surface temperature shifts, and distribution metrics.', {fontSize: '12px', color: COLORS.gray, whiteSpace: 'pre-wrap'})
], null, STYLES.section);

var cardGreen = makeStatCard('Green space change'); var cardTemp  = makeStatCard('Surface temperature');
var cardFVC   = makeStatCard('Vegetation fraction'); var cardET    = makeStatCard('Water consumption');

var statsGrid1 = ui.Panel([cardGreen.panel, cardTemp.panel], ui.Panel.Layout.flow('horizontal'));
var statsGrid2 = ui.Panel([cardFVC.panel], ui.Panel.Layout.flow('horizontal'));
var statsGrid3 = ui.Panel([cardET.panel], ui.Panel.Layout.flow('horizontal'));

var plainEnglish = ui.Label('', {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '6px 0'});

var tractGeoidLabel = ui.Label('', {fontSize: '14px', fontWeight: 'bold', color: '#' + COLORS.primary, padding: '4px 0 0 0'});
var tractAreaLabel = ui.Label('', {fontSize: '12px', color: '#' + COLORS.black, padding: '0 0 4px 0'});

var resetSelectionBtn = ui.Button('Reset selected tract', function() { resetSelectedTract(); });
resetSelectionBtn.style().set({fontSize: '11px', color: '#' + COLORS.red, backgroundColor: '#FFFFFF', margin: '8px 0 0 0', padding: '6px 8px', border: '1px solid #' + COLORS.red});

var tractProfileTitle = makeSectionTitle('Selected Tract');
var tractHeaderPanel = ui.Panel([tractProfileTitle, tractGeoidLabel, tractAreaLabel, resetSelectionBtn], null, STYLES.section);
tractHeaderPanel.style().set('shown', false);

var chartTitle = ui.Label('Selected area distributions', STYLES.subtitle);
var chartNote = ui.Label('Histograms update after you click a tract.', {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'});

var fvcChartHolder = ui.Panel([ui.Label('FVC distribution chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
var lstChartHolder = ui.Panel([ui.Label('LST distribution chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
var etChartHolder  = ui.Panel([ui.Label('Water consumption chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});

var chartsPanel = ui.Panel([chartTitle, chartNote, fvcChartHolder, lstChartHolder, etChartHolder], null, STYLES.section);

var statsTitleLabel = makeSectionTitle('What changed?');
var statsPanel = ui.Panel([statsTitleLabel, statsGrid1, statsGrid2, statsGrid3], null, STYLES.section);
statsPanel.style().set('shown', false);

// BUG FIX from v28: trendPanel was updated but never added to the UI!
var trendPanel = ui.Panel([], null, STYLES.section); 

var comparePromptPanel = ui.Panel([
  makeSectionTitle('Compare areas'),
  ui.Label('Click a census tract directly on the map to select your first area for comparison.', {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'})
], null, STYLES.section);
comparePromptPanel.style().set('shown', false);

var compareContent = ui.Panel([], null, {stretch: 'horizontal'}); 
compareContent.style().set('shown', false);

var aboutBody = {fontSize: '12px', color: '#' + COLORS.black, whiteSpace: 'pre-wrap', padding: '2px 0 6px 0'};
var aboutContent = ui.Panel([
  makeSectionTitle('About this dashboard'),
  ui.Label('This dashboard tracks the removal of non-functional turf across the Las Vegas Valley...', aboutBody),
  makeSeparator(), ui.Label('Policy background', STYLES.subtitle),
  ui.Label('Nevada Assembly Bill 356 (2021) requires the removal of all non-functional turf...', aboutBody),
  ui.Label('The Southern Nevada Water Authority (SNWA) oversees compliance...', aboutBody)
], null, STYLES.section);
aboutContent.style().set('shown', false);

// EXPLORE PANEL: Now includes the missing trendPanel
var explorePanel = ui.Panel([statsPanel, chartsPanel, trendPanel], null, {stretch: 'horizontal'});

var sidebarContent = ui.Panel([instructionPanel, promptPanel, tractHeaderPanel, comparePromptPanel, controlsPanel, explorePanel, compareContent, aboutContent], null, {stretch: 'horizontal', padding: '0 12px 12px 12px'});
var leftSidebar = ui.Panel([headerPanel, tabRow, sidebarContent], null, {width: '390px', stretch: 'vertical', backgroundColor: '#' + COLORS.grayLight});

// ─── SECTION 8: TAB SWITCHING ───────────────────────────────────────

function setActiveTab(tab) {
  state.currentView = tab;
  styleTabButton(tabExplore, tab === 'explore'); styleTabButton(tabCompare, tab === 'compare'); styleTabButton(tabAbout, tab === 'about');

  controlsPanel.style().set('shown', tab !== 'about'); instructionPanel.style().set('shown', tab !== 'about');
  explorePanel.style().set('shown', tab === 'explore'); compareContent.style().set('shown', tab === 'compare'); aboutContent.style().set('shown', tab === 'about');

  tractHeaderPanel.style().set('shown', tab === 'explore' && state.selectedTract !== null);
  promptPanel.style().set('shown', tab === 'explore' && state.selectedTract === null);
  comparePromptPanel.style().set('shown', tab === 'compare');

  if (tab === 'explore') refreshMap();
  if (tab === 'compare') updateCompareView();
  updateHighlightLayer();
}

tabExplore.onClick(function() { setActiveTab('explore'); });
tabCompare.onClick(function() { setActiveTab('compare'); });
tabAbout.onClick(function()   { setActiveTab('about'); });

// ─── SECTION 9: RESET SELECTED TRACT ────────────────────────────────

function resetSelectedTract() {
  state.selectedTract = null;
  promptPanel.style().set('shown', true); statsPanel.style().set('shown', false); tractHeaderPanel.style().set('shown', false); plainEnglish.setValue('');
  fvcChartHolder.widgets().reset([ui.Label('FVC distribution chart will appear here.', STYLES.muted)]);
  lstChartHolder.widgets().reset([ui.Label('LST distribution chart will appear here.', STYLES.muted)]);
  etChartHolder.widgets().reset([ui.Label('Water consumption chart will appear here.', STYLES.muted)]);
  trendPanel.widgets().reset([]); // Clear trend panel too
  updateHighlightLayer();
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
      leftMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
      if (state.splitEnabled) rightMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
    });
  }

  if (state.currentView === 'explore' && state.selectedTract) {
    var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())]).style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2});
    leftMap.addLayer(highlightStyle, {}, 'Selected tract');
    if (state.splitEnabled) rightMap.addLayer(highlightStyle, {}, 'Selected tract');
  }
}

// ─── SECTION 10: MAP REFRESH ────────────────────────────────────────

var mapInitialized = false; var containerMode  = null; 

function refreshMap() {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var isBaseline = (state.timeMode === 'baseline2019');

  splitCheck.style().set('shown', !isSameDate || isBaseline);
  var actuallySplit = state.splitEnabled && (!isSameDate || isBaseline);

  var fromStr = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
  var toStr   = MONTHS[state.toMonth - 1]   + ' ' + state.toYear;
  
  leftDateLabel.setValue(isBaseline ? 'Baseline 2019' : (isSameDate || actuallySplit ? fromStr : fromStr + ' → ' + toStr));
  rightDateLabel.setValue(toStr);

  leftMap.layers().reset(); rightMap.layers().reset();

  if (actuallySplit) {
    if (containerMode !== 'split') { mapContainer.widgets().reset([splitPanel]); containerMode = 'split'; }
    rightDateLabel.style().set('shown', true);

    if (state.activeLayer === 'greenspace') {
      leftMap.addLayer(getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC Before'); rightMap.addLayer(getFVCImage(state.toYear, state.toMonth), fvc_vis, 'FVC After');
    } else if (state.activeLayer === 'temperature') {
      leftMap.addLayer(getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST Before'); rightMap.addLayer(getLSTImage(state.toYear, state.toMonth), lst_vis, 'LST After');
    } else if (state.activeLayer === 'water') {
      leftMap.addLayer(getETImage(state.fromYear, state.fromMonth), et_vis, 'Water Consumption Before'); rightMap.addLayer(getETImage(state.toYear, state.toMonth), et_vis, 'Water Consumption After');
    } else {
      leftMap.addLayer(getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'S2 Before'); rightMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'S2 After');
    }
  } else {
    if (containerMode !== 'single') { mapContainer.widgets().reset([leftMap]); containerMode = 'single'; }
    rightDateLabel.style().set('shown', false);

    if (isSameDate && !isBaseline) {
      if (state.activeLayer === 'greenspace') leftMap.addLayer(getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC');
      else if (state.activeLayer === 'temperature') leftMap.addLayer(getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST');
      else if (state.activeLayer === 'water') leftMap.addLayer(getETImage(state.fromYear, state.fromMonth), et_vis, 'Water Consumption');
      else leftMap.addLayer(getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'Satellite');
    } else {
      if (state.activeLayer === 'greenspace') {
        var fvcDiff = isBaseline ? getVegDiffImage(state.toYear, state.toMonth) : getFVCImage(state.toYear, state.toMonth).subtract(getFVCImage(state.fromYear, state.fromMonth));
        leftMap.addLayer(fvcDiff, fvc_diff_vis, 'FVC change');
      } else if (state.activeLayer === 'temperature') {
        var lstDiff = getLSTImage(state.toYear, state.toMonth).subtract(getLSTImage(state.fromYear, state.fromMonth));
        leftMap.addLayer(lstDiff, lst_diff_vis, 'LST change');
      } else if (state.activeLayer === 'water') {
        var etDiff = getETImage(state.toYear, state.toMonth).subtract(getETImage(state.fromYear, state.fromMonth));
        leftMap.addLayer(etDiff, et_diff_vis, 'Water Consumption change');
      } else {
        leftMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'Current view');
      }
    }
  }

  var tractStyle = tracts.style({color: COLORS.primary + '99', fillColor: '00000000', width: 0.8});
  leftMap.addLayer(tractStyle, {}, 'Census tracts'); if (state.splitEnabled) rightMap.addLayer(tractStyle, {}, 'Census tracts');

  var boundaryStyle = lasvegas_boundary.style({color: COLORS.primary, fillColor: '00000000', width: 2});
  leftMap.addLayer(boundaryStyle, {}, 'Study area'); if (state.splitEnabled) rightMap.addLayer(boundaryStyle, {}, 'Study area');

  state.compareTracts.forEach(function(t) {
    var compStyle = ee.FeatureCollection([ee.Feature(t.feature.geometry())]).style({color: t.color, fillColor: t.color + '40', width: 3});
    leftMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid); if (state.splitEnabled) rightMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
  });

  if (state.selectedTract) {
    var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())]).style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2});
    leftMap.addLayer(highlightStyle, {}, 'Selected tract'); if (state.splitEnabled) rightMap.addLayer(highlightStyle, {}, 'Selected tract');
  }

  updateLegendVisibility();
  if (!mapInitialized) { leftMap.centerObject(roi, 11); mapInitialized = true; }
}

// ─── SECTION 11: MAP CLICK → SIDEBAR + CHARTS ───────────────────────

function handleMapClick(coords) {
  if (state.currentView === 'about') return; 
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var clicked = tracts.filterBounds(point).first();

  clicked.evaluate(function(f) {
    if (!f) return;
    var tract = ee.Feature(f);
    if (state.currentView === 'explore') updateSidePanel(tract);
    else if (state.currentView === 'compare') handleCompareClick(tract);
  });
}

leftMap.onClick(handleMapClick); rightMap.onClick(handleMapClick);

function handleCompareClick(tract) {
  if (state.compareTracts.length >= 2) state.compareTracts = [];
  tract.get('GEOID').evaluate(function(geoid) {
    var already = state.compareTracts.some(function(t) { return t.geoid === geoid; });
    if (!already) {
      state.compareTracts.push({geoid: geoid, feature: tract, color: [COLORS.blue, COLORS.coral][state.compareTracts.length]});
      updateCompareView(); updateHighlightLayer();
    }
  });
}

function updateDistributionCharts(tractGeom) {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var isBaseline = (state.timeMode === 'baseline2019');

  if (isBaseline) {
      var vegDiffImg = getVegDiffImage(state.toYear, state.toMonth);
      var fvcChart = ui.Chart.image.histogram({image: vegDiffImg.rename('Difference vs 2019'), region: tractGeom, scale: 10, maxPixels: 1e7})
      .setOptions({
        title: 'FVC Shift vs 2019 Baseline',
        hAxis: { title: 'veg_diff value', format: '0.00' }, series: { 0: {color: '#D85A30'} }
      });
      fvcChartHolder.widgets().reset([fvcChart]);
      lstChartHolder.widgets().reset([ui.Label('Temperature diff vs 2019 not available yet.', STYLES.muted)]);
      etChartHolder.widgets().reset([ui.Label('Water diff vs 2019 not available yet.', STYLES.muted)]);
      return;
  }

  var fvcBefore = getFVCImage(state.fromYear, state.fromMonth).updateMask(getFVCImage(state.fromYear, state.fromMonth).gt(0.01));
  var lstBefore = getLSTImage(state.fromYear, state.fromMonth);
  var etBefore  = getETImage(state.fromYear, state.fromMonth);
  var fvcChart, lstChart, etChart; 

  if (isSameDate) {
    var dateLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
    fvcChart = ui.Chart.image.histogram({image: fvcBefore.rename(dateLabel), region: tractGeom, scale: 10, maxPixels: 1e7}).setOptions({title: 'FVC distribution: ' + dateLabel, hAxis: { title: 'FVC / NDVI proxy', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#1B5E20'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
    lstChart = ui.Chart.image.histogram({image: lstBefore.rename(dateLabel), region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'LST distribution: ' + dateLabel, hAxis: { title: 'Temperature (°C)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#D95F0E'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
    etChart = ui.Chart.image.histogram({image: etBefore.rename(dateLabel), region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'Water consumption distribution: ' + dateLabel, hAxis: { title: 'Water consumption (mm)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#2171b5'} }, legend: {position: 'none'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
  } else {
    var fromLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear; var toLabel   = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
    var fvcAfter  = getFVCImage(state.toYear, state.toMonth).updateMask(getFVCImage(state.toYear, state.toMonth).gt(0.01));
    var lstAfter  = getLSTImage(state.toYear, state.toMonth); var etAfter   = getETImage(state.toYear, state.toMonth);
    var fvcStack = fvcBefore.rename('Before').addBands(fvcAfter.rename('After')); var lstStack = lstBefore.rename('Before').addBands(lstAfter.rename('After')); var etStack  = etBefore.rename('Before').addBands(etAfter.rename('After'));

    fvcChart = ui.Chart.image.histogram({image: fvcStack, region: tractGeom, scale: 10, maxPixels: 1e7}).setOptions({title: 'FVC distribution: ' + fromLabel + ' vs ' + toLabel, hAxis: { title: 'FVC / NDVI proxy', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#8FBF73'}, 1: {color: '#1B5E20'} }, legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
    lstChart = ui.Chart.image.histogram({image: lstStack, region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'LST distribution: ' + fromLabel + ' vs ' + toLabel, hAxis: { title: 'Temperature (°C)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#6BAED6'}, 1: {color: '#D95F0E'} }, legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
    etChart = ui.Chart.image.histogram({image: etStack, region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({title: 'Water consumption distribution: ' + fromLabel + ' vs ' + toLabel, hAxis: { title: 'Water consumption (mm)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#9ecae1'}, 1: {color: '#2171b5'} }, legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});
  }

  fvcChartHolder.widgets().reset([fvcChart]); lstChartHolder.widgets().reset([lstChart]); etChartHolder.widgets().reset([etChart]);
}

function updateSidePanel(tract) {
  state.selectedTract = tract;
  promptPanel.style().set('shown', false); statsPanel.style().set('shown', true);

  var tractGeom = tract.geometry(); var geoid = tract.get('GEOID'); var aland = ee.Number(tract.get('ALAND'));
  var fvcBefore = getFVCImage(state.fromYear, state.fromMonth); var fvcAfter  = getFVCImage(state.toYear, state.toMonth);
  var lstBefore = getLSTImage(state.fromYear, state.fromMonth); var lstAfter  = getLSTImage(state.toYear, state.toMonth);
  var etBefore  = getETImage(state.fromYear, state.fromMonth);  var etAfter   = getETImage(state.toYear, state.toMonth);

  ee.Dictionary({
    fvcStart: fvcBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
    fvcEnd: fvcAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
    lstStart: lstBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
    lstEnd: lstAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
    etStart: etBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'),
    etEnd: etAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('et_actual'),
    aland: aland, geoid: geoid
  }).evaluate(function(v) {
    if (!v) { plainEnglish.setValue('Error loading data for this tract.'); return; }

    var fS = v.fvcStart || 0; var fE = v.fvcEnd || 0;
    var lS = v.lstStart || 0; var lE = v.lstEnd || 0;
    var eS = v.etStart || 0; var eE = v.etEnd || 0;
    var alandSqm = v.aland || 0; var alandAcres = alandSqm / 4046.86;

    var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

    if (state.timeMode === 'baseline2019') {
      statsTitleLabel.setValue('Comparison to 2019');
      statsGrid2.style().set('shown', false); statsGrid3.style().set('shown', false); // Hide LST/ET

      var fvcChangePct = fS > 0 ? ((fE - fS) / fS * 100) : 0;
      cardGreen.name.setValue('Green space change'); cardGreen.val.setValue(fvcChangePct.toFixed(1) + '%');
      cardGreen.delta.setValue('compared to same month in 2019');
      cardGreen.delta.style().set('color', fvcChangePct < 0 ? COLORS.red : COLORS.green);
      
      trendPanel.widgets().reset([buildBaselineTrendChart(tractGeom, state.toYear)]);
      
    } else if (isSameDate) {
      statsTitleLabel.setValue('Monthly summary'); 
      statsGrid2.style().set('shown', false); statsGrid3.style().set('shown', true);

      cardGreen.name.setValue('Mean greenness (FVC)'); cardGreen.val.setValue(fS.toFixed(3)); cardGreen.delta.setValue('proxy value'); cardGreen.delta.style().set('color', COLORS.gray);
      cardTemp.name.setValue('Surface temperature'); cardTemp.val.setValue(lS.toFixed(1) + '°C'); cardTemp.delta.setValue('mean value'); cardTemp.delta.style().set('color', COLORS.gray);
      cardET.name.setValue('Water consumption'); cardET.val.setValue(eS.toFixed(1) + ' mm'); cardET.delta.setValue('mean this month'); cardET.delta.style().set('color', COLORS.gray);
      
      updateTrendCharts(tractGeom);
      
    } else {
      statsTitleLabel.setValue('What changed?'); 
      statsGrid2.style().set('shown', true); statsGrid3.style().set('shown', true);

      var fvcChangePct  = fS > 0 ? ((fE - fS) / fS * 100) : 0; var turfLossAcres = Math.abs(fE - fS) * alandAcres;
      var lstChange     = lE - lS; var fvcAbsChange  = fE - fS; var etChange = eE - eS;

      cardGreen.name.setValue('Green space change'); cardGreen.val.setValue(fvcChangePct.toFixed(1) + '%'); cardGreen.delta.setValue(turfLossAcres.toFixed(1) + ' acres'); cardGreen.delta.style().set('color', fvcChangePct < 0 ? COLORS.red : COLORS.green);
      cardTemp.name.setValue('Surface temperature'); cardTemp.val.setValue((lstChange >= 0 ? '+' : '') + lstChange.toFixed(1) + '°C'); cardTemp.delta.setValue('between selected dates'); cardTemp.delta.style().set('color', lstChange > 0 ? COLORS.red : COLORS.green);
      cardFVC.val.setValue(fvcAbsChange.toFixed(3)); cardFVC.delta.setValue('mean FVC change'); cardFVC.delta.style().set('color', fvcAbsChange < 0 ? COLORS.red : COLORS.green);
      cardET.name.setValue('Water consumption'); cardET.val.setValue((etChange >= 0 ? '+' : '') + etChange.toFixed(1) + ' mm'); cardET.delta.setValue('mean change'); cardET.delta.style().set('color', etChange < 0 ? COLORS.green : COLORS.red);
      
      updateTrendCharts(tractGeom);
    }

    tractGeoidLabel.setValue('● Tract ' + (v.geoid || 'Unknown'));
    tractAreaLabel.setValue('Area: ' + alandAcres.toFixed(1) + ' acres (' + (alandSqm / 1e6).toFixed(2) + ' km²)');
    tractHeaderPanel.style().set('shown', true);
    updateHighlightLayer();
  });

  updateDistributionCharts(tractGeom);
}

// ─── SECTION 12: COMPARE VIEW ───────────────────────────────────────

var resetCompareBtn = ui.Button('Reset comparison', function() { state.compareTracts = []; updateCompareView(); updateHighlightLayer(); });
resetCompareBtn.style().set({fontSize: '11px', color: '#' + COLORS.red, backgroundColor: '#FFFFFF', margin: '4px 0 8px 0', padding: '6px 8px', border: '2px solid #' + COLORS.red});

function updateCompareView() {
  var n = state.compareTracts.length;

  if (n === 0) {
    comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('Click a census tract directly on the map to select your first area for comparison.', {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'})]);
    compareContent.widgets().reset([]); return;
  }

  if (n === 1) {
    comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('● Tract ' + state.compareTracts[0].geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + state.compareTracts[0].color, padding: '4px 0'}), resetCompareBtn, ui.Label('Click a second tract on the map to compare against.', {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'})]);
    compareContent.widgets().reset([]); return;
  }

  var tractA = state.compareTracts[0]; var tractB = state.compareTracts[1];
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

  comparePromptPanel.widgets().reset([makeSectionTitle('Compare areas'), ui.Label('● Tract ' + tractA.geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + tractA.color, padding: '4px 0 2px 0'}), ui.Label('● Tract ' + tractB.geoid, {fontSize: '13px', fontWeight: 'bold', color: '#' + tractB.color, padding: '0 0 8px 0'}), resetCompareBtn]);
  compareContent.widgets().reset([ui.Label(isSameDate ? 'Calculating differences...' : 'Generating comparison charts...', {fontSize: '11px', color: '#' + COLORS.gray, fontStyle: 'italic', padding: '12px 0'})]);

  if (state.timeMode === 'baseline2019') {
      var diffImg = getVegDiffImage(state.toYear, state.toMonth);
      ee.Dictionary({
        dA: diffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff'),
        dB: diffImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('veg_diff')
      }).evaluate(function(v) {
        var fvcCardA = ui.Panel([ ui.Label('Tract ' + tractA.geoid + ' vs 2019', STYLES.statLabel), ui.Label(((v.dA||0)*100).toFixed(1) + '%', STYLES.statValue) ], null, STYLES.card);
        var fvcCardB = ui.Panel([ ui.Label('Tract ' + tractB.geoid + ' vs 2019', STYLES.statLabel), ui.Label(((v.dB||0)*100).toFixed(1) + '%', STYLES.statValue) ], null, STYLES.card);
        compareContent.widgets().reset([ui.Panel([fvcCardA, fvcCardB], ui.Panel.Layout.flow('horizontal')), buildBaselineCompareTrendChart(tractA, tractB, state.toYear)]);
      });
  } else if (isSameDate) {
    var fvcImg = getFVCImage(state.fromYear, state.fromMonth); var lstImg = getLSTImage(state.fromYear, state.fromMonth); var etImg  = getETImage(state.fromYear, state.fromMonth);
    ee.Dictionary({
      fA: fvcImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 10, bestEffort: true}).get('FVC'), fB: fvcImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 10, bestEffort: true}).get('FVC'),
      lA: lstImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('LST'), lB: lstImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('LST'),
      eA: etImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractA.feature.geometry(), scale: 30, bestEffort: true}).get('et_actual'), eB: etImg.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractB.feature.geometry(), scale: 30, bestEffort: true}).get('et_actual')
    }).evaluate(function(v) {
      if (!v) return;
      var fvcDiff = (v.fB || 0) - (v.fA || 0); var lstDiff = (v.lB || 0) - (v.lA || 0); var etDiff  = (v.eB || 0) - (v.eA || 0);
      var fvcCard = ui.Panel([ui.Label('FVC Difference', STYLES.statLabel), ui.Label((fvcDiff > 0 ? '+' : '') + fvcDiff.toFixed(3), STYLES.statValue), ui.Label('Tract B vs Tract A', {fontSize: '11px', color: COLORS.gray})], null, STYLES.card);
      var lstCard = ui.Panel([ui.Label('Temp Difference', STYLES.statLabel), ui.Label((lstDiff > 0 ? '+' : '') + lstDiff.toFixed(1) + '°C', STYLES.statValue), ui.Label('Tract B vs Tract A', {fontSize: '11px', color: COLORS.gray})], null, STYLES.card);
      var etCard = ui.Panel([ui.Label('Water Consumption Difference', STYLES.statLabel), ui.Label((etDiff > 0 ? '+' : '') + etDiff.toFixed(1) + ' mm', STYLES.statValue), ui.Label('Tract B vs Tract A', {fontSize: '11px', color: COLORS.gray})], null, STYLES.card);
      compareContent.widgets().set(0, ui.Label('Comparison for ' + MONTHS[state.fromMonth - 1] + ' ' + state.fromYear + '.', {fontSize: '11px', color: '#' + COLORS.gray, padding: '0 0 8px 0'}));
      compareContent.add(ui.Panel([fvcCard, lstCard], ui.Panel.Layout.flow('horizontal'))); compareContent.add(ui.Panel([etCard], ui.Panel.Layout.flow('horizontal')));
    });
  } else {
    ee.Number(1).evaluate(function() {
      var chartPanels = makeCompareTrendCharts(tractA, tractB);
      compareContent.widgets().set(0, ui.Label('Overlay monthly trends for the two selected tracts over the selected date range.', {fontSize: '11px', color: '#' + COLORS.gray, whiteSpace: 'pre-wrap', padding: '0 0 8px 0'}));
      compareContent.add(chartPanels[0]); compareContent.add(chartPanels[1]); compareContent.add(chartPanels[2]);
    });
  }
}

// ─── SECTION 13: APP ASSEMBLY ───────────────────────────────────────

var contentRow = ui.Panel([leftSidebar, mapContainer], ui.Panel.Layout.flow('horizontal'), {stretch: 'both'});
ui.root.widgets().reset([contentRow]);

// ─── SECTION 14: INIT ───────────────────────────────────────────────

styleTabButton(tabExplore, true); styleTabButton(tabCompare, false); styleTabButton(tabAbout, false);
setActiveTab('explore'); updateTimeModeUI(); updateLayerPills(); refreshMap();

print('─── Las Vegas Valley Turf Tracker loaded ───');
print('Click a census tract on the map to view statistics.');
print('Change months with the dropdowns. Toggle split view on/off.');