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

async function getConstellationTLEs(constellation) {
  const groups = { 'iridium': 'iridium', 'starlink': 'starlink', 'kuiper': 'kuiper' };
  const group = groups[constellation];
  if (!group) throw new Error(`Unknown constellation: ${constellation}`);

  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group.toUpperCase()}&FORMAT=tle&LIMIT=50`;
  
  try {
    const resp = await axios.get(url, { timeout: 10000,
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Satellite-Demo/1.0)'  // Polite bot
    } });
    const tleCount = parseTLEs(resp.data).length;
    console.log(`LIVE ${group}: ${tleCount} TLEs`);
    return parseTLEs(resp.data);
  } catch (err) {
    if (err.response?.status === 403 || err.code === 'ECONNABORTED') {
      const fallbackPath = path.join(__dirname, 'tle-samples', `${constellation}.txt`);
      if (fs.existsSync(fallbackPath)) {
        const tleData = fs.readFileSync(fallbackPath, 'utf8');
        const tleCount = parseTLEs(tleData).length;
        console.log(`FALLBACK ${group}: ${tleCount} TLEs (${group}.txt)`);
        return parseTLEs(tleData);
      }
    }
    console.error(`${group}:`, err.message);
    throw new Error(`Failed to fetch ${group} TLEs`);
  }
}

app.use(express.static(path.resolve(__dirname, '../client/build')));
/*
app.get('/api/iridium/tle', async (req, res) => {
  try {
    const apiKey = process.env.N2YO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing N2YO_API_KEY in environment variables' });
    }

    const filePath = path.resolve(__dirname, 'iridium.json');
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const noradIds = fileData.testNoradIDs;

    // N2YO rate limits 
    const results = [];

    for (const id of noradIds) {
      try {
        const url = `https://api.n2yo.com/rest/v1/satellite/tle/${id}?apiKey=${apiKey}`;
        const response = await axios.get(url);

        results.push({
          noradId: id,
          tle: response.data.tle
        });

        // Small delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`Failed for NORAD ${id}`);
      }
    }

    res.json({ satellites: results });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to fetch TLE data' });
  }
});

app.get('/api/iridium/pos', async (req, res) => {
  try {
    const apiKey = process.env.N2YO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing N2YO_API_KEY in environment variables' });
    }

    const filePath = path.resolve(__dirname, 'iridium.json');
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const noradIds = fileData.testNoradIDs;

    const results = [];

    for (const id of noradIds) {
      try {
        const url = `https://api.n2yo.com/rest/v1/satellite/tle/${id}?apiKey=${apiKey}`;
        const response = await axios.get(url);

        const tleString = response.data.tle;

        const [line1, line2] = tleString.trim().split(/\r?\n/);

        const satrec = satellite.twoline2satrec(line1, line2);

        const now = new Date();

        const positionAndVelocity = satellite.propagate(satrec, now);

        if (!positionAndVelocity.position) continue;

        const gmst = satellite.gstime(now);

        const geodetic = satellite.eciToGeodetic(
          positionAndVelocity.position,
          gmst
        );

        const latitude = satellite.degreesLat(geodetic.latitude);
        const longitude = satellite.degreesLong(geodetic.longitude);

        const altitudeKm = geodetic.height;

        results.push({
          noradId: id,
          lat: latitude,
          lng: longitude,
          altitudeKm: altitudeKm,
          altitudeRatio: altitudeKm / 6371 
        });

        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`Failed for NORAD ${id}`, err.message);
      }
    }

    res.json({
      timestamp: new Date(),
      satellites: results
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to fetch TLE data' });
  }
});
*/
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
