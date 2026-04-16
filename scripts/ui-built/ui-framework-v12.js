// ═══════════════════════════════════════════════════════════════════════
// LAS VEGAS VALLEY TURF TRACKER — UI FRAMEWORK v12
// single time and single space updates
// ═══════════════════════════════════════════════════════════════════════


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

// Future precomputed stats placeholder
// var tractStats = ee.FeatureCollection('users/NAME/lv_tract_monthly_stats');

var parcels = null;


// ─── SECTION 2: CLOUD MASKING & PROCESSING ──────────────────────────

function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

function maskL8sr(image) {
  var dilatedCloud = (1 << 1);
  var cirrus = (1 << 2);
  var cloud = (1 << 3);
  var cloudShadow = (1 << 4);
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(dilatedCloud).eq(0)
    .and(qa.bitwiseAnd(cirrus).eq(0))
    .and(qa.bitwiseAnd(cloud).eq(0))
    .and(qa.bitwiseAnd(cloudShadow).eq(0));
  return image.updateMask(mask);
}

function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true);
}

var s2_vis = {
  min: 0.0, max: 0.3, bands: ['B4', 'B3', 'B2']
};

var lst_vis = {
  min: 20, max: 60,
  palette: ['#313695','#4575B4','#ABD9E9','#00A6FF','#00CC66','#FFFF00','#FFA500','#FF0000','#A50026']
};

var fvc_vis = {
  min: 0, max: 0.7,
  palette: ['#F5F5DC','#C5E1A5','#66BB6A','#2E7D32','#1B5E20']
};


// ─── SECTION 3: COMPOSITE FUNCTIONS ─────────────────────────────────

function getS2Composite(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(roi)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .map(maskS2clouds)
    .median()
    .clip(roi);
}

// NDVI proxy placeholder
function getFVCImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var composite = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(roi)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .map(maskS2clouds)
    .median();
  return composite.normalizedDifference(['B8', 'B4']).rename('FVC').clip(roi);
}

function getLSTImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterDate(start, end)
    .filterBounds(roi)
    .filter(ee.Filter.lt('CLOUD_COVER', 10))
    .map(maskL8sr)
    .map(applyScaleFactors);

  var lst = collection.select('ST_B10').map(function(image) {
    var celsius = image.subtract(273.15);
    var mask = celsius.gt(0);
    return celsius.updateMask(mask);
  });

  return lst.median().rename('LST').clip(roi);
}

// ─── SECTION 3A: MONTHLY TIMESERIES HELPERS ─────────────────────────

function getOrderedDateRange() {
  var fromDate = ee.Date.fromYMD(state.fromYear, state.fromMonth, 1);
  var toDate   = ee.Date.fromYMD(state.toYear, state.toMonth, 1);

  var start = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), fromDate, toDate));
  var end   = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), toDate, fromDate));

  return {
    start: start,
    end: end
  };
}

function buildMonthlyFVCCollection(startDate, endDate) {
  var monthCount = endDate.difference(startDate, 'month').round();
  var months = ee.List.sequence(0, monthCount);

  return ee.ImageCollection.fromImages(
    months.map(function(m) {
      m = ee.Number(m);
      var start = startDate.advance(m, 'month');
      var end   = start.advance(1, 'month');

      var composite = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterDate(start, end)
        .filterBounds(roi)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
        .map(maskS2clouds)
        .median();

      var ndvi = composite.normalizedDifference(['B8', 'B4']).rename('FVC');

      return ndvi
        .clip(roi)
        .set('system:time_start', start.millis())
        .set('label', start.format('YYYY-MM'));
    })
  );
}

function buildMonthlyLSTCollection(startDate, endDate) {
  var monthCount = endDate.difference(startDate, 'month').round();
  var months = ee.List.sequence(0, monthCount);

  return ee.ImageCollection.fromImages(
    months.map(function(m) {
      m = ee.Number(m);
      var start = startDate.advance(m, 'month');
      var end   = start.advance(1, 'month');

      var collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterDate(start, end)
        .filterBounds(roi)
        .filter(ee.Filter.lt('CLOUD_COVER', 10))
        .map(maskL8sr)
        .map(applyScaleFactors);

      var lst = collection.select('ST_B10').map(function(image) {
        var celsius = image.subtract(273.15);
        var mask = celsius.gt(0);
        return celsius.updateMask(mask);
      }).median().rename('LST');

      return lst
        .clip(roi)
        .set('system:time_start', start.millis())
        .set('label', start.format('YYYY-MM'));
    })
  );
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

      // ---------- FVC ----------
      var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterDate(monthStart, monthEnd)
        .filterBounds(tractGeom)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
        .map(maskS2clouds);

      var fvcMean = ee.Algorithms.If(
        s2.size().gt(0),
        s2.median()
          .normalizedDifference(['B8', 'B4'])
          .rename('FVC')
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: tractGeom,
            scale: 10,
            bestEffort: true,
            maxPixels: 1e7,
            tileScale: 2
          })
          .get('FVC'),
        null
      );

      // ---------- LST ----------
      var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterDate(monthStart, monthEnd)
        .filterBounds(tractGeom)
        .filter(ee.Filter.lt('CLOUD_COVER', 10))
        .map(maskL8sr)
        .map(applyScaleFactors);

      var lstMean = ee.Algorithms.If(
        l8.size().gt(0),
        l8.select('ST_B10')
          .map(function(image) {
            var celsius = image.subtract(273.15);
            return celsius.updateMask(celsius.gt(0));
          })
          .median()
          .rename('LST')
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: tractGeom,
            scale: 30,
            bestEffort: true,
            maxPixels: 1e7,
            tileScale: 2
          })
          .get('LST'),
        null
      );

      return ee.Feature(null, {
        'date': monthStart.format('YYYY-MM'),
        'system:time_start': monthStart.millis(),
        'FVC': fvcMean,
        'LST': lstMean
      });
    })
  );

  var sortedTable = monthlyTable.sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({
    features: sortedTable,
    xProperty: 'date',
    yProperties: ['FVC']
  }).setChartType('LineChart').setOptions({
    title: 'Monthly FVC trend',
    hAxis: {
      title: 'Month',
      slantedText: true,
      slantedTextAngle: 45,
      textStyle: {fontSize: 10}
    },
    vAxis: {
      title: 'Mean FVC / NDVI proxy',
      viewWindow: {min: -1, max: 1}
    },
    legend: {position: 'none'},
    lineWidth: 3,
    pointSize: 4,
    interpolateNulls: true,
    colors: ['#2E7D32'],
    chartArea: {left: 60, top: 40, width: '78%', height: '58%'},
    fontSize: 11
  });

  var lstChart = ui.Chart.feature.byFeature({
    features: sortedTable,
    xProperty: 'date',
    yProperties: ['LST']
  }).setChartType('LineChart').setOptions({
    title: 'Monthly LST trend',
    hAxis: {
      title: 'Month',
      slantedText: true,
      slantedTextAngle: 45,
      textStyle: {fontSize: 10}
    },
    vAxis: {
      title: 'Mean surface temperature (°C)',
      viewWindow: {min: 15, max: 70}
    },
    legend: {position: 'none'},
    lineWidth: 3,
    pointSize: 4,
    interpolateNulls: true,
    colors: ['#D85A30'],
    chartArea: {left: 60, top: 40, width: '78%', height: '58%'},
    fontSize: 11
  });

