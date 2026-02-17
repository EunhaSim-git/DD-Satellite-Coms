import './App.css';
import { useEffect, useState, useCallback } from "react";
import SatelliteMap from './components/SatelliteMap';

function App() {
  const [lat, setLat] = useState(45.42);  // Ottawa
  const [lng, setLng] = useState(-75.7);
  const [constellation1, setConstellation1] = useState('iridium');
  const [constellation2, setConstellation2] = useState('starlink');
  const [coverage1, setCoverage1] = useState([]);
  const [coverage2, setCoverage2] = useState([]);

  // Live stats
  const visible1 = coverage1.filter(s => s.available).length;
  const visible2 = coverage2.filter(s => s.available).length;

  const fetchBoth = useCallback(async () => {
    const params = new URLSearchParams({ 
      lat: lat.toFixed(4), lng: lng.toFixed(4), alt: '100' 
    });
    
    try{
      // Parallel fetch
      const [data1, data2] = await Promise.all([
        fetch(`/api/${constellation1}/coverage?${params}`).then(r => r.json()),
        fetch(`/api/${constellation2}/coverage?${params}`).then(r => r.json())
      ]);

      setCoverage1(data1.satellites || []);
      setCoverage2(data2.satellites || []);
    } catch (error) {
      console.error('Fetch failed:', error);
    }
  }, [constellation1, constellation2, lat, lng]);


  useEffect(() => {
    fetchBoth();  // Initial Ottawa
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
      
        {/* Location Inputs */}
        <label>Lat: <input type="number" step="0.01" value={lat} onChange={e => setLat(+e.target.value)} /></label>
        <label>Lng: <input type="number" step="0.01" value={lng} onChange={e => setLng(+e.target.value)} /></label>
      
        {/* Constellation Tabs */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '10px 0' }}>
          <select value={constellation1} onChange={e => setConstellation1(e.target.value)}>
            <option value="iridium">Iridium</option>
            <option value="starlink">Starlink</option>
            <option value="kuiper">Kuiper</option>
          </select>
          <span style={{ color: '#61dafb' }}>VS</span>
          <select value={constellation2} onChange={e => setConstellation2(e.target.value)}>
            <option value="iridium">Iridium</option>
            <option value="starlink">Starlink</option>
            <option value="kuiper">Kuiper</option>
          </select>
        </div>
      
        <button onClick={fetchBoth}>Refresh Coverage</button>
      
        {/* Live Stats */}
        <div className="stats">
          <span>{constellation1.toUpperCase()}: {visible1} visible</span>
          <span>{constellation2.toUpperCase()}: {visible2} visible</span>
        </div>
      </div>
    
      {/* DUAL MAPS */}
        <div className="dual-maps">
          <SatelliteMap constellation={constellation1} coverage={coverage1} lat={lat} lng={lng} />
          <SatelliteMap constellation={constellation2} coverage={coverage2} lat={lat} lng={lng} />
        </div>

        <div className="info">
          🟢 elev&gt;10°+low loss | 🔴 horizon/high loss | 📡 station | 5s live
        </div>
      </div>
  );
}

export default App;