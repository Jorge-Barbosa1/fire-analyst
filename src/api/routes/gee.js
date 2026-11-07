import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEE } from '../../lib/utils/gee-utils.js';
import {
  getTimeSeriesData,
  normalizeSatelliteLabel,
  SAT_CONF,
} from '../../lib/services/gee-service.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default Portugal bounding box for burned-area queries
const PT_BBOX = [-10.0, 36.8, -6.0, 42.3]; // [minLon, minLat, maxLon, maxLat]
const MCD64A1_ASSET = 'MODIS/061/MCD64A1';
const SENTINEL2_ASSET = 'COPERNICUS/S2_SR_HARMONIZED';

const S2_BANDS = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12'];

function shiftDateISO(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function s2Mask(ee, img) {
  const qa = img.select('QA60');
  const cloud = 1 << 10;
  const cirrus = 1 << 11;
  const mask = qa.bitwiseAnd(cloud).eq(0).and(qa.bitwiseAnd(cirrus).eq(0));
  return ee.Image(img).updateMask(mask);
}

function s2Rescale(ee, img) {
  const refl = img.select(S2_BANDS).divide(1e4);
  return ee.Image(img).addBands(refl, null, true);
}

function buildSentinel2NbrCollection(ee, region, startDate, endDate) {
  return ee.ImageCollection(SENTINEL2_ASSET)
    .filterBounds(region)
    .filterDate(startDate, endDate)
    .map((img) => {
      const processed = s2Rescale(ee, s2Mask(ee, img));
      return processed
        .normalizedDifference(['B8', 'B12'])
        .rename('NBR')
        .copyProperties(img, ['system:time_start']);
    })
    .select('NBR');
}

function evaluate(obj) {
  return new Promise((resolve, reject) => obj.evaluate((value, error) => (error ? reject(error) : resolve(value))));
}

function hasGeePrivateKeyFile() {
  return fs.existsSync(path.join(__dirname, '../../lib/config/severus-457615-83acf40ce029.json'));
}

router.get('/status', (_req, res) => {
  res.json({
    configured: Boolean(process.env.GEE_PRIVATE_KEY) || hasGeePrivateKeyFile(),
    privateKeyEnv: Boolean(process.env.GEE_PRIVATE_KEY),
    privateKeyFile: hasGeePrivateKeyFile(),
    note: 'MODIS burned-area analysis requires GEE credentials; Sentinel-2 time-series/severity also use GEE.',
  });
});

// GET /api/gee/modis-burned-areas
// Returns clickable GeoJSON polygons vectorised from MODIS MCD64A1 BurnDate
// for the requested window, clipped to Portugal. Each polygon has:
//   - fire_date (YYYY-MM-DD) derived from the pixel's BurnDate + image year
//   - area_ha (integer hectares)
// Small patches below `minAreaHa` are dropped to cut MODIS noise.
// Query: from=YYYY-MM-DD, to=YYYY-MM-DD, minAreaHa=<number, default 100>
router.get('/modis-burned-areas', async (req, res) => {
  try {
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const minAreaHa = Math.max(0, parseFloat(String(req.query.minAreaHa || '100')) || 100);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({
        error: 'from and to are required in YYYY-MM-DD format',
      });
    }

    const ee = await getEE();
    const region = ee.Geometry.Rectangle(PT_BBOX);
    const ic = ee.ImageCollection(MCD64A1_ASSET);

    // Coverage window of the collection itself so the UI can show users what is really available.
    const [latestDate, earliestDate] = await Promise.all([
      new Promise((r, j) =>
        ee
          .Date(ic.limit(1, 'system:time_start', false).first().get('system:time_start'))
          .format('YYYY-MM-dd')
          .evaluate((v, e) => (e ? j(e) : r(v))),
      ),
      new Promise((r, j) =>
        ee
          .Date(ic.limit(1, 'system:time_start', true).first().get('system:time_start'))
          .format('YYYY-MM-dd')
          .evaluate((v, e) => (e ? j(e) : r(v))),
      ),
    ]);

    const filtered = ic.filterDate(from, to).filterBounds(region);

    const matchedCount = await new Promise((r, j) =>
      filtered.size().evaluate((v, e) => (e ? j(e) : r(v))),
    );

    if (matchedCount === 0) {
      return res.status(200).json({
        source: 'MODIS/061/MCD64A1',
        from,
        to,
        coverage: { earliest: earliestDate, latest: latestDate },
        matchedImages: 0,
        count: 0,
        geojson: { type: 'FeatureCollection', features: [] },
        note: `MCD64A1 has no images in this window. Latest available month is ${latestDate}.`,
      });
    }

    // Encode absBurn = year*1000 + BurnDate(DOY) so downstream vectorisation can
    // recover the real calendar date regardless of which monthly image a pixel came from.
    const withAbsDate = filtered.map((img) => {
      const year = ee.Date(img.get('system:time_start')).get('year');
      const bd = img.select('BurnDate');
      return bd
        .add(year.multiply(1000))
        .updateMask(bd.gt(0))
        .rename('absBurn')
        .toInt32();
    });

    const mosaic = withAbsDate.mosaic();

    // reduceToVectors with labelProperty=absBurn groups pixels of equal absBurn
    // into polygons. Eight-connected so diagonal neighbours merge.
    const polys = mosaic.reduceToVectors({
      geometry: region,
      scale: 500,
      geometryType: 'polygon',
      eightConnected: true,
      labelProperty: 'absBurn',
      maxPixels: 1e10,
    });

    const enriched = polys
      .map((f) => {
        const absBurn = ee.Number(f.get('absBurn'));
        const year = absBurn.divide(1000).floor();
        const doy = absBurn.mod(1000);
        const date = ee.Date.fromYMD(year, 1, 1).advance(doy.subtract(1), 'day');
        const areaHa = f.geometry().area(1).divide(10000);
        return f.set({
          fire_date: date.format('YYYY-MM-dd'),
          area_ha: areaHa,
        });
      })
      .filter(ee.Filter.gte('area_ha', minAreaHa));

    const raw = await new Promise((resolve, reject) =>
      enriched.getInfo((v, e) => (e ? reject(e) : resolve(v))),
    );

    const features = (raw?.features || []).map((f) => {
      const p = f.properties || {};
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          source_dataset: MCD64A1_ASSET,
          fire_date: p.fire_date || null,
          area_ha: typeof p.area_ha === 'number' ? Math.round(p.area_ha) : null,
        },
      };
    });

    const totalHa = features.reduce((s, f) => s + (f.properties.area_ha || 0), 0);

    res.json({
      source: 'MODIS/061/MCD64A1',
      from,
      to,
      minAreaHa,
      coverage: { earliest: earliestDate, latest: latestDate },
      matchedImages: matchedCount,
      count: features.length,
      totalBurnedHa: totalHa,
      totalBurnedKm2: Math.round(totalHa / 100),
      geojson: { type: 'FeatureCollection', features },
      note: features.length === 0
        ? `No burned patches above ${minAreaHa} ha in Portugal for this window. Try a fire-season window (Jun-Sep) or lower minAreaHa.`
        : undefined,
    });
  } catch (err) {
    console.error('MCD64A1 fetch error:', err);
    res.status(500).json({
      error: 'MCD64A1_FETCH_FAILED',
      message: err?.message || String(err),
    });
  }
});

