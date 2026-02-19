require('dotenv').config();
const fs = require('fs').promises;
const fsSync = require('fs'); // for sync checks
const path = require('path');
const express = require('express');
const axios = require('axios');
const satellite = require('satellite.js');

const app = express();
const PORT = process.env.PORT || 3001;


const CACHE_DIR = path.join(__dirname, 'tle-cache');
const MIN_REFRESH_MS = 2 * 60 * 60 * 1000; // 2 hours
const EARTH_RADIUS_KM = 6371;
const DEFAULT_MIN_ELEV_DEG = 10;
const CONSTELLATION_FREQS_GHZ = {
  iridium: 1.6,
  starlink: 12.0,
  kuiper: 12.0
};

// Ensure cache directory exists
if (!fsSync.existsSync(CACHE_DIR)) fsSync.mkdirSync(CACHE_DIR);


// Check if cache file is stale
async function isStale(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return (Date.now() - stats.mtimeMs) > MIN_REFRESH_MS;
  } catch {
    return true;
  }
}

// Parse TLE text to array of satellites
function parseTLEs(tleText, maxSats = 30) {
  const lines = tleText.trim().split('\n');
  const sats = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i]?.trim() || '';
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (line1?.startsWith('1 ') && line2?.startsWith('2 ')) {
      const noradId = parseInt(line1.substring(2, 7), 10);
      if (!Number.isFinite(noradId)) continue;
      sats.push({ noradId, name, line1, line2 });
    }
    if (sats.length >= maxSats) break;
  }
  return sats;
}

// Fetch or read cached TLEs
async function getConstellationTLEs(constellation, maxSats = 30) {
  const groups = { iridium: 'iridium', starlink: 'starlink', kuiper: 'kuiper' };
  const group = groups[constellation];
  if (!group) throw new Error(`Unknown constellation: ${constellation}`);

  const cachePath = path.join(CACHE_DIR, `${group}.tle`);
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group.toUpperCase()}&FORMAT=TLE`;

  if (!await isStale(cachePath)) {
    console.log(` Using cached ${group}`);
    const tleData = await fs.readFile(cachePath, 'utf8');
    return parseTLEs(tleData, maxSats);
  }

  try {
    console.log(` Fetching fresh ${group} TLEs`);
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Satellite-Demo/1.0 (educational use)' }
    });
    if (!resp.data?.trim()) throw new Error('Empty TLE response');

    await fs.writeFile(cachePath, resp.data, 'utf8');
    console.log(` Cached ${group} TLEs`);

    return parseTLEs(resp.data, maxSats);
  } catch (err) {
    console.warn(` Fetch failed for ${group}: ${err.message}`);
    if (fsSync.existsSync(cachePath)) {
      console.log(`Fallback to stale cache for ${group}`);
      const tleData = await fs.readFile(cachePath, 'utf8');
      return parseTLEs(tleData, maxSats);
    }
    throw new Error(`Failed to fetch ${group} and no cache available`);
  }
}

// Compute coverage info for a single satellite
function computeSatelliteCoverage(sat, observer, constellation, minElevDeg = DEFAULT_MIN_ELEV_DEG) {
  const satrec = satellite.twoline2satrec(sat.line1, sat.line2);
  const now = new Date();
  const pv = satellite.propagate(satrec, now);
  if (!pv?.position) return null;

  const gmst = satellite.gstime(now);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const elevRad = minElevDeg * Math.PI / 180;
  const h = geo.height; // km
  const centralAngle = Math.acos(EARTH_RADIUS_KM * Math.cos(elevRad) / (EARTH_RADIUS_KM + h)) - elevRad;
  const coverageRadiusKm = EARTH_RADIUS_KM * centralAngle;

  const satPos = {
    lat: satellite.degreesLat(geo.latitude),
    lng: satellite.degreesLong(geo.longitude),
    altitudeKm: h
  };

  const observerGd = {
    longitude: satellite.degreesToRadians(observer.lng),
    latitude: satellite.degreesToRadians(observer.lat),
    height: observer.alt / 1000
  };

  const satEcf = satellite.eciToEcf(pv.position, gmst);
  const lookAngles = satellite.ecfToLookAngles(observerGd, satEcf);
  const elevation = satellite.radiansToDegrees(lookAngles.elevation);
  const rangeKm = lookAngles.rangeSat;

  if (!Number.isFinite(rangeKm) || rangeKm <= 0) return { ...satPos, elevation: +(elevation).toFixed(1), rangeKm: null, pathLossDb: null, coverageRadiusKm, available: false };

  const freqGHz = CONSTELLATION_FREQS_GHZ[constellation] || 1.6;
  const pathLossDb = 32.44 + 20 * Math.log10(rangeKm) + 20 * Math.log10(freqGHz);

  return {
    noradId: sat.noradId,
    ...satPos,
    elevation: +(elevation).toFixed(1),
    rangeKm: Math.round(rangeKm),
    pathLossDb: Math.round(pathLossDb),
    coverageRadiusKm,
    available: elevation > minElevDeg && pathLossDb < 160
  };
}


app.use(express.static(path.resolve(__dirname, '../client/dist')));

app.get('/api/:constellation/coverage', async (req, res) => {
  const { lat = 45.42, lng = -75.7, alt = 100, maxSats = 30, minElevDeg = DEFAULT_MIN_ELEV_DEG } = req.query;
  const constellation = req.params.constellation;

  try {
    const tleList = await getConstellationTLEs(constellation, Number(maxSats));
    const observer = { lat: Number(lat), lng: Number(lng), alt: Number(alt) };

    // Parallel satellite computations
    const results = await Promise.all(
      tleList.map(sat => {
        try { return computeSatelliteCoverage(sat, observer, constellation, Number(minElevDeg)); }
        catch { return null; }
      })
    );

    const filtered = results.filter(Boolean);
    const visibleCount = filtered.filter(r => r.available).length;
    console.log(`📡 ${constellation}: ${visibleCount}/${filtered.length} visible`);
console.log('maxSats received:', maxSats);

    res.json({ observer, constellation, satellites: filtered });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Catch-all for SPA routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/dist/index.html'));
});

// Start server
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
