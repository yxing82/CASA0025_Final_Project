// ---------------------- Pre-process -----------------------------------


//------------------ Set Las Vegas coordinates --------------------------
var lasvegas_point = ee.Geometry.Point([-115.1391, 36.1716]);

Map.centerObject(lasvegas_point, 10)



//--------------------- Load vector data --------------------------------

// Load in shp file
// The boundaries are pre-processed with QGIS, 
// filtered for: "NAME20" = 'Las Vegas--Henderson--Paradise, NV' OR "NAME20" = 'Boulder City, NV'
// Source: https://catalog.data.gov/dataset/tiger-line-shapefile-2020-nation-u-s-2020-census-urban-area

var lasvegas_boundary = ee.FeatureCollection('users/christychoicc/lasvegas_boundary');

var styleParams = {
  fillColor: 'b5ffb4',
  color: '00909F',
  width: 1.0,
};

Map.centerObject(lasvegas_boundary, 10);

var roi = lasvegas_boundary.geometry();

// Add map layer 
Map.addLayer(lasvegas_boundary, {}, 'Las Vegas City Boundary');

// --------------------- Cloud Masking & Scaling Functions ---------------

// ----------- Sentinel 2 clouds -----------
// Sentinel clouds mask function
function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000);
}

// ----------- Landsat 8 clouds -----------
// Landsat clouds mask function
var maskL8sr = function(image) {
  var dilatedCloud = (1 << 1)
  var cirrus = (1 << 2);
  var cloud = (1 << 3)
  var cloudShadow = (1 << 4)
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(dilatedCloud).eq(0)
    .and(qa.bitwiseAnd(cirrus).eq(0))
    .and(qa.bitwiseAnd(cloud).eq(0))
    .and(qa.bitwiseAnd(cloudShadow).eq(0));
  return image.updateMask(mask);
}

// Landsat scale factors function
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true);
}


// --------------------- Visualisation Parameters -----------------------
// Sentinel 
var s2_vis = {
  min: 0.0, 
  max: 0.3,
  bands: ['B4', 'B3', 'B2']
};

// Landsat - for True Colour
var l8_vis = { 
  min: 0.0, 
  max: 0.3,
  bands: ['SR_B4', 'SR_B3', 'SR_B2'] 
};

// Landsat LST (I adjusted for 20-60 as the maximum is 58.8)
var lst_vis = {
  min: 20, 
  max: 60, 
  palette: ['blue', 'cyan', 'green', 'yellow', 'orange', 'red']
};


// ----------------- Load Sentinel and Landsat data --------------

// Sentinel 2 - 2020 and 2023 imagery
// 2020
var sentinel2020 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterDate('2020-06-01', '2020-09-30')
                  .filterBounds(roi)
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
                  .map(maskS2clouds);
                  
// Calculate median and clip boundary
var s2_median_2020 = sentinel2020.median().clip(roi);
// Add map layer
Map.addLayer(s2_median_2020, s2_vis, 'Sentinel-2 2020 Median', false);

//2023
var sentinel2023 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterDate('2023-06-01', '2023-09-30')
                  .filterBounds(roi)
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
                  .map(maskS2clouds);
// Calculate median and clip boundary
var s2_median_2023 = sentinel2023.median().clip(lasvegas_boundary);
// Add map layer
Map.addLayer(s2_median_2023, s2_vis, 'Sentinel-2 2023 Median', false);

// Landsat 8 - 2020 and 2023 imagery
// 2020
var landsat2020 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterDate('2020-06-01', '2020-09-30')
  .filterBounds(roi)
  .filter(ee.Filter.lt("CLOUD_COVER", 10))
  .map(maskL8sr)
  .map(applyScaleFactors);
  
var landsat_median_2020 = landsat2020.median().clip(roi);
print("Landsat 2020 Normal Median");
print(landsat_median_2020);
Map.addLayer(landsat_median_2020, l8_vis, 'Landsat 8 True Colour 2020', false);

// LST  
var lst2020 = landsat2020.select('ST_B10').map(function (image) {
  var subtract = image.subtract(273.15); // subtract
  var mask = subtract.gt(0); //set mask up
  var mask_0 = subtract.updateMask(mask); //Apply this in a mask
//return mask_0
return image.addBands(mask_0, null, true);
})  

// ChatGPT told me to change to (more concise):
//var lst2020 = landsat2020.map(function(image) {
  //return image.select('ST_B10')
    //.subtract(273.15)
    //.rename('LST_C')
    //.copyProperties(image, ['system:time_start']);
//});

var lst_median_2020 = lst2020.median().clip(roi);
print("Landsat 2020 Median LST");
print(lst_median_2020)
// Add map layer
Map.addLayer(lst_median_2020, lst_vis, 'Landsat 8 LST 2020 (Celsius)');


// 2023
var landsat2023 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterDate('2023-06-01', '2023-09-30')
  .filter(ee.Filter.calendarRange(5, 9,'month'))
  .filterBounds(roi)
  .filter(ee.Filter.lt("CLOUD_COVER", 10))
  .map(maskL8sr)
  .map(applyScaleFactors);
  
var landsat_median_2023 = landsat2023.median().clip(lasvegas_boundary);
print("Landsat 2023 Normal Median");
print(landsat_median_2023);
Map.addLayer(landsat_median_2023, l8_vis, 'Landsat 8 True Colour 2023', false);
  
// LST
var lst2023 = landsat2023.select('ST_B10').map(function (image) {
  var subtract = image.subtract(273.15); // subtract
  var mask = subtract.gt(0); //set mask up
  var mask_0 = subtract.updateMask(mask); //Apply this in a mask
//return mask_0
return image.addBands(mask_0, null, true);
}) 

// ChatGPT told me to change to (more concise):
//var lst2023 = landsat2023.map(function(image) {
  //return image.select('ST_B10')
    //.subtract(273.15)
    //.rename('LST_C')
    //.copyProperties(image, ['system:time_start']);
//});


var lst_median_2023 = lst2023.median().clip(roi);

print("Landsat 2023 Median LST");
print(lst_median_2023)
// Add map layer
Map.addLayer(lst_median_2023, lst_vis, 'Landsat 8 LST 2023 (Celsius)');



// Graph plotting ......
// --------------------- Landsat Time Series -----------------------

// Merge 2020 and 2023 LST collections into one
var lst_combined = lst2020.merge(lst2023);

// We use doySeriesByYear so it stacks the years as overlapping lines
var timeseries_chart = ui.Chart.image.doySeriesByYear({
  imageCollection: lst_combined,
  bandName: 'ST_B10',
  region: roi,
  regionReducer: ee.Reducer.mean(),
  scale: 100, // landsat scale 100
  sameDayReducer: ee.Reducer.mean() // Averages values if overlapping images exist on the same day
})
.setOptions({
  title: 'Las Vegas Average Summer Land Surface Temperature',
  interpolateNulls: true,
  hAxis: {
    title: 'Day of Year',
    titleTextStyle: {italic: false, bold: true}
  },
  vAxis: {
    title: 'LST (°C)',
    titleTextStyle: {italic: false, bold: true}
  },
  lineWidth: 2,
  colors: ['0f8755', '808080'],
  pointSize: 4
});

print("LST Time Series 2020 and 2023");
print(timeseries_chart);