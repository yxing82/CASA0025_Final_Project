/**
 * LST Gap-Filled Explorer & Exporter
 * Baseline: 2019 Comparison
 */

// ==============================================================================
// 1. SETUP & CONFIGURATION
// ==============================================================================
var lasvegas_boundary = ee.FeatureCollection('projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary');
var roi = lasvegas_boundary.geometry();

var CONFIG = {
  runExport: true, // Change to true to trigger the Tasks tab exports
  startYear: 2023,
  startMonth: 1,
  endYear: 2026,
  endMonth: 1,
  assetFolder: 'projects/yg-casa-project-11365/assets/lst_monthly_collection/',
  scale: 30
};

var startDate = ee.Date.fromYMD(CONFIG.startYear, CONFIG.startMonth, 1);
var endDate = ee.Date.fromYMD(CONFIG.endYear, CONFIG.endMonth, 1);
var nMonths = endDate.difference(startDate, 'month').round();

// ==============================================================================
// 2. LANDSAT FUNCTIONS
// ==============================================================================
function maskL8sr(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 1).eq(0).and(qa.bitwiseAnd(1 << 2).eq(0))
               .and(qa.bitwiseAnd(1 << 3).eq(0)).and(qa.bitwiseAnd(1 << 4).eq(0));
  return image.updateMask(mask);
}

function applyScaleFactors(image) {
  var thermalBands = image.select('ST_B10').multiply(0.00341802).add(149.0);
  return image.addBands(thermalBands, null, true);
}

// ==============================================================================
// 3. PRE-CALCULATE 2019 BASELINE (NOW FULLY GAP-FILLED)
// ==============================================================================
var months1to12 = ee.List.sequence(1, 12);

// 3A. Get the raw medians for 2019
var rawBaseline2019 = ee.ImageCollection.fromImages(months1to12.map(function(m) {
  var start = ee.Date.fromYMD(2019, m, 1);
  var end = start.advance(1, 'month');

  var collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterDate(start, end)
    .filterBounds(roi)
    .map(maskL8sr)
    .map(applyScaleFactors);

  var lst = collection.select('ST_B10').map(function(image) {
    return image.subtract(273.15).updateMask(image.subtract(273.15).gt(0));
  });

  var dummyImage = ee.Image.constant(0).updateMask(0).rename('LST_2019').clip(roi);
  var medianLST = ee.Algorithms.If(collection.size().gt(0), lst.median().rename('LST_2019').clip(roi), dummyImage);

  return ee.Image(medianLST).set('month', m);
}));

// 3B. Apply the gap-filling logic to the 2019 baseline
var rawBaselineList = rawBaseline2019.toList(12);
var filledBaselineList = ee.List(ee.List.sequence(0, 11).iterate(function(n, acc) {
    n = ee.Number(n); acc = ee.List(acc);
    var current = ee.Image(rawBaselineList.get(n));
    var previous = ee.Algorithms.If(n.gt(0), ee.Image(acc.get(n.subtract(1))), null);
    var filled = ee.Algorithms.If(n.gt(0), current.unmask(ee.Image(previous)), current);
    return acc.add(ee.Image(filled));
}, ee.List([])));

// 3C. Package it back up into our final baseline collection
var baseline2019Col = ee.ImageCollection.fromImages(
  ee.List.sequence(0, 11).map(function(n) {
    var original = ee.Image(rawBaselineList.get(n));
    // Copy the month property back over so the subtraction logic can find it later
    return ee.Image(filledBaselineList.get(n)).copyProperties(original, ['month']);
  })
);

// ==============================================================================
// 4. GENERATE TARGET COLLECTION & GAP-FILL
// ==============================================================================
var monthlyLST = ee.ImageCollection.fromImages(
  ee.List.sequence(0, nMonths.subtract(1)).map(function(n) {
    var currentStart = startDate.advance(n, 'month');
    var currentEnd = currentStart.advance(1, 'month');
    
    var collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .filterDate(currentStart, currentEnd)
      .filterBounds(roi)
      .filter(ee.Filter.lt('CLOUD_COVER', 10))
      .map(maskL8sr)
      .map(applyScaleFactors);

    var lst = collection.select('ST_B10').map(function(image) {
      return image.subtract(273.15).updateMask(image.subtract(273.15).gt(0));
    });

    var dummyImage = ee.Image.constant(0).updateMask(0).rename('LST').clip(roi);
    var monthlyMedian = ee.Algorithms.If(collection.size().gt(0), lst.median().rename('LST').clip(roi), dummyImage);
    
    return ee.Image(monthlyMedian)
      .set('month', currentStart.get('month'))
      .set('year', currentStart.get('year'))
      .set('system:time_start', currentStart.millis());
  })
);