// POST /api/gee/derive-perimeter
// Derives an approximate recent burned perimeter from a click geometry or drawn AOI
// using Sentinel-2 dNBR over a pre/post window around the supplied fire date.
router.post('/derive-perimeter', async (req, res) => {
  try {
    const {
      geometry,
      fireDate,
      satellite = 'Sentinel-2/MSI',
      preDays = 14,
      postDays = 21,
      bufferMeters = 3000,
      burnThreshold = 0.12,
      minAreaHa = 5,
    } = req.body || {};

    if (!geometry || !fireDate) {
      return res.status(400).json({
        error: 'geometry and fireDate are required',
      });
    }

    const normalizedSatellite = normalizeSatelliteLabel(String(satellite));
    const ee = await getEE();
    const regionBase = ee.Geometry(geometry);
    const region = ['Point', 'MultiPoint'].includes(geometry?.type)
      ? regionBase.buffer(Number(bufferMeters) || 3000)
      : regionBase;

    if (normalizedSatellite !== 'Sentinel2') {
      return res.status(400).json({
        error: 'Sentinel-2 is the only supported satellite for perimeter derivation at the moment',
        fallback: 'Use Sentinel-2/MSI or draw a geometry for analysis',
      });
    }

    const safePreDays = Math.max(1, Number(preDays) || 14);
    const safePostDays = Math.max(1, Number(postDays) || 21);
    const safeThreshold = Number(burnThreshold);
    const safeMinAreaHa = Math.max(0, Number(minAreaHa) || 5);

    const preStart = shiftDateISO(fireDate, -safePreDays);
    const preEnd = shiftDateISO(fireDate, -1);
    const postStart = shiftDateISO(fireDate, 0);
    const postEnd = shiftDateISO(fireDate, safePostDays);

    const preCol = buildSentinel2NbrCollection(ee, region, preStart, preEnd);
    const postCol = buildSentinel2NbrCollection(ee, region, postStart, postEnd);

    const [preCount, postCount] = await Promise.all([
      evaluate(preCol.size()),
      evaluate(postCol.size()),
    ]);

    if (!preCount || !postCount) {
      return res.status(200).json({
        source: 'Sentinel-2/dNBR',
        satellite: normalizedSatellite,
        fireDate,
        preWindow: { from: preStart, to: preEnd },
        postWindow: { from: postStart, to: postEnd },
        preImageCount: preCount || 0,
        postImageCount: postCount || 0,
        threshold: safeThreshold,
        count: 0,
        geojson: { type: 'FeatureCollection', features: [] },
        note: 'Não há imagens Sentinel-2 suficientes nesta janela para derivar um perímetro.',
      });
    }

    const pre = preCol.median();
    const post = postCol.median();
    const dnbr = pre.subtract(post).rename('dNBR');
    const burnMask = dnbr.gte(safeThreshold).selfMask().rename('burned');

    const vectors = burnMask.reduceToVectors({
      geometry: region,
      scale: 20,
      geometryType: 'polygon',
      eightConnected: true,
      labelProperty: 'burned',
      maxPixels: 1e10,
    });

    const enriched = vectors
      .map((f) => {
        const areaHa = f.geometry().area(1).divide(10000);
        return f.set({
          source_dataset: 'Sentinel-2/dNBR',
          fire_date: fireDate,
          pre_start: preStart,
          pre_end: preEnd,
          post_start: postStart,
          post_end: postEnd,
          area_ha: areaHa,
          threshold: safeThreshold,
        });
      })
      .filter(ee.Filter.gte('area_ha', safeMinAreaHa));

    const raw = await evaluate(enriched);
    const features = (raw?.features || []).map((f) => {
      const p = f.properties || {};
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          source_dataset: p.source_dataset || 'Sentinel-2/dNBR',
          fire_date: p.fire_date || fireDate,
          pre_start: p.pre_start || preStart,
          pre_end: p.pre_end || preEnd,
          post_start: p.post_start || postStart,
          post_end: p.post_end || postEnd,
          area_ha: typeof p.area_ha === 'number' ? Math.round(p.area_ha) : null,
          threshold: typeof p.threshold === 'number' ? p.threshold : safeThreshold,
        },
      };
    });

    const totalHa = features.reduce((sum, feature) => sum + (feature.properties.area_ha || 0), 0);

    return res.json({
      source: 'Sentinel-2/dNBR',
      satellite: normalizedSatellite,
      fireDate,
      preWindow: { from: preStart, to: preEnd },
      postWindow: { from: postStart, to: postEnd },
      preImageCount: preCount,
      postImageCount: postCount,
      threshold: safeThreshold,
      minAreaHa: safeMinAreaHa,
      count: features.length,
      totalBurnedHa: totalHa,
      geojson: { type: 'FeatureCollection', features },
      note: features.length === 0
        ? 'Não foram encontrados polígonos acima do limiar nesta janela.'
        : undefined,
    });
  } catch (err) {
    console.error('derive-perimeter error:', err);
    return res.status(500).json({
      error: 'DERIVE_PERIMETER_FAILED',
      message: err?.message || String(err),
    });
  }
});

