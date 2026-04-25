  // ── Run once. Creates pre-computed FeatureView tile assets. ──

  var tracts = ee.FeatureCollection(
    'projects/yg-casa-project-11365/assets/lasvegas_tracts_simplified');

  var boundary = ee.FeatureCollection(
    'projects/project-ba3da252-127d-4b0d-bf0/assets/lasvegas_boundary');

  Export.table.toFeatureView({
    collection: tracts,
    assetId: 'projects/yg-casa-project-11365/assets/lasvegas_tracts_fv',
    description: 'tracts_featureview',
    maxFeaturesPerTile: 1500,
    thinningStrategy: 'HIGHER_DENSITY'
  });

  Export.table.toFeatureView({
    collection: boundary,
    assetId: 'projects/yg-casa-project-11365/assets/lasvegas_boundary_fv',
    description: 'boundary_featureview',
    maxFeaturesPerTile: 10
  });