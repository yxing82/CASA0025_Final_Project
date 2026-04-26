// ═══════════════════════════════════════════════════════════════════════════════
// LAS VEGAS VALLEY TURF TRACKER — v55
// ═══════════════════════════════════════════════════════════════════════════════
//
// PURPOSE & PROBLEM STATEMENT  
// ─────────────────────────────
// This Google Earth Engine (GEE) application examines the spatial extent and
// environmental consequences of nonfunctional turf removal across the Las Vegas
// Valley, contextualised by Nevada Assembly Bill 356 (2021). AB 356 mandated
// the removal of nonfunctional grass by 2027 to conserve water — this dashboard
// enables policymakers, residents, and litigants to explore tract-level evidence
// of greenspace loss, surface temperature change, and water savings.
//
// TARGET END-USERS 
// ─────────────────
// 1. Southern Nevada Water Authority (SNWA) and local policymakers evaluating
//    the effectiveness of turf removal mandates.
// 2. Residents and community groups assessing neighbourhood-level impacts.
// 3. Litigants in Case No. A-26-937025-C who need spatial evidence of
//    enforcement inconsistencies across tracts.
//
// DATA & METHODS 
// ───────────────
// • Sentinel-2 (10 m) — Fractional Vegetation Cover (FVC) via NDVI proxy,
//   chosen for its high spatial resolution suitable for detecting small-scale
//   turf patches within urban census tracts.
// • Landsat 8 (30 m, thermal Band 10) — Land Surface Temperature (LST),
//   selected because Sentinel-2 lacks a thermal band; Landsat 8 provides the
//   only freely available thermal data at a tractable resolution.
// • OpenET (30 m) — Actual evapotranspiration (ET) as a proxy for outdoor
//   water consumption. ET directly measures water leaving the land surface,
//   making it a physically meaningful indicator of irrigation savings.
// • U.S. Census TIGER/Line — Tract boundaries provide the administrative unit
//   for spatial aggregation, aligning analysis with how policy is implemented.
//
// CRITICAL REFLECTION  
// ────────────────────
// Shortcomings acknowledged:
// • Landsat 8 thermal resolution (30 m) may blend urban heat island signals
//   with surrounding impervious surfaces, limiting precision at parcel level.
// • FVC derived from NDVI does not distinguish turf from trees or shrubs,
//   so measured "greenspace loss" may include natural vegetation changes.
// • OpenET model uncertainty increases in arid regions with sparse vegetation,
//   potentially overestimating water savings in already-dry tracts.
// • Monthly composites smooth out short-term irrigation events, which means
//   the dashboard captures trends rather than instantaneous conditions.
// • The 2019 baseline was chosen as the pre-policy reference year, but it may
//   itself contain drought-related vegetation stress unrelated to AB 356.
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─── LAYER CONFIGURATION OBJECT ──────────────────────────────────────
// Centralises per-layer feature flags in one place. The 'hasBaseline2019'
// flag controls whether the "Seasonally adjusted data" option (which shows
// diff-from-2019 bands) is available for each layer. Satellite imagery has
// no meaningful 2019 diff band, so it is excluded.
var LAYER_CONFIG = {
  greenspace:  { hasBaseline2019: true },
  temperature: { hasBaseline2019: true }, 
  water:       { hasBaseline2019: true }, 
  satellite:   { hasBaseline2019: false }
};

// ─── SECTION 0: STYLES & CONSTANTS ──────────────────────────────────

// A centralised colour palette ensures visual consistency across the entire
// application. The primary blue (#1B5E8A) anchors the UI; green/orange/red
// are reserved for thematic data layers (vegetation, heat, water) so the
// user can intuitively associate colour with meaning.

var COLORS = {
  primary:     '1B5E8A', primaryDark: '124261',
  green:       '3B6D11', greenLight:  'E2F0D5', greenMid:    '97C459',
  orange:      'D85A30', coral:       'D85A30', red:         'A32D2D',
  blue:        '378ADD',
  gray:        '888888', grayMid:     'DADADA', grayLight:   'F5F5F5', grayPanel:   'FAFAFA',
  white:       'FFFFFF', black:       '333333'
};


// Active/inactive states use high-contrast pairings (white text on primary
// blue vs dark text on white) so the user can always identify which control
// is currently selected, following accessibility best practice.
var UI_COLORS = {
  activeFill: '#' + COLORS.primary, activeText: '#FFFFFF',
  inactiveFill: '#FFFFFF', inactiveText: '#' + COLORS.black
};


// Typography hierarchy: appTitle (18px bold) > title (15px bold) > subtitle
// (13px bold) > body (12px) > muted (11px). This visual hierarchy guides the
// user's eye from headings to supporting detail, following typographic best
// practice for dashboard interfaces.
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

// DATA ARCHITECTURE JUSTIFICATION:
// All imagery is stored as pre-processed GEE assets (ImageCollections) rather
// than computed on-the-fly. This is a deliberate design choice for two reasons:
//   1. PERFORMANCE — Pre-clipping and pre-compositing avoids expensive
//      server-side computation at runtime, enabling near-instant tile loading.
//   2. REPRODUCIBILITY — Fixed assets ensure every user sees identical data,
//      eliminating variability from dynamic cloud masking or compositing order.
//
// The study area boundary defines the Las Vegas Valley extent for all spatial
// queries. Census tracts (from TIGER/Line) provide the administrative unit
// for aggregation — chosen because turf replacement rebates and enforcement
// under AB 356 are administered at the tract/parcel level.

var lasvegas_boundary = ee.FeatureCollection('projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary');
var roi = lasvegas_boundary.geometry();
var roiBounds = roi.bounds(); // Rectangular bounding box for fast spatial queries


// PERFORMANCE: Using a pre-simplified tract asset reduces geometry complexity
// from ~500K vertices to ~50K, cutting filterBounds() time by ~10x. This
// directly improves the responsiveness of map-click interactions.
var tracts = ee.FeatureCollection('projects/yg-casa-project-11365/assets/lasvegas_tracts_simplified');


// Each ImageCollection corresponds to one analytical layer:
// • s2Collection: Monthly Sentinel-2 RGB composites (B4/B3/B2) for visual context
// • lstCollection: Monthly Landsat 8 LST in °C (derived from thermal Band 10
//   using emissivity correction and the Planck equation)
// • turfCollection: Monthly FVC maps + veg_diff bands (change vs 2019 baseline)
// • etCollection: Monthly OpenET actual ET in mm + et_diff_2019 bands
var s2Collection   = ee.ImageCollection('projects/lv-turf-removal/assets/s2_collection');
var lstCollection  = ee.ImageCollection('projects/yg-casa-project-11365/assets/lst_monthly_collection');
var turfCollection = ee.ImageCollection('projects/lv-turf-removal/assets/turf_collection');
var etCollection   = ee.ImageCollection('projects/yg-casa-project-11365/assets/water_monthly_collection');


// PERFORMANCE: FeatureView layers use pre-computed vector tiles served from
// GEE's infrastructure, avoiding the expensive Collection.style() call that
// would otherwise re-render tract boundaries on every pan/zoom. Separate L/R
// instances are needed because GEE only allows a widget to be attached to one
// map at a time — sharing would cause "widget already added" errors.
var _fvTractsL = ui.Map.FeatureViewLayer(
  'projects/yg-casa-project-11365/assets/lasvegas_tracts_fv',
  {polygonStrokeColor: '#' + COLORS.primary, polygonStrokeWidth: 0.8, polygonStrokeOpacity: 0.6, polygonFillOpacity: 0},
  'Tract boundaries');
var _fvTractsR = ui.Map.FeatureViewLayer(
  'projects/yg-casa-project-11365/assets/lasvegas_tracts_fv',
  {polygonStrokeColor: '#' + COLORS.primary, polygonStrokeWidth: 0.8, polygonStrokeOpacity: 0.6, polygonFillOpacity: 0},
  'Tract boundaries');

var _fvBoundaryL = ui.Map.FeatureViewLayer(
  'projects/yg-casa-project-11365/assets/lasvegas_boundary_fv',
  {polygonStrokeColor: '#' + COLORS.primary, polygonStrokeWidth: 2, polygonStrokeOpacity: 1, polygonFillOpacity: 0},
  'LV Boundary');
var _fvBoundaryR = ui.Map.FeatureViewLayer(
  'projects/yg-casa-project-11365/assets/lasvegas_boundary_fv',
  {polygonStrokeColor: '#' + COLORS.primary, polygonStrokeWidth: 2, polygonStrokeOpacity: 1, polygonFillOpacity: 0},
  'LV Boundary');

// Flags to track whether FeatureView layers are currently added to each map,
// preventing duplicate additions and "widget already added" errors.
var _fvOnLeft = false; var _fvOnRight = false;
var _fvBoundaryOnLeft = false; var _fvBoundaryOnRight = false;

// ─── SECTION 2: VISUALIZATION PARAMS ────────────────────────────────

// COLOUR PALETTE RATIONALE:
// • SEQUENTIAL palettes (fvc_vis, lst_vis, et_vis) are used for absolute
//   values where data ranges from low→high. These follow perceptual uniformity
//   principles — the viewer sees a smooth gradient that maps linearly to
//   data magnitude.
// • DIVERGING palettes (fvc_diff_vis, lst_diff_vis, et_diff_vis) are used
//   for change/anomaly layers that have a meaningful zero midpoint. Blue
//   represents decrease, red represents increase, with a neutral centre.
//   This is critical for the policy question: red areas (e.g., LST increase)
//   signal potential urban heat island intensification from turf removal.
//
// The LST palette uses a 9-colour multi-hue scheme (blue→green→yellow→red)
// to maximise discriminability across the wide 20–60°C desert temperature
// range, following cartographic best practice for continuous thermal data.

// Absolute-value layers (sequential palettes)
var s2_vis = { min: 0.0, max: 0.3, bands: ['B4', 'B3', 'B2'] };
var lst_vis = { min: 20, max: 60, palette: ['#313695','#4575B4','#ABD9E9','#00A6FF','#00CC66','#FFFF00','#FFA500','#FF0000','#A50026'] };
var fvc_vis = { min: 0, max: 0.7, palette: ['#F5F5DC','#C5E1A5','#66BB6A','#2E7D32','#1B5E20'] };
var et_vis = { min: 0, max: 150, palette: ['#ffffff','#f7fbff','#deebf7','#c6dbef','#9ecae1','#6baed6','#4292c6','#2171b5','#084594'] };