// POST /api/gee/time-series
router.post('/time-series', async (req, res) => {
  try {
    const { satellite, index, startDate, endDate, geometry } = req.body;

    if (!satellite || !index || !startDate || !endDate || !geometry) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    const data = await getTimeSeriesData({
      satellite,
      index,
      startDate,
      endDate,
      geometry,
    });

    res.json({ data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/gee/severity
router.post('/severity', async (req, res) => {
  try {
    const {
      satellite: satLabel,
      index,
      fireDate,
      windowSize,
      geometry,
    } = req.body;

    if (!satLabel || !index || !fireDate || !windowSize || !geometry) {
      return res.status(400).json({
        message: 'Missing parameters: satellite, index, fireDate, windowSize, geometry are required',
      });
    }

    const ee = await getEE();
    const sat = normalizeSatelliteLabel(satLabel);
    const cfg = SAT_CONF[sat];
    if (!cfg) {
      throw new Error(`Satélite não suportado: ${satLabel}`);
    }

    const region = ee.Geometry(geometry);
    const collectionId = cfg.ic;
    const scale = cfg.scale;
    const [b1, b2] = cfg.bands[index];

    const start = ee.Date(fireDate).advance(-windowSize, 'day');
    const end = ee.Date(Date.now());
    const stepMillis = windowSize * 24 * 60 * 60 * 1000;

    const dateSeq = ee.List
      .sequence(start.millis(), end.millis(), stepMillis)
      .map(m => ee.Date(m));

    const imgCol = ee.ImageCollection(collectionId).filterBounds(region);

    const imgSeq = ee.List.sequence(0, dateSeq.length().subtract(2)).map(i => {
      const ini = ee.Date(dateSeq.get(i));
      const fin = ee.Date(dateSeq.get(ee.Number(i).add(1)));

      return imgCol
        .filterDate(ini, fin)
        .map(img =>
          ee.Image(img)
            .normalizedDifference([b1, b2])
            .rename(index)
            .copyProperties(img, ['system:time_start'])
        )
        .median();
    });

    const bandsImg = ee.ImageCollection.fromImages(imgSeq).toBands();

    const reducer = bandsImg.reduceRegion({
      reducer: ee.Reducer.median(),
      geometry: region,
      scale,
      maxPixels: 1e13,
    });

    const values = await new Promise((resolve, reject) =>
      reducer.evaluate((v, e) => (e ? reject(e) : resolve(Object.values(v))))
    );

    const base = values[0];
    const deltas = values.map(v => (v != null && base != null ? v - base : null));
    const days = Array.from({ length: deltas.length }, (_, i) => (i + 1) * windowSize);

    res.json({ data: { days, deltas } });
  } catch (err) {
    console.error('Erro em /api/gee/severity:', err);
    res.status(500).json({ error: err.message ?? 'Erro desconhecido.' });
  }
});

export default router;
