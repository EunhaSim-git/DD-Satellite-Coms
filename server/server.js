// server/index.js
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const axios = require('axios');
const satellite = require('satellite.js')

const app = express();
const PORT = process.env.PORT || 3001; // Use port 3001 for the server

// Parse Celestrak TLE response -> [{noradId, line1, line2}]
function parseTLEs(tleText) {
  const lines = tleText.trim().split('\n');
  const sats = [];

  for (let i = 0; i < lines.length - 1; i +=3) {
    const name = lines[i]?.trim() || '';
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    if (line1?.startsWith('1 ') && line2?.startsWith('2 ')) {
      const noradId = parseInt(line1.substring(2,7));
      sats.push({ noradId, line1, line2});
    }
  }

  return sats.slice(0, 30); // Limit to first 30 sats for speed
}

const CACHE_DIR = path.join(__dirname, 'tle-cache');
const MIN_REFRESH_MS = 2 * 60 * 60 * 1000; // 2 hours

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

function isStale(filePath) {
  if (!fs.existsSync(filePath)) return true;
  const stats = fs.statSync(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  return ageMs > MIN_REFRESH_MS;
}

async function getConstellationTLEs(constellation) {
  const groups = {
    iridium: 'iridium',
    starlink: 'starlink',
    kuiper: 'kuiper'
  };

  const group = groups[constellation];
  if (!group) throw new Error(`Unknown constellation: ${constellation}`);

  const cachePath = path.join(CACHE_DIR, `${group}.tle`);
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group.toUpperCase()}&FORMAT=TLE`;

  //  Use cache if fresh
  if (!isStale(cachePath)) {
    console.log(`🗂 Using cached ${group}`);
    const tleData = fs.readFileSync(cachePath, 'utf8');
    return parseTLEs(tleData);
  }

  //  Fetch fresh if stale
  try {
    console.log(` Fetching fresh ${group} from CelesTrak`);
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Satellite-Demo/1.0 (educational use)'
      }
    });

    if (!resp.data || !resp.data.trim()) {
      throw new Error('Empty TLE response');
    }

    fs.writeFileSync(cachePath, resp.data, 'utf8');
    console.log(` Cached ${group} TLEs`);

    return parseTLEs(resp.data);

  } catch (err) {
    console.error(` Fetch failed for ${group}:`, err.message);

    // Fallback to stale cache if available
    if (fs.existsSync(cachePath)) {
      console.log(` Falling back to stale cache for ${group}`);
      const tleData = fs.readFileSync(cachePath, 'utf8');
      return parseTLEs(tleData);
    }

    throw new Error(`Failed to fetch ${group} and no cache available`);
  }
}


app.use(express.static(path.resolve(__dirname, '../client/dist')));

app.get('/api/:constellation/coverage', async (req, res) => {
  const { lat = 45.42, lng = -75.7, alt = 100 } = req.query;
  const constellation = req.params.constellation;

  try {
    // Fetch TLEs for constellation
    const tleList = await getConstellationTLEs(constellation);

    const results = [];
    for (const sat of tleList) {
      const noradId = sat.noradId;
      const line1 = sat.line1;
      const line2 = sat.line2;

      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        const now = new Date();
        const pv = satellite.propagate(satrec, now);
        if (!pv || !pv.position) continue;

        const gmst = satellite.gstime(now);
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        const EARTH_RADIUS = 6371;
        const MIN_ELEVATION_DEG = 10; // or per-constellation
        const elevRad = MIN_ELEVATION_DEG * Math.PI / 180;

        const h = geo.height; // already in km
        const centralAngle =
          Math.acos(
            EARTH_RADIUS * Math.cos(elevRad) / (EARTH_RADIUS + h)
          ) - elevRad;

        const coverageRadiusKm = EARTH_RADIUS * centralAngle;
        const satPos = {
          lat: satellite.degreesLat(geo.latitude),
          lng: satellite.degreesLong(geo.longitude),
          altitudeKm: geo.height
        };

        const observerGd = {
          longitude: satellite.degreesToRadians(lng),
          latitude: satellite.degreesToRadians(lat),
          height: alt / 1000  // meters -> km
        };

        // Satellite position in ECF
        const satEcf = satellite.eciToEcf(pv.position, gmst);
        // Look angles: observer (geodetic) + satellite (ECF)
        const lookAngles = satellite.ecfToLookAngles(observerGd, satEcf);

        const elevation = satellite.radiansToDegrees(lookAngles.elevation);
        const rangeKm = lookAngles.rangeSat;

        if (Number.isFinite(rangeKm) && rangeKm > 0) {
          // Frequency by constellation
          const freqGHz = {
            'iridium': 1.6,   // L-band
            'starlink': 12.0, // Ka-band downlink
            'kuiper': 12.0    // Ka-band
          } [constellation] || 1.6;

          const pathLossDb = 32.44 + 20 * Math.log10(rangeKm) + 20 * Math.log10(freqGHz);
          results.push({
            noradId,
            ...satPos,
            elevation: +(elevation).toFixed(1),
            rangeKm: Math.round(rangeKm),
            pathLossDb: Math.round(pathLossDb),
            coverageRadiusKm,
            available: elevation > 10 && pathLossDb < 160
          });
          if (results.length % 5 === 0) {  // Every 5 sats
            const visible = results.filter(r => r.available).length;
            console.log(`📡 ${constellation}: ${visible}/${results.length} visible`);
          }
        } else {
          results.push({
            noradId,
            ...satPos,
            elevation: +(elevation).toFixed(1),
            rangeKm: null,
            pathLossDb: null,
            coverageRadiusKm,
            available: false
          });
        }
      } catch (err) {
        console.error(`NORAD ${noradId}:`, err.message);
      }
    }
    console.log(`Returning ${results.length} satellites`);//debug
    res.json({
      observer: { lat: Number(lat), lng: Number(lng), alt: `${alt}m` },
      constellation,
      satellites: results
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