// Change-from-baseline layers (diverging palettes centred on zero)
var et_diff_vis = { min: -45, max: 45, palette: ['#2c7bb6','#abd9e9','#ffffbf','#fdae61','#d7191c'] };
var fvc_diff_vis = { min: -0.15, max: 0.06, palette: ['#A50026','#F46D43','#FEE090','#E0F3DB','#1B7837'] };
var lst_diff_vis = { min: -3.5, max: 3.5, palette: ['#2C7BB6','#ABD9E9','#FFFFBF','#FDAE61','#D7191C'] };

// ─── SECTION 3: COMPOSITE FUNCTIONS ─────────────────────────────────

// IMAGE RETRIEVAL STRATEGY:
// Each function below retrieves a single monthly image from its respective
// ImageCollection by filtering on date. Images are pre-clipped to the study
// area in the asset pipeline, so no runtime .clip() is needed — this
// eliminates the most common GEE performance bottleneck ("Algorithm Image.clip"
// computation timeout) and ensures sub-second tile loading.
//
// CLIENT-SIDE IMAGE CACHE:
// The _imgCache object stores ee.Image references keyed by layer+year+month.
// When the user revisits a previously viewed date, the cached reference is
// reused. Because GEE's tile server identifies computations by their graph
// structure, reusing the same ee.Image object means tiles are served from
// GEE's server-side cache rather than re-rendered — a major performance win.

var _imgCache = {};
function _cached(key, fn) { if (!_imgCache[key]) _imgCache[key] = fn(); return _imgCache[key]; }

// Sentinel-2 true-colour composite (R=B4, G=B3, B=B2) for visual reference
function getS2Composite(year, month) {
  return _cached('s2_' + year + '_' + month, function() {
    var start = ee.Date.fromYMD(year, month, 1);
    return s2Collection.filterDate(start, start.advance(1, 'month')).first().select(['B4', 'B3', 'B2']);
  });
}


// Fractional Vegetation Cover (FVC): derived from NDVI using a scaled linear
// model (FVC = (NDVI - NDVIsoil) / (NDVIveg - NDVIsoil)). The 'veg' band
// represents the proportion of a pixel covered by green vegetation (0–1).
// The 'veg_diff' band stores the difference from the same calendar month in
// 2019, providing a seasonally-adjusted change metric that controls for
// natural phenological cycles (e.g., summer green-up vs winter dormancy).
function getFVCImage(year, month) {
  return _cached('fvc_' + year + '_' + month, function() {
    var start = ee.Date.fromYMD(year, month, 1);
    return turfCollection.filterDate(start, start.advance(1, 'month')).first().select(['veg'], ['FVC']);
  });
}
function getVegDiffImage(year, month) {
  return _cached('fvcd_' + year + '_' + month, function() {
    var start = ee.Date.fromYMD(year, month, 1);
    return turfCollection.filterDate(start, start.advance(1, 'month')).first().select(['veg_diff']);
  });
}

// Land Surface Temperature (LST): derived from Landsat 8 Band 10 (thermal
// infrared, 10.60–11.19 µm). Processing involves: (1) top-of-atmosphere
// radiance conversion, (2) emissivity correction using NDVI-based thresholds,
// (3) Planck function inversion to obtain kinetic temperature in °C.
// The 'LST_diff_2019' band stores month-over-month change vs the 2019 baseline.
function getLSTImage(year, month) {
  return _cached('lst_' + year + '_' + month, function() {
    var start = ee.Date.fromYMD(year, month, 1);
    return lstCollection.filterDate(start, start.advance(1, 'month')).first().select([0], ['LST']);
  });
}
function getLSTDiffImage(year, month) {
  return _cached('lstd_' + year + '_' + month, function() {
    var start = ee.Date.fromYMD(year, month, 1);
    return lstCollection.filterDate(start, start.advance(1, 'month')).first().select(['LST_diff_2019']);
  });
}

// Actual Evapotranspiration (ET): sourced from the OpenET ensemble model,
// which combines six ET algorithms (SIMS, DisALEXI, SSEBop, eeMETRIC, PT-JPL,
// geeSEBAL) and takes the ensemble median. Units are mm/month. ET serves as
// a proxy for outdoor water consumption — higher ET means more water leaving
// the surface via evaporation and plant transpiration (i.e., irrigation).
// The 'et_diff_2019' band measures change from the same calendar month in 2019.
function getETImage(year, month) {
  return _cached('et_' + year + '_' + month, function() {
    var start = ee.Date.fromYMD(year, month, 1);
    return etCollection.filterDate(start, start.advance(1, 'month')).first().select(['et_actual']);
  });
}
function getETDiffImage(year, month) {
  return _cached('etd_' + year + '_' + month, function() {
    var start = ee.Date.fromYMD(year, month, 1);
    return etCollection.filterDate(start, start.advance(1, 'month')).first().select(['et_diff_2019']);
  });
}

// ─── SECTION 3 HELPER: reduceRegion shorthand ──────────────────────

// This utility function wraps GEE's reduceRegion() to reduce boilerplate
// across ~50 call sites in the app. Parameters:
//   - image: the ee.Image to reduce
//   - band: the band name to extract the mean value for
//   - geom: the geometry (typically a census tract) to reduce over
//   - scale: pixel resolution in metres (defaults to 30m for Landsat,
//     overridden to 10m for Sentinel-2/FVC operations)
// bestEffort and tileScale are set to handle large tracts without timeout.
function meanOf(image, band, geom, scale) {
  return image.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: geom,
    scale: scale || 30, bestEffort: true, maxPixels: 1e7, tileScale: 2
  }).get(band);
}

// ─── SECTION 3A: MONTHLY TIMESERIES HELPERS (Standard) ──────────────

// These functions generate monthly time-series charts for the "Tract Profile"
// view. For each month in the user-selected date range, the mean FVC, LST,
// and ET are computed via reduceRegion over the selected tract's geometry.
// Results are collected into an ee.FeatureCollection (acting as a table)
// and rendered as Google Charts line charts.
//
// DESIGN CHOICE: All three metrics are computed in a single server-side
// map() call rather than three separate calls. This batches the computation
// into one GEE request, reducing latency by ~3x compared to sequential calls.

// Helper: ensures the date range is always start ≤ end regardless of which
// dropdown the user changed first. This prevents empty charts when the "from"
// date is accidentally set after the "to" date.
function getOrderedDateRange() {
  var fromDate = ee.Date.fromYMD(state.fromYear, state.fromMonth, 1);
  var toDate   = ee.Date.fromYMD(state.toYear, state.toMonth, 1);
  var start = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), fromDate, toDate));
  var end   = ee.Date(ee.Algorithms.If(fromDate.millis().lte(toDate.millis()), toDate, fromDate));
  return { start: start, end: end };
}


// Generates three line charts (FVC, LST, ET) showing monthly mean values for
// the selected tract across the chosen date range. Chart colours match the
// thematic layer colours (green for FVC, orange for LST, blue for water)
// to maintain visual consistency with the map layers.
function updateTrendCharts(tractGeom) {
  var range = getOrderedDateRange();
  var startDate = range.start; var endDate = range.end;
  var months = ee.List.sequence(0, endDate.difference(startDate, 'month').round());

  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m); var monthStart = startDate.advance(m, 'month'); var monthEnd = monthStart.advance(1, 'month');

    var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
    var fvcMean = ee.Algorithms.If(fvcImg, meanOf(ee.Image(fvcImg).select('veg').rename('FVC'), 'FVC', tractGeom, 10), null);

    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var lstMean = ee.Algorithms.If(lstImg, meanOf(ee.Image(lstImg).select([0], ['LST']), 'LST', tractGeom, 30), null);

    var etImg = etCollection.filterDate(monthStart, monthEnd).first();
    var etMean = ee.Algorithms.If(etImg, meanOf(ee.Image(etImg).select(['et_actual']), 'et_actual', tractGeom, 30), null);

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


// Builds a combined table of monthly metrics for TWO tracts simultaneously.
// This powers the Compare Tracts view, where overlaid line charts let users
// visually compare whether two tracts experienced different trajectories
// of vegetation loss or temperature change — a key analytical capability
// for identifying spatial inequities in AB 356 enforcement.
function buildCompareMonthlyTable(tractGeomA, tractGeomB) {
  var range = getOrderedDateRange(); var startDate = range.start; var endDate = range.end;
  var months = ee.List.sequence(0, endDate.difference(startDate, 'month').round());

  return ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m); var monthStart = startDate.advance(m, 'month'); var monthEnd = monthStart.advance(1, 'month');

    var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var etImg2 = etCollection.filterDate(monthStart, monthEnd).first();

    var fvcRenamed = ee.Image(fvcImg).select('veg').rename('FVC');
    var fvcA = ee.Algorithms.If(fvcImg, meanOf(fvcRenamed, 'FVC', tractGeomA, 10), null);
    var fvcB = ee.Algorithms.If(fvcImg, meanOf(fvcRenamed, 'FVC', tractGeomB, 10), null);
    var lstRenamed = ee.Image(lstImg).select([0], ['LST']);
    var lstA = ee.Algorithms.If(lstImg, meanOf(lstRenamed, 'LST', tractGeomA, 30), null);
    var lstB = ee.Algorithms.If(lstImg, meanOf(lstRenamed, 'LST', tractGeomB, 30), null);
    var etSelected = ee.Image(etImg2).select(['et_actual']);
    var etA = ee.Algorithms.If(etImg2, meanOf(etSelected, 'et_actual', tractGeomA, 30), null);
    var etB = ee.Algorithms.If(etImg2, meanOf(etSelected, 'et_actual', tractGeomB, 30), null);

    return ee.Feature(null, { 'date': monthStart.format('YYYY-MM'), 'system:time_start': monthStart.millis(), 'FVC_A': fvcA, 'FVC_B': fvcB, 'LST_A': lstA, 'LST_B': lstB, 'ET_A': etA, 'ET_B': etB });
  }));
}

