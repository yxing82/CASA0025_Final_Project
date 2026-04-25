// 1. Define your study area
var lasvegas_boundary = ee.FeatureCollection('projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary');
var roi = lasvegas_boundary.geometry();
    
     // 2. Filter the TIGER tracts
     var lv_tracts = ee.FeatureCollection('TIGER/2020/TRACT')
       .filter(ee.Filter.eq('STATEFP', '32'))
       .filter(ee.Filter.eq('COUNTYFP', '003'))
       .filter(ee.Filter.lt('ALAND', 20000000))
      .filterBounds(roi);
   
    // 3. PERFORMANCE HACK: Simplify the geometry of every tract
    // A maxError of 10 (meters) removes thousands of useless vertices
    // without visibly changing the shape of the tracts on a city-wide map.
    var simplified_tracts = lv_tracts.map(function(feature) {
      return feature.simplify({maxError: 10});
    });
   
    // 4. Export the lightweight asset to your project
    Export.table.toAsset({
      collection: simplified_tracts,
      description: 'export_simplified_lv_tracts',
      assetId: 'projects/yg-casa-project-11365/assets/lasvegas_tracts_simplified' // Update path if needed
    });