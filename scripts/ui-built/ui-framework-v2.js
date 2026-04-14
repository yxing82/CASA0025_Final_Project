// ═══════════════════════════════════════════════════════════════════════
// LAS VEGAS VALLEY TURF TRACKER — UI FRAMEWORK v2
// ═══════════════════════════════════════════════════════════════════════

// ─── SECTION 0: STYLES & CONSTANTS ──────────────────────────────────

var COLORS = {
  primary:    '1B5E8A',
  green:      '3B6D11',
  greenLight: 'E2F0D5',
  greenMid:   '97C459',
  orange:     'D85A30',
  red:        'A32D2D',
  gray:       '888888',
  grayLight:  'F5F5F5',
  white:      'FFFFFF',
  black:      '333333',
  blue:       '378ADD',
  coral:      'D85A30'
};

var STYLES = {
  title:      {fontSize: '16px', fontWeight: 'bold', color: COLORS.primary},
  subtitle:   {fontSize: '13px', fontWeight: 'bold', color: COLORS.black},
  body:       {fontSize: '12px', color: COLORS.black},
  muted:      {fontSize: '11px', color: COLORS.gray},
  statValue:  {fontSize: '22px', fontWeight: 'bold', color: COLORS.black},
  statLabel:  {fontSize: '11px', color: COLORS.gray},
  card: {
    backgroundColor: COLORS.grayLight,
    padding: '10px',
    margin: '4px',
    stretch: 'horizontal'
  }
};


// ─── SECTION 1: DATA LOADING ────────────────────────────────────────

// ─── 1A. Study area boundary ───
var lasvegas_boundary = ee.FeatureCollection(
  'projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary'
);  // need to be matched on our own end!!!!
var roi = lasvegas_boundary.geometry();

// ─── 1B. Census tracts (analytical unit — ~300 features) ───
// These tile Clark County seamlessly. filterBounds clips to the boundary.
var tracts = ee.FeatureCollection('TIGER/2020/TRACT')
  .filter(ee.Filter.eq('STATEFP', '32'))
  .filter(ee.Filter.eq('COUNTYFP', '003'))
  .filter(ee.Filter.lt('ALAND', 20000000))  // exclude tracts > 20 km²
  .filterBounds(roi);

// ─── 1C. Precomputed monthly stats (UNCOMMENT when analysis done) ───
// var tractStats = ee.FeatureCollection('users/NAME/lv_tract_monthly_stats');

// ─── 1D. Parcel boundaries (visual only — appears when zoomed in) ───
// TODO: Upload the parcel shapefile as an Earth Engine asset, then:
// var parcels = ee.FeatureCollection('users/NAME/lv_parcels');
// For now this is null
var parcels = null;


// ─── SECTION 2: CLOUD MASKING & PROCESSING ─

// ─── Sentinel-2 cloud mask ───
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

// ─── Landsat 8 cloud mask ───
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

// ─── Landsat 8 scale factors ───
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true);
}

// ─── Visualisation parameters ───
var s2_vis = {min: 0.0, max: 0.3, bands: ['B4', 'B3', 'B2']};
var lst_vis = {min: 20, max: 60, palette: ['#313695','#4575B4','#ABD9E9','#FEE090','#F46D43','#A50026']};
var fvc_vis = {min: 0, max: 0.7, palette: ['#F5F5DC','#C5E1A5','#66BB6A','#2E7D32','#1B5E20']};


// ─── SECTION 3: COMPOSITE FUNCTIONS ─────────────────────────────────

// ─── Sentinel-2 true-colour monthly composite ───
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

// ─── FVC monthly composite ───
// [STUB] Uses NDVI as proxy. Replace with Spectral Mixture Analysis.
function getFVCImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var composite = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(roi)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .map(maskS2clouds)
    .median();
  // NDVI proxy — replace with SMA FVC when ready
  return composite.normalizedDifference(['B8', 'B4']).rename('FVC').clip(roi);
}