// Gap-filling logic
var lstList = monthlyLST.toList(monthlyLST.size());
var filledLSTList = ee.List(ee.List.sequence(0, nMonths.subtract(1)).iterate(function(n, acc) {
    n = ee.Number(n); acc = ee.List(acc);
    var current = ee.Image(lstList.get(n));
    var previous = ee.Algorithms.If(n.gt(0), ee.Image(acc.get(n.subtract(1))), null);
    var filled = ee.Algorithms.If(n.gt(0), current.unmask(ee.Image(previous)), current);
    return acc.add(ee.Image(filled));
}, ee.List([])));

// ADD THE 2019 DIFFERENCE BAND TO THE FINAL COLLECTION
var finalMultiBandCollection = ee.ImageCollection.fromImages(
  ee.List.sequence(0, nMonths.subtract(1)).map(function(n) {
    var originalProps = ee.Image(lstList.get(n));
    
    // THE FIX: We must cast the result of copyProperties back to an ee.Image
    var filledImg = ee.Image(
      ee.Image(filledLSTList.get(n)).copyProperties(originalProps, ['month', 'year', 'system:time_start'])
    );
    
    var currentMonth = filledImg.get('month');
    
    // THE FIX: .first() returns an Element, so we must cast it to an ee.Image as well
    var baselineImg = ee.Image(
      baseline2019Col.filter(ee.Filter.eq('month', currentMonth)).first()
    );
    
    // Now it knows how to subtract!
    var diff = filledImg.subtract(baselineImg).rename('LST_diff_2019');
    
    return filledImg.addBands(diff);
  })
);

// ==============================================================================
// 5. UI & VISUALIZATION
// ==============================================================================
var lst_vis = { min: 20, max: 60, palette: ['#313695','#4575B4','#ABD9E9','#00A6FF','#00CC66','#FFFF00','#FFA500','#FF0000','#A50026'] };
var diff_vis = { min: -5, max: 5, palette: ['#0000FF', '#FFFFFF', '#FF0000'] }; // Blue = Cooler than 2019, Red = Hotter
var boundary_vis = { color: '000000', fillColor: '00000000', width: 2 };

Map.clear();
Map.centerObject(roi, 11);
Map.setOptions('SATELLITE');

var titleLabel = ui.Label('🌡️ Multi-Band LST Scanner', {fontWeight: 'bold', fontSize: '16px', margin: '8px 8px 4px 8px'});
var dateLabel = ui.Label('Loading...', {color: '#555555', fontSize: '13px', margin: '0px 8px 8px 8px'});

function updateMap(sliderValue) {
  var currentDate = startDate.advance(sliderValue, 'month');
  
  currentDate.format('MMMM YYYY').evaluate(function(dateString) {
    dateLabel.setValue('Currently viewing: ' + dateString);
  });

  var targetMonth = currentDate.get('month');
  var targetYear = currentDate.get('year');
  var img = finalMultiBandCollection
    .filter(ee.Filter.eq('month', targetMonth))
    .filter(ee.Filter.eq('year', targetYear))
    .first();

  Map.layers().reset();
  // Display the actual LST
  Map.addLayer(img.select('LST'), lst_vis, 'Actual LST');
  // Display the difference layer (Hidden by default, turn on in Layers menu)
  Map.addLayer(img.select('LST_diff_2019'), diff_vis, 'Diff from 2019', false);
  Map.addLayer(lasvegas_boundary.style(boundary_vis), {}, 'LV Boundary');
}

var slider = ui.Slider({
  min: 0,
  max: nMonths.getInfo() - 1, 
  value: 0,
  step: 1,
  onChange: updateMap,
  style: {stretch: 'horizontal', margin: '8px'}
});

var controlPanel = ui.Panel({
  widgets: [titleLabel, dateLabel, slider],
  style: {position: 'bottom-left', width: '350px', padding: '8px'}
});

Map.add(controlPanel);
updateMap(0);

// ==============================================================================
// 6. EXPORT LOGIC (Triggered via CONFIG)
// ==============================================================================
if (CONFIG.runExport) {
  var exportList = finalMultiBandCollection.toList(finalMultiBandCollection.size()); 

  exportList.evaluate(function(list) {
    list.forEach(function(imgProps, index) {
      var image = ee.Image(exportList.get(index));
      var month = imgProps.properties.month;
      var year = imgProps.properties.year;
      
      var monthStr = month < 10 ? '0' + month : month;
      var assetName = 'LST_wDiff_' + year + '_' + monthStr;

      Export.image.toAsset({
        image: image,
        description: 'Export_' + assetName,
        assetId: CONFIG.assetFolder + assetName, 
        scale: CONFIG.scale,
        region: roi, 
        maxPixels: 1e13
      });
    });
    print('Export tasks generated! Check the Tasks tab.');
  });
}