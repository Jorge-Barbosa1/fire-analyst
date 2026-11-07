// Portugal burned-area monitoring pipeline for the GEE Code Editor.
//
// Manual workflow:
// 1) Update CONFIG.startDate and CONFIG.endDate to the 5-day monitoring window.
// 2) Run the script in the Earth Engine Code Editor.
// 3) Inspect the hotspot buffers, Sentinel-2 composites, severity map, and export tasks.
//
// Notes:
// - This script uses MODIS active-fire detections as the trigger layer.
// - If you want finer temporal response, swap the hotspot collection for a VIIRS
//   active-fire product available in your Earth Engine account.
// - The Mainland Portugal geometry below is a pragmatic bounding box; for
//   production use, replace it with an authoritative mainland boundary asset.

var CONFIG = {
  // 5-day monitoring window: change these manually before each run.
  startDate: '2026-05-01',
  endDate: '2026-05-05',

  // Hotspot trigger layer.
  hotspotSource: 'MODIS',
  hotspotFireMaskThreshold: 5,
  hotspotBufferMeters: 15000,

  // Sentinel-2 dNBR windows.
  preFireDays: 20,
  postFireDays: 10,

  // Burned-area threshold inspired by common USGS dNBR guidance.
  burnedThreshold: 0.1,

  // Export controls.
  exportFolder: 'FireAnalyst',
  exportPrefix: 'Portugal_BurnedArea',
  exportScale: 20,
  exportPolygons: true,

  // Visualization controls.
  mapZoom: 8,
};

// Mainland Portugal envelope used as a fast filter for hotspot detection.
// Replace this with a proper mainland boundary asset if you have one.
var PORTUGAL_MAINLAND = ee.Geometry.Rectangle([-9.6, 36.8, -6.0, 42.2], null, false);

// MODIS active-fire collection used for hotspot triggering.
// The FireMask threshold is intentionally conservative to reduce false positives.
var MODIS_HOTSPOT_COLLECTION = 'MODIS/061/MOD14A1';

// Sentinel-2 SR Harmonized collection used for burn-severity analysis.
var SENTINEL2_SR_COLLECTION = 'COPERNICUS/S2_SR_HARMONIZED';

// USGS-style severity palette for dNBR classification.
var SEVERITY_PALETTE = [
  '#2c7bb6', // enhanced regrowth / very low
  '#ffffbf', // unburned / very low
  '#fee08b', // low
  '#fdae61', // moderate-low
  '#f46d43', // moderate-high
  '#d73027', // high
];

// -----------------------------------------------------------------------------
// Utility helpers
// -----------------------------------------------------------------------------

function parseDate(dateString) {
  return ee.Date(String(dateString));
}

function formatDate(dateObject) {
  return ee.Date(dateObject).format('YYYY-MM-dd');
}

function addDays(dateString, days) {
  return ee.Date(dateString).advance(days, 'day');
}

function logRange(label, startDate, endDate) {
  print(label + ':', formatDate(startDate), '->', formatDate(endDate));
}

function getAreaHa(geometry) {
  return ee.Number(geometry.area(1)).divide(10000);
}

function countValidPixels(image, geometry, scale, bandName, callback) {
  var countDictionary = image.select(bandName).reduceRegion({
    reducer: ee.Reducer.count(),
    geometry: geometry,
    scale: scale,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale: 4,
  });

  countDictionary.evaluate(function (result) {
    var value = result && result[bandName] ? Number(result[bandName]) : 0;
    callback(value);
  });
}

// -----------------------------------------------------------------------------
// 1) Hotspot detection
// -----------------------------------------------------------------------------

function getHotspots(startDate, endDate) {
  // Filter the active-fire collection to the manual monitoring window.
  var hotspotCollection = ee.ImageCollection(MODIS_HOTSPOT_COLLECTION)
    .filterDate(startDate, endDate)
    .filterBounds(PORTUGAL_MAINLAND);

  // Convert FireMask values into a conservative active-fire mask.
  // The exact value semantics depend on the product; thresholding above the
  // configured cutoff keeps the pipeline practical and easy to tune.
  var hotspotMask = hotspotCollection.map(function (image) {
    var active = image.select('FireMask').gte(CONFIG.hotspotFireMaskThreshold);
    return active.rename('hotspot').selfMask().copyProperties(image, ['system:time_start']);
  });

  // Collapse the 5-day window into a single raster indicating persistent or
  // repeated active-fire detections.
  var hotspotCount = hotspotMask.sum().rename('hotspot_count');
  var hotspotPixels = hotspotCount.gt(0).selfMask().rename('hotspot');

  // Vectorize hotspot pixels as centroid points so we can buffer only the areas
  // that matter for Sentinel-2 processing.
  return hotspotPixels.reduceToVectors({
    geometry: PORTUGAL_MAINLAND,
    scale: 1000,
    geometryType: 'centroid',
    eightConnected: true,
    labelProperty: 'hotspot',
    maxPixels: 1e13,
    bestEffort: true,
  });
}

