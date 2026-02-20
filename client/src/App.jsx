import './App.css';
import { useEffect, useState, useCallback, useRef } from "react";
import { generateHeatmap } from "./satUtil";
import CesiumGlobe from './components/CesiumGlobe';

function App() {
  const [lat, setLat] = useState(45.42);  // Ottawa
  const [lng, setLng] = useState(-75.7);
  const [maxSats, setMaxSats] = useState(300);
  const [constellation1, setConstellation1] = useState('iridium');
  const [coverage1, setCoverage1] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [positions, setPositions] = useState([]);
  const [mode, setMode] = useState('station');
  const globeRef = useRef();

  // Live stats
  const visible1 = coverage1.filter(s => s.available).length;

  const fetchBoth = useCallback(async () => {
    const params = new URLSearchParams({ 
      lat: lat.toFixed(4), 
      lng: lng.toFixed(4), 
      alt: '100', 
      maxSats: maxSats.toString() 
    });

    try {
      
        // Globe: only constellation1
        const data1 = await fetch(`/api/${constellation1}/coverage?${params}`).then(r => r.json());
        const sats = data1.satellites || [];

        setCoverage1(sats);

        const globeSats = sats.map(s => ({
          noradId: s.noradId,
          lat: s.lat,
          lng: s.lng,
          altitude: s.altitudeKm / 6371,
          size: Math.max(0.3, Math.abs(s.elevation || 0) / 20),
          available: s.available
        }));

        setPositions(globeSats);
        setHeatmapData(generateHeatmap(globeSats));
      
    } catch (error) {
      console.error('Fetch failed:', error);
    }
  }, [constellation1, lat, lng, maxSats, generateHeatmap]);

  useEffect(() => {
    fetchBoth();  // Initial fetch
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchBoth, 60000);
    return () => clearInterval(interval);
  }, [fetchBoth]);

  return (
    <div className="App">
      {/* Top Controls Panel */}
      <div className="controls">
        <h2>Satellite Coverage Comparator</h2>

        <div style={{ margin: '15px 0' }}>
          <label>
            Coverage Mode:
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              style={{ marginLeft: 8 }}
            >
              <option value="station">Station Coverage</option>
              <option value="constellation">Full Constellation</option>
            </select>
          </label>
        </div>

        {/* Location */}
        <label>Lat: <input type="number" step="0.01" value={lat} onChange={e => setLat(+e.target.value)} /></label>
        <label>Lng: <input type="number" step="0.01" value={lng} onChange={e => setLng(+e.target.value)} /></label>

        {/* Max sats */}
        <label style={{ marginLeft: 10 }}>
          Max sats: 
          <input 
            type="number" min={10} max={5000} step={10} 
            value={maxSats} 
            onChange={e => setMaxSats(+e.target.value)} 
            style={{ width: 80, marginLeft: 5 }}
          />
        </label>

        {/* Constellation selectors */}
          <div style={{ margin: '15px 0' }}>
            <select value={constellation1} onChange={e => setConstellation1(e.target.value)}>
              <option value="iridium">Iridium</option>
              <option value="starlink">Starlink</option>
              <option value="kuiper">Kuiper</option>
            </select>
          </div>
        

        <button onClick={fetchBoth} style={{ marginTop: 10 }}>Refresh Coverage</button>
      </div>

      {/* Views */}
        <div className="globe-container" style={{ height: '70vh' }}>
          <CesiumGlobe
            lat={lat}
            lng={lng}
            constellation={constellation1}
            maxSats={maxSats}
            mode={mode}
          />
        </div>
    
      <div className="info">
        🟢 elev&gt;10°+low loss | 🔴 horizon/high loss | 📡 station | 5s live
      </div>
    </div>
  );
}

export default App;
