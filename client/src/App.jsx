import './App.css';
import { useEffect, useState, useCallback, useRef } from "react";
import { generateHeatmap } from "./satUtil";
import SatelliteMap from './components/SatelliteMap';
import CesiumGlobe from './components/CesiumGlobe';

function App() {
  const [lat, setLat] = useState(45.42);
  const [lng, setLng] = useState(-75.7);
  const [maxSats, setMaxSats] = useState(300);
  const [constellation1, setConstellation1] = useState('iridium');
  const [constellation2, setConstellation2] = useState('starlink');
  const [coverage1, setCoverage1] = useState([]);
  const [coverage2, setCoverage2] = useState([]);
  const [viewMode, setViewMode] = useState('maps');  // 'maps' or 'globe'
  const [heatmapData, setHeatmapData] = useState([]);
  const [positions, setPositions] = useState([]);
  const globeRef = useRef();

  // Live stats
  const visible1 = coverage1.filter(s => s.available).length;
  const visible2 = coverage2.filter(s => s.available).length;

  // Fetch satellites for selected constellation(s)
  const fetchBoth = useCallback(async () => {
    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lng: lng.toFixed(4),
      alt: '100',
      maxSats: maxSats.toString()
    });

    try {
      if (viewMode === 'maps') {
        const [data1, data2] = await Promise.all([
          fetch(`/api/${constellation1}/coverage?${params}`).then(r => r.json()),
          fetch(`/api/${constellation2}/coverage?${params}`).then(r => r.json())
        ]);

        setCoverage1(data1.satellites || []);
        setCoverage2(data2.satellites || []);

        setPositions([]);
        setHeatmapData([]);
      } else {
        const data1 = await fetch(`/api/${constellation1}/coverage?${params}`).then(r => r.json());
        const sats = data1.satellites || [];
        setCoverage1(sats);
        setCoverage2([]);

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
      }
    } catch (error) {
      console.error('Fetch failed:', error);
    }
  }, [constellation1, constellation2, lat, lng, maxSats, viewMode, generateHeatmap]);

  // Initial fetch
  useEffect(() => { fetchBoth(); }, []);

  // Periodic update
  useEffect(() => {
    const interval = setInterval(fetchBoth, 60000);
    return () => clearInterval(interval);
  }, [fetchBoth]);

  return (
    <div className="App">
      <div className="controls">
        <h2>Satellite Coverage Comparator</h2>

        <div className="view-toggle" style={{marginBottom: '15px'}}>
          <label style={{fontSize: '14px'}}>
            View: 
            <select value={viewMode} onChange={e => setViewMode(e.target.value)}>
              <option value="maps">Dual Maps</option>
              <option value="globe">3D Globe</option>
            </select>
          </label>
        </div>

        {/* Location Inputs */}
        <label>Lat: <input type="number" step="0.01" value={lat} onChange={e => setLat(+e.target.value)} /></label>
        <label>Lng: <input type="number" step="0.01" value={lng} onChange={e => setLng(+e.target.value)} /></label>

        {/* Max sats */}
        <label>Max sats: 
          <input type="number" min={10} max={5000} step={10} value={maxSats} onChange={e => setMaxSats(+e.target.value)} />
        </label>

        {/* Constellation selection */}
        {viewMode === 'maps' ? (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '15px 0' }}>
            <select value={constellation1} onChange={e => setConstellation1(e.target.value)}>
              <option value="iridium">Iridium</option>
              <option value="starlink">Starlink</option>
              <option value="kuiper">Kuiper</option>
            </select>
            <span style={{ color: '#61dafb', fontWeight: 'bold' }}>VS</span>
            <select value={constellation2} onChange={e => setConstellation2(e.target.value)}>
              <option value="iridium">Iridium</option>
              <option value="starlink">Starlink</option>
              <option value="kuiper">Kuiper</option>
            </select>
          </div>
        ) : (
          <div style={{ margin: '15px 0' }}>
            <select value={constellation1} onChange={e => setConstellation1(e.target.value)}>
              <option value="iridium">Iridium</option>
              <option value="starlink">Starlink</option>
              <option value="kuiper">Kuiper</option>
            </select>
          </div>
        )}

        <button onClick={fetchBoth}>Refresh Coverage</button>
      </div>

      {/* Map vs Globe */}
      {viewMode === 'maps' ? (
        <div className="dual-maps">
          <SatelliteMap constellation={constellation1} coverage={coverage1} lat={lat} lng={lng} />
          <SatelliteMap constellation={constellation2} coverage={coverage2} lat={lat} lng={lng} />
        </div>
      ) : (
        <div className="globe-container" style={{ height: '70vh' }}>
          <CesiumGlobe 
            lat={lat} 
            lng={lng} 
            constellation={constellation1} 
            maxSats={maxSats} 
          />
        </div>
      )}

      <div className="info">
        🟢 elev&gt;10°+low loss | 🔴 horizon/high loss | 📡 station | 5s live
      </div>
    </div>
  );
}

export default App;