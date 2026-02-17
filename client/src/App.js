import './App.css';
import Globe from 'react-globe.gl';
import * as satellite from "satellite.js";
import { useEffect, useState, useRef } from "react";
import { generateHeatmap} from "./satUtil";

function App() {
  const [coverageData, setCoverageData] = useState({ satellites: [] });
  const [lat, setLat] = useState(45.42);  // Ottawa
  const [lng, setLng] = useState(-75.7);
  const [constellation, setConstellation] = useState('iridium');
  const [heatmapData, setHeatmapData] = useState([]);
  const [positions, setPositions] = useState([]);
  const globeRef = useRef();

  // Fetch coverage (dynamic location)
  async function fetchCoverage() {
    const params = new URLSearchParams({ lat, lng, alt: 100 });
    const response = await fetch(`/api/${constellation}/coverage?${params}`);
    const data = await response.json();
    setCoverageData(data);

    // Filter visible + size by elevation
    const positions = data.satellites
      //.filter(s => s.elevation > 0) // by commenting out, send all 18 sat regardless of elevation
      .map(s => ({
        noradId: s.noradId,
        lat: s.lat,
        lng: s.lng,
        altitude: s.altitudeKm / 6371,
        size: Math.max(0.3, (s.elevation || 0) / 20),  // Bigger = higher elev
        available: s.available,
        elevation: s.elevation
      }));

    setPositions(positions);
    const heatmap = generateHeatmap(positions);
    setHeatmapData(heatmap);
  }

  useEffect(() => {
    fetchCoverage();  // Initial Ottawa
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchCoverage, 5000);  // Update every 5s
    return () => clearInterval(interval);
  }, [lat, lng, constellation]);  // Re-fetch on location change

  return (
  <div className="App">
    {/* Top Controls Panel */}
    <div className="controls">
      <h2>Sat Coverage Toolkit</h2>
      
      {/* Location Inputs */}
      <label>
        Lat: 
        <input 
          type="number" 
          step="0.01" 
          value={lat} 
          onChange={(e) => setLat(+e.target.value)} 
        />
      </label>
      
      <label>
        Lng: 
        <input 
          type="number" 
          step="0.01" 
          value={lng} 
          onChange={(e) => setLng(+e.target.value)} 
        />
      </label>
      
      {/* Constellation Tabs */}
      <select value={constellation} onChange={(e) => setConstellation(e.target.value)}>
        <option value="iridium">Iridium (66 sats)</option>  
        <option value="starlink">Starlink (7k+ sats)</option>
        <option value="kuiper">Kuiper (3k+ sats)</option>
      </select>
      
      {/* Refresh Button */}
      <button onClick={fetchCoverage}>Refresh Coverage</button>
      
      {/* Live Stats */}
      <div className="stats">
        <span>Visible: {coverageData.satellites.filter(s => s.available).length}</span>
        <span>Max Elev: {Math.max(...coverageData.satellites.map(s => s.elevation || 0)).toFixed(1)}°</span>
      </div>
    </div>
    
    {/* 3D Globe */}
    <Globe
      ref={globeRef}
      globeImageUrl="/earth-blue-marble.jpg"
      pointsData={positions}
      pointLat="lat"
      pointLng="lng"
      pointAltitude="altitude"
      pointColor={(d) => d.available ? 'lime' : 'red'}  // Green=usable!
      pointRadius="size"
      pointsTransitionDuration={500}
      heatmapsData={heatmapData ? [heatmapData] : []}
      heatmapBandwidth={2.5}
      heatmapColorSaturation={1.5}
    />
    
    {/* Bottom Info */}
    <div className="info">
      Ottawa: {lat.toFixed(2)}°, {lng.toFixed(2)}° | Drag=rotate • Scroll=zoom • Green=elev&gt;10°+low path loss
    </div>
  </div>
);

}

export default App;