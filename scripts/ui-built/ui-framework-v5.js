// ═══════════════════════════════════════════════════════════════════════
// LAS VEGAS VALLEY TURF TRACKER — UI FRAMEWORK v5
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


// ─── SECTION 4: APP STATE ───────────────────────────────────────────

var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var YEARS  = ['2019','2020','2021','2022','2023','2024','2025','2026'];

var state = {
  currentView:   'explore',
  activeLayer:   'greenspace',
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
  return {panel: card, val: valLabel, delta: deltaLabel};
}

function styleTabButton(btn, active) {
  btn.style().set({
    backgroundColor: active ? UI_COLORS.activeFill : UI_COLORS.inactiveFill,
    color: active ? UI_COLORS.activeText : UI_COLORS.inactiveText,
    border: '0px solid transparent',
    padding: '8px 16px',
    margin: '0 6px 0 0',
    fontSize: '12px',
    fontWeight: active ? 'bold' : 'normal'
  });
}

function stylePillButton(btn, active) {
  btn.style().set({
    backgroundColor: active ? UI_COLORS.activeFill : UI_COLORS.inactiveFill,
    color: active ? UI_COLORS.activeText : UI_COLORS.inactiveText,
    border: '0px solid transparent',
    padding: '6px 12px',
    margin: '2px 6px 2px 0',
    fontSize: '11px',
    fontWeight: active ? 'bold' : 'normal'
  });
}


// ─── SECTION 6: MAPS ────────────────────────────────────────────────

ui.root.clear();

var leftMap = ui.Map();
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
leftMap.add(leftLSTLegend);

function updateLegendVisibility() {
  var showLegend = state.activeLayer === 'temperature';
  leftLSTLegend.style().set('shown', showLegend);
}


// ─── SECTION 7: LEFT SIDEBAR ────────────────────────────────────────

var appTitle = ui.Label('Las Vegas Valley Turf Tracker', STYLES.appTitle);
var appSubtitle = ui.Label(
  'Urban turf change, surface heat, and water savings explorer',
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
  label: 'Explore',
  style: {border: '0px solid transparent'}
});

var tabCompare = ui.Button({
  label: 'Compare',
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

var pillGreen = makeLayerPill('Greenness', 'greenspace');
var pillTemp  = makeLayerPill('Heat', 'temperature');
var pillWater = makeLayerPill('Water', 'watersavings');

function updateLayerPills() {
  [pillGreen, pillTemp, pillWater].forEach(function(p) {
    var active = (p._key === state.activeLayer);
    stylePillButton(p, active);
  });
}

// Time controls
var fromMonthSel = ui.Select({items: MONTHS, value: 'Jun', style: {width: '70px', fontSize: '12px'}});
var fromYearSel  = ui.Select({items: YEARS,  value: '2020', style: {width: '75px', fontSize: '12px'}});
var toMonthSel   = ui.Select({items: MONTHS, value: 'Jun', style: {width: '70px', fontSize: '12px'}});
var toYearSel    = ui.Select({items: YEARS,  value: '2023', style: {width: '75px', fontSize: '12px'}});

function onTimeChange() {
  state.fromMonth = MONTHS.indexOf(fromMonthSel.getValue()) + 1;
  state.fromYear  = parseInt(fromYearSel.getValue(), 10);
  state.toMonth   = MONTHS.indexOf(toMonthSel.getValue()) + 1;
  state.toYear    = parseInt(toYearSel.getValue(), 10);
  refreshMap();
  if (state.selectedTract) updateSidePanel(state.selectedTract);
}

fromMonthSel.onChange(onTimeChange);
fromYearSel.onChange(onTimeChange);
toMonthSel.onChange(onTimeChange);
toYearSel.onChange(onTimeChange);

var splitCheck = ui.Checkbox('Split view', true);
splitCheck.style().set({fontSize: '12px', color: '#' + COLORS.black});
splitCheck.onChange(function(v) {
  state.splitEnabled = v;
  refreshMap();
});

var controlsPanel = ui.Panel([
  makeSectionTitle('Map controls'),
  ui.Label('Layer', STYLES.muted),
  ui.Panel([pillGreen, pillTemp, pillWater], ui.Panel.Layout.flow('horizontal')),
  makeSeparator(),
  ui.Label('Time period', STYLES.muted),
  ui.Panel([
    ui.Label('From', {fontSize: '11px', color: COLORS.gray, width: '40px'}),
    fromMonthSel, fromYearSel
  ], ui.Panel.Layout.flow('horizontal')),
  ui.Panel([
    ui.Label('To', {fontSize: '11px', color: COLORS.gray, width: '40px'}),
    toMonthSel, toYearSel
  ], ui.Panel.Layout.flow('horizontal')),
  makeSeparator(),
  splitCheck
], null, STYLES.section);

// Explore content
var promptPanel = ui.Panel([
  makeSectionTitle('Select an area'),
  ui.Label(
    'Click any census tract on the map to view green space, temperature, water savings, and distribution charts.',
    {fontSize: '12px', color: COLORS.gray, whiteSpace: 'pre-wrap'}
  )
], null, STYLES.section);

var cardGreen = makeStatCard('Green space change');
var cardTemp  = makeStatCard('Surface temperature');
var cardWater = makeStatCard('Water savings');
var cardFVC   = makeStatCard('Vegetation fraction');

var statsGrid1 = ui.Panel([cardGreen.panel, cardTemp.panel], ui.Panel.Layout.flow('horizontal'));
var statsGrid2 = ui.Panel([cardWater.panel, cardFVC.panel], ui.Panel.Layout.flow('horizontal'));

var plainEnglish = ui.Label('', {
  fontSize: '12px',
  color: COLORS.black,
  whiteSpace: 'pre-wrap',
  padding: '6px 0'
});

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
  fontSize: '11px',
  color: '#' + COLORS.gray,
  backgroundColor: '#' + COLORS.grayLight,
  margin: '4px 0',
  padding: '6px 8px',
  border: '0px solid transparent'
});