// ─── LST monthly composite ───
function getLSTImage(year, month) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterDate(start, end)
    .filterBounds(roi)
    .filter(ee.Filter.lt('CLOUD_COVER', 10))
    .map(maskL8sr)
    .map(applyScaleFactors);

  // ST_B10 is already in Kelvin after applyScaleFactors; convert to Celsius
  var lst = collection.select('ST_B10').map(function(image) {
    var celsius = image.subtract(273.15);
    var mask = celsius.gt(0);  // mask out implausible negatives
    return celsius.updateMask(mask);
  });

  return lst.median().rename('LST').clip(roi);
}


// ─── SECTION 4: APP STATE ───────────────────────────────────────────

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026'];

var state = {
  currentView:   'explore',
  activeLayer:   'greenspace',
  splitEnabled:  true,
  fromYear:  2019,  fromMonth: 1, // so far, we consider the start of January 2019
  toYear:    2026,  toMonth:   3,  // and the end in March 2026
  selectedTract: null,
  compareTracts: []
};


// ─── SECTION 5: UI CONSTRUCTION ─────────────────────────────────────

// Hide default GEE UI
ui.root.clear();
var leftMap  = ui.Map();
var rightMap = ui.Map();

[leftMap, rightMap].forEach(function(m) {
  m.setControlVisibility({all: false});
  m.setOptions('custom', {custom: [
    {stylers: [{saturation: -80}]},
    {featureType: 'poi',     stylers: [{visibility: 'off'}]},
    {featureType: 'transit', stylers: [{visibility: 'off'}]}
  ]});
});

var mapLinker = ui.Map.Linker([leftMap, rightMap]);

// // ─── 5.1 Navigation bar ─────────────────────────────────────────────

// var logo = ui.Label('Las Vegas Valley Turf Tracker', {
//   fontSize: '15px', fontWeight: 'bold', color: COLORS.primary, margin: '8px 16px'
// });

// var tabExplore = ui.Button('Explore');
// var tabCompare = ui.Button('Compare');
// var tabAbout   = ui.Button('About');

// var tabBar = ui.Panel([tabExplore, tabCompare, tabAbout],
//   ui.Panel.Layout.flow('horizontal'), {margin: '6px 8px'});

// var navBar = ui.Panel([logo, tabBar],
//   ui.Panel.Layout.flow('horizontal'),
//   {backgroundColor: COLORS.white, stretch: 'horizontal'});

// ─── 5.1 Navigation bar ─────────────────────────────────────────────

var logo = ui.Label('Las Vegas Valley Turf Tracker', {
  fontSize: '15px', fontWeight: 'bold', color: COLORS.primary, margin: '8px 16px'
});

var tabExplore = ui.Button('Explore');
var tabCompare = ui.Button('Compare');
var tabAbout   = ui.Button('About');

var tabBar = ui.Panel([tabExplore, tabCompare, tabAbout],
  ui.Panel.Layout.flow('horizontal'), {margin: '6px 8px'});

// Create an empty label that stretches to fill the empty space
var spacer = ui.Label('', {stretch: 'horizontal'});

// Add the spacer BETWEEN the logo and the tabBar
var navBar = ui.Panel([logo, spacer, tabBar],
  ui.Panel.Layout.flow('horizontal'),
  {backgroundColor: COLORS.white, stretch: 'horizontal'});


// ─── 5.2 Layer toolbar ──────────────────────────────────────────────

function makeLayerPill(label, key) {
  var btn = ui.Button(label, function() {
    state.activeLayer = key;
    updatePillStyles();
    refreshMap();
  }, false, {fontSize: '11px', padding: '4px 12px', margin: '2px'});
  btn._key = key;
  return btn;
}

var pillGreen = makeLayerPill('Green space', 'greenspace');
var pillTemp  = makeLayerPill('Temperature', 'temperature');
var pillWater = makeLayerPill('Water savings', 'watersavings');