// -----------------------------------------------------------------------------
// 2) Buffer construction
// -----------------------------------------------------------------------------

function buildBuffers(hotspots, bufferMeters) {
  // Expand each hotspot point into a search radius around the fire trigger.
  // The union of these buffers becomes the analysis region for Sentinel-2.
  return hotspots.map(function (feature) {
    var bufferedFeature = ee.Feature(feature.geometry().buffer(bufferMeters), feature.toDictionary());

    return bufferedFeature
      .set('buffer_m', bufferMeters)
      .set('buffer_ha', bufferedFeature.geometry().area(1).divide(10000));
  });
}

function unionBuffers(buffers) {
  // Dissolve overlapping buffers into a single analysis geometry to keep the
  // Sentinel-2 composites as small as possible.
  return ee.FeatureCollection(buffers).geometry().dissolve(1);
}

// -----------------------------------------------------------------------------
// 3) Sentinel-2 preprocessing
// -----------------------------------------------------------------------------

function maskSentinel2(image) {
  // Mask clouds, shadows, snow/ice, water, and no-data pixels using SCL.
  var scl = image.select('SCL');
  var clear = scl.neq(0)
    .and(scl.neq(1))
    .and(scl.neq(2))
    .and(scl.neq(3))
    .and(scl.neq(6))
    .and(scl.neq(7))
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  return image.updateMask(clear);
}

function scaleSentinel2(image) {
  // Convert reflectance values to the 0-1 domain used by Earth Engine SR bands.
  return image.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .multiply(0.0001)
    .copyProperties(image, ['system:time_start']);
}

function addNBR(image) {
  // NBR uses NIR and SWIR2 to emphasize post-fire spectral change.
  var nbr = image.normalizedDifference(['B8', 'B12']).rename('NBR');
  return image.addBands(nbr);
}

function buildSentinel2Collection(geometry, startDate, endDate) {
  // Build a clean Sentinel-2 collection inside the buffered fire region only.
  var collection = ee.ImageCollection(SENTINEL2_SR_COLLECTION)
    .filterBounds(geometry)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 90))
    .map(maskSentinel2)
    .map(scaleSentinel2)
    .map(addNBR);

  return collection;
}

function getPreFireComposite(geometry, startDate, preDays) {
  // Use imagery before the active-fire window to represent pre-fire vegetation.
  var windowEnd = addDays(startDate, -1);
  var windowStart = addDays(startDate, -preDays);
  var collection = buildSentinel2Collection(geometry, windowStart, windowEnd);

  return {
    collection: collection,
    start: windowStart,
    end: windowEnd,
    composite: collection.median().clip(geometry),
  };
}

function getPostFireComposite(geometry, endDate, postDays) {
  // Use imagery after the active-fire window to capture post-fire condition.
  var windowStart = addDays(endDate, 1);
  var windowEnd = addDays(endDate, postDays);
  var collection = buildSentinel2Collection(geometry, windowStart, windowEnd);

  return {
    collection: collection,
    start: windowStart,
    end: windowEnd,
    composite: collection.median().clip(geometry),
  };
}

// -----------------------------------------------------------------------------
// 4) dNBR computation and severity classification
// -----------------------------------------------------------------------------

function computeDNBR(preComposite, postComposite) {
  // dNBR = pre-fire NBR minus post-fire NBR.
  var preNBR = preComposite.select('NBR').rename('preNBR');
  var postNBR = postComposite.select('NBR').rename('postNBR');
  var dnbr = preNBR.subtract(postNBR).rename('dNBR');
  var rbr = dnbr.divide(preNBR.add(1.001)).rename('RBR');

  return ee.Image.cat([preNBR, postNBR, dnbr, rbr]).clip(preComposite.geometry());
}

function classifySeverity(dnbrImage) {
  // USGS-style dNBR thresholds, simplified into a practical classification map.
  var dnbr = dnbrImage.select('dNBR');

  var severity = ee.Image(0)
    .where(dnbr.lt(0.1), 0)
    .where(dnbr.gte(0.1).and(dnbr.lt(0.27)), 1)
    .where(dnbr.gte(0.27).and(dnbr.lt(0.44)), 2)
    .where(dnbr.gte(0.44).and(dnbr.lt(0.66)), 3)
    .where(dnbr.gte(0.66), 4)
    .rename('severity_class')
    .toUint8();

  var burnedMask = dnbr.gte(CONFIG.burnedThreshold).rename('burned_mask').selfMask();

  return {
    severity: severity,
    burnedMask: burnedMask,
  };
}

