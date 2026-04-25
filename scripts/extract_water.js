/**
 * Vegas Water Change Explorer (2019-2025)
 * Baseline: 2019 Comparison
 */

// =================================================================
// 1. SETUP & CONFIGURATION
// =================================================================

var lasvegas_boundary = ee.FeatureCollection('projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary');
var roi = lasvegas_boundary.geometry();

var CONFIG = {
  runExport: false, 
  startYear: 2019,
  endYear: 2022,
  assetFolder: 'projects/yg-casa-project-11365/assets/water_monthly_collection/',
  scale: 30,
  ensembleId: "projects/openet/assets/ensemble/conus/gridmet/monthly/v2_1",
  ssebopId: "projects/openet/assets/ssebop/conus/gridmet/monthly/v2_1"
};

// =================================================================
// 2. PRE-CALCULATE 2019 BASELINE
// =================================================================

var ensembleCol = ee.ImageCollection(CONFIG.ensembleId);
var ssebopCol = ee.ImageCollection(CONFIG.ssebopId);
var months = ee.List.sequence(1, 12);

var baseline2019 = months.map(function(m) {
  var start = ee.Date.fromYMD(2019, m, 1);
  var end = start.advance(1, 'month');
  var img = ensembleCol.filterDate(start, end)
    .filterBounds(roi)
    .select('et_ensemble_mad')
    .mean()
    .clip(roi);
  return img.set('month', m);
});

var baseline2019Col = ee.ImageCollection.fromImages(baseline2019);

// =================================================================
// 3. GENERATE MULTI-BAND COLLECTION (2019-2025)
// =================================================================

var years = ee.List.sequence(CONFIG.startYear, CONFIG.endYear);

var etCollection = ee.ImageCollection.fromImages(years.map(function(y) {
  return months.map(function(m) {
    var startDate = ee.Date.fromYMD(y, m, 1);
    var endDate = startDate.advance(1, 'month');
    
    var isBefore2025 = ee.Number(y).lt(2025);
    var currentCollection = ee.ImageCollection(ee.Algorithms.If(isBefore2025, ensembleCol, ssebopCol));
    var bandToSelect = ee.Algorithms.If(isBefore2025, 'et_ensemble_mad', 'et');
    
    // 1. Get current month ET
    var img = currentCollection.filterDate(startDate, endDate)
      .filterBounds(roi).select([ee.String(bandToSelect)])
      .mean().clip(roi).rename('et_actual');
      
    // 2. Get 2019 baseline for the SAME month
    var baselineImg = baseline2019Col.filter(ee.Filter.eq('month', m)).first();
    
    // 3. Calculate Difference (Current - 2019)
    var diff = img.subtract(baselineImg).rename('et_diff_2019');
    
    return img.addBands(diff).set({
      'year': y,
      'month': m,
      'model': ee.Algorithms.If(isBefore2025, 'Ensemble', 'SSEBop'),
      'system:time_start': startDate.millis()
    });
  });
}).flatten()).filter(ee.Filter.listContains('system:band_names', 'et_actual'));

// =================================================================
// 4. UI & VISUALIZATION
// =================================================================

// Visualization for the Actual ET
var et_vis = {min: 0, max: 200, palette: ['#ffffff', '#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594']};

// Visualization for the Difference (Red = Less ET, Blue = More ET)
var diff_vis = {min: -50, max: 50, palette: ['#d7191c', '#fdae61', '#ffffbf', '#abd9e9', '#2c7bb6']};

var updateMap = function() {
  var y = yearSlider.getValue();
  var m = monthSlider.getValue();
  var filtered = etCollection.filter(ee.Filter.eq('year', y)).filter(ee.Filter.eq('month', m));
  
  var layers = Map.layers();
  layers.reset();
  
  if (filtered.size().getInfo() > 0) {
    var img = filtered.first();
    
    Map.addLayer(img.select('et_actual'), et_vis, 'Actual ET ' + y + '/' + m);
    
    Map.addLayer(img.select('et_diff_2019'), diff_vis, 'Diff from 2019', false);
    
    statusLabel.setValue('Year: ' + y + ' Month: ' + m + ' | Model: ' + img.get('model').getInfo());
  }
};

var yearSlider = ui.Slider({min: CONFIG.startYear, max: CONFIG.endYear, value: 2024, step: 1, onChange: updateMap});
var monthSlider = ui.Slider({min: 1, max: 12, value: 7, step: 1, onChange: updateMap});
var statusLabel = ui.Label('Select Date');
var panel = ui.Panel([ui.Label('Vegas Water (Baseline 2019)', {fontWeight:'bold'}), ui.Label('Year:'), yearSlider, ui.Label('Month:'), monthSlider, statusLabel], ui.Panel.Layout.flow('vertical'), {position: 'bottom-left', padding: '10px'});

Map.add(panel);
Map.centerObject(roi, 11);
updateMap();

// =================================================================
// 5. EXPORT LOGIC
// =================================================================

if (CONFIG.runExport) {
  var exportList = etCollection.toList(etCollection.size());
  exportList.evaluate(function(list) {
    list.forEach(function(imgProps, index) {
      var image = ee.Image(exportList.get(index));
      var assetName = 'ET_wDiff_' + imgProps.properties.year + '_' + (imgProps.properties.month < 10 ? '0' + imgProps.properties.month : imgProps.properties.month);
      Export.image.toAsset({
        image: image,
        description: 'Export_' + assetName,
        assetId: CONFIG.assetFolder + assetName,
        scale: CONFIG.scale,
        region: roi,
        maxPixels: 1e13
      });
    });
  });
}