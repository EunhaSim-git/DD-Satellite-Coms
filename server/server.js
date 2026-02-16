// server/index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001; // Use port 3001 for the server

app.use(express.static(path.resolve(__dirname, '../client/build')));

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

app.get(/.*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
