import './App.css';
import Globe from 'react-globe.gl';
import * as satellite from "satellite.js";
import { useEffect, useState, useRef } from "react";
import { generateHeatmap} from "./satUtil";

function App() {
  const [positions, setPositions] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const satrecsRef = useRef([]);
  const globeRef = useRef();

  useEffect(() => {
    async function fetchTLEs() {
      const response = await fetch("/api/iridium/tle");
      const data = await response.json();

      const now = new Date();

      const sats = data.satellites.map(sat => {
        const [l1, l2] = sat.tle.trim().split(/\r?\n/);
        const satrec = satellite.twoline2satrec(l1, l2);

        return {
          noradId: sat.noradId,
          satrec
        };
      });

      satrecsRef.current = sats;

      const positions = sats.map(({ noradId, satrec }) => {
        const pv = satellite.propagate(satrec, now);
        if (!pv.position) return null;

        const gmst = satellite.gstime(now);
        const geo = satellite.eciToGeodetic(pv.position, gmst);

        return {
          noradId,
          lat: satellite.degreesLat(geo.latitude),
          lng: satellite.degreesLong(geo.longitude),
          altitude: geo.height / 6371
        };
      }).filter(Boolean);

      setPositions(positions);
      
      const heatmap = generateHeatmap(positions);
      setHeatmapData(heatmap);
    }

    fetchTLEs();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();

      const sats = satrecsRef.current.map(({ noradId, satrec }) => {
        const pv = satellite.propagate(satrec, now);
        if (!pv.position) return null;

        const gmst = satellite.gstime(now);
        const geo = satellite.eciToGeodetic(pv.position, gmst);

        return {
          noradId,
          lat: satellite.degreesLat(geo.latitude),
          lng: satellite.degreesLong(geo.longitude),
          altitude: geo.height / 6371
        };
      }).filter(Boolean);

      setPositions(sats);

      const heatmap = generateHeatmap(sats);
      setHeatmapData(heatmap);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Globe
      ref={globeRef}
      globeImageUrl="/earth-blue-marble.jpg"
      pointsData={positions}
      pointLat="lat"
      pointLng="lng"
      pointAltitude="altitude"
      pointColor={() => "red"}
      pointRadius={0.4}
      pointsTransitionDuration={0}
      
      heatmapsData={[heatmapData]} 
      heatmapBandwidth={2.5}       
      heatmapColorSaturation={1.5}
  
    />
  );
}

export default App;