//   trendPanel.widgets().reset([
//     ui.Label('Trend over time', STYLES.subtitle),
//     ui.Label(
//       'Monthly mean values for the selected tract over the selected date range.',
//       {fontSize: '11px', color: COLORS.gray, margin: '0 0 6px 0'}
//     ),
//     ui.Panel([fvcChart], null, {
//       backgroundColor: '#' + COLORS.white,
//       border: '1px solid #' + COLORS.grayMid,
//       padding: '6px',
//       margin: '4px 0'
//     }),
//     ui.Panel([lstChart], null, {
//       backgroundColor: '#' + COLORS.white,
//       border: '1px solid #' + COLORS.grayMid,
//       padding: '6px',
//       margin: '4px 0'
//     })
//   ]);
}

// IT IS A BIT SLOW MAYBE FIND A BETTER WAY?? 
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

      // ---------- FVC : tract A ----------
      var s2A = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterDate(monthStart, monthEnd)
        .filterBounds(tractGeomA)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
        .map(maskS2clouds);

      var fvcA = ee.Algorithms.If(
        s2A.size().gt(0),
        s2A.median()
          .normalizedDifference(['B8', 'B4'])
          .rename('FVC')
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: tractGeomA,
            scale: 10,
            bestEffort: true,
            maxPixels: 1e7,
            tileScale: 2
          })
          .get('FVC'),
        null
      );

      // ---------- FVC : tract B ----------
      var s2B = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterDate(monthStart, monthEnd)
        .filterBounds(tractGeomB)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
        .map(maskS2clouds);

      var fvcB = ee.Algorithms.If(
        s2B.size().gt(0),
        s2B.median()
          .normalizedDifference(['B8', 'B4'])
          .rename('FVC')
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: tractGeomB,
            scale: 10,
            bestEffort: true,
            maxPixels: 1e7,
            tileScale: 2
          })
          .get('FVC'),
        null
      );

      // ---------- LST : tract A ----------
      var l8A = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterDate(monthStart, monthEnd)
        .filterBounds(tractGeomA)
        .filter(ee.Filter.lt('CLOUD_COVER', 10))
        .map(maskL8sr)
        .map(applyScaleFactors);

      var lstA = ee.Algorithms.If(
        l8A.size().gt(0),
        l8A.select('ST_B10')
          .map(function(image) {
            var celsius = image.subtract(273.15);
            return celsius.updateMask(celsius.gt(0));
          })
          .median()
          .rename('LST')
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: tractGeomA,
            scale: 30,
            bestEffort: true,
            maxPixels: 1e7,
            tileScale: 2
          })
          .get('LST'),
        null
      );

      // ---------- LST : tract B ----------
      var l8B = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
        .filterDate(monthStart, monthEnd)
        .filterBounds(tractGeomB)
        .filter(ee.Filter.lt('CLOUD_COVER', 10))
        .map(maskL8sr)
        .map(applyScaleFactors);

      var lstB = ee.Algorithms.If(
        l8B.size().gt(0),
        l8B.select('ST_B10')
          .map(function(image) {
            var celsius = image.subtract(273.15);
            return celsius.updateMask(celsius.gt(0));
          })
          .median()
          .rename('LST')
          .reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: tractGeomB,
            scale: 30,
            bestEffort: true,
            maxPixels: 1e7,
            tileScale: 2
          })
          .get('LST'),
        null
      );

      var props = {
        'date': monthStart.format('YYYY-MM'),
        'system:time_start': monthStart.millis()
      };

      props['FVC_A'] = fvcA;
      props['FVC_B'] = fvcB;
      props['LST_A'] = lstA;
      props['LST_B'] = lstB;

return ee.Feature(null, props);
    })
  );
}


function makeCompareTrendCharts(tractA, tractB) {
  var geoidA = tractA.geoid;
  var geoidB = tractB.geoid;
  var colorA = '#' + tractA.color;
  var colorB = '#' + tractB.color;

  var tractGeomA = tractA.feature.geometry();
  var tractGeomB = tractB.feature.geometry();

  var table = buildCompareMonthlyTable(tractGeomA, tractGeomB)
    .sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({
    features: table,
    xProperty: 'date',
    yProperties: ['FVC_A', 'FVC_B']
  }).setChartType('LineChart').setOptions({
    title: 'Monthly greenness trend: ' + geoidA + ' vs ' + geoidB,
    hAxis: {
      title: 'Month',
      slantedText: true,
      slantedTextAngle: 45,
      textStyle: {fontSize: 10}
    },
    vAxis: {
      title: 'Mean NDVI proxy',
      viewWindow: {min: 0, max: 0.3}
    },
    legend: {position: 'top'},
    lineWidth: 3,
    pointSize: 4,
    interpolateNulls: true,
    series: {
      0: {color: colorA, labelInLegend: 'Tract ' + geoidA},
      1: {color: colorB, labelInLegend: 'Tract ' + geoidB}
    },
    chartArea: {left: 60, top: 45, width: '76%', height: '56%'},
    fontSize: 11
  });

  var lstChart = ui.Chart.feature.byFeature({
    features: table,
    xProperty: 'date',
    yProperties: ['LST_A', 'LST_B']
  }).setChartType('LineChart').setOptions({
    title: 'Monthly surface temperature: ' + geoidA + ' vs ' + geoidB,
    hAxis: {
      title: 'Month',
      slantedText: true,
      slantedTextAngle: 45,
      textStyle: {fontSize: 10}
    },
    vAxis: {
      title: 'LST Celsius',
      viewWindow: {min: 15, max: 70}
    },
    legend: {position: 'top'},
    lineWidth: 3,
    pointSize: 4,
    interpolateNulls: true,
    series: {
      0: {color: colorA, labelInLegend: 'Tract ' + geoidA},
      1: {color: colorB, labelInLegend: 'Tract ' + geoidB}
    },
    chartArea: {left: 60, top: 45, width: '76%', height: '56%'},
    fontSize: 11
  });

  return [
    ui.Panel([fvcChart], null, {
      backgroundColor: '#' + COLORS.white,
      border: '1px solid #' + COLORS.grayMid,
      padding: '6px',
      margin: '6px 0'
    }),
    ui.Panel([lstChart], null, {
      backgroundColor: '#' + COLORS.white,
      border: '1px solid #' + COLORS.grayMid,
      padding: '6px',
      margin: '6px 0'
    })
  ];
}