function updatePillStyles() {
  [pillGreen, pillTemp, pillWater].forEach(function(p) {
    var active = (p._key === state.activeLayer);
    p.style().set('backgroundColor', active ? COLORS.greenLight : COLORS.white);
    p.style().set('color', active ? COLORS.green : COLORS.gray);
  });
}

var splitLabel = ui.Label('Split view', {fontSize: '11px', color: COLORS.gray, margin: '6px 4px'});
var splitCheck = ui.Checkbox('', true);
splitCheck.onChange(function(v) { state.splitEnabled = v; refreshMap(); });

var toolbar = ui.Panel(
  [pillGreen, pillTemp, pillWater, ui.Label('', {stretch: 'horizontal'}), splitLabel, splitCheck],
  ui.Panel.Layout.flow('horizontal'),
  {backgroundColor: COLORS.white, padding: '4px 8px'}
);


// ─── 5.3 Time selector ─────────────────────────────────────────────

var fromMonthSel = ui.Select({items: MONTHS, value: 'Jan', style: {width: '70px', fontSize: '12px'}});
var fromYearSel  = ui.Select({items: YEARS,  value: '2019', style: {width: '70px', fontSize: '12px'}});
var toMonthSel   = ui.Select({items: MONTHS, value: 'Mar', style: {width: '70px', fontSize: '12px'}});
var toYearSel    = ui.Select({items: YEARS,  value: '2026', style: {width: '70px', fontSize: '12px'}});

function onTimeChange() {
  state.fromMonth = MONTHS.indexOf(fromMonthSel.getValue()) + 1;
  state.fromYear  = parseInt(fromYearSel.getValue());
  state.toMonth   = MONTHS.indexOf(toMonthSel.getValue()) + 1;
  state.toYear    = parseInt(toYearSel.getValue());
  refreshMap();
  if (state.selectedTract) updateSidePanel(state.selectedTract);
}

fromMonthSel.onChange(onTimeChange);
fromYearSel.onChange(onTimeChange);
toMonthSel.onChange(onTimeChange);
toYearSel.onChange(onTimeChange);

var timeBar = ui.Panel(
  [ui.Label('From', {fontSize: '11px', color: COLORS.gray, margin: '6px 4px'}),
   fromMonthSel, fromYearSel,
   ui.Label('—', {fontSize: '14px', color: COLORS.gray, margin: '4px 8px'}),
   toMonthSel, toYearSel,
   ui.Label('To', {fontSize: '11px', color: COLORS.gray, margin: '6px 4px'})],
  ui.Panel.Layout.flow('horizontal'),
  {backgroundColor: COLORS.white, padding: '6px 12px'}
);


// ─── 5.4 Map date labels ───────────────────────────────────────────

var leftDateLabel = ui.Label('Jun 2020', {
  fontSize: '12px', fontWeight: 'bold',
  backgroundColor: 'rgba(255,255,255,0.9)',
  padding: '4px 10px', position: 'top-left'
});
var rightDateLabel = ui.Label('Jun 2023', {
  fontSize: '12px', fontWeight: 'bold',
  backgroundColor: 'rgba(255,255,255,0.9)',
  padding: '4px 10px', position: 'top-right'
});
leftMap.add(leftDateLabel);
rightMap.add(rightDateLabel);


// ─── 5.5 Side panel (Explore view) ─────────────────────────────────

// Prompt (before any tract is clicked)
var promptPanel = ui.Panel([
  ui.Label('Select an area', STYLES.subtitle),
  ui.Label('Click any census tract on the map to see its green space, temperature, and water savings statistics.',
    {fontSize: '12px', color: COLORS.gray, padding: '8px 0'}),
  ui.Label('Tracts are outlined on the map. Your statistics will appear here.',
    {fontSize: '11px', color: COLORS.gray, fontStyle: 'italic'})
], null, {padding: '16px'});

// Stat cards
function makeStatCard(label) {
  var valLabel   = ui.Label('—', STYLES.statValue);
  var nameLabel  = ui.Label(label, STYLES.statLabel);
  var deltaLabel = ui.Label('', {fontSize: '11px'});
  var card = ui.Panel([nameLabel, valLabel, deltaLabel], null, STYLES.card);
  return {panel: card, val: valLabel, delta: deltaLabel};
}

var cardGreen = makeStatCard('Green space lost');
var cardTemp  = makeStatCard('Surface got hotter');
var cardWater = makeStatCard('Water saved');
var cardFVC   = makeStatCard('Vegetation fraction');

var statsRow1 = ui.Panel([cardGreen.panel, cardTemp.panel],
  ui.Panel.Layout.flow('horizontal'));
var statsRow2 = ui.Panel([cardWater.panel, cardFVC.panel],
  ui.Panel.Layout.flow('horizontal'));

// Plain English summary
var plainEnglish = ui.Label('', {fontSize: '12px', color: COLORS.black, padding: '8px 0', whiteSpace: 'pre-wrap'});

// Technical detail (collapsible)
var techContent = ui.Panel([
  ui.Label('Loading...', {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'})
], null, {shown: false, backgroundColor: COLORS.grayLight, padding: '10px', margin: '4px 0'});

var techToggle = ui.Button('+ Technical detail for reports', function() {
  var shown = techContent.style().get('shown');
  techContent.style().set('shown', !shown);
  techToggle.setLabel(shown ? '+ Technical detail for reports' : '− Technical detail for reports');
}, false, {fontSize: '11px', color: COLORS.gray, backgroundColor: COLORS.grayLight, margin: '4px 0'});

// Trend charts placeholder
var trendPanel = ui.Panel([
  ui.Label('Trend over time', STYLES.subtitle),
  ui.Label('Monthly FVC and LST charts will appear here once precomputed stats are available.',
    {fontSize: '11px', color: COLORS.gray, fontStyle: 'italic'})
], null, {padding: '12px 0'});

// Nearby tracts
var nearbyPanel = ui.Panel([
  ui.Label('Nearby areas for context', STYLES.subtitle)
], null, {padding: '12px 0'});

// Add to compare button
var addCompareBtn = ui.Button('+ Add to comparison', function() {
  if (state.selectedTract && state.compareTracts.length < 3) {
    state.selectedTract.get('GEOID').evaluate(function(geoid) {
      var already = state.compareTracts.some(function(t) { return t.geoid === geoid; });
      if (!already) {
        state.compareTracts.push({
          geoid: geoid,
          feature: state.selectedTract,
          color: COLORS[['blue','coral','greenMid'][state.compareTracts.length]]
        });
        addCompareBtn.setLabel('Added (' + state.compareTracts.length + '/3)');
      }
    });
  }
}, false, {fontSize: '11px', color: COLORS.primary, margin: '8px 0'});

// Stats panel (hidden until click)
var statsPanel = ui.Panel([
  ui.Label('What changed?', STYLES.subtitle),
  statsRow1, statsRow2,
  plainEnglish,
  addCompareBtn,
  techToggle, techContent,
  trendPanel,
  nearbyPanel
], null, {padding: '12px 14px', shown: false});

var sidePanel = ui.Panel([promptPanel, statsPanel], null, {
  width: '320px', backgroundColor: COLORS.white
});


// ─── 5.6 Compare panel ─────────────────────────────────────────────

var compareContent = ui.Panel([
  ui.Label('Compare areas', STYLES.title),
  ui.Label('Add 2–3 tracts from the Explore tab using the "+ Add to comparison" button, then switch here.',
    {fontSize: '12px', color: COLORS.gray, padding: '8px 0'})
], null, {padding: '16px', shown: false});


// ─── 5.7 About panel ───────────────────────────────────────────────

var aboutContent = ui.Panel([
  ui.Label('About this dashboard', STYLES.title),
  ui.Label(''),

  ui.Label('Policy background', STYLES.subtitle),
  ui.Label(
    'Nevada Assembly Bill 356 (2021) requires removal of all non-functional turf ' +
    'irrigated with Colorado River water in the Las Vegas Valley by the end of 2026. ' +
    'Non-functional turf includes decorative grass in medians, office parks, streetscapes, ' +
    'and commercial surroundings. Functional turf (recreation, sport) is exempt.\n\n' +
    'The SNWA Xeriscape Conversion Study found that turf consumed 73.0 gallons per ' +
    'square foot annually vs. 17.2 for xeriscape — a saving of 55.8 gal/sq.ft/yr. ' +
    'This figure underpins all water savings estimates in the dashboard.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0 12px 0'}),

  ui.Label('Data pipeline', STYLES.subtitle),
  ui.Label(
    'Green space: Sentinel-2 SR → cloud masking (QA60 bits 10–11) → monthly median → ' +
    'Spectral Mixture Analysis → FVC.\n\n' +
    'Temperature: Landsat 8 C2 L2 → cloud masking (QA_PIXEL bits 1–4) → scale factors ' +
    '(optical: ×0.0000275 − 0.2; thermal: ×0.00341802 + 149.0) → K to °C → monthly median.\n\n' +
    'Spatial units: 2020 TIGER census tracts, Clark County, clipped to study area, ' +
    'tracts > 20 km² excluded.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0 12px 0'}),

  ui.Label('Limitations', STYLES.subtitle),
  ui.Label(
    '• LST is land surface temperature, not air temperature — it indicates surface ' +
    'heating, not thermal comfort.\n' +
    '• Greenness loss may reflect xeriscape replacement, paving, or other changes.\n' +
    '• Water savings use the 55.8 gal/sq.ft/yr constant, not metered data.\n' +
    '• This is an exploratory spatial tool, not a causal test.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0 12px 0'}),

  ui.Label('References', STYLES.subtitle),
  ui.Label(
    'Saher et al. (2021) Urban Climate, 38.\n' +
    'Mejía Valencia et al. (2023) AAG Conference Abstract.\n' +
    'SNWA (2000) Xeriscape Conversion Study.\n' +
    'SNWA (2026) Water Resource Plan Ch. 3.\n' +
    'Nevada Legislature (2021) AB 356.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0'})
], null, {width: '600px', padding: '16px', shown: false});