var addCompareBtn = ui.Button('+ Add to comparison', function() {
  if (state.selectedTract && state.compareTracts.length < 3) {
    state.selectedTract.get('GEOID').evaluate(function(geoid) {
      var already = state.compareTracts.some(function(t) {
        return t.geoid === geoid;
      });
      if (!already) {
        state.compareTracts.push({
          geoid: geoid,
          feature: state.selectedTract,
          color: [COLORS.blue, COLORS.coral, COLORS.greenMid][state.compareTracts.length]
        });
        addCompareBtn.setLabel('Added (' + state.compareTracts.length + '/3)');
        
        // Refresh map immediately to draw the highlight for the new compared tract
        refreshMap();
      }
    });
  }
});
addCompareBtn.style().set({
  fontSize: '11px',
  color: '#' + COLORS.primary,
  margin: '8px 0 4px 0',
  padding: '6px 8px',
  border: '0px solid transparent',
  backgroundColor: '#FFFFFF'
});

var resetSelectionBtn = ui.Button('Reset selected tract', function() {
  resetSelectedTract();
});
resetSelectionBtn.style().set({
  fontSize: '11px',
  color: '#FFFFFF',
  backgroundColor: '#' + COLORS.red,
  margin: '4px 0 0 0',
  padding: '6px 8px',
  border: '0px solid transparent'
});

var trendPanel = ui.Panel([
  ui.Label('Trend over time', STYLES.subtitle),
  ui.Label(
    'Monthly FVC and LST charts will appear here once precomputed stats are available.',
    {fontSize: '11px', color: COLORS.gray, fontStyle: 'italic'}
  )
], null, STYLES.section);

var nearbyPanel = ui.Panel([
  ui.Label('Nearby areas for context', STYLES.subtitle),
  ui.Label(
    'Comparison values will appear here once monthly stats are precomputed per tract.',
    {fontSize: '11px', color: COLORS.gray, fontStyle: 'italic'}
  )
], null, STYLES.section);

// Charts section
var chartTitle = ui.Label('Selected area distributions', STYLES.subtitle);