// -----------------------------------------------------------------------------
// 5) Export helpers
// -----------------------------------------------------------------------------

function buildSummaryFeature(buffers, analysisGeometry, hotspotCount, preWindow, postWindow, dnbrImage, burnedMask) {
  // Build a one-row summary table for CSV export.
  var burnedAreaHa = burnedMask
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: analysisGeometry,
      scale: CONFIG.exportScale,
      bestEffort: true,
      maxPixels: 1e13,
      tileScale: 4,
    })
    .get('burned_mask');

  return ee.Feature(null, {
    project: 'FireAnalyst',
    source_hotspots: CONFIG.hotspotSource,
    start_date: CONFIG.startDate,
    end_date: CONFIG.endDate,
    hotspot_count: hotspotCount,
    buffer_count: buffers.size(),
    buffer_area_ha: getAreaHa(analysisGeometry),
    pre_window_start: formatDate(preWindow.start),
    pre_window_end: formatDate(preWindow.end),
    post_window_start: formatDate(postWindow.start),
    post_window_end: formatDate(postWindow.end),
    burned_area_ha: burnedAreaHa,
  });
}

function exportResults(args) {
  // Export GeoTIFFs and CSV summaries manually from the Code Editor.
  var analysisGeometry = args.analysisGeometry;
  var preComposite = args.preComposite;
  var postComposite = args.postComposite;
  var dnbrImage = args.dnbrImage;
  var severityImage = args.severityImage;
  var burnedMask = args.burnedMask;
  var buffers = args.buffers;
  var hotspotCount = args.hotspotCount;
  var preWindow = args.preWindow;
  var postWindow = args.postWindow;

  Export.image.toDrive({
    image: dnbrImage.select('dNBR'),
    description: CONFIG.exportPrefix + '_dNBR',
    folder: CONFIG.exportFolder,
    fileNamePrefix: CONFIG.exportPrefix + '_dNBR',
    region: analysisGeometry,
    scale: CONFIG.exportScale,
    maxPixels: 1e13,
  });

  Export.image.toDrive({
    image: severityImage,
    description: CONFIG.exportPrefix + '_Severity',
    folder: CONFIG.exportFolder,
    fileNamePrefix: CONFIG.exportPrefix + '_Severity',
    region: analysisGeometry,
    scale: CONFIG.exportScale,
    maxPixels: 1e13,
  });

  Export.image.toDrive({
    image: burnedMask,
    description: CONFIG.exportPrefix + '_BurnedMask',
    folder: CONFIG.exportFolder,
    fileNamePrefix: CONFIG.exportPrefix + '_BurnedMask',
    region: analysisGeometry,
    scale: CONFIG.exportScale,
    maxPixels: 1e13,
  });

  var summaryFeature = buildSummaryFeature(
    buffers,
    analysisGeometry,
    hotspotCount,
    preWindow,
    postWindow,
    dnbrImage,
    burnedMask
  );

  Export.table.toDrive({
    collection: ee.FeatureCollection([summaryFeature]),
    description: CONFIG.exportPrefix + '_SummaryCSV',
    folder: CONFIG.exportFolder,
    fileNamePrefix: CONFIG.exportPrefix + '_Summary',
    fileFormat: 'CSV',
  });

  if (CONFIG.exportPolygons) {
    var burnedPolygons = burnedMask.reduceToVectors({
      geometry: analysisGeometry,
      scale: CONFIG.exportScale,
      geometryType: 'polygon',
      eightConnected: true,
      labelProperty: 'burned',
      maxPixels: 1e13,
      bestEffort: true,
    }).map(function (feature) {
      return feature
        .set('area_ha', feature.geometry().area(1).divide(10000))
        .set('source', 'Sentinel-2 dNBR')
        .set('start_date', CONFIG.startDate)
        .set('end_date', CONFIG.endDate);
    });

    Export.table.toDrive({
      collection: burnedPolygons,
      description: CONFIG.exportPrefix + '_PolygonsGeoJSON',
      folder: CONFIG.exportFolder,
      fileNamePrefix: CONFIG.exportPrefix + '_Polygons',
      fileFormat: 'GeoJSON',
    });
  }
}

// -----------------------------------------------------------------------------
// 6) Main pipeline orchestration
// -----------------------------------------------------------------------------