// ─── SECTION 6: TAB SWITCHING ───────────────────────────────────────

function setActiveTab(tab) {
  state.currentView = tab;
  tabExplore.style().set('backgroundColor', tab === 'explore' ? COLORS.grayLight : COLORS.white);
  tabCompare.style().set('backgroundColor', tab === 'compare' ? COLORS.grayLight : COLORS.white);
  tabAbout.style().set('backgroundColor',   tab === 'about'   ? COLORS.grayLight : COLORS.white);

  sidePanel.style().set('shown',      tab === 'explore');
  compareContent.style().set('shown',  tab === 'compare');
  aboutContent.style().set('shown',    tab === 'about');
  toolbar.style().set('shown',         tab === 'explore');
  timeBar.style().set('shown',         tab === 'explore');
  mapContainer.style().set('shown',    tab !== 'about');

  if (tab === 'explore') refreshMap();
  if (tab === 'compare') updateCompareView();
}

tabExplore.onClick(function() { setActiveTab('explore'); });
tabCompare.onClick(function() { setActiveTab('compare'); });
tabAbout.onClick(function()   { setActiveTab('about');   });


// ─── SECTION 7: MAP REFRESH ────────────────────────────────────────

// Split panel
var splitPanel = ui.SplitPanel({
  firstPanel: leftMap, secondPanel: rightMap,
  orientation: 'horizontal', wipe: true
});

var mapContainer = ui.Panel([splitPanel], null, {stretch: 'both'});

function refreshMap() {
  leftDateLabel.setValue(MONTHS[state.fromMonth - 1] + ' ' + state.fromYear);
  rightDateLabel.setValue(MONTHS[state.toMonth - 1] + ' ' + state.toYear);

  leftMap.layers().reset();
  rightMap.layers().reset();

  if (state.splitEnabled) {
    // ─── Split view: composites side by side ───
    mapContainer.widgets().reset([splitPanel]);
    rightDateLabel.style().set('shown', true);

    if (state.activeLayer === 'greenspace') {
      leftMap.addLayer(getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC Before');
      rightMap.addLayer(getFVCImage(state.toYear, state.toMonth), fvc_vis, 'FVC After');

    } else if (state.activeLayer === 'temperature') {
      leftMap.addLayer(getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST Before');
      rightMap.addLayer(getLSTImage(state.toYear, state.toMonth), lst_vis, 'LST After');

    } else {
      // Water savings view: show true colour + tract outlines
      leftMap.addLayer(getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'S2 Before');
      rightMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'S2 After');
    }

  } else {
    // ─── Single view: choropleth ───
    mapContainer.widgets().reset([leftMap]);
    rightDateLabel.style().set('shown', false);

    // TODO: Once precomputed stats exist, colour tracts by change value:
    //   var painted = ee.Image().paint(tractStats, 'fvc_change_pct');
    //   leftMap.addLayer(painted, {min:-30, max:0, palette:['red','yellow','green']}, 'FVC Change');
    // For now, show FVC difference raster
    var fvcDiff = getFVCImage(state.toYear, state.toMonth)
      .subtract(getFVCImage(state.fromYear, state.fromMonth));
    leftMap.addLayer(fvcDiff, {min: -0.3, max: 0.1, palette: ['#A50026','#F46D43','#FEE090','#E0F3DB','#1B7837']},
      'FVC change');
  }

  // ─── Always add tract boundaries for click interaction ───
  var tractStyle = tracts.style({color: COLORS.primary + '80', fillColor: '00000000', width: 0.8});
  leftMap.addLayer(tractStyle, {}, 'Census tracts');
  if (state.splitEnabled) {
    rightMap.addLayer(tractStyle, {}, 'Census tracts');
  }

  // ─── Add study area boundary ───
  var boundaryStyle = lasvegas_boundary.style({color: COLORS.primary, fillColor: '00000000', width: 2});
  leftMap.addLayer(boundaryStyle, {}, 'Study area');
  if (state.splitEnabled) {
    rightMap.addLayer(boundaryStyle, {}, 'Study area'); // Adds to right side!
  }

  // ─── Parcel visual overlay (only if loaded) ───
  // These are for visual context only — not used for any computation
  if (parcels !== null) {
    var parcelStyle = parcels.style({color: '00000030', fillColor: '00000000', width: 0.3});
    leftMap.addLayer(parcelStyle, {}, 'Parcels (visual)');
    if (state.splitEnabled) {
      rightMap.addLayer(parcelStyle, {}, 'Parcels (visual)');
    }
  }

  leftMap.centerObject(roi, 11);
}



// ─── SECTION 8: TRACT CLICK → STATS ────────────────────────────────

// Pull the click logic out into its own named function
function handleMapClick(coords) {
  if (state.currentView !== 'explore') return;

  var point   = ee.Geometry.Point(coords.lon, coords.lat);
  var clicked = tracts.filterBounds(point).first();

  clicked.evaluate(function(f) {
    if (!f) return;
    updateSidePanel(ee.Feature(f));
  });
}

// Assign the function to BOTH maps
leftMap.onClick(handleMapClick);
rightMap.onClick(handleMapClick);

function updateSidePanel(tract) {
  state.selectedTract = tract;
  addCompareBtn.setLabel('+ Add to comparison');
  promptPanel.style().set('shown', false);
  statsPanel.style().set('shown', true);

  var tractGeom = tract.geometry();
  var geoid     = tract.get('GEOID');
  var aland     = ee.Number(tract.get('ALAND'));

  // ─── Live query (replace with precomputed property lookup later) ───
  // TODO: When tractStats is available, replace this with:
  //   var fvcStartKey = 'fvc_' + state.fromYear + '_' + padMonth(state.fromMonth);
  //   var fvcStart = ee.Number(tract.get(fvcStartKey));
  //   ... etc, then call .evaluate() on a dictionary of those values.

  var fvcBefore = getFVCImage(state.fromYear, state.fromMonth);
  var fvcAfter  = getFVCImage(state.toYear, state.toMonth);
  var lstBefore = getLSTImage(state.fromYear, state.fromMonth);
  var lstAfter  = getLSTImage(state.toYear, state.toMonth);

  ee.Dictionary({
    fvcStart: fvcBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
    fvcEnd:   fvcAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 10, bestEffort: true}).get('FVC'),
    lstStart: lstBefore.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
    lstEnd:   lstAfter.reduceRegion({reducer: ee.Reducer.mean(), geometry: tractGeom, scale: 30, bestEffort: true}).get('LST'),
    aland: aland,
    geoid: geoid
  }).evaluate(function(v) {
    if (!v) {
      plainEnglish.setValue('Error loading data for this tract. Try another.');
      return;
    }

    var fS = v.fvcStart || 0,  fE = v.fvcEnd || 0;
    var lS = v.lstStart || 0,  lE = v.lstEnd || 0;
    var alandSqm = v.aland || 0;

    // ─── Derived values (from spec Section 3.3) ───
    var fvcChangePct  = fS > 0 ? ((fE - fS) / fS * 100) : 0;
    var alandAcres    = alandSqm / 4046.86;
    var turfLossAcres = Math.abs(fE - fS) * alandAcres;
    var lstChange     = lE - lS;
    var turfLossSqFt  = turfLossAcres * 43560;
    var waterSaved    = turfLossSqFt * 55.8;
    var fvcAbsChange  = fE - fS;

    // ─── Update stat cards ───
    cardGreen.val.setValue(fvcChangePct.toFixed(1) + '%');
    cardGreen.delta.setValue(turfLossAcres.toFixed(1) + ' acres');
    cardGreen.delta.style().set('color', fvcChangePct < 0 ? COLORS.red : COLORS.green);

    cardTemp.val.setValue((lstChange >= 0 ? '+' : '') + lstChange.toFixed(1) + '°C');
    cardTemp.delta.setValue('between selected dates');
    cardTemp.delta.style().set('color', lstChange > 0 ? COLORS.red : COLORS.green);

    var wLabel = waterSaved >= 1e6 ? (waterSaved/1e6).toFixed(1) + 'M gal/yr'
               : waterSaved >= 1e3 ? (waterSaved/1e3).toFixed(0) + 'K gal/yr'
               : waterSaved.toFixed(0) + ' gal/yr';
    cardWater.val.setValue(wLabel);
    cardWater.delta.setValue('estimated');
    cardWater.delta.style().set('color', COLORS.green);

    cardFVC.val.setValue(fvcAbsChange.toFixed(3));
    cardFVC.delta.setValue('mean FVC change');
    cardFVC.delta.style().set('color', fvcAbsChange < 0 ? COLORS.red : COLORS.green);

    // ─── Plain English summary ───
    var fromStr = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
    var toStr   = MONTHS[state.toMonth - 1]   + ' ' + state.toYear;
    var dir     = fvcChangePct < 0 ? 'lost' : 'gained';
    var tDir    = lstChange > 0 ? 'warmer' : 'cooler';
    plainEnglish.setValue(
      'Between ' + fromStr + ' and ' + toStr + ', this area ' + dir +
      ' about ' + turfLossAcres.toFixed(0) + ' acres of green space (' +
      Math.abs(fvcChangePct).toFixed(0) + '%). The ground surface got ' +
      Math.abs(lstChange).toFixed(1) + '°C ' + tDir + '.' +
      (fvcChangePct < 0 ? ' That removal saves an estimated ' + wLabel + ' of water.' : '')
    );

    // ─── Technical detail ───
    techContent.widgets().reset([ui.Label(
      'Data: Sentinel-2 SR (FVC via NDVI proxy — to be replaced with SMA), ' +
      'Landsat 8 C2 L2 (LST).\n' +
      'Tract GEOID: ' + (v.geoid || '—') + '\n' +
      'Area: ' + alandAcres.toFixed(1) + ' acres (' + (alandSqm/1e6).toFixed(2) + ' km²)\n' +
      'FVC: ' + fS.toFixed(4) + ' → ' + fE.toFixed(4) + '\n' +
      'LST: ' + lS.toFixed(1) + '°C → ' + lE.toFixed(1) + '°C\n' +
      'Water factor: 55.8 gal/sq.ft/yr (SNWA, 2000).\n\n' +
      'Caveats: LST ≠ air temperature. Greenness loss ≠ confirmed turf removal.',
      {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'}
    )]);

// ─── Highlight tract on map ───
    var highlightStyle = ee.FeatureCollection([ee.Feature(tractGeom)])
      .style({color: COLORS.primary, fillColor: COLORS.primary + '30', width: 2});
      
    leftMap.addLayer(highlightStyle, {}, 'Selected tract');
    
    if (state.splitEnabled) {
      rightMap.addLayer(highlightStyle, {}, 'Selected tract');
    }
  });
    
    

  // ─── Nearby tracts comparison ───
  nearbyPanel.widgets().reset([
    ui.Label('Nearby areas for context', STYLES.subtitle),
    ui.Label('Computing nearby tracts...', {fontSize: '11px', color: COLORS.gray})
  ]);

  var centroid = tract.geometry().centroid();
  var nearby = tracts.filterBounds(centroid.buffer(5000)).limit(4);

  // TODO: When precomputed stats exist, read FVC change % from properties
  // and show a comparison row. For now, show count only.
  nearby.size().evaluate(function(n) {
    nearbyPanel.widgets().reset([
      ui.Label('Nearby areas for context', STYLES.subtitle),
      ui.Label(n + ' tracts within 5 km. Comparison values will appear ' +
               'once monthly stats are precomputed per tract.',
        {fontSize: '11px', color: COLORS.gray})
    ]);
  });
}


// ─── SECTION 9: COMPARE VIEW ────────────────────────────────────────

function updateCompareView() {
  var n = state.compareTracts.length;
  if (n < 2) {
    compareContent.widgets().reset([
      ui.Label('Compare areas', STYLES.title),
      ui.Label(n + '/2 tracts selected. Go to the Explore tab, click a tract, ' +
               'and press "+ Add to comparison" to add more.',
        {fontSize: '12px', color: COLORS.gray, padding: '12px 0'})
    ]);
    return;
  }

  // TODO: Build full comparison view with overlaid charts
  // For now, show selected tracts
  var widgets = [ui.Label('Compare areas', STYLES.title)];
  state.compareTracts.forEach(function(t, i) {
    widgets.push(ui.Label(
      '● Tract ' + t.geoid,
      {fontSize: '13px', fontWeight: 'bold', color: t.color, padding: '4px 0'}
    ));
  });
  widgets.push(ui.Label(
    'Full side-by-side charts and stats table will be built once ' +
    'the precomputed monthly feature collection is available.',
    {fontSize: '11px', color: COLORS.gray, padding: '12px 0', fontStyle: 'italic'}
  ));

  compareContent.widgets().reset(widgets);
}


// ─── SECTION 10: ASSEMBLE & LAUNCH ─────────────────────────────────

var contentRow = ui.Panel(
  [mapContainer, sidePanel, compareContent, aboutContent],
  ui.Panel.Layout.flow('horizontal'),
  {stretch: 'both'}
);

var app = ui.Panel(
  [navBar, toolbar, timeBar, contentRow],
  ui.Panel.Layout.flow('vertical'),
  {stretch: 'both'}
);

ui.root.add(app);

// Initialise
setActiveTab('explore');
updatePillStyles();
refreshMap();

print('─── Las Vegas Valley Turf Tracker loaded ───');
print('Click a census tract on the map to view statistics.');
print('Change months with the dropdowns. Toggle split view on/off.');
print('Use "+ Add to comparison" to collect tracts for the Compare tab.');
