// ── Load boundary ─────────────────────────────────────────────
var lv_metro_boundary = ee.FeatureCollection('projects/lv-turf-removal/assets/lv_metro_boundary');

// ── Month name lookup ─────────────────────────────────────────
var MONTH_NAMES = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April',
  5: 'May', 6: 'June', 7: 'July', 8: 'August',
  9: 'September', 10: 'October', 11: 'November', 12: 'December'
};

// ── Collection registry ───────────────────────────────────────
var COLLECTIONS = [
  {
    key: 's2',
    label: 'Base Map',
    folder: 'projects/lv-turf-removal/assets/s2',
    visParams: {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3, gamma: 1.4}
  }
  ,{
    key: 'veg',
    label: 'Turf Loss',
    folder: 'projects/lv-turf-removal/assets/turf_loss',
    visParams: {bands: ['veg'], min: 0, max: 1, palette: ['black', 'blue', 'cyan', 'yellow', 'white']}
  }
];

var panelBg = '#C3896B';

// ── Build entries from active collections ─────────────────────
function buildEntries(activeKeys) {
  var allEntries = {};
  activeKeys.forEach(function(key) {
    var config = COLLECTIONS.filter(function(c) { return c.key === key; })[0];
    if (!config) return;

    var assetList = ee.data.listAssets(config.folder)['assets'] || [];
    
    // Batch fetch all properties in one server call instead of one per image
    var images = assetList.map(function(asset) { return ee.Image(asset['name']); });
    var propsList = ee.ImageCollection.fromImages(images)
      .toList(images.length)
      .map(function(img) {
        return ee.Image(img).toDictionary(['month', 'year', 'system:index']);
      })
      .getInfo();  // single round-trip for all images

    propsList.forEach(function(props, i) {
      var yr = props['year'];
      var mo = props['month'];
      if (!yr || !mo) return;
      var dateKey = yr + '_' + mo;
      if (!allEntries[dateKey]) {
        allEntries[dateKey] = {label: MONTH_NAMES[mo] + ' ' + yr, year: yr, month: mo, layers: {}};
      }
      allEntries[dateKey].layers[key] = {
        image: ee.Image(assetList[i]['name']),
        visParams: config.visParams
      };
    });
  });

  return Object.keys(allEntries).map(function(k) {
    return allEntries[k];
  }).sort(function(a, b) {
    return (a.year * 100 + a.month) - (b.year * 100 + b.month);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function getActiveKeys() {
  return COLLECTIONS
    .filter(function(c) { return checkboxes[c.key].getValue(); })
    .map(function(c) { return c.key; });
}

function monthNum(name) {
  var keys = Object.keys(MONTH_NAMES);
  for (var i = 0; i < keys.length; i++) {
    if (MONTH_NAMES[keys[i]] === name) return Number(keys[i]);
  }
  return null;
}

function buildStatusMessage(leftEntry, rightEntry, activeKeys) {
  if (activeKeys.length === 0) return '⚠ No map layers selected.';
  var names = activeKeys.map(function(key) {
    return COLLECTIONS.filter(function(c) { return c.key === key; })[0].label;
  }).join(' + ');
  return '✓ Showing ' + names + ' for ' + leftEntry.label + ' ↔ ' + rightEntry.label;
}

function updateStats(leftEntry, rightEntry) {
  statAvg.setValue('Loading...');
  statSum.setValue('');
  statAvg.style().set('backgroundColor', panelBg);
  statSum.style().set('backgroundColor', panelBg);

  // Only compute if both dates have a veg layer
  if (!leftEntry.layers['veg'] || !rightEntry.layers['veg']) {
    statAvg.setValue('No Turf Loss data for selected dates.');
    return;
  }

  var imgStart = leftEntry.layers['veg'].image;
  var imgEnd   = rightEntry.layers['veg'].image;

  // Pixel-wise difference (end - start) on the veg band
  var diff = imgEnd.select('veg').subtract(imgStart.select('veg'));

  // Single reduceRegion call to get both mean and sum together
  var stats = diff.reduceRegion({
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.sum(),
      sharedInputs: true
    }),
    geometry: lv_metro_boundary.geometry(),
    scale: 10,
    maxPixels: 1e10,
    bestEffort: true
  }).getInfo();

  var avg = stats['veg_mean'];
  var sum = stats['veg_sum'];

  var SQM_TO_ACRES = 0.000247105;
  statAvg.setValue((avg !== null ? (avg * 100).toFixed(2) : 'N/A') + '%');
  statSum.setValue((sum !== null ? (sum * 100 * SQM_TO_ACRES).toFixed(2) : 'N/A') + ' acres');
  statAvg.style().set('backgroundColor', panelBg);
  statSum.style().set('backgroundColor', panelBg);
}

function labelStyle(overrides) {
  var base = {color: '#ffffff', fontFamily: 'serif', backgroundColor: panelBg};
  if (overrides) {
    for (var k in overrides) { base[k] = overrides[k]; }
  }
  return base;
}

// ── Build UI ──────────────────────────────────────────────────
ui.root.clear();

var controlPanel = ui.Panel({
  style: {width: '300px', padding: '16px', backgroundColor: panelBg}
});

controlPanel.add(ui.Label('Las Vegas Turf Tracker',
  labelStyle({fontSize: '28px', fontWeight: 'bold', margin: '0 0 4px 0'})));
controlPanel.add(ui.Label('Nonfunctional Turf Loss under AB356',
  labelStyle({fontSize: '12px', color: '#f5deb3', margin: '0 0 16px 0'})));

// ── Checkboxes ────────────────────────────────────────────────
controlPanel.add(ui.Label('Map Layers',
  labelStyle({fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0'})));

var checkboxes = {};
var checkboxPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {backgroundColor: panelBg, margin: '0 0 16px 0', padding: '0'}
});
COLLECTIONS.forEach(function(config) {
  var cb = ui.Checkbox({
    label: config.label, value: true,
    style: {color: '#ffffff', fontFamily: 'serif', backgroundColor: panelBg,
            fontSize: '12px', margin: '2px 8px 2px 0'}
  });
  checkboxes[config.key] = cb;
  checkboxPanel.add(cb);
});
controlPanel.add(checkboxPanel);

// ── Date selectors ────────────────────────────────────────────
var selectStyle = {backgroundColor: '#ffffff', color: '#000000'};

var leftMonthSelect  = ui.Select({placeholder: 'Month', style: {width: '136px', margin: '0 4px 0 0'}});
var leftYearSelect  = ui.Select({placeholder: 'Year', style: {width: '80px', margin: '0p 0 0 0'}});
var rightMonthSelect = ui.Select({placeholder: 'Month', style: {width: '136px', margin: '0 4px 0 0'}});
var rightYearSelect = ui.Select({placeholder: 'Year', style: {width: '80px', margin: '0 0 0 0'}});

// Start date
controlPanel.add(ui.Label('Start Date',
  labelStyle({fontSize: '12px', fontWeight: 'bold', margin: '0 0 4px 0'})));
controlPanel.add(ui.Panel(
  [leftMonthSelect, leftYearSelect],
  ui.Panel.Layout.flow('horizontal'),
  {backgroundColor: panelBg, margin: '0 0 8px 0', padding: '0'}
));

// End date — immediately beneath start
controlPanel.add(ui.Label('End Date',
  labelStyle({fontSize: '12px', fontWeight: 'bold', margin: '0 0 4px 0'})));
controlPanel.add(ui.Panel(
  [rightMonthSelect, rightYearSelect],
  ui.Panel.Layout.flow('horizontal'),
  {backgroundColor: panelBg, margin: '0 0 12px 0', padding: '0'}
));

// Compare button beneath both dates
var compareButton = ui.Button({
  label: '▶  Compare',
  style: {width: '228px', margin: '4px 0 0 0', backgroundColor: '#ffffff',
          color: '#000000', fontFamily: 'serif', fontWeight: 'bold'}
});
controlPanel.add(compareButton);

var statusLabel = ui.Label('',
  labelStyle({fontSize: '11px', color: '#f5deb3', margin: '8px 0 0 0', whiteSpace: 'wrap'}));
controlPanel.add(statusLabel);

// ── Stats panel ───────────────────────────────────────────────
var statsHeader = ui.Label('Estimated Turf Loss',
  labelStyle({fontSize: '13px', fontWeight: 'bold', margin: '16px 0 6px 0'}));

var statAvg = ui.Label('',
  labelStyle({fontSize: '20px', fontWeight: 'bold', color: '#ffffff', margin: '0 16px 0 0'}));

var statSum = ui.Label('',
  labelStyle({fontSize: '20px', fontWeight: 'bold', color: '#ffffff', margin: '0'}));

var statsRow = ui.Panel(
  [statAvg, statSum],
  ui.Panel.Layout.flow('horizontal'),
  {backgroundColor: panelBg, margin: '0', padding: '0'}
);

controlPanel.add(statsHeader);
controlPanel.add(statsRow);

// ── Map panels ────────────────────────────────────────────────
var leftMap  = ui.Map();
var rightMap = ui.Map();
leftMap.setControlVisibility({all: false, zoomControl: true});
rightMap.setControlVisibility({all: false, zoomControl: true});

var splitPanel = ui.SplitPanel({
  firstPanel: leftMap, secondPanel: rightMap,
  orientation: 'horizontal', wipe: true
});

ui.Map.Linker([leftMap, rightMap]);

// ── initDropdowns — runs ONCE on load only ────────────────────
// Populates dropdowns and triggers the initial map load.
// Checkboxes never call this — so toggling layers never resets dates.
function initDropdowns() {
  // Use all collection keys regardless of checkbox state for date discovery,
  // so the full date range is always shown in the dropdowns.
  var allKeys = COLLECTIONS.map(function(c) { return c.key; });
  var entries = buildEntries(allKeys);

  if (entries.length === 0) {
    statusLabel.setValue('⚠ No images found.');
    statusLabel.style().set('backgroundColor', panelBg);
    return;
  }

  var years = [];
  entries.forEach(function(e) {
    if (years.indexOf(e.year) === -1) years.push(e.year);
  });
  years.sort();
  var yearItems = years.map(function(y) { return String(y); });

  var months = [];
  entries.forEach(function(e) {
    if (months.indexOf(e.month) === -1) months.push(e.month);
  });
  months.sort(function(a, b) { return a - b; });
  var monthItems = months.map(function(m) { return MONTH_NAMES[m]; });

  leftMonthSelect.items().reset(monthItems);
  leftYearSelect.items().reset(yearItems);
  rightMonthSelect.items().reset(monthItems);
  rightYearSelect.items().reset(yearItems);

  // Default: earliest date on left, latest on right
  leftMonthSelect.setValue(MONTH_NAMES[entries[0].month]);
  leftYearSelect.setValue(String(entries[0].year));
  rightMonthSelect.setValue(MONTH_NAMES[entries[entries.length - 1].month]);
  rightYearSelect.setValue(String(entries[entries.length - 1].year));

  // Load the map immediately with the defaults
  updateComparison();
}

// ── updateComparison — only runs on button click ──────────────
function updateComparison() {
  var activeKeys = getActiveKeys();

  if (activeKeys.length === 0) {
    statusLabel.setValue('⚠ Select at least one map layer.');
    statusLabel.style().set('backgroundColor', panelBg);
    return;
  }

  var entries = buildEntries(activeKeys);

  var leftYear  = Number(leftYearSelect.getValue());
  var leftMonth = monthNum(leftMonthSelect.getValue());
  var rightYear  = Number(rightYearSelect.getValue());
  var rightMonth = monthNum(rightMonthSelect.getValue());

  if (!leftYear || !leftMonth || !rightYear || !rightMonth) {
    statusLabel.setValue('⚠ Please select both month and year for each date.');
    statusLabel.style().set('backgroundColor', panelBg);
    return;
  }

  if (leftYear === rightYear && leftMonth === rightMonth) {
    statusLabel.setValue('⚠ Start and end dates must be different.');
    statusLabel.style().set('backgroundColor', panelBg);
    return;
  }

  var leftEntry = entries.filter(function(e) {
    return e.year === leftYear && e.month === leftMonth;
  })[0];

  var rightEntry = entries.filter(function(e) {
    return e.year === rightYear && e.month === rightMonth;
  })[0];

  if (!leftEntry) {
    statusLabel.setValue('⚠ No image found for start date.');
    statusLabel.style().set('backgroundColor', panelBg);
    return;
  }
  if (!rightEntry) {
    statusLabel.setValue('⚠ No image found for end date.');
    statusLabel.style().set('backgroundColor', panelBg);
    return;
  }

  leftMap.clear();
  rightMap.clear();

  activeKeys.forEach(function(key) {
    var config = COLLECTIONS.filter(function(c) { return c.key === key; })[0];
    if (leftEntry.layers[key]) {
      leftMap.addLayer(leftEntry.layers[key].image, leftEntry.layers[key].visParams, config.label);
    }
    if (rightEntry.layers[key]) {
      rightMap.addLayer(rightEntry.layers[key].image, rightEntry.layers[key].visParams, config.label);
    }
  });

  leftMap.add(ui.Label(leftEntry.label, {
    position: 'bottom-left', fontSize: '13px', fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.55)', color: '#ffffff', padding: '4px 8px'
  }));
  rightMap.add(ui.Label(rightEntry.label, {
    position: 'bottom-right', fontSize: '13px', fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.55)', color: '#ffffff', padding: '4px 8px'
  }));

  statusLabel.setValue(buildStatusMessage(leftEntry, rightEntry, activeKeys));
  statusLabel.style().set('backgroundColor', panelBg);
  
  updateStats(leftEntry, rightEntry)
}

// ── Wire events ───────────────────────────────────────────────
compareButton.onClick(updateComparison);

// ── Assemble and run ──────────────────────────────────────────
ui.root.add(controlPanel);
ui.root.add(splitPanel);
// leftMap.centerObject(lv_metro_boundary, 10);

initDropdowns();

leftMap.setCenter(-115.1398, 36.1699, 10);