function runPipeline() {
  var startDate = parseDate(CONFIG.startDate);
  var endDate = parseDate(CONFIG.endDate);
  var preWindow = {
    start: addDays(CONFIG.startDate, -CONFIG.preFireDays),
    end: addDays(CONFIG.startDate, -1),
  };
  var postWindow = {
    start: addDays(CONFIG.endDate, 1),
    end: addDays(CONFIG.endDate, CONFIG.postFireDays),
  };

  print('FireAnalyst burned-area monitoring pipeline');
  print('Mainland Portugal envelope:', PORTUGAL_MAINLAND);
  logRange('Hotspot window', startDate, endDate);
  logRange('Pre-fire window', preWindow.start, preWindow.end);
  logRange('Post-fire window', postWindow.start, postWindow.end);

  var hotspots = getHotspots(CONFIG.startDate, CONFIG.endDate);

  // Guard 1: if no hotspots exist, stop immediately and avoid Sentinel-2 work.
  hotspots.size().evaluate(function (hotspotCount) {
    if (!hotspotCount || hotspotCount === 0) {
      print('No hotspots found in the selected 5-day window. No Sentinel-2 processing will run.');
      return;
    }

    print('Hotspots found:', hotspotCount);

    var buffers = buildBuffers(hotspots, CONFIG.hotspotBufferMeters);
    var analysisGeometry = unionBuffers(buffers);

    print('Buffered analysis geometry area (ha):', getAreaHa(analysisGeometry));
    Map.centerObject(analysisGeometry, CONFIG.mapZoom);
    Map.addLayer(PORTUGAL_MAINLAND, { color: '#888888' }, 'Mainland envelope', false);
    Map.addLayer(hotspots, { color: '#00ffff' }, 'Hotspots');
    Map.addLayer(buffers, { color: '#ffcc00' }, 'Hotspot buffers');

    var preResult = getPreFireComposite(analysisGeometry, CONFIG.startDate, CONFIG.preFireDays);
    var postResult = getPostFireComposite(analysisGeometry, CONFIG.endDate, CONFIG.postFireDays);

    // Guard 2: if either Sentinel-2 collection is empty, stop before exporting.
    preResult.collection.size().evaluate(function (preCount) {
      postResult.collection.size().evaluate(function (postCount) {
        if (!preCount || preCount === 0 || !postCount || postCount === 0) {
          print('One or both Sentinel-2 collections are empty. Expand the date windows or relax the cloud filter.');
          print('Pre-fire image count:', preCount);
          print('Post-fire image count:', postCount);
          return;
        }

        print('Pre-fire image count:', preCount);
        print('Post-fire image count:', postCount);

        // Build the dNBR stack and classify severity.
        var dnbrImage = computeDNBR(preResult.composite, postResult.composite);
        var classified = classifySeverity(dnbrImage);
        var severityImage = classified.severity;
        var burnedMask = classified.burnedMask;

        // Guard 3: if clouds masked everything, stop before export.
        countValidPixels(preResult.composite, analysisGeometry, CONFIG.exportScale, 'NBR', function (preValidPixels) {
          countValidPixels(postResult.composite, analysisGeometry, CONFIG.exportScale, 'NBR', function (postValidPixels) {
            if (preValidPixels === 0 || postValidPixels === 0) {
              print('Cloud masking removed all usable Sentinel-2 pixels in one of the windows.');
              print('Pre-fire valid pixels:', preValidPixels);
              print('Post-fire valid pixels:', postValidPixels);
              return;
            }

            print('Pre-fire valid pixels:', preValidPixels);
            print('Post-fire valid pixels:', postValidPixels);

            // Visual layers for manual inspection in the Code Editor.
            Map.addLayer(preResult.composite.select('NBR'), {
              min: -0.3,
              max: 0.9,
              palette: ['#7f0000', '#fdae61', '#ffffbf', '#1a9850', '#006837'],
            }, 'Pre-fire NBR', false);

            Map.addLayer(postResult.composite.select('NBR'), {
              min: -0.3,
              max: 0.9,
              palette: ['#7f0000', '#fdae61', '#ffffbf', '#1a9850', '#006837'],
            }, 'Post-fire NBR', false);

            Map.addLayer(dnbrImage.select('dNBR'), {
              min: -0.2,
              max: 0.8,
              palette: ['#2c7bb6', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d73027'],
            }, 'dNBR');

            Map.addLayer(severityImage, {
              min: 0,
              max: 4,
              palette: SEVERITY_PALETTE,
            }, 'Severity classification');

            Map.addLayer(burnedMask, { palette: ['#ff0000'] }, 'Burned mask', false);

            // Export products manually. The tasks will appear in the Tasks panel.
            exportResults({
              analysisGeometry: analysisGeometry,
              preComposite: preResult.composite,
              postComposite: postResult.composite,
              dnbrImage: dnbrImage,
              severityImage: severityImage,
              burnedMask: burnedMask,
              buffers: buffers,
              hotspotCount: hotspotCount,
              preWindow: preWindow,
              postWindow: postWindow,
            });

            print('Export tasks created. Review the Tasks panel and run them manually.');
          });
        });
      });
    });
  });
}

// Run the pipeline.
runPipeline();