// ─── SECTION 4: APP STATE ───────────────────────────────────────────

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026'];

// update in v12
var state = {
  currentView:   'explore',
  activeLayer:   'greenspace',
  timeMode:      'compare', 
  splitEnabled:  true,
  fromYear:  2020, fromMonth: 6,
  toYear:    2023, toMonth:   6,
  selectedTract: null,
  compareTracts: []
};


// ─── SECTION 5: UI HELPERS ──────────────────────────────────────────

function makeSectionTitle(text) {
  return ui.Label(text, STYLES.subtitle);
}

function makeSeparator() {
  return ui.Panel(null, null, {
    height: '1px',
    backgroundColor: '#' + COLORS.grayMid,
    margin: '8px 0'
  });
}

function makeStatCard(label) {
  var valLabel   = ui.Label('—', STYLES.statValue);
  var nameLabel  = ui.Label(label, STYLES.statLabel);
  var deltaLabel = ui.Label('', {fontSize: '11px'});
  var card = ui.Panel([nameLabel, valLabel, deltaLabel], null, STYLES.card);
  return {panel: card, name: nameLabel, val: valLabel, delta: deltaLabel}; 
}

function styleTabButton(btn, active) {
  btn.style().set({
    backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill,
    color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText,
    border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid,
    padding: '8px 16px',
    margin: '0 6px 0 0',
    fontSize: '12px',
    fontWeight: active ? 'bold' : 'normal'
  });
}

function stylePillButton(btn, active) {
  btn.style().set({
    backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill,
    color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText,
    border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid,
    padding: '6px 12px',
    margin: '2px 6px 2px 0',
    fontSize: '11px',
    fontWeight: active ? 'bold' : 'normal'
  });
}


// ─── SECTION 6: MAPS ────────────────────────────────────────────────

ui.root.clear();

var leftMap = ui.Map();
leftMap.style().set('stretch', 'both');
var rightMap = ui.Map();

[leftMap, rightMap].forEach(function(m) {
  m.setControlVisibility({
    all: false,
    zoomControl: true,
    scaleControl: true,
    mapTypeControl: true
  });
  m.setOptions('custom', {
    custom: [
      {stylers: [{saturation: -75}]},
      {featureType: 'poi', stylers: [{visibility: 'off'}]},
      {featureType: 'transit', stylers: [{visibility: 'off'}]}
    ]
  });
});

var mapLinker = ui.Map.Linker([leftMap, rightMap]);

var leftDateLabel = ui.Label('Jun 2020', {
  fontSize: '12px',
  fontWeight: 'bold',
  backgroundColor: 'rgba(255,255,255,0.92)',
  padding: '4px 10px',
  position: 'top-left'
});

var rightDateLabel = ui.Label('Jun 2023', {
  fontSize: '12px',
  fontWeight: 'bold',
  backgroundColor: 'rgba(255,255,255,0.92)',
  padding: '4px 10px',
  position: 'top-right'
});

leftMap.add(leftDateLabel);
rightMap.add(rightDateLabel);

var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  orientation: 'horizontal',
  wipe: true,
  style: {stretch: 'both'}
});

var mapContainer = ui.Panel([splitPanel], null, {
  stretch: 'both',
  backgroundColor: '#' + COLORS.white
});


// ─── SECTION 6A: MAP LEGENDS ────────────────────────────────────────

function makeLSTLegend(position) {
  var legend = ui.Panel({
    style: {
      position: position,
      padding: '8px 10px',
      backgroundColor: 'rgba(255,255,255,0.9)',
      shown: false
    }
  });

  var title = ui.Label('LST variation °C', {
    fontSize: '12px',
    fontWeight: 'bold',
    color: COLORS.black,
    margin: '0 0 6px 0'
  });

  var gradient = ui.Thumbnail({
    image: ee.Image.pixelLonLat().select('longitude'),
    params: {
      bbox: [0, 0, 1, 0.1],
      dimensions: '180x16',
      min: 0,
      max: 1,
      palette: lst_vis.palette
    },
    style: {
      stretch: 'horizontal',
      margin: '0 0 4px 0'
    }
  });

  var labels = ui.Panel([
    ui.Label(String(lst_vis.min), {fontSize: '11px', margin: '0'}),
    ui.Label('40', {
      fontSize: '11px',
      margin: '0',
      textAlign: 'center',
      stretch: 'horizontal'
    }),
    ui.Label(String(lst_vis.max), {fontSize: '11px', margin: '0'})
  ], ui.Panel.Layout.flow('horizontal'));

  legend.add(title);
  legend.add(gradient);
  legend.add(labels);

  return legend;
}

var leftLSTLegend = makeLSTLegend('bottom-left');
var rightLSTLegend = makeLSTLegend('bottom-left');
leftMap.add(leftLSTLegend);
rightMap.add(rightLSTLegend);

function updateLegendVisibility() {
  var showLegend = state.activeLayer === 'temperature';
  leftLSTLegend.style().set('shown', showLegend);
  rightLSTLegend.style().set('shown', showLegend);
}