var chartNote = ui.Label(
  'Histograms update after you click a tract.',
  {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'}
);

var fvcChartHolder = ui.Panel([
  ui.Label('FVC distribution chart will appear here.', STYLES.muted)
], null, {
  backgroundColor: '#' + COLORS.white,
  border: '1px solid #' + COLORS.grayMid,
  padding: '6px',
  margin: '4px 0'
});

var lstChartHolder = ui.Panel([
  ui.Label('LST distribution chart will appear here.', STYLES.muted)
], null, {
  backgroundColor: '#' + COLORS.white,
  border: '1px solid #' + COLORS.grayMid,
  padding: '6px',
  margin: '4px 0'
});

var chartsPanel = ui.Panel([
  chartTitle,
  chartNote,
  fvcChartHolder,
  lstChartHolder
], null, STYLES.section);

// Future analysis placeholder
var futureAnalysisPanel = ui.Panel([
  makeSectionTitle('Analysis outputs'),
  ui.Label(
    'Reserved for later teammate outputs: precomputed monthly stats, trend charts, comparison tables, and modeled summaries.',
    {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'}
  )
], null, STYLES.section);

var statsPanel = ui.Panel([
  makeSectionTitle('What changed?'),
  statsGrid1,
  statsGrid2,
  plainEnglish,
  addCompareBtn,
  resetSelectionBtn,
  techToggle,
  techContent
], null, STYLES.section);
statsPanel.style().set('shown', false);

// Compare panel (Initialized with empty content, updated by updateCompareView)
var compareContent = ui.Panel([], null, STYLES.section);
compareContent.style().set('shown', false);

// About panel
var aboutContent = ui.Panel([
  makeSectionTitle('About this dashboard'),

  ui.Label('Policy background', STYLES.subtitle),
  ui.Label(
    'Nevada AB 356 requires removal of non-functional turf irrigated with Colorado River water in the Las Vegas Valley by the end of 2026.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0 10px 0'}
  ),

  ui.Label('Data pipeline', STYLES.subtitle),
  ui.Label(
    'Green space: Sentinel-2 SR → cloud masking → monthly median → FVC proxy.\n\n' +
    'Temperature: Landsat 8 C2 L2 → cloud masking → scale factors → °C → monthly median.\n\n' +
    'Spatial units: 2020 TIGER census tracts clipped to study area.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap', padding: '4px 0 10px 0'}
  ),

  ui.Label('Limitations', STYLES.subtitle),
  ui.Label(
    'LST is land surface temperature, not air temperature. Greenness loss is not direct confirmation of turf removal. Water savings are estimated with a fixed conversion factor.',
    {fontSize: '12px', color: COLORS.black, whiteSpace: 'pre-wrap'}
  )
], null, STYLES.section);
aboutContent.style().set('shown', false);

var explorePanel = ui.Panel([
  controlsPanel,
  promptPanel,
  statsPanel,
  trendPanel,
  nearbyPanel,
  chartsPanel,
  futureAnalysisPanel
], null, {stretch: 'horizontal'});