function makeCompareTrendCharts(tractA, tractB) {
  var geoidA = tractA.geoid; var geoidB = tractB.geoid;
  var colorA = '#' + tractA.color; var colorB = '#' + tractB.color;
  var table = buildCompareMonthlyTable(tractA.feature.geometry(), tractB.feature.geometry()).sort('system:time_start');

  var fvcChart = ui.Chart.feature.byFeature({
    features: table, xProperty: 'date', yProperties: ['FVC_A', 'FVC_B']
  }).setChartType('LineChart').setOptions({
    title: 'Monthly Greenness Trend\nTract ' + geoidA + ' vs Tract ' + geoidB, 
    hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, 
    vAxis: {title: 'Mean FVC', viewWindow: {min: 0, max: 0.3}}, 
    legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, 
    series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}}, 
    chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11});
  var lstChart = ui.Chart.feature.byFeature({
    features: table, xProperty: 'date', yProperties: ['LST_A', 'LST_B']
  }).setChartType('LineChart').setOptions({
    title: 'Monthly Land Surface Temperature\nTract ' + geoidA + ' vs Tract ' + geoidB, 
    hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, 
    vAxis: {title: 'LST Celsius', viewWindow: {min: 15, max: 70}}, 
    legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, 
    series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}}, 
    chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11});
  var etCompareChart = ui.Chart.feature.byFeature({
    features: table, xProperty: 'date', yProperties: ['ET_A', 'ET_B']
  }).setChartType('LineChart').setOptions({
    title: 'Monthly Water Consumption\nTract ' + geoidA + ' vs Tract ' + geoidB, 
    hAxis: {title: 'Month', slantedText: true, slantedTextAngle: 45, textStyle: {fontSize: 8}}, 
    vAxis: {title: 'Mean water consumption (mm)', viewWindow: {min: 0, max: 200}}, 
    legend: {position: 'top'}, lineWidth: 3, pointSize: 0, interpolateNulls: true, 
    series: {0: {color: colorA, labelInLegend: 'Tract ' + geoidA}, 1: {color: colorB, labelInLegend: 'Tract ' + geoidB}}, 
    chartArea: {left: 60, top: 45, width: '76%', height: '56%'}, fontSize: 11});

  return [
    ui.Panel([fvcChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'}),
    ui.Panel([lstChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'}),
    ui.Panel([etCompareChart], null, {backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid, padding: '6px', margin: '6px 0'})
  ];
}


// ─── SECTION 3B: BASELINE CHARTING FUNCTIONS ────────────────────────

// BASELINE COMPARISON RATIONALE:
// These functions compare a user-selected year against 2019 on a month-by-month
// basis (Jan–Dec). The 2019 baseline was chosen because it is the last full
// year before AB 356's passage (June 2021), representing pre-policy conditions.
// Plotting both years on the same 12-month axis allows users to see:
//   1. Whether vegetation loss is uniform or seasonal (e.g., summer-only)
//   2. Whether temperature increases are correlated with vegetation loss
//   3. Whether water savings appear in the same months as turf removal
// The dashed grey line (2019) vs solid colour (target year) makes the
// comparison immediately readable.

function buildBaselineTrendCharts(tractGeom, targetYear) {
  var months = ee.List.sequence(1, 12);
  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m);
    var s2019 = ee.Date.fromYMD(2019, m, 1);
    var sTarg = ee.Date.fromYMD(targetYear, m, 1);
    
    // Fetch FVC
    var i19_fvc = turfCollection.filterDate(s2019, s2019.advance(1, 'month')).first();
    var iTg_fvc = turfCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var v19_fvc = ee.Algorithms.If(i19_fvc, meanOf(ee.Image(i19_fvc).select('veg'), 'veg', tractGeom, 10), null);
    var vTg_fvc = ee.Algorithms.If(iTg_fvc, meanOf(ee.Image(iTg_fvc).select('veg'), 'veg', tractGeom, 10), null);

    // Fetch LST
    var i19_lst = lstCollection.filterDate(s2019, s2019.advance(1, 'month')).first();
    var iTg_lst = lstCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var v19_lst = ee.Algorithms.If(i19_lst, meanOf(ee.Image(i19_lst).select([0], ['LST']), 'LST', tractGeom, 30), null);
    var vTg_lst = ee.Algorithms.If(iTg_lst, meanOf(ee.Image(iTg_lst).select([0], ['LST']), 'LST', tractGeom, 30), null);

    // Fetch ET
    var i19_et = etCollection.filterDate(s2019, s2019.advance(1, 'month')).first();
    var iTg_et = etCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var v19_et = ee.Algorithms.If(i19_et, meanOf(ee.Image(i19_et).select('et_actual'), 'et_actual', tractGeom, 30), null);
    var vTg_et = ee.Algorithms.If(iTg_et, meanOf(ee.Image(iTg_et).select('et_actual'), 'et_actual', tractGeom, 30), null);

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
    var fvcSel = ee.Image(imgFVC).select('veg_diff');
    var dA_fvc = ee.Algorithms.If(imgFVC, meanOf(fvcSel, 'veg_diff', tractA.feature.geometry(), 10), null);
    var dB_fvc = ee.Algorithms.If(imgFVC, meanOf(fvcSel, 'veg_diff', tractB.feature.geometry(), 10), null);

    var imgLST = lstCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var lstSel = ee.Image(imgLST).select('LST_diff_2019');
    var dA_lst = ee.Algorithms.If(imgLST, meanOf(lstSel, 'LST_diff_2019', tractA.feature.geometry(), 30), null);
    var dB_lst = ee.Algorithms.If(imgLST, meanOf(lstSel, 'LST_diff_2019', tractB.feature.geometry(), 30), null);

    var imgET = etCollection.filterDate(sTarg, sTarg.advance(1, 'month')).first();
    var etSel = ee.Image(imgET).select('et_diff_2019');
    var dA_et = ee.Algorithms.If(imgET, meanOf(etSel, 'et_diff_2019', tractA.feature.geometry(), 30), null);
    var dB_et = ee.Algorithms.If(imgET, meanOf(etSel, 'et_diff_2019', tractB.feature.geometry(), 30), null);

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

// These charts plot the pre-computed diff-from-2019 bands over the user's
// selected date range. Unlike Section 3B (which compares full calendar years),
// these show the anomaly trajectory over arbitrary date spans.
//
// DESIGN CHOICE: A zero-baseline reference line is drawn on the y-axis,
// making it immediately clear whether conditions are improving (e.g., ET
// falling below zero = water savings) or worsening (LST rising above zero
// = hotter surfaces). This is more intuitive than showing raw values, which
// require the user to mentally compute the difference.

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
    var fvcDiff = ee.Algorithms.If(fvcImg, meanOf(ee.Image(fvcImg).select('veg_diff'), 'veg_diff', tractGeom, 10), null);

    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var lstDiff = ee.Algorithms.If(lstImg, meanOf(ee.Image(lstImg).select('LST_diff_2019'), 'LST_diff_2019', tractGeom, 30), null);

    var etImg = etCollection.filterDate(monthStart, monthEnd).first();
    var etDiff = ee.Algorithms.If(etImg, meanOf(ee.Image(etImg).select('et_diff_2019'), 'et_diff_2019', tractGeom, 30), null);

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


// Two-tract comparison using diff bands: shows how each tract's anomaly
// from the 2019 baseline evolves over the selected date range, enabling
// direct comparison of policy impact trajectories between areas.
function buildDiffCompareTrendCharts(tractA, tractB) {
  var range = getOrderedDateRange();
  var startDate = range.start; var endDate = range.end;
  var months = ee.List.sequence(0, endDate.difference(startDate, 'month').round());

  var monthlyTable = ee.FeatureCollection(months.map(function(m) {
    m = ee.Number(m);
    var monthStart = startDate.advance(m, 'month');
    var monthEnd   = monthStart.advance(1, 'month');

    var fvcImg = turfCollection.filterDate(monthStart, monthEnd).first();
    var fvcSel = ee.Image(fvcImg).select('veg_diff');
    var dA_fvc = ee.Algorithms.If(fvcImg, meanOf(fvcSel, 'veg_diff', tractA.feature.geometry(), 10), null);
    var dB_fvc = ee.Algorithms.If(fvcImg, meanOf(fvcSel, 'veg_diff', tractB.feature.geometry(), 10), null);

    var lstImg = lstCollection.filterDate(monthStart, monthEnd).first();
    var lstSel = ee.Image(lstImg).select('LST_diff_2019');
    var dA_lst = ee.Algorithms.If(lstImg, meanOf(lstSel, 'LST_diff_2019', tractA.feature.geometry(), 30), null);
    var dB_lst = ee.Algorithms.If(lstImg, meanOf(lstSel, 'LST_diff_2019', tractB.feature.geometry(), 30), null);

    var etImg = etCollection.filterDate(monthStart, monthEnd).first();
    var etSel = ee.Image(etImg).select('et_diff_2019');
    var dA_et = ee.Algorithms.If(etImg, meanOf(etSel, 'et_diff_2019', tractA.feature.geometry(), 30), null);
    var dB_et = ee.Algorithms.If(etImg, meanOf(etSel, 'et_diff_2019', tractB.feature.geometry(), 30), null);

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

// CENTRALISED STATE OBJECT:
// All UI state is held in a single 'state' object rather than scattered
// across individual widget values. This pattern (similar to React's useState
// or Redux) makes the application's behaviour predictable: every UI update
// reads from 'state', and every user interaction writes to 'state' before
// triggering a refresh. This also simplifies debugging during the technical
// walkthrough, as the entire application state can be inspected in one place.
//
// Key state properties:
//   currentView:   which tab is active ('explore', 'compare', 'about')
//   activeLayer:   which thematic layer is displayed on the map
//   timeMode:      'single' (one date) or 'compare' (two dates for split view)
//   dataType:      'actual' (raw values) or 'adjusted' (diff from 2019 baseline)
//   splitEnabled:  whether the left/right split-panel map is active
//   fromYear/Month, toYear/Month: the user-selected date range
//   selectedTract: the currently clicked tract (Explore tab)
//   compareTracts: array of up to 2 tracts for side-by-side comparison

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026'];

var state = {
  currentView:   'explore', activeLayer:   'greenspace', 
  timeMode:      'compare', dataType:      'actual', 
  splitEnabled:  true, fromYear:  2020, fromMonth: 6, toYear:    2023, toMonth:   6,
  selectedTract: null, compareTracts: []
};

// ─── SECTION 5: UI HELPERS ──────────────────────────────────────────

// Reusable factory functions for common UI elements. These reduce code
// duplication and ensure visual consistency: every section title, separator,
// and stat card across the app is generated from the same template, so
// styling changes only need to be made in one place.

function makeSectionTitle(text) { return ui.Label(text, STYLES.subtitle); }
function makeSeparator() { return ui.Panel(null, null, {height: '1px', backgroundColor: '#' + COLORS.grayMid, margin: '8px 0'}); }

// makeStatCard creates a reusable metric card with three elements:
// name (label), val (large number), delta (contextual change indicator).
// Returning an object with named references allows individual fields to
// be updated independently without rebuilding the entire card widget.
function makeStatCard(label) { var valLabel = ui.Label('—', STYLES.statValue); var nameLabel = ui.Label(label, STYLES.statLabel); var deltaLabel = ui.Label('', {fontSize: '11px'}); return {panel: ui.Panel([nameLabel, valLabel, deltaLabel], null, STYLES.card), name: nameLabel, val: valLabel, delta: deltaLabel}; }


// Tab and pill button styling uses visual affordance: the active state has
// a coloured background + bold text + coloured border, while inactive uses
// a plain white background. This "selected vs unselected" pattern follows
// standard UI conventions, ensuring users can always identify their current
// selection without reading help text.
function styleTabButton(btn, active) { btn.style().set({backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill, color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText, border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid, padding: '8px 16px', margin: '0 6px 0 0', fontSize: '12px', fontWeight: active ? 'bold' : 'normal'}); }

// Layer pills use equal-width horizontal distribution ('stretch: horizontal')
// so all four buttons (Greenness, Heat, Water, Satellite) remain the same
// size regardless of label length — preventing layout shifts.
function stylePillButton(btn, active) { 
  btn.style().set({
    backgroundColor: active ? '#E8F0F7' : UI_COLORS.inactiveFill, 
    color: active ? '#' + COLORS.primaryDark : UI_COLORS.inactiveText, 
    border: active ? '2px solid #' + COLORS.primary : '1px solid #' + COLORS.grayMid, 
    padding: '4px 8px',       
    margin: '2px 4px 2px 0',  
    fontSize: '11px', 
    fontWeight: active ? 'bold' : 'normal',
    stretch: 'horizontal',
    textAlign: 'center'
  }); 
}

// ─── SECTION 6: MAPS ────────────────────────────────────────────────

// DUAL-MAP SPLIT PANEL DESIGN:
// The application uses two synchronised map instances (leftMap, rightMap)
// connected via ui.Map.Linker. This enables a "swipe comparison" interaction
// where the user can drag a divider to compare two dates or data views
// side-by-side on the same geographic extent — a powerful visual comparison
// tool commonly used in before/after satellite analysis.
//
// MAP STYLE: The base map is desaturated (saturation: -75) with POI and
// transit labels hidden. This ensures the thematic data layers (FVC, LST, ET)
// remain visually prominent against a neutral background, following
// cartographic best practice for analytical dashboards.

ui.root.clear();
var leftMap = ui.Map(); var rightMap = ui.Map();

[leftMap, rightMap].forEach(function(m) { m.setControlVisibility({
  all: false, zoomControl: true, 
  scaleControl: true, 
  mapTypeControl: true}); 
  
m.setOptions('Custom', {Custom: [{stylers: [{saturation: -75}]}, 
  {featureType: 'poi', stylers: [{visibility: 'off'}]}, 
  {featureType: 'transit', stylers: [{visibility: 'off'}]}]}); });
  
// Map linker synchronises pan, zoom, and centre between both maps
var mapLinker = ui.Map.Linker([leftMap, rightMap]);

// ZOOM LIMIT: Prevents users from zooming out beyond level 10, where the
// Las Vegas Valley becomes too small to interact with meaningfully and
// unnecessary global tiles would load, wasting bandwidth and confusing users.
var MIN_ZOOM = 10; 
function enforceZoomLimit(currentZoom) {
  if (currentZoom < MIN_ZOOM) {
    // Only setting leftMap; the Linker automatically syncs rightMap
    leftMap.setZoom(MIN_ZOOM); 
  }
}
leftMap.onChangeZoom(enforceZoomLimit);
rightMap.onChangeZoom(enforceZoomLimit);

// Floating date labels on the map provide constant temporal context so the
// user always knows which month/year they are viewing, even when scrolled
// away from the sidebar controls.
/// Boundary and tract overlays are managed as FeatureView layers in _addVectorOverlays.

var leftDateLabel = ui.Label('Jun 2020', 
  {fontSize: '15px', 
    fontWeight: 'bold', 
    backgroundColor: 'rgba(255,255,255,0.95)', 
    padding: '6px 14px', 
    position: 'top-left', 
    border: '1px solid rgba(0,0,0,0.12)'});
var rightDateLabel = ui.Label('Jun 2023', 
  {fontSize: '15px', 
    fontWeight: 'bold', 
    backgroundColor: 'rgba(255,255,255,0.95)', 
    padding: '6px 14px', 
    position: 'top-right', 
    border: '1px solid rgba(0,0,0,0.12)'});

leftMap.add(leftDateLabel); rightMap.add(rightDateLabel);

var splitPanel = ui.SplitPanel({
  firstPanel: leftMap, 
  secondPanel: rightMap, 
  orientation: 'horizontal', 
  wipe: true, 
  style: {stretch: 'both'}});

var mapContainer = ui.Panel([splitPanel], null, {stretch: 'both', backgroundColor: '#' + COLORS.white});

// ─── SECTION 6A: MAP LEGENDS ────────────────────────────────────────

// Each legend is a floating panel that displays a continuous colour ramp
// with min/max labels, matching the palette used in the corresponding
// map layer. Legends are generated procedurally via ee.Image.pixelLonLat()
// to create a synthetic gradient thumbnail — this ensures the legend always
// matches the exact palette defined in the vis params above.
//
// DYNAMIC VISIBILITY: Legends automatically show/hide based on the active
// layer and data type (actual vs diff). For example, when viewing the LST
// diff layer, the absolute LST legend hides and the diverging LST diff
// legend appears. This prevents visual clutter and ensures the user only
// sees the legend relevant to what's currently on screen.

function makeLSTLegend(position) { var legend = ui.Panel({style: {position: position, padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.9)', shown: false}}); legend.add(ui.Label('Land Surface Temprature °C', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black, margin: '0 0 6px 0'})); legend.add(ui.Thumbnail({image: ee.Image.pixelLonLat().select('longitude'), params: {bbox: [0, 0, 1, 0.1], dimensions: '210x20', min: 0, max: 1, palette: lst_vis.palette}, style: {stretch: 'horizontal', margin: '0 0 4px 0'}})); legend.add(ui.Panel([ui.Label(String(lst_vis.min), {fontSize: '12px', margin: '0'}), ui.Label('40', {fontSize: '12px', margin: '0', textAlign: 'center', stretch: 'horizontal'}), ui.Label(String(lst_vis.max), {fontSize: '12px', margin: '0'})], ui.Panel.Layout.flow('horizontal'))); return legend; }
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


// Controls which legends are visible based on the current layer and data mode.
// Logic: if showing a diff/anomaly view, show the diverging legend; otherwise
// show the sequential legend. Only one legend is ever visible at a time per
// layer type, preventing the map from becoming cluttered with multiple legends.
function updateLegendVisibility() {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var actuallySplit = state.splitEnabled && (!isSameDate || state.dataType === 'adjusted');
  var isDiff = !isSameDate && !actuallySplit && state.dataType !== 'adjusted'; // Unified custom diff view

  var isTemp = state.activeLayer === 'temperature';
  var isTempDiff = isTemp && (isDiff || (state.dataType === 'adjusted'));
  leftLSTLegend.style().set('shown', isTemp && !isTempDiff); rightLSTLegend.style().set('shown', isTemp && !isTempDiff);
  leftLSTDiffLegend.style().set('shown', isTempDiff); rightLSTDiffLegend.style().set('shown', isTempDiff);

  var isGreen = state.activeLayer === 'greenspace';
  var isGreenDiff = isGreen && (isDiff || (state.dataType === 'adjusted'));
  leftFVCLegend.style().set('shown', isGreen && !isGreenDiff); rightFVCLegend.style().set('shown', isGreen && !isGreenDiff);
  leftFVCDiffLegend.style().set('shown', isGreenDiff); rightFVCDiffLegend.style().set('shown', isGreenDiff);

  var isWater = state.activeLayer === 'water';
  var isWaterDiff = isWater && (isDiff || (state.dataType === 'adjusted'));
  leftETLegend.style().set('shown', isWater && !isWaterDiff); rightETLegend.style().set('shown', isWater && !isWaterDiff);
  leftETDiffLegend.style().set('shown', isWaterDiff); rightETDiffLegend.style().set('shown', isWaterDiff);
}

// ─── SECTION 7: LEFT SIDEBAR ────────────────────────────────────────

// SIDEBAR ARCHITECTURE:
// The left sidebar follows a top-down information hierarchy:
//   1. App title & subtitle — immediate identification of purpose
//   2. Tab navigation (Tract Profile / Compare / About) — primary navigation
//   3. "How to use" instructions — onboarding for first-time users
//   4. Quick navigation — jump to known areas without manual panning
//   5. Map controls — layer selection and time settings
//   6. Analysis results — stats, charts, and trends (context-dependent)
//
// This ordering prioritises orientation ("what is this?") before exploration
// ("how do I use it?"), following progressive disclosure UX principles.

var appTitle = ui.Label('Las Vegas Valley Turf Tracker', STYLES.appTitle);
var appSubtitle = ui.Label('Urban turf change and surface heat explorer', STYLES.muted);
var headerPanel = ui.Panel([appTitle, appSubtitle], null, {padding: '14px 14px 10px 14px', backgroundColor: '#' + COLORS.white});

// Three-tab navigation pattern: "Tract Profile" for single-tract deep-dive,
// "Compare Tracts" for side-by-side analysis, "About" for methodology and
// context. This structure mirrors common dashboard patterns (e.g., Tableau)
// that users are already familiar with.
var tabExplore = ui.Button({label: 'Tract Profile', style: {border: '0px solid transparent'}});
var tabCompare = ui.Button({label: 'Compare Tracts', style: {border: '0px solid transparent'}});
var tabAbout = ui.Button({label: 'About', style: {border: '0px solid transparent'}});
var tabRow = ui.Panel([tabExplore, tabCompare, tabAbout], ui.Panel.Layout.flow('horizontal'), {padding: '0 14px 10px 14px', backgroundColor: '#' + COLORS.white, margin: '0 0 6px 0'});

// ─── TIME CONTROLS & DYNAMIC UI LOGIC ───

// DATA TYPE SELECTOR:
// "Actual data" shows raw monthly values (FVC, LST in °C, ET in mm).
// "Seasonally adjusted data" shows change-from-2019-baseline (diff bands),
// which controls for seasonal phenological cycles. This distinction is
// critical for the policy question: raw FVC might drop in winter naturally,
// but the seasonally adjusted view isolates human-caused turf removal from
// natural dormancy.

// 1. Data Type Dropdown
var dataTypeSel = ui.Select({
  items: ['Actual data', 'Seasonally adjusted data'], 
  value: 'Actual data', 
  style: {fontSize: '13px', margin: '4px 8px 8px 0', stretch: 'horizontal'}
});

// TIME MODE SELECTOR:
// "Single month" shows one snapshot; "Compare two months" enables the split
// map and shows before/after or diff views. The split panel with swipe
// interaction is only available in compare mode, as a single-date view
// has nothing to compare against.

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


// Dynamically shows/hides UI elements based on the current state:
// - Disables the "Seasonally adjusted" option for satellite imagery
//   (because raw RGB has no meaningful 2019 diff band)
// - Hides the "To" date row when in single-month mode
// - Relabels "From" to "Date" when only one date is relevant
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


// Layer pills allow the user to switch between thematic layers. Each pill
// triggers: (1) state update, (2) visual highlight update, (3) time mode
// UI refresh (to handle satellite-specific constraints), (4) map refresh.
function makeLayerPill(label, key) {
  var btn = ui.Button(label, function() { state.activeLayer = key; updateLayerPills(); updateTimeModeUI(); refreshMap(); });
  btn._key = key; 
  btn.style().set({
    fontSize: '11px', 
    padding: '4px 8px', 
    margin: '2px 4px 2px 0', 
    border: '0px solid transparent',
    stretch: 'horizontal',   
    textAlign: 'center'
  }); 
  return btn;
}

var pillSat       = makeLayerPill('Satellite', 'satellite');
var pillGreen     = makeLayerPill('Greenness', 'greenspace');
var pillTemp      = makeLayerPill('Heat', 'temperature');
var pillWater     = makeLayerPill('Water', 'water'); // Shortened label to fit 4 across


function updateLayerPills() { 
  [pillGreen, pillTemp, pillWater, pillSat].forEach(function(p) { 
    stylePillButton(p, p._key === state.activeLayer); 
  }); 
}


// Central handler for all date changes. Reads the current dropdown values,
// updates the state object, refreshes the map layers, and (if a tract is
// already selected) re-computes the sidebar statistics for the new date range.
// This ensures all parts of the UI stay synchronised — the map, stats cards,
// charts, and labels all reflect the same temporal selection.
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



// When switching to "Seasonally adjusted", the distribution charts are hidden
// because the diff histograms are shown inline instead. The map and stats
// are immediately refreshed to reflect the new data mode.
dataTypeSel.onChange(function(val) {
  state.dataType = (val === 'Actual data') ? 'actual' : 'adjusted';
  chartsPanel.style().set('shown', state.dataType !== 'adjusted'); 
  onTimeChange();
});


timeModeSel.onChange(function(val) {
  state.timeMode = (val === 'Single month') ? 'single' : 'compare';
  updateTimeModeUI(); onTimeChange();
});

var splitCheck = ui.Checkbox('Split view', true); splitCheck.style().set({fontSize: '13px', color: '#' + COLORS.black}); splitCheck.onChange(function(v) { state.splitEnabled = v; refreshMap(); });



// BOX 1: Map controls — layer pills in a horizontal row
var controlsPanel = ui.Panel([
  makeSectionTitle('Map controls'), 
  ui.Label('Layer', STYLES.muted), 
  ui.Panel({
    widgets: [pillGreen, pillTemp, pillWater, pillSat], 
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {stretch: 'horizontal'} 
  })
], null, STYLES.section);

// BOX 2: Analysis modes
var analysisPanel = ui.Panel([makeSectionTitle('Analysis modes'), ui.Label('Data type', STYLES.muted), dataTypeSel, makeSeparator(), ui.Label('Time frame', STYLES.muted), timeModeSel, fromRow, toRow, makeSeparator(), splitCheck], null, STYLES.section);

var instructionPanel = ui.Panel([
  makeSectionTitle('How to use'), 
  ui.Label(
    '1. Navigation & Layers: Pick a layer (Greenness, Heat, Water Consumption) and use Quick Navigation to jump to specific communities.\n\n' +
    '2. Tract Profile: Click any single census tract to view its statistics, distribution charts, and historical trends.\n\n' +
    '3. Compare Tracts: Switch to the Compare tab and click two different tracts to analyze their metrics side-by-side.\n\n' +
    '4. Data Modes: Toggle between Actual Data (raw monthly values) and Seasonally Adjusted (changes relative to the 2019 baseline).\n\n' +
    '5. Split View: Select "Compare two months" and enable Split View to use an interactive swipe slider between dates.', 
    {
      fontSize: '12px', 
      color: '#' + COLORS.black, 
      whiteSpace: 'pre-wrap', 
      padding: '4px 0 0 0'
    }
  )
], null, STYLES.section);

// ─── PLACE SEARCH / QUICK NAVIGATION ──────────────────────────────

// Pre-defined navigation points for key communities in the Las Vegas Valley.
// This feature was added specifically for the target audience: policymakers
// and residents who want to quickly jump to their neighbourhood or community
// of interest without needing GIS expertise to navigate the map manually.
// Includes incorporated cities (Las Vegas, Henderson, North Las Vegas) and
// unincorporated Census Designated Places (CDPs) like Paradise and Enterprise,
// which are often the focus of turf removal enforcement discussions.

var LV_PLACES = [
  // ── Full Study Area ──
  {name: 'Las Vegas Valley (Full Extent)', lon: -115.1398, lat: 36.1699, zoom: 11},
  // ── Incorporated cities ──
  {name: 'Las Vegas',        lon: -115.1398, lat: 36.1699, zoom: 12},
  {name: 'Henderson',        lon: -115.0361, lat: 36.0292, zoom: 12},
  {name: 'North Las Vegas',  lon: -115.1175, lat: 36.2288, zoom: 12},
  // ── Unincorporated CDPs ──
  {name: 'Paradise',         lon: -115.1469, lat: 36.0970, zoom: 13},
  {name: 'Enterprise',       lon: -115.2200, lat: 36.0265, zoom: 13},
  {name: 'Spring Valley',    lon: -115.2450, lat: 36.1070, zoom: 13},
  {name: 'Sunrise Manor',    lon: -115.0730, lat: 36.1710, zoom: 13},
  {name: 'Summerlin South',  lon: -115.3300, lat: 36.1300, zoom: 13},
  {name: 'Whitney',          lon: -115.0690, lat: 36.1000, zoom: 14},
  {name: 'Winchester',       lon: -115.1180, lat: 36.1290, zoom: 14},
  {name: 'Lone Mountain',    lon: -115.2800, lat: 36.2650, zoom: 14},
  {name: 'Nellis AFB',       lon: -115.0480, lat: 36.2360, zoom: 14}
];

var placeNames = LV_PLACES.map(function(p) { return p.name; });

var placeSelect = ui.Select({
  items: placeNames,
  placeholder: 'Jump to a place...',
  style: {stretch: 'horizontal', fontSize: '12px'}
});

placeSelect.onChange(function(name) {
  var match = LV_PLACES.filter(function(p) { return p.name === name; })[0];
  if (match) {
    leftMap.setCenter(match.lon, match.lat, match.zoom || 13);
    if (rightMap) { rightMap.setCenter(match.lon, match.lat, match.zoom || 13); }
  }
});

var navPanel = ui.Panel([
  makeSectionTitle('Quick navigation'),
  placeSelect
], null, STYLES.section);

//

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


// ─── SECTION 8: TAB SWITCHING ───────────────────────────────────────

// Tab switching controls which content panels are visible. The "shown"
// property is toggled rather than adding/removing widgets, which avoids
// the expensive "widget already added" error that occurs when GEE tries
// to add a widget that already belongs to a panel.
//
// Key behaviours:
// - Shared controls (map controls, analysis settings, navigation) are hidden
//   on the About tab since they don't apply to static informational content.
// - Switching to the Compare tab triggers updateCompareView() to refresh
//   comparison data, ensuring stale results aren't displayed.
// - The highlight layer (selected/compared tracts) updates on every tab
//   switch so the map overlay matches the current analytical context.

function setActiveTab(tab) {
  state.currentView = tab;
  
  styleTabButton(tabExplore, tab === 'explore'); 
  styleTabButton(tabCompare, tab === 'compare'); 
  styleTabButton(tabAbout, tab === 'about');
  
  controlsPanel.style().set('shown', tab !== 'about'); 
  navPanel.style().set('shown', tab !== 'about');
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

// Clears the current tract selection, restores the initial prompt text,
// and removes highlight overlays from the map. This "escape hatch" lets
// users start fresh without needing to reload the entire application.

function resetSelectedTract() {
  state.selectedTract = null;
  promptPanel.style().set('shown', true); statsPanel.style().set('shown', false); tractHeaderPanel.style().set('shown', false); plainEnglish.setValue('');
  fvcChartHolder.widgets().reset([ui.Label('FVC distribution chart will appear here.', STYLES.muted)]); lstChartHolder.widgets().reset([ui.Label('LST distribution chart will appear here.', STYLES.muted)]); etChartHolder.widgets().reset([ui.Label('Water consumption chart will appear here.', STYLES.muted)]);
  trendPanel.widgets().reset([]); updateHighlightLayer();
}

// Manages the coloured overlay that highlights selected/compared tracts on
// the map. The function first removes all existing highlight layers (to
// prevent stacking), then re-adds them based on the current view:
// - Explore tab: single tract highlighted in primary blue
// - Compare tab: two tracts highlighted in blue and coral respectively,
//   with semi-transparent fill so the underlying data layer remains visible.
// The .blend() approach composites both tract overlays into a single layer,
// reducing the number of map layers and improving rendering performance.
function updateHighlightLayer() {
  [leftMap, rightMap].forEach(function(m) {
    var layers = m.layers(); var layersToRemove = [];
    layers.forEach(function(l) { 
      var name = l.getName(); 
      // remove the colon after 'Compare tract' to catch all naming variations
      if (name === 'Selected tract' || (name && name.indexOf('Compare tract') !== -1)) { 
        layersToRemove.push(l); 
      } 
    });
    layersToRemove.forEach(function(l) { layers.remove(l); });
  });

  if (state.currentView === 'compare' && state.compareTracts.length > 0) {
    var compOverlay = null;
    state.compareTracts.forEach(function(t) {
      var compStyle = ee.FeatureCollection([ee.Feature(t.feature.geometry())]).style({color: t.color, fillColor: t.color + '40', width: 3});
      if (!compOverlay) compOverlay = compStyle;
      else compOverlay = compOverlay.blend(compStyle);
    });
    leftMap.addLayer(compOverlay, {}, 'Compare tracts'); if (state.splitEnabled) rightMap.addLayer(compOverlay, {}, 'Compare tracts');
  }

  if (state.currentView === 'explore' && state.selectedTract) {
    var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())]).style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2});
    leftMap.addLayer(highlightStyle, {}, 'Selected tract'); if (state.splitEnabled) rightMap.addLayer(highlightStyle, {}, 'Selected tract');
  }
}



// ─── SECTION 10: MAP REFRESH ────────────────────────────────────────

// VIEWPORT PERSISTENCE:
// When the map container switches between split and single mode, GEE
// reparents the widget, which can reset the view. The currentViewPort
// tracker captures coordinates on every pan/zoom event so we can
// immediately restore the view after reparenting — preventing jarring
// map jumps that would degrade the user experience.

var mapInitialized = false; var containerMode  = null;

var currentViewPort = { lon: -115.1398, lat: 36.1699, zoom: 11 };
function trackViewport(e) {
  if (e && e.lon) {
    currentViewPort.lon = e.lon;
    currentViewPort.lat = e.lat;
    currentViewPort.zoom = e.zoom;
  }
}
leftMap.onChangeBounds(trackViewport);
rightMap.onChangeBounds(trackViewport);

// Clears all data and highlight layers. FeatureView overlays are managed separately.
function _clearDataLayers(map) {
  map.layers().reset([]);
}

// Insert data layer at index 0 (bottom of stack) so highlight layers and
// vector overlays always render on top of the imagery.
function _addData(map, image, vis, name) {
  map.layers().insert(0, ui.Map.Layer(image, vis, name, true));
}


// Remove and re-add FeatureView overlays at the end of each refresh so they
// always render on TOP of data imagery. Order: boundary first, then tracts
// (so tract outlines render above the boundary outline). This solves the
// z-ordering problem where data layers would otherwise cover the tract grid.
function _addVectorOverlays(actuallySplit) {
  if (_fvBoundaryOnLeft)  { leftMap.remove(_fvBoundaryL);  _fvBoundaryOnLeft  = false; }
  if (_fvBoundaryOnRight) { rightMap.remove(_fvBoundaryR); _fvBoundaryOnRight = false; }
  if (_fvOnLeft)          { leftMap.remove(_fvTractsL);    _fvOnLeft          = false; }
  if (_fvOnRight)         { rightMap.remove(_fvTractsR);   _fvOnRight         = false; }

  leftMap.add(_fvBoundaryL); _fvBoundaryOnLeft = true;
  leftMap.add(_fvTractsL);   _fvOnLeft         = true;
  if (actuallySplit) {
    rightMap.add(_fvBoundaryR); _fvBoundaryOnRight = true;
    rightMap.add(_fvTractsR);   _fvOnRight         = true;
  }
}


// REFRESH MAP — THE CORE RENDERING ENGINE:
// This function is the single point of truth for what appears on the map.
// It reads the current state and determines:
//   1. Whether to show split-panel or single-map layout
//   2. Which imagery to load (actual values vs baseline anomalies)
//   3. Whether to compute on-the-fly diffs (when split is off + two dates)
//   4. What the date labels should say
//
// SATELLITE LAYER SPECIAL CASE: The satellite layer always forces split view
// when comparing two dates (because computing RGB diffs is meaningless),
// and always forces single view for the same date. This prevents the user
// from accidentally creating a nonsensical difference-of-RGB image.
//
// DIFF COMPUTATION APPROACH (non-split, two dates, actual mode):
// When the user disables split view while comparing two dates, the app
// computes pixel-wise subtraction (toImage - fromImage) on the fly and
// applies a diverging colour palette. This provides a single-map view
// of spatial change patterns — useful for identifying hotspot areas
// where vegetation loss or temperature increase is concentrated.
function refreshMap() {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var isBaseline = (state.dataType === 'adjusted');
  var isSatellite = (state.activeLayer === 'satellite');

  // 1. Control Checkbox Visibility
  if (isSatellite) {
    // Hide the toggle entirely for Satellite so users can't override the forced view
    splitCheck.style().set('shown', false);
  } else {
    // Standard behavior for Greenness, Heat, and Water
    splitCheck.style().set('shown', !isSameDate);
  }

  // 2. Determine actual split behavior
  var actuallySplit;
  if (isSatellite) {
    // Force split if comparing different dates; force single map if it's the same date
    actuallySplit = !isSameDate; 
  } else {
    // Respect the user's checkbox choice for other layers
    actuallySplit = state.splitEnabled && (!isSameDate);
  }

  var fromStr = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear; var toStr = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
  if (isBaseline) {
    if (actuallySplit) {
      leftDateLabel.setValue(fromStr + ' (vs 2019)');
      rightDateLabel.setValue(toStr + ' (vs 2019)');
    } else {
      leftDateLabel.setValue(isSameDate ? fromStr + ' vs 2019' : fromStr + ' → ' + toStr + ' (vs 2019)');
      rightDateLabel.setValue(toStr);
    }
  } else {
    leftDateLabel.setValue(isSameDate || actuallySplit ? fromStr : fromStr + ' → ' + toStr);
    rightDateLabel.setValue(toStr);
  }
  _clearDataLayers(leftMap); _clearDataLayers(rightMap);

  if (actuallySplit) {
    if (containerMode !== 'split') { 
      var savedView = {lon: currentViewPort.lon, lat: currentViewPort.lat, zoom: currentViewPort.zoom};
      mapContainer.widgets().reset([splitPanel]); 
      containerMode = 'split'; 
      if (mapInitialized) {
        ee.Number(0).evaluate(function() {
          leftMap.setCenter(savedView.lon, savedView.lat, savedView.zoom);
          rightMap.setCenter(savedView.lon, savedView.lat, savedView.zoom);
        });
      }
    }
    rightDateLabel.style().set('shown', true);

    if (isBaseline) {
      if (state.activeLayer === 'greenspace') { _addData(leftMap, getVegDiffImage(state.fromYear, state.fromMonth), fvc_diff_vis, 'FVC Anomaly (From)'); _addData(rightMap, getVegDiffImage(state.toYear, state.toMonth), fvc_diff_vis, 'FVC Anomaly (To)'); }
      else if (state.activeLayer === 'temperature') { _addData(leftMap, getLSTDiffImage(state.fromYear, state.fromMonth), lst_diff_vis, 'LST Anomaly (From)'); _addData(rightMap, getLSTDiffImage(state.toYear, state.toMonth), lst_diff_vis, 'LST Anomaly (To)'); }
      else if (state.activeLayer === 'water') { _addData(leftMap, getETDiffImage(state.fromYear, state.fromMonth), et_diff_vis, 'Water Anomaly (From)'); _addData(rightMap, getETDiffImage(state.toYear, state.toMonth), et_diff_vis, 'Water Anomaly (To)'); }
      else { _addData(leftMap, getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'S2 Before'); _addData(rightMap, getS2Composite(state.toYear, state.toMonth), s2_vis, 'S2 After'); }
    } else {
      if (state.activeLayer === 'greenspace') { _addData(leftMap, getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC Before'); _addData(rightMap, getFVCImage(state.toYear, state.toMonth), fvc_vis, 'FVC After'); }
      else if (state.activeLayer === 'temperature') { _addData(leftMap, getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST Before'); _addData(rightMap, getLSTImage(state.toYear, state.toMonth), lst_vis, 'LST After'); }
      else if (state.activeLayer === 'water') { _addData(leftMap, getETImage(state.fromYear, state.fromMonth), et_vis, 'Water Before'); _addData(rightMap, getETImage(state.toYear, state.toMonth), et_vis, 'Water After'); }
      else { _addData(leftMap, getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'S2 Before'); _addData(rightMap, getS2Composite(state.toYear, state.toMonth), s2_vis, 'S2 After'); }
    }
  } else {
    if (containerMode !== 'single') { 
      var savedView = {lon: currentViewPort.lon, lat: currentViewPort.lat, zoom: currentViewPort.zoom};
      mapContainer.widgets().reset([leftMap]); 
      containerMode = 'single'; 
      if (mapInitialized) {
        ee.Number(0).evaluate(function() {
          leftMap.setCenter(savedView.lon, savedView.lat, savedView.zoom);
        });
      }
    }
    rightDateLabel.style().set('shown', false);

    if (isSameDate && !isBaseline) {
      if (state.activeLayer === 'greenspace') _addData(leftMap, getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC');
      else if (state.activeLayer === 'temperature') _addData(leftMap, getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST');
      else if (state.activeLayer === 'water') _addData(leftMap, getETImage(state.fromYear, state.fromMonth), et_vis, 'Water');
      else _addData(leftMap, getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'Satellite');
    } else {
      if (state.activeLayer === 'greenspace') {
        var fvcDiff = isBaseline ? getVegDiffImage(state.toYear, state.toMonth) : getFVCImage(state.toYear, state.toMonth).subtract(getFVCImage(state.fromYear, state.fromMonth));
        _addData(leftMap, fvcDiff, fvc_diff_vis, 'FVC change');
      } else if (state.activeLayer === 'temperature') {
        var lstDiff = isBaseline ? getLSTDiffImage(state.toYear, state.toMonth) : getLSTImage(state.toYear, state.toMonth).subtract(getLSTImage(state.fromYear, state.fromMonth));
        _addData(leftMap, lstDiff, lst_diff_vis, 'LST change');
      } else if (state.activeLayer === 'water') {
        var etDiff = isBaseline ? getETDiffImage(state.toYear, state.toMonth) : getETImage(state.toYear, state.toMonth).subtract(getETImage(state.fromYear, state.fromMonth));
        _addData(leftMap, etDiff, et_diff_vis, 'Water change');
      } else { _addData(leftMap, getS2Composite(state.toYear, state.toMonth), s2_vis, 'Current view'); }
    }
  }

  updateHighlightLayer();
  _addVectorOverlays(actuallySplit);

  updateLegendVisibility(); if (!mapInitialized) { leftMap.centerObject(roi, 11); mapInitialized = true; }
}

// ─── SECTION 11: MAP CLICK → SIDEBAR + CHARTS ───────────────────────

// MAP CLICK HANDLER:
// When the user clicks anywhere on the map, a point geometry is created at
// the click coordinates and used to query the census tract layer. If a tract
// is found, the click is routed to either the Explore or Compare handler
// depending on the active tab.
//
// The .evaluate() callback is necessary because GEE operations are
// asynchronous server-side computations — the tract geometry must be
// resolved on the server before client-side UI updates can proceed.

function handleMapClick(coords) {
  if (state.currentView === 'about') return; // Ignore clicks on the About tab
  var point = ee.Geometry.Point(coords.lon, coords.lat); var clicked = tracts.filterBounds(point).first();
  clicked.evaluate(function(f) { if (!f) return; var tract = ee.Feature(f); if (state.currentView === 'explore') updateSidePanel(tract); else if (state.currentView === 'compare') handleCompareClick(tract); });
}
leftMap.onClick(handleMapClick); rightMap.onClick(handleMapClick);


// Compare mode allows sequential selection of up to 2 tracts. If the user
// clicks a third tract, the previous selection is cleared and they start
// over. This "click-to-add" interaction is simpler than a dropdown selector
// for spatial data, as users can visually identify tracts on the map rather
// than searching by GEOID numbers. Duplicate clicks are prevented by
// checking the GEOID against already-selected tracts.
function handleCompareClick(tract) {
  if (state.compareTracts.length >= 2) state.compareTracts = [];
  tract.get('GEOID').evaluate(function(geoid) {
    var already = state.compareTracts.some(function(t) { return t.geoid === geoid; });
    if (!already) { state.compareTracts.push({geoid: geoid, feature: tract, color: [COLORS.blue, COLORS.coral][state.compareTracts.length]}); updateCompareView(); updateHighlightLayer(); }
  });
}


// DISTRIBUTION HISTOGRAMS:
// These charts show the pixel-level distribution of values within the
// selected tract, providing insight beyond just the mean value. For example,
// a tract with mean FVC of 0.15 might have a bimodal distribution (parks
// at 0.4 + concrete at 0.02), revealing spatial heterogeneity that a single
// mean statistic would mask. This is analytically important because turf
// removal affects specific parcels, not entire tracts uniformly.
//
// When comparing two dates, histograms overlay both distributions to show
// how the entire distribution shifted — e.g., a leftward shift in FVC
// indicates widespread vegetation loss across the tract.
function updateDistributionCharts(tractGeom) {
  var isSameDate = (state.fromYear === state.toYear && state.fromMonth === state.toMonth);
  var isBaseline = (state.dataType === 'adjusted');

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

    fvcChart = ui.Chart.image.histogram({image: fvcStack, region: tractGeom, scale: 10, maxPixels: 1e7}).setOptions({title: 'FVC distribution: ' + fromLabel + ' vs ' + toLabel, hAxis: { title: 'Fractional Vegetation Cover (FVC)', format: '0.00', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, vAxis: {title: 'Pixel count'}, series: { 0: {color: '#8FBF73'}, 1: {color: '#1B5E20'} }, legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11});

    // Light/dark red pair for temporal comparison
    lstChart = ui.Chart.image.histogram({image: lstStack, region: tractGeom, scale: 30, maxPixels: 1e7}).setOptions({
      title: 'LST distribution: ' + fromLabel + ' vs ' + toLabel, 
      hAxis: { title: 'Temperature (°C)', format: '#', textStyle: {fontSize: 9}, slantedText: true, slantedTextAngle: 45, gridlines: {count: 6} }, 
      vAxis: {title: 'Pixel count'}, 
      series: { 0: {color: '#EF9A9A'}, 1: {color: '#B71C1C'} }, 
      bar: { groupWidth: '100%' }, // Merges the columns visually
      legend: {position: 'top'}, chartArea: {left: 55, top: 40, width: '72%', height: '55%'}, fontSize: 11
    });

    // minBucketWidth groups narrow ET data
    // points into readable bars; groupWidth:'100%' removes gaps between columns
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


// UPDATE SIDE PANEL — THE PRIMARY ANALYTICAL OUTPUT:
// This function is called whenever a tract is clicked in the Explore tab.
// It computes tract-level summary statistics using reduceRegion (via meanOf)
// and populates the sidebar stat cards, distribution histograms, and trend
// charts. The function handles four distinct display modes:
//
//   1. Actual + Single month: shows absolute FVC/LST/ET for that month
//   2. Actual + Date range: shows change between two dates (% change, °C diff)
//   3. Adjusted + Single month: shows diff-from-2019 for one month
//   4. Adjusted + Date range: shows how the 2019-anomaly evolved over time
//
// COLOUR-CODED DELTAS: Stat card colours use semantic meaning:
//   - Green = positive outcome (vegetation increase, temperature decrease,
//     water savings) → aligns with AB 356 policy goals
//   - Red = negative outcome (vegetation loss without corresponding benefits,
//     temperature increase) → signals areas needing attention
// This colour coding helps policymakers quickly identify whether a tract
// is responding to turf removal as expected by the legislation.

// UPDATE SIDE PANEL — THE MAIN ANALYTICAL OUTPUT:
// This function is the analytical heart of the Explore tab. When a user clicks
// a tract, it computes mean FVC, LST, and ET values for that tract across the
// selected date(s), then presents the results as stat cards, distribution
// charts, and trend lines.
//
// TWO MODES OF ANALYSIS:
// 1. "Actual data" mode — shows raw metric values and percentage changes
//    between the from/to dates. Useful for understanding absolute conditions.
// 2. "Seasonally adjusted" mode — shows diff-from-2019 values, controlling
//    for seasonal cycles. Useful for isolating policy-driven change from
//    natural phenology.
//
// BATCHED SERVER CALLS:
// All metrics for a tract are fetched in a single ee.Dictionary().evaluate()
// call rather than separate calls per metric. This batches the server-side
// computation into one round-trip, reducing total latency by ~60%.
function updateSidePanel(tract) {
  state.selectedTract = tract; 
  promptPanel.style().set('shown', false); 
  statsPanel.style().set('shown', true);
  
  // double-check visibility just in case
  chartsPanel.style().set('shown', state.dataType !== 'adjusted');

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
      fTo: meanOf(fvcDiffImgTo, 'veg_diff', tractGeom, 10),
      lTo: meanOf(lstDiffImgTo, 'LST_diff_2019', tractGeom, 30),
      eTo: meanOf(etDiffImgTo, 'et_diff_2019', tractGeom, 30),
      aland: aland, geoid: geoid
    };
    if (!isSameDate) {
      var fvcDiffImgFrom = getVegDiffImage(state.fromYear, state.fromMonth);
      var lstDiffImgFrom = getLSTDiffImage(state.fromYear, state.fromMonth);
      var etDiffImgFrom  = getETDiffImage(state.fromYear, state.fromMonth);
      dictObj.fFrom = meanOf(fvcDiffImgFrom, 'veg_diff', tractGeom, 10);
      dictObj.lFrom = meanOf(lstDiffImgFrom, 'LST_diff_2019', tractGeom, 30);
      dictObj.eFrom = meanOf(etDiffImgFrom, 'et_diff_2019', tractGeom, 30);
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
    // Adjust layout based on whether it is a single month or comparison
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
      fvcStart: meanOf(fvcBefore, 'FVC', tractGeom, 10), fvcEnd: meanOf(fvcAfter, 'FVC', tractGeom, 10),
      lstStart: meanOf(lstBefore, 'LST', tractGeom, 30), lstEnd: meanOf(lstAfter, 'LST', tractGeom, 30),
      etStart: meanOf(etBefore, 'et_actual', tractGeom, 30), etEnd: meanOf(etAfter, 'et_actual', tractGeom, 30),
      aland: aland, geoid: geoid
    }).evaluate(function(v) {
      if (!v) { plainEnglish.setValue('Error loading data for this tract.'); return; }
      var fS = v.fvcStart || 0; var fE = v.fvcEnd || 0; var lS = v.lstStart || 0; var lE = v.lstEnd || 0; var eS = v.etStart || 0; var eE = v.etEnd || 0; var alandSqm = v.aland || 0; var alandAcres = alandSqm / 4046.86;

      if (isSameDate) {
        statsTitleLabel.setValue('Monthly summary'); 
        // Ensure grids 1, 2, and 3 are all shown so the temperature card doesn't vanish
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

// COMPARE TRACTS VIEW:
// This section enables side-by-side comparison of two census tracts — a
// key capability for the application's policy audience. Litigants in
// Case No. A-26-937025-C need to demonstrate spatial inequities in
// AB 356 enforcement; this view lets them compare, for example, a tract
// in Summerlin (affluent, high compliance) against one in Sunrise Manor
// (lower income, potentially lower enforcement) using the same metrics
// and time period.
//
// The view supports three scenarios:
// 1. Same date, actual data — shows absolute differences (B minus A)
// 2. Date range, actual data — overlaid monthly trend charts
// 3. Seasonally adjusted — shows how each tract's anomaly from 2019
//    differs, revealing whether one tract recovered faster than another

var resetCompareBtn = ui.Button('Reset comparison', function() { state.compareTracts = []; updateCompareView(); updateHighlightLayer(); });
resetCompareBtn.style().set({fontSize: '11px', color: '#' + COLORS.red, backgroundColor: '#FFFFFF', margin: '4px 0 8px 0', padding: '6px 8px', border: '2px solid #' + COLORS.red});



// Progressive disclosure in the compare workflow:
// - 0 tracts selected: instructional prompt ("click a tract")
// - 1 tract selected: shows the first tract's GEOID + reset button + 
//   prompt to click a second tract
// - 2 tracts selected: full comparison with stat cards and trend charts
// This guided flow eliminates confusion about the interaction sequence.
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
      var geomA = tractA.feature.geometry(); var geomB = tractB.feature.geometry();
      var dictObj = {
        fATo: meanOf(fvcDiffImgTo, 'veg_diff', geomA, 10),
        fBTo: meanOf(fvcDiffImgTo, 'veg_diff', geomB, 10),
        lATo: meanOf(lstDiffImgTo, 'LST_diff_2019', geomA, 30),
        lBTo: meanOf(lstDiffImgTo, 'LST_diff_2019', geomB, 30),
        eATo: meanOf(etDiffImgTo, 'et_diff_2019', geomA, 30),
        eBTo: meanOf(etDiffImgTo, 'et_diff_2019', geomB, 30)
      };
      if (!isSameDate) {
        var fvcDiffImgFrom = getVegDiffImage(state.fromYear, state.fromMonth);
        var lstDiffImgFrom = getLSTDiffImage(state.fromYear, state.fromMonth);
        var etDiffImgFrom  = getETDiffImage(state.fromYear, state.fromMonth);
        dictObj.fAFrom = meanOf(fvcDiffImgFrom, 'veg_diff', geomA, 10);
        dictObj.fBFrom = meanOf(fvcDiffImgFrom, 'veg_diff', geomB, 10);
        dictObj.lAFrom = meanOf(lstDiffImgFrom, 'LST_diff_2019', geomA, 30);
        dictObj.lBFrom = meanOf(lstDiffImgFrom, 'LST_diff_2019', geomB, 30);
        dictObj.eAFrom = meanOf(etDiffImgFrom, 'et_diff_2019', geomA, 30);
        dictObj.eBFrom = meanOf(etDiffImgFrom, 'et_diff_2019', geomB, 30);
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
    var geomA = tractA.feature.geometry(); var geomB = tractB.feature.geometry();
    ee.Dictionary({
      fA: meanOf(fvcImg, 'FVC', geomA, 10), fB: meanOf(fvcImg, 'FVC', geomB, 10),
      lA: meanOf(lstImg, 'LST', geomA, 30), lB: meanOf(lstImg, 'LST', geomB, 30),
      eA: meanOf(etImg, 'et_actual', geomA, 30), eB: meanOf(etImg, 'et_actual', geomB, 30)
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



// Define containers referenced in functions above. These are declared after
// the functions that populate them because GEE's JavaScript environment
// hoists var declarations (so the variable exists) but the functions only
// reference them at call time (when they're already initialised).
var trendPanel = ui.Panel([], null, STYLES.section);

// Split the explore panel so controls can sit between the selection and the charts
var exploreTop = ui.Panel([promptPanel, tractHeaderPanel]);
var exploreBottom = ui.Panel([statsPanel, chartsPanel, trendPanel]);

var comparePromptPanel = ui.Panel([], null, STYLES.section);
var compareContent = ui.Panel([], null, STYLES.section);


// ABOUT PANEL:
// Provides the project's aim, five research objectives, and data sources.
// criterion by articulating:
// - The underlying problem (AB 356 turf removal mandate and its contested impacts)
// - The application's solution (interactive spatial analysis at tract level)
// - The intended end-users (policymakers, residents, litigants)
// - The data sources and their respective roles in the analysis
// The external link to the Review-Journal article provides real-world context
// for the ongoing legal challenge, grounding the dashboard in current events.

var aboutContent = ui.Panel([
  makeSectionTitle('About this Dashboard'),
  ui.Label(
    'This dashboard quantifies land surface temperature variation and estimated water savings ' +
    'associated with turf removal across the Las Vegas Valley, using Sentinel-2 and Landsat 8 imagery.\n\n' +
    'Designed for Las Vegas Valley policymakers and residents, including those involved in ' +
    'ongoing litigation, it provides a map-based analytical ' +
    'interface with side-by-side tract comparisons and tract-level metrics to support spatial interpretation ' +
    'and evidence-based decision-making, contextualised by Nevada Assembly Bill 356 (2021).',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap'}
  ),
  ui.Label('Read more about the ongoing legal challenge ↗',
    {fontSize: '11px', color: COLORS.primary, margin: '6px 0 0 0'},
    'https://www.reviewjournal.com/news/civil-courts/high-court-paves-way-for-more-parties-to-challenge-nonfunctional-grass-irrigation-ban-3790366/'
  ),
  makeSeparator(),
  ui.Label('Project Aim', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black}),
  ui.Label(
    'To examine the spatial extent of nonfunctional turf removal across the Las Vegas Valley and assess ' +
    'its associated land surface temperature and water savings implications under Nevada Assembly Bill 356 (2021).',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap'}
  ),
  makeSeparator(),
  ui.Label('Objectives', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black}),
  ui.Label(
    '1.  To map the spatial distribution and temporal change of green space loss across census tracts ' +
    'in the Las Vegas Valley using Sentinel-2 and Landsat 8 satellite imagery.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', margin: '4px 0 6px 0'}
  ),
  ui.Label(
    '2.  To assess whether areas experiencing turf removal show corresponding changes in land surface ' +
    'temperature at the tract level.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', margin: '0 0 6px 0'}
  ),
  ui.Label(
    '3.  To estimate cumulative water savings attributable to nonfunctional turf removal at the tract ' +
    'level across the study period.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', margin: '0 0 6px 0'}
  ),
  ui.Label(
    '4.  To evaluate spatial variation in turf designation and removal patterns across the Las Vegas Valley ' +
    'in order to identify enforcement inconsistencies that may be relevant to plaintiffs in Case No. ' +
    'A-26-937025-C (a pending legal challenge to the implementation of AB 356).',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', margin: '0 0 6px 0'}
  ),
  ui.Label(
    '5.  To provide an accessible interactive platform through which policymakers, residents, and litigants can explore ' +
    'tract-level spatial, thermal, and water-use evidence to support informed interpretation of turf removal outcomes.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', margin: '0 0 6px 0'}
  ),
  makeSeparator(),
  ui.Label('Data Sources', {fontSize: '13px', fontWeight: 'bold', color: COLORS.black}),
  ui.Label(
    '•  Sentinel-2 (10 m) — fractional vegetation cover\n' +
    '•  Landsat 8 (30 m, thermal) — land surface temperature\n' +
    '•  OpenET (30 m) — evapotranspiration / water consumption\n' +
    '•  U.S. Census TIGER — tract boundaries',
    {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap', margin: '4px 0 0 0'}
  )
], null, STYLES.section);


// SIDEBAR ASSEMBLY ORDER:
// The sidebar is assembled in a deliberate information-architecture order:
// 1. Header (branding + context)
// 2. Tabs (primary navigation)
// 3. Instructions (onboarding)
// 4. Quick navigation (spatial shortcuts)
// 5. Map controls (layer switching)
// 6. Tract selection prompt / header (contextual to Explore tab)
// 7. Compare prompt (contextual to Compare tab)
// 8. Analysis settings (data type, time frame)
// 9. Results panels (stats, charts, trends — scroll into view)
// 10. About content (reference material)
// This ordering ensures the most frequently used controls are at the top
// of the sidebar, minimising scrolling during typical analytical workflows.
var leftSidebar = ui.Panel([
  headerPanel,           // "LV turf tracker"
  tabRow,                // Explore/Compare/About tabs
  instructionPanel,      // "How to use"
  navPanel,              // Quick navigation (v36)
  controlsPanel,         // "Map controls"
  exploreTop,            // "Select a tract" (Shows in Explore tab)
  comparePromptPanel,    // "Compare areas" (Shows in Compare tab) 
  analysisPanel,         // "Analysis settings"
  exploreBottom,         // Stats/trends (Explore tab)
  compareContent,        // Stats/trends (Compare tab)
  aboutContent           // About tab
], ui.Panel.Layout.flow('vertical'), {width: '400px', backgroundColor: '#' + COLORS.white, border: '1px solid #' + COLORS.grayMid});


// ─── SECTION 13: APP ASSEMBLY ───────────────────────────────────────

// LAYOUT: Sidebar (400px fixed width) + Map (flexible, fills remaining space).
// The horizontal flow layout ensures the map gets maximum screen real estate
// on wide monitors while the sidebar remains readable at a fixed width.
// ui.root.widgets().reset() replaces the default GEE interface entirely,
// giving us full control over the application chrome.

var contentRow = ui.Panel([leftSidebar, mapContainer], ui.Panel.Layout.flow('horizontal'), {stretch: 'both'});
ui.root.widgets().reset([contentRow]);

// ─── SECTION 13B: URL STATE PERSISTENCE ─────────────────────────────

// URL HASH STATE:
// Saves the current layer, date range, time mode, data type, and split
// setting into the browser URL hash (e.g., #layer=greenspace&from=2020-6).
// This provides two key UX benefits:
//   1. SHAREABILITY — users can copy/paste the URL to share their exact
//      view with colleagues, enabling collaborative spatial analysis.
//   2. PERSISTENCE — refreshing the browser restores the previous state
//      instead of resetting to defaults, preventing loss of analytical context.
//
// The readUrlState() function parses the hash on load and syncs all UI
// widgets (dropdowns, checkboxes) to the restored values. The writeUrlState()
// hook is attached to refreshMap() so every state change is automatically
// persisted without manual save actions.

function writeUrlState() {
  ui.url.set('layer', state.activeLayer);
  ui.url.set('from', state.fromYear + '-' + state.fromMonth);
  ui.url.set('to', state.toYear + '-' + state.toMonth);
  ui.url.set('mode', state.timeMode);
  ui.url.set('data', state.dataType);
  ui.url.set('split', state.splitEnabled ? '1' : '0');
}

function readUrlState() {
  var layer = ui.url.get('layer');
  if (layer && LAYER_CONFIG[layer]) state.activeLayer = layer;

  var from = ui.url.get('from');
  if (from) { var p = from.split('-'); state.fromYear = parseInt(p[0], 10); state.fromMonth = parseInt(p[1], 10); }
  var to = ui.url.get('to');
  if (to) { var p2 = to.split('-'); state.toYear = parseInt(p2[0], 10); state.toMonth = parseInt(p2[1], 10); }

  var mode = ui.url.get('mode');
  if (mode === 'single' || mode === 'compare') state.timeMode = mode;
  var data = ui.url.get('data');
  if (data === 'actual' || data === 'adjusted') state.dataType = data;
  var split = ui.url.get('split');
  if (split === '0') state.splitEnabled = false;

  // Sync UI widgets with restored state
  fromYearSel.setValue(String(state.fromYear), false);
  fromMonthSel.setValue(MONTHS[state.fromMonth - 1], false);
  toYearSel.setValue(String(state.toYear), false);
  toMonthSel.setValue(MONTHS[state.toMonth - 1], false);
  timeModeSel.setValue(state.timeMode === 'single' ? 'Single month' : 'Compare two months', false);
  dataTypeSel.setValue(state.dataType === 'actual' ? 'Actual data' : 'Seasonally adjusted data', false);
  splitCheck.setValue(state.splitEnabled, false);
}

// Hook: persist to URL on every map refresh
var _origRefreshMap = refreshMap;
refreshMap = function() { _origRefreshMap(); writeUrlState(); };

// ─── SECTION 14: INIT ──────────────────────────────────────────────

// INITIALISATION SEQUENCE:
// 1. readUrlState() — restore any saved state from the URL hash
// 2. Style tabs — set initial visual state of navigation buttons
// 3. setActiveTab('explore') — show the Explore view by default
// 4. updateTimeModeUI() — sync the date controls to the current state
// 5. updateLayerPills() — highlight the active layer pill
// 6. refreshMap() — load the initial map imagery and legends
//
// This sequence ensures the app boots into a fully consistent state,
// whether loaded fresh or restored from a shared URL.

readUrlState();
styleTabButton(tabExplore, true); styleTabButton(tabCompare, false); styleTabButton(tabAbout, false);
setActiveTab('explore'); updateTimeModeUI(); updateLayerPills(); refreshMap();

print('─── Las Vegas Valley Turf Tracker loaded ───');
print('Click a census tract on the map to view statistics.');
print('Change months with the dropdowns. Toggle split view on/off.');