// ─── SECTION 7: LEFT SIDEBAR ────────────────────────────────────────

var appTitle = ui.Label('Las Vegas Valley Turf Tracker', STYLES.appTitle);
var appSubtitle = ui.Label(
  'Urban turf change and surface heat explorer',
  STYLES.muted
);

var headerPanel = ui.Panel([
  appTitle,
  appSubtitle
], null, {
  padding: '14px 14px 10px 14px',
  backgroundColor: '#' + COLORS.white
});

// Tabs
var tabExplore = ui.Button({
  label: 'Tract Profile',
  style: {border: '0px solid transparent'}
});

var tabCompare = ui.Button({
  label: 'Compare Tracts',
  style: {border: '0px solid transparent'}
});

var tabAbout = ui.Button({
  label: 'About',
  style: {border: '0px solid transparent'}
});

var tabRow = ui.Panel([tabExplore, tabCompare, tabAbout],
  ui.Panel.Layout.flow('horizontal'), {
    padding: '0 14px 10px 14px',
    backgroundColor: '#' + COLORS.white,
    margin: '0 0 6px 0'
  }
);

// Layer pills
function makeLayerPill(label, key) {
  var btn = ui.Button(label, function() {
    state.activeLayer = key;
    updateLayerPills();
    refreshMap();
  });

  btn._key = key;

  btn.style().set({
    fontSize: '11px',
    padding: '6px 12px',
    margin: '2px 6px 2px 0',
    border: '0px solid transparent'
  });

  return btn;
}

var pillGreen     = makeLayerPill('Greenness', 'greenspace');
var pillTemp      = makeLayerPill('Heat', 'temperature');
var pillSatellite = makeLayerPill('Satellite', 'satellite');

function updateLayerPills() {
  [pillGreen, pillTemp, pillSatellite].forEach(function(p) {
    var active = (p._key === state.activeLayer);
    stylePillButton(p, active);
  });
}

// ─── NEW TIME CONTROLS LOGIC ───
var timeModeSel = ui.Select({
  items: ['Single month', 'Compare two months'],
  value: 'Compare two months',
  style: {fontSize: '12px', margin: '4px 8px 8px 0', stretch: 'horizontal'}
});

var fromMonthSel = ui.Select({items: MONTHS, value: 'Jun', style: {width: '70px', fontSize: '12px'}});
var fromYearSel  = ui.Select({items: YEARS,  value: '2020', style: {width: '75px', fontSize: '12px'}});
var toMonthSel   = ui.Select({items: MONTHS, value: 'Jun', style: {width: '70px', fontSize: '12px'}});
var toYearSel    = ui.Select({items: YEARS,  value: '2023', style: {width: '75px', fontSize: '12px'}});

var fromLabel = ui.Label('From', {fontSize: '11px', color: COLORS.gray, width: '40px', margin: '10px 8px'});
var toLabel   = ui.Label('To', {fontSize: '11px', color: COLORS.gray, width: '40px', margin: '10px 8px'});

var fromRow = ui.Panel([fromLabel, fromMonthSel, fromYearSel], ui.Panel.Layout.flow('horizontal'));
var toRow   = ui.Panel([toLabel, toMonthSel, toYearSel], ui.Panel.Layout.flow('horizontal'));

function onTimeChange() {
  state.fromMonth = MONTHS.indexOf(fromMonthSel.getValue()) + 1;
  state.fromYear  = parseInt(fromYearSel.getValue(), 10);
  
  if (state.timeMode === 'single') {
    // Force the "To" variables to match the "From" variables secretly
    state.toMonth = state.fromMonth;
    state.toYear  = state.fromYear;
  } else {
    state.toMonth = MONTHS.indexOf(toMonthSel.getValue()) + 1;
    state.toYear  = parseInt(toYearSel.getValue(), 10);
  }
  
  refreshMap();
  if (state.selectedTract) updateSidePanel(state.selectedTract);
}

fromMonthSel.onChange(onTimeChange);
fromYearSel.onChange(onTimeChange);
toMonthSel.onChange(onTimeChange);
toYearSel.onChange(onTimeChange);

timeModeSel.onChange(function(val) {
  if (val === 'Single month') {
    state.timeMode = 'single';
    fromLabel.setValue('Date');
    toRow.style().set('shown', false);
  } else {
    state.timeMode = 'compare';
    fromLabel.setValue('From');
    toRow.style().set('shown', true);
  }
  onTimeChange(); // Trigger the backend update
});



// Map Controls Panel (Split check removed)
var controlsPanel = ui.Panel([
  makeSectionTitle('Map controls'),
  ui.Label('Layer', STYLES.muted),
  ui.Panel([pillGreen, pillTemp, pillSatellite], ui.Panel.Layout.flow('horizontal')),
  makeSeparator(),
  ui.Label('Analysis mode', STYLES.muted),
  timeModeSel,
  fromRow,
  toRow
], null, STYLES.section);

// Explore content
var promptPanel = ui.Panel([
  makeSectionTitle('Select a Tract'),
  ui.Label(
    'Click any census tract on the map to view its local green space changes, surface temperature shifts, and distribution metrics.',
    {fontSize: '12px', color: COLORS.gray, whiteSpace: 'pre-wrap'}
  )
], null, STYLES.section);

var cardGreen = makeStatCard('Green space change');
var cardTemp  = makeStatCard('Surface temperature');
var cardWater = makeStatCard('Water savings');
var cardFVC   = makeStatCard('Vegetation fraction');

var statsGrid1 = ui.Panel([cardGreen.panel, cardTemp.panel], ui.Panel.Layout.flow('horizontal'));
var statsGrid2 = ui.Panel([cardWater.panel, cardFVC.panel], ui.Panel.Layout.flow('horizontal'));

var techContent = ui.Panel([
  ui.Label('Loading...', {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'})
], null, {
  shown: false,
  backgroundColor: '#' + COLORS.grayLight,
  padding: '10px',
  margin: '4px 0'
});

var techToggle = ui.Button('+ Technical detail', function() {
  var shown = techContent.style().get('shown');
  techContent.style().set('shown', !shown);
  techToggle.setLabel(shown ? '+ Technical detail' : '− Technical detail');
});
techToggle.style().set({
  fontSize: '11px', color: '#' + COLORS.gray, backgroundColor: '#' + COLORS.grayLight,
  margin: '4px 0', padding: '6px 8px', border: '0px solid transparent'
});

var resetSelectionBtn = ui.Button('Reset selected tract', function() {
  resetSelectedTract();
});
resetSelectionBtn.style().set({
  fontSize: '11px', color: '#' + COLORS.red, backgroundColor: '#FFFFFF',
  margin: '4px 0 0 0', padding: '6px 8px', border: '2px solid #' + COLORS.red
});

// Charts section (Trend panel removed)
var chartTitle = ui.Label('Selected area distributions', STYLES.subtitle);
var chartNote = ui.Label('Histograms update after you click a tract.', {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'});

var fvcChartHolder = ui.Panel([ui.Label('FVC distribution chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});
var lstChartHolder = ui.Panel([ui.Label('LST distribution chart will appear here.', STYLES.muted)], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '4px 0'});

var chartsPanel = ui.Panel([chartTitle, chartNote, fvcChartHolder, lstChartHolder], null, STYLES.section);

// Stats Panel (Mode indicator and plain English removed)
var statsPanel = ui.Panel([
  makeSectionTitle('What changed?'),
  statsGrid1,
  statsGrid2,
  resetSelectionBtn,
  techToggle,
  techContent
], null, STYLES.section);

var explorePanel = ui.Panel([
  promptPanel,
  statsPanel,
  chartsPanel
], null, {stretch: 'horizontal'});

// About content
var aboutBody = {fontSize: '12px', color: '#' + COLORS.black, whiteSpace: 'pre-wrap', padding: '2px 0 6px 0'};
var aboutMuted = {fontSize: '11px', color: '#' + COLORS.gray, whiteSpace: 'pre-wrap', padding: '2px 0'};
var aboutPipeline = {
  fontSize: '11px', color: '#' + COLORS.black, whiteSpace: 'pre-wrap',
  backgroundColor: '#' + COLORS.white, padding: '8px 10px', margin: '4px 0',
  border: '1px solid #' + COLORS.grayMid
};

var aboutContent = ui.Panel([
  makeSectionTitle('About this dashboard'),
  ui.Label('This dashboard tracks the removal of non-functional turf across the Las Vegas Valley...', aboutBody),
  makeSeparator(),
  ui.Label('Policy background', STYLES.subtitle),
  ui.Label('Nevada Assembly Bill 356 (2021) requires the removal of all non-functional turf...', aboutBody),
  ui.Label('The Southern Nevada Water Authority (SNWA) oversees compliance...', aboutBody),
  makeSeparator(),
  ui.Label('How it works', STYLES.subtitle),
  ui.Label('Green space detection', {fontSize: '11px', fontWeight: 'bold', color: '#' + COLORS.green, margin: '4px 0 0 0'}),
  ui.Label('Sentinel-2 SR imagery\n  → cloud masking (QA60)\n  → monthly median composite\n  → NDVI as FVC proxy\n  → mean per census tract', aboutPipeline),
  ui.Label('Surface temperature', {fontSize: '11px', fontWeight: 'bold', color: '#' + COLORS.orange, margin: '4px 0 0 0'}),
  ui.Label('Landsat 8 C2 Level 2 imagery\n  → cloud masking (QA_PIXEL)\n  → scale factors applied\n  → Kelvin to Celsius\n  → monthly median composite\n  → mean per census tract', aboutPipeline),
  ui.Label('Water savings estimate', {fontSize: '11px', fontWeight: 'bold', color: '#' + COLORS.blue, margin: '4px 0 0 0'}),
  ui.Label('Turf loss area (sq ft)  ×  55.8 gal/sq.ft/yr\nSource: SNWA Xeriscape Conversion Study (2000)', aboutPipeline),
  ui.Label('Spatial units', {fontSize: '11px', fontWeight: 'bold', color: '#' + COLORS.black, margin: '4px 0 0 0'}),
  ui.Label('2020 TIGER census tracts for Clark County...', aboutMuted),
  makeSeparator(),
  ui.Label('Limitations', STYLES.subtitle),
  ui.Label('▸  LST is land surface temperature...', aboutMuted),
  ui.Label('▸  Greenness loss could reflect xeriscape...', aboutMuted),
  ui.Label('▸  Water savings use a fixed conversion factor...', aboutMuted),
  ui.Label('▸  FVC currently uses NDVI as a proxy...', aboutMuted),
  makeSeparator(),
  ui.Label('References', STYLES.subtitle),
  ui.Label('• Nevada AB 356...\n• SNWA Xeriscape Conversion Study (2000)\n• SNWA Water Resource Plan 2026\n• U.S. Census Bureau TIGER/Line 2020 Tracts\n• Copernicus Sentinel-2 SR Harmonized\n• USGS Landsat 8 Collection 2 Level 2', aboutMuted)
], null, STYLES.section);
aboutContent.style().set('shown', false);

// // EXPLORE PANEL: Controls panel is removed from here
// var explorePanel = ui.Panel([
//   promptPanel,
//   statsPanel,
//   trendPanel,
//   chartsPanel,
//   futureAnalysisPanel
// ], null, {stretch: 'horizontal'});

// Compare panel (Initialized with default content)
var compareContent = ui.Panel([
  makeSectionTitle('Compare areas'),
  ui.Label(
    'Click a census tract directly on the map to select your first area for comparison.',
    {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'}
  )
], null, STYLES.section);
compareContent.style().set('shown', false);

// SIDEBAR CONTENT: Controls panel added at the top so it's shared!
var sidebarContent = ui.Panel([
  controlsPanel, 
  explorePanel,
  compareContent,
  aboutContent
], null, {
  stretch: 'horizontal',
  padding: '0 12px 12px 12px'
});

var leftSidebar = ui.Panel([
  headerPanel,
  tabRow,
  sidebarContent
], null, {
  width: '390px',
  stretch: 'vertical',
  backgroundColor: '#' + COLORS.grayLight
});


// ─── SECTION 8: TAB SWITCHING ───────────────────────────────────────

function setActiveTab(tab) {
  state.currentView = tab;

  styleTabButton(tabExplore, tab === 'explore');
  styleTabButton(tabCompare, tab === 'compare');
  styleTabButton(tabAbout,   tab === 'about');

  // Show map controls on Explore & Compare, hide on About
  controlsPanel.style().set('shown', tab !== 'about'); 
  
  explorePanel.style().set('shown', tab === 'explore');
  compareContent.style().set('shown', tab === 'compare');
  aboutContent.style().set('shown', tab === 'about');

  // TRIGGER THE UPDATES
  if (tab === 'explore') refreshMap();
  if (tab === 'compare') updateCompareView();

  // Change what is highlighted on the map depending on the active tab
  updateHighlightLayer(); 
}



tabExplore.onClick(function() { setActiveTab('explore'); });
tabCompare.onClick(function() { setActiveTab('compare'); });
tabAbout.onClick(function()   { setActiveTab('about'); });



// ─── SECTION 9: RESET SELECTED TRACT ────────────────────────────────

function resetSelectedTract() {
  state.selectedTract = null;

  promptPanel.style().set('shown', true);
  statsPanel.style().set('shown', false);
  plainEnglish.setValue('');

  techContent.widgets().reset([
    ui.Label('Loading...', {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'})
  ]);
  techContent.style().set('shown', false);
  techToggle.setLabel('+ Technical detail');

  fvcChartHolder.widgets().reset([ui.Label('FVC distribution chart will appear here.', STYLES.muted)]);
  lstChartHolder.widgets().reset([ui.Label('LST distribution chart will appear here.', STYLES.muted)]);

  updateHighlightLayer();
}

function updateHighlightLayer() {
  // 1. Remove ALL existing highlights from both maps
  [leftMap, rightMap].forEach(function(m) {
    var layers = m.layers();
    var layersToRemove = [];
    layers.forEach(function(l) {
      var name = l.getName();
      if (name === 'Selected tract' || (name && name.indexOf('Compare tract:') !== -1)) {
        layersToRemove.push(l);
      }
    });
    layersToRemove.forEach(function(l) { layers.remove(l); });
  });

  // 2. Draw Compare Highlights ONLY if on the compare tab
  if (state.currentView === 'compare') {
    state.compareTracts.forEach(function(t) {
      var compStyle = ee.FeatureCollection([ee.Feature(t.feature.geometry())])
        .style({color: t.color, fillColor: t.color + '40', width: 3});
      leftMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
      if (state.splitEnabled) rightMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
    });
  }

  // 3. Draw Single Select Highlight ONLY if on the explore tab
  if (state.currentView === 'explore' && state.selectedTract) {
    var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())])
      .style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2});
    leftMap.addLayer(highlightStyle, {}, 'Selected tract');
    if (state.splitEnabled) rightMap.addLayer(highlightStyle, {}, 'Selected tract');
  }
}





// ─── SECTION 10: MAP REFRESH ────────────────────────────────────────

// update the whoel function below in v12
function refreshMap() {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

  // Set the date label based on the mode
  leftDateLabel.setValue(
    isSameDate ? 
    MONTHS[state.fromMonth - 1] + ' ' + state.fromYear : 
    MONTHS[state.fromMonth - 1] + ' ' + state.fromYear + ' vs ' + MONTHS[state.toMonth - 1] + ' ' + state.toYear
  );

  leftMap.layers().reset();
  mapContainer.widgets().reset([leftMap]);
  rightDateLabel.style().set('shown', false);

  // DATA LAYERS
  if (isSameDate) {
    if (state.activeLayer === 'greenspace') {
      leftMap.addLayer(getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC Snapshot');
    } else if (state.activeLayer === 'temperature') {
      leftMap.addLayer(getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST Snapshot');
    } else {
      leftMap.addLayer(getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'Satellite Snapshot');
    }
  } else {
    if (state.activeLayer === 'greenspace') {
      var fvcDiff = getFVCImage(state.toYear, state.toMonth).subtract(getFVCImage(state.fromYear, state.fromMonth));
      leftMap.addLayer(fvcDiff, {min: -0.3, max: 0.1, palette: ['#A50026','#F46D43','#FEE090','#E0F3DB','#1B7837']}, 'FVC change');
    } else if (state.activeLayer === 'temperature') {
      var lstDiff = getLSTImage(state.toYear, state.toMonth).subtract(getLSTImage(state.fromYear, state.fromMonth));
      leftMap.addLayer(lstDiff, {min: -5, max: 5, palette: ['#2C7BB6','#ABD9E9','#FFFFBF','#FDAE61','#D7191C']}, 'LST change');
    } else {
      leftMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'Satellite View');
    }
  }

  // VECTORS AND BOUNDARIES
  var tractStyle = tracts.style({color: COLORS.primary + '99', fillColor: '00000000', width: 0.8});
  leftMap.addLayer(tractStyle, {}, 'Census tracts');

  var boundaryStyle = lasvegas_boundary.style({color: COLORS.primary, fillColor: '00000000', width: 2});
  leftMap.addLayer(boundaryStyle, {}, 'Study area');

  if (parcels !== null) {
    var parcelStyle = parcels.style({color: '00000030', fillColor: '00000000', width: 0.3});
    leftMap.addLayer(parcelStyle, {}, 'Parcels');
  }

  // HIGHLIGHTS
  state.compareTracts.forEach(function(t) {
    var compStyle = ee.FeatureCollection([ee.Feature(t.feature.geometry())]).style({color: t.color, fillColor: t.color + '40', width: 3});
    leftMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
  });

  if (state.selectedTract) {
    var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())]).style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2});
    leftMap.addLayer(highlightStyle, {}, 'Selected tract');
  }

  updateLegendVisibility();
  if (roi) leftMap.centerObject(roi, 11);
}