var sidebarContent = ui.Panel([
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

  explorePanel.style().set('shown', tab === 'explore');
  compareContent.style().set('shown', tab === 'compare');
  aboutContent.style().set('shown', tab === 'about');

  if (tab === 'explore') refreshMap();
  if (tab === 'compare') updateCompareView();
}

tabExplore.onClick(function() { setActiveTab('explore'); });
tabCompare.onClick(function() { setActiveTab('compare'); });
tabAbout.onClick(function()   { setActiveTab('about'); });


// ─── SECTION 9: RESET SELECTED TRACT ────────────────────────────────

function resetSelectedTract() {
  state.selectedTract = null;
  addCompareBtn.setLabel('+ Add to comparison');

  promptPanel.style().set('shown', true);
  statsPanel.style().set('shown', false);

  plainEnglish.setValue('');

  techContent.widgets().reset([
    ui.Label('Loading...', {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'})
  ]);
  techContent.style().set('shown', false);
  techToggle.setLabel('+ Technical detail');

  trendPanel.widgets().reset([
    ui.Label('Trend over time', STYLES.subtitle),
    ui.Label(
      'Monthly FVC and LST charts will appear here once precomputed stats are available.',
      {fontSize: '11px', color: COLORS.gray, fontStyle: 'italic'}
    )
  ]);

  nearbyPanel.widgets().reset([
    ui.Label('Nearby areas for context', STYLES.subtitle),
    ui.Label(
      'Comparison values will appear here once monthly stats are precomputed per tract.',
      {fontSize: '11px', color: COLORS.gray, fontStyle: 'italic'}
    )
  ]);

  fvcChartHolder.widgets().reset([
    ui.Label('FVC distribution chart will appear here.', STYLES.muted)
  ]);

  lstChartHolder.widgets().reset([
    ui.Label('LST distribution chart will appear here.', STYLES.muted)
  ]);

  refreshMap();
}


// ─── SECTION 10: MAP REFRESH ────────────────────────────────────────

function refreshMap() {
  leftDateLabel.setValue(MONTHS[state.fromMonth - 1] + ' ' + state.fromYear);
  rightDateLabel.setValue(MONTHS[state.toMonth - 1] + ' ' + state.toYear);

  leftMap.layers().reset();
  rightMap.layers().reset();

  if (state.splitEnabled) {
    mapContainer.widgets().reset([splitPanel]);
    rightDateLabel.style().set('shown', true);

    if (state.activeLayer === 'greenspace') {
      leftMap.addLayer(getFVCImage(state.fromYear, state.fromMonth), fvc_vis, 'FVC Before');
      rightMap.addLayer(getFVCImage(state.toYear, state.toMonth), fvc_vis, 'FVC After');

    } else if (state.activeLayer === 'temperature') {
      leftMap.addLayer(getLSTImage(state.fromYear, state.fromMonth), lst_vis, 'LST Before');
      rightMap.addLayer(getLSTImage(state.toYear, state.toMonth), lst_vis, 'LST After');

    } else {
      leftMap.addLayer(getS2Composite(state.fromYear, state.fromMonth), s2_vis, 'S2 Before');
      rightMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'S2 After');
    }

  } else {
    mapContainer.widgets().reset([leftMap]);
    rightDateLabel.style().set('shown', false);

    if (state.activeLayer === 'greenspace') {
      var fvcDiff = getFVCImage(state.toYear, state.toMonth)
        .subtract(getFVCImage(state.fromYear, state.fromMonth));
      leftMap.addLayer(fvcDiff, {
        min: -0.3, max: 0.1,
        palette: ['#A50026','#F46D43','#FEE090','#E0F3DB','#1B7837']
      }, 'FVC change');

    } else if (state.activeLayer === 'temperature') {
      var lstDiff = getLSTImage(state.toYear, state.toMonth)
        .subtract(getLSTImage(state.fromYear, state.fromMonth));
      leftMap.addLayer(lstDiff, {
        min: -5, max: 5,
        palette: ['#2C7BB6','#ABD9E9','#FFFFBF','#FDAE61','#D7191C']
      }, 'LST change');

    } else {
      leftMap.addLayer(getS2Composite(state.toYear, state.toMonth), s2_vis, 'Current view');
    }
  }

  var tractStyle = tracts.style({
    color: COLORS.primary + '99',
    fillColor: '00000000',
    width: 0.8
  });
  leftMap.addLayer(tractStyle, {}, 'Census tracts');
  if (state.splitEnabled) rightMap.addLayer(tractStyle, {}, 'Census tracts');

  var boundaryStyle = lasvegas_boundary.style({
    color: COLORS.primary,
    fillColor: '00000000',
    width: 2
  });
  leftMap.addLayer(boundaryStyle, {}, 'Study area');
  if (state.splitEnabled) rightMap.addLayer(boundaryStyle, {}, 'Study area');

  if (parcels !== null) {
    var parcelStyle = parcels.style({
      color: '00000030',
      fillColor: '00000000',
      width: 0.3
    });
    leftMap.addLayer(parcelStyle, {}, 'Parcels');
    if (state.splitEnabled) rightMap.addLayer(parcelStyle, {}, 'Parcels');
  }

  // Draw highlights for compared tracts
  state.compareTracts.forEach(function(t) {
    var compStyle = ee.FeatureCollection([ee.Feature(t.feature.geometry())])
      .style({
        color: t.color,
        fillColor: t.color + '40', // 40 adds a slight transparency 
        width: 3
      });
    leftMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
    if (state.splitEnabled) rightMap.addLayer(compStyle, {}, 'Compare tract: ' + t.geoid);
  });

  // Draw highlight for the currently selected tract
  if (state.selectedTract) {
    var highlightStyle = ee.FeatureCollection([ee.Feature(state.selectedTract.geometry())])
      .style({
        color: COLORS.primary,
        fillColor: COLORS.primary + '30',
        width: 2
      });

    leftMap.addLayer(highlightStyle, {}, 'Selected tract');
    if (state.splitEnabled) rightMap.addLayer(highlightStyle, {}, 'Selected tract');
  }

  updateLegendVisibility();
  leftMap.centerObject(roi, 11);
}


// ─── SECTION 11: MAP CLICK → SIDEBAR + CHARTS ───────────────────────

function handleMapClick(coords) {
  if (state.currentView !== 'explore') return;

  var point = ee.Geometry.Point(coords.lon, coords.lat);
  var clicked = tracts.filterBounds(point).first();

  clicked.evaluate(function(f) {
    if (!f) return;
    updateSidePanel(ee.Feature(f));
  });
}

leftMap.onClick(handleMapClick);
rightMap.onClick(handleMapClick);

function updateDistributionCharts(tractGeom) {
  var fromLabel = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
  var toLabel   = MONTHS[state.toMonth - 1] + ' ' + state.toYear;

  var fvcBefore = getFVCImage(state.fromYear, state.fromMonth);
  var fvcAfter  = getFVCImage(state.toYear, state.toMonth);
  var lstBefore = getLSTImage(state.fromYear, state.fromMonth);
  var lstAfter  = getLSTImage(state.toYear, state.toMonth);

  var fvcStack = fvcBefore.rename('Before').addBands(fvcAfter.rename('After'));
  var lstStack = lstBefore.rename('Before').addBands(lstAfter.rename('After'));

  var fvcChart = ui.Chart.image.histogram({
    image: fvcStack,
    region: tractGeom,
    scale: 10,
    maxPixels: 1e7
  }).setOptions({
    title: 'FVC distribution: ' + fromLabel + ' vs ' + toLabel,
    hAxis: {title: 'FVC / NDVI proxy'},
    vAxis: {title: 'Pixel count'},
    series: {
      0: {color: '#8FBF73'},
      1: {color: '#1B5E20'}
    },
    legend: {position: 'top'},
    chartArea: {left: 55, top: 40, width: '78%', height: '62%'},
    fontSize: 11
  });

  var lstChart = ui.Chart.image.histogram({
    image: lstStack,
    region: tractGeom,
    scale: 30,
    maxPixels: 1e7
  }).setOptions({
    title: 'LST distribution: ' + fromLabel + ' vs ' + toLabel,
    hAxis: {title: 'Temperature (°C)'},
    vAxis: {title: 'Pixel count'},
    series: {
      0: {color: '#6BAED6'},
      1: {color: '#D95F0E'}
    },
    legend: {position: 'top'},
    chartArea: {left: 55, top: 40, width: '78%', height: '62%'},
    fontSize: 11
  });

  fvcChartHolder.widgets().reset([fvcChart]);
  lstChartHolder.widgets().reset([lstChart]);
}

function updateSidePanel(tract) {
  state.selectedTract = tract;
  addCompareBtn.setLabel('+ Add to comparison');

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
    fvcStart: fvcBefore.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: tractGeom,
      scale: 10,
      bestEffort: true
    }).get('FVC'),
    fvcEnd: fvcAfter.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: tractGeom,
      scale: 10,
      bestEffort: true
    }).get('FVC'),
    lstStart: lstBefore.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: tractGeom,
      scale: 30,
      bestEffort: true
    }).get('LST'),
    lstEnd: lstAfter.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: tractGeom,
      scale: 30,
      bestEffort: true
    }).get('LST'),
    aland: aland,
    geoid: geoid
  }).evaluate(function(v) {
    if (!v) {
      plainEnglish.setValue('Error loading data for this tract.');
      return;
    }

    var fS = v.fvcStart || 0;
    var fE = v.fvcEnd || 0;
    var lS = v.lstStart || 0;
    var lE = v.lstEnd || 0;
    var alandSqm = v.aland || 0;

    var fvcChangePct  = fS > 0 ? ((fE - fS) / fS * 100) : 0;
    var alandAcres    = alandSqm / 4046.86;
    var turfLossAcres = Math.abs(fE - fS) * alandAcres;
    var lstChange     = lE - lS;
    var turfLossSqFt  = turfLossAcres * 43560;
    var waterSaved    = turfLossSqFt * 55.8;
    var fvcAbsChange  = fE - fS;

    cardGreen.val.setValue(fvcChangePct.toFixed(1) + '%');
    cardGreen.delta.setValue(turfLossAcres.toFixed(1) + ' acres');
    cardGreen.delta.style().set('color', fvcChangePct < 0 ? COLORS.red : COLORS.green);

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

    var fromStr = MONTHS[state.fromMonth - 1] + ' ' + state.fromYear;
    var toStr   = MONTHS[state.toMonth - 1] + ' ' + state.toYear;
    var dir     = fvcChangePct < 0 ? 'lost' : 'gained';
    var tDir    = lstChange > 0 ? 'warmer' : 'cooler';

    plainEnglish.setValue(
      'Between ' + fromStr + ' and ' + toStr + ', this tract ' + dir +
      ' about ' + turfLossAcres.toFixed(0) + ' acres of green cover (' +
      Math.abs(fvcChangePct).toFixed(0) + '%). Surface temperature became ' +
      Math.abs(lstChange).toFixed(1) + '°C ' + tDir + '.' +
      (fvcChangePct < 0 ? ' Estimated water savings: ' + wLabel + '.' : '')
    );

    techContent.widgets().reset([ui.Label(
      'Tract GEOID: ' + (v.geoid || '—') + '\n' +
      'Area: ' + alandAcres.toFixed(1) + ' acres (' + (alandSqm / 1e6).toFixed(2) + ' km²)\n' +
      'FVC: ' + fS.toFixed(4) + ' → ' + fE.toFixed(4) + '\n' +
      'LST: ' + lS.toFixed(1) + '°C → ' + lE.toFixed(1) + '°C\n' +
      'Water factor: 55.8 gal/sq.ft/yr\n\n' +
      'Current note: FVC still uses NDVI proxy and can be replaced later with SMA outputs.',
      {fontSize: '11px', color: COLORS.gray, whiteSpace: 'pre-wrap'}
    )]);

    refreshMap();
  });

  trendPanel.widgets().reset([
    ui.Label('Trend over time', STYLES.subtitle),
    ui.Label(
      'Monthly FVC and LST charts will appear here once precomputed stats are available.',
      {fontSize: '11px', color: COLORS.gray, fontStyle: 'italic'}
    )
  ]);

  nearbyPanel.widgets().reset([
    ui.Label('Nearby areas for context', STYLES.subtitle),
    ui.Label('Computing nearby tracts...', {fontSize: '11px', color: COLORS.gray})
  ]);

  var centroid = tract.geometry().centroid();
  var nearby = tracts.filterBounds(centroid.buffer(5000)).limit(4);

  nearby.size().evaluate(function(n) {
    nearbyPanel.widgets().reset([
      ui.Label('Nearby areas for context', STYLES.subtitle),
      ui.Label(
        n + ' tracts within 5 km. Comparison values will appear once monthly stats are precomputed per tract.',
        {fontSize: '11px', color: COLORS.gray}
      )
    ]);
  });

  updateDistributionCharts(tractGeom);
}


// ─── SECTION 12: COMPARE VIEW ───────────────────────────────────────

function updateCompareView() {
  var n = state.compareTracts.length;

  if (n < 2) {
    compareContent.widgets().reset([
      makeSectionTitle('Compare areas'),
      ui.Label(
        n + '/2 tracts selected. Go to the Explore tab, click a tract, and press "+ Add to comparison" to add more.',
        {fontSize: '12px', color: '#' + COLORS.gray, whiteSpace: 'pre-wrap', padding: '12px 0'}
      )
    ]);
    return;
  }

  var widgets = [makeSectionTitle('Compare areas')];

  state.compareTracts.forEach(function(t, i) {
    widgets.push(ui.Label(
      '● Tract ' + t.geoid,
      {
        fontSize: '13px', 
        fontWeight: 'bold', 
        color: '#' + t.color, 
        padding: '4px 0'
      }
    ));
  });

  widgets.push(ui.Label(
    'Full side-by-side charts and stats table will be built once the precomputed monthly feature collection is available.',
    {fontSize: '11px', color: '#' + COLORS.gray, whiteSpace: 'pre-wrap', padding: '12px 0', fontStyle: 'italic'}
  ));

  compareContent.widgets().reset(widgets);
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