// ─── SECTION 11: MAP CLICK → SIDEBAR + CHARTS ───────────────────────

function handleMapClick(coords) {
  if (state.currentView === 'about') return; // Do nothing on About tab

  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var clicked = tracts.filterBounds(point).first();

  clicked.evaluate(function(f) {
    if (!f) return;
    var tract = ee.Feature(f);
    
    // Route the click based on the active tab
    if (state.currentView === 'explore') {
      updateSidePanel(tract);
    } else if (state.currentView === 'compare') {
      handleCompareClick(tract);
    }
  });
}

leftMap.onClick(handleMapClick);
rightMap.onClick(handleMapClick);

function handleCompareClick(tract) {
  // If they already have 2, clear it to start a new pair
  if (state.compareTracts.length >= 2) {
    state.compareTracts = []; 
  }

  tract.get('GEOID').evaluate(function(geoid) {
    var already = state.compareTracts.some(function(t) { return t.geoid === geoid; });
    if (!already) {
      state.compareTracts.push({
        geoid: geoid,
        feature: tract,
        color: [COLORS.blue, COLORS.coral][state.compareTracts.length]
      });
      updateCompareView();
      updateHighlightLayer();
    }
  });
}


function updateDistributionCharts(tractGeom) {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

  var fvcBefore = getFVCImage(state.fromYear, state.fromMonth);
  var lstBefore = getLSTImage(state.fromYear, state.fromMonth);

  var fvcChart, lstChart;

  if (isSameDate) {
    var dateLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;

    fvcChart = ui.Chart.image.histogram({
      image: fvcBefore.rename(dateLabel), region: tractGeom, scale: 10, maxPixels: 1e7
    }).setOptions({
      title: 'FVC distribution: ' + dateLabel,
      hAxis: { title: 'FVC / NDVI proxy', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} },
      vAxis: {title: 'Pixel count'},
      series: { 0: {color: '#1B5E20'} },
      legend: {position: 'none'},
      chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });

    lstChart = ui.Chart.image.histogram({
      image: lstBefore.rename(dateLabel), region: tractGeom, scale: 30, maxPixels: 1e7
    }).setOptions({
      title: 'LST distribution: ' + dateLabel,
      hAxis: { title: 'Temperature (°C)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} },
      vAxis: {title: 'Pixel count'},
      series: { 0: {color: '#D95F0E'} },
      legend: {position: 'none'},
      chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });

  } else {
    var fromLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
    var toLabel   = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
    var fvcAfter  = getFVCImage(state.toYear, state.toMonth);
    var lstAfter  = getLSTImage(state.toYear, state.toMonth);

    var fvcStack = fvcBefore.rename('Before').addBands(fvcAfter.rename('After'));
    var lstStack = lstBefore.rename('Before').addBands(lstAfter.rename('After'));

    fvcChart = ui.Chart.image.histogram({
      image: fvcStack, region: tractGeom, scale: 10, maxPixels: 1e7
    }).setOptions({
      title: 'FVC distribution: ' + fromLabel + ' vs ' + toLabel,
      hAxis: { title: 'FVC / NDVI proxy', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} },
      vAxis: {title: 'Pixel count'},
      series: { 0: {color: '#8FBF73'}, 1: {color: '#1B5E20'} },
      legend: {position: 'top'},
      chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });

    lstChart = ui.Chart.image.histogram({
      image: lstStack, region: tractGeom, scale: 30, maxPixels: 1e7
    }).setOptions({
      title: 'LST distribution: ' + fromLabel + ' vs ' + toLabel,
      hAxis: { title: 'Temperature (°C)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} },
      vAxis: {title: 'Pixel count'},
      series: { 0: {color: '#6BAED6'}, 1: {color: '#D95F0E'} },
      legend: {position: 'top'},
      chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });
  }

  fvcChartHolder.widgets().reset([fvcChart]);
  lstChartHolder.widgets().reset([lstChart]);
}




function updateSidePanel(tract) {
  state.selectedTract = tract;
  // addCompareBtn.setLabel('+ Add to comparison');

  promptPanel.style().set('shown', false);
  statsPanel.style().set('shown', true);

  var tractGeom = tract.geometry();
  var geoid = tract.get('GEOID');
  var aland = ee.Number(tract.get('ALAND'));

  var fvcBefore = getFVCImage(state.fromYear, state.fromMonth);
  var fvcAfter  = getFVCImage(state.toYear, state.toMonth);
  var lstBefore = getLSTImage(state.fromYear, state.fromMonth);
  var lstAfter  = getLSTImage(state.toYear, state.toMonth);

  ee.Dictionary({
    fvcStart: fvcBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
    fvcEnd: fvcAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
    lstStart: lstBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
    lstEnd: lstAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
    aland: aland,
    geoid: geoid
  }).evaluate(function(v) {
    if (!v) { plainEnglish.setValue('Error loading data for this tract.'); return; }

    // UNCOMMENTED THESE LINES:
    var fS = v.fvcStart || 0;
    var fE = v.fvcEnd || 0;
    var lS = v.lstStart || 0;
    var lE = v.lstEnd || 0;
    var alandSqm = v.aland || 0;
    var alandAcres = alandSqm / 4046.86;
    
    // ... [Keep your variable declarations for fS, fE, lS, lE, etc.] ...

    var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);

    // Set values based on mode
    if (isSameDate) {
      statsPanel.widgets().get(0).setValue('Tract Statistics'); // Set Title
      statsGrid2.style().set('shown', false);

      cardGreen.name.setValue('Mean greenness (FVC)');
      cardGreen.val.setValue((fS).toFixed(3));
      cardGreen.delta.setValue('proxy value');
      
      cardTemp.name.setValue('Mean surface temp');
      cardTemp.val.setValue((lS).toFixed(1) + '°C');
      cardTemp.delta.setValue('land surface temperature');

    } else {
      statsPanel.widgets().get(0).setValue('What changed?'); // Set Title
      statsGrid2.style().set('shown', true);

      var fvcChangePct  = fS > 0 ? ((fE - fS) / fS * 100) : 0;
      var turfLossAcres = Math.abs(fE - fS) * alandAcres;
      var lstChange     = lE - lS;
      var turfLossSqFt  = turfLossAcres * 43560;
      var waterSaved    = turfLossSqFt * 55.8;
      var fvcAbsChange  = fE - fS;

      cardGreen.name.setValue('Green space change');
      cardGreen.val.setValue(fvcChangePct.toFixed(1) + '%');
      cardGreen.delta.setValue(turfLossAcres.toFixed(1) + ' acres');
      cardGreen.delta.style().set('color', fvcChangePct < 0 ? COLORS.red : COLORS.green);

      cardTemp.name.setValue('Surface temperature');
      cardTemp.val.setValue((lstChange >= 0 ? '+' : '') + lstChange.toFixed(1) + '°C');
      cardTemp.delta.setValue('between selected dates');
      cardTemp.delta.style().set('color', lstChange > 0 ? COLORS.red : COLORS.green);

      var wLabel = waterSaved >= 1e6 ? (waterSaved / 1e6).toFixed(1) + 'M gal/yr'
                 : waterSaved >= 1e3 ? (waterSaved / 1e3).toFixed(0) + 'K gal/yr'
                 : waterSaved.toFixed(0) + ' gal/yr';

      cardWater.val.setValue(wLabel);
      cardWater.delta.setValue('estimated');
      cardWater.delta.style().set('color', COLORS.green);

      cardFVC.val.setValue(fvcAbsChange.toFixed(3));
      cardFVC.delta.setValue('mean FVC change');
      cardFVC.delta.style().set('color', fvcAbsChange < 0 ? COLORS.red : COLORS.green);
    }

    // --- Technical details ---
    var techLabelStyle = {fontSize: '11px', color: '#' + COLORS.gray, margin: '0', padding: '0'};
    var techValueStyle = {fontSize: '11px', color: '#' + COLORS.black, margin: '0 0 4px 0', padding: '0'};
    var techHeadStyle  = {fontSize: '11px', fontWeight: 'bold', color: '#' + COLORS.black, margin: '8px 0 2px 0', padding: '0'};

    techContent.widgets().reset([
      ui.Label('Tract', techHeadStyle),
      ui.Label('GEOID:  ' + (v.geoid || '—'), techValueStyle),
      ui.Label('Area:  ' + alandAcres.toFixed(1) + ' acres  (' + (alandSqm / 1e6).toFixed(2) + ' km²)', techValueStyle),
      makeSeparator(),
      ui.Label('Observed values', techHeadStyle),
      ui.Label('FVC (mean):  ' + fS.toFixed(4) + (isSameDate ? '' : '  →  ' + fE.toFixed(4) + '  (Δ ' + (fE - fS).toFixed(4) + ')'), techValueStyle),
      ui.Label('LST (mean):  ' + lS.toFixed(1) + '°C' + (isSameDate ? '' : '  →  ' + lE.toFixed(1) + '°C  (Δ ' + (lE - lS).toFixed(1) + '°C)'), techValueStyle),
      makeSeparator(),
      ui.Label('Data sources', techHeadStyle),
      ui.Label('Green space:  Sentinel-2 SR — NDVI proxy', techLabelStyle),
      ui.Label('Temperature:  Landsat 8 C2 L2 — surface temperature', techLabelStyle)
    ]);
    
    updateHighlightLayer();
  });

  // CRITICAL: Remove the updateTrendCharts(tractGeom) call here! 
  updateDistributionCharts(tractGeom);
}



// ─── SECTION 12: COMPARE VIEW ───────────────────────────────────────

var resetCompareBtn = ui.Button('Reset comparison', function() {
  state.compareTracts = [];
  updateCompareView();
  updateHighlightLayer();
});

resetCompareBtn.style().set({
  fontSize: '11px', color: '#' + COLORS.red,
  backgroundColor: '#FFFFFF', margin: '4px 0 8px 0',
  padding: '6px 8px', border: '2px solid #' + COLORS.red
});

function updateCompareView() {
  var n = state.compareTracts.length;

  // STATE 0: No tracts selected yet
  if (n === 0) {
    compareContent.widgets().reset([
      makeSectionTitle('Compare areas'),
      ui.Label(
        'Click a census tract directly on the map to select your first area for comparison.', 
        {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'}
      )
    ]);
    return;
  }

  // STATE 1: One tract selected
  if (n === 1) {
    compareContent.widgets().reset([
      makeSectionTitle('Compare areas'),
      ui.Label(
        '● Tract ' + state.compareTracts[0].geoid, 
        {fontSize: '13px', fontWeight: 'bold', color: '#' + state.compareTracts[0].color, padding: '4px 0'}
      ),
      resetCompareBtn,
      ui.Label(
        'Click a second tract on the map to compare against.', 
        {fontSize: '12px', color: '#' + COLORS.gray, padding: '12px 0'}
      )
    ]);
    return;
  }

  // STATE 2: Both tracts selected
  var tractA = state.compareTracts[0];
  var tractB = state.compareTracts[1];

  compareContent.widgets().reset([
    makeSectionTitle('Compare areas'),
    ui.Label(
      '● Tract ' + tractA.geoid, 
      {fontSize: '13px', fontWeight: 'bold', color: '#' + tractA.color, padding: '4px 0 2px 0'}
    ),
    ui.Label(
      '● Tract ' + tractB.geoid, 
      {fontSize: '13px', fontWeight: 'bold', color: '#' + tractB.color, padding: '0 0 8px 0'}
    ),
    resetCompareBtn,
    ui.Label(
      'Generating comparison charts...', 
      {fontSize: '11px', color: '#' + COLORS.gray, fontStyle: 'italic', padding: '12px 0'}
    )
  ]);

  // Generate charts
  ee.Number(1).evaluate(function() {
    var chartPanels = makeCompareTrendCharts(tractA, tractB);
    
    // Replace the loading text with the actual charts description
    compareContent.widgets().set(4, ui.Label(
      'Overlay monthly trends for the two selected tracts over the selected date range.',
      {fontSize: '11px', color: '#' + COLORS.gray, whiteSpace: 'pre-wrap', padding: '0 0 8px 0'}
    ));
    compareContent.add(chartPanels[0]);
    compareContent.add(chartPanels[1]);
  });
}



// ─── SECTION 13: APP ASSEMBLY ───────────────────────────────────────

var contentRow = ui.Panel([
  leftSidebar,
  mapContainer
], ui.Panel.Layout.flow('horizontal'), {
  stretch: 'both'
});

ui.root.add(contentRow);


// ─── SECTION 14: INIT ───────────────────────────────────────────────

styleTabButton(tabExplore, true);
styleTabButton(tabCompare, false);
styleTabButton(tabAbout, false);

setActiveTab('explore');
updateLayerPills();
refreshMap();

print('─── Las Vegas Valley Turf Tracker loaded ───');
print('Click a census tract on the map to view statistics.');
print('Change months with the dropdowns. Toggle split view on/off.');
print('Use "+ Add to comparison" to collect tracts for the Compare tab.');