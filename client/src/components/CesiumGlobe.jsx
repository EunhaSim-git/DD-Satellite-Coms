import { useEffect, useRef, useState, useCallback } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

const MIN_ELEV_DEG = 25;
const UPDATE_HZ = 3;
const MAX_FOOTPRINTS = 1200;
const ORBIT_REFRESH_MS = 5000;
const ORBIT_POINTS = 180;
const ORBIT_SPAN_MINUTES = 90;
const ORBIT_SAMPLE_STEP_SEC = 10;

const CONSTELLATIONS = [
  { label: "Starlink", param: "starlink" },
  { label: "Iridium", param: "iridium" },
  { label: "Kuiper", param: "kuiper" },
];

function CesiumGlobe({ initialLat = 45.42, initialLng = -75.7 }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [constellation, setConstellation] = useState("iridium");
  const [maxSats, setMaxSats] = useState(300);
  const [showCoverage, setShowCoverage] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [sats, setSats] = useState([]);
  const selectedSatIds = useRef(new Set());
  const orbitEntities = useRef(new Map());

  // Viewer init (from main.js)
  useEffect(() => {
    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      animation: true,
      timeline: true,
      baseLayer: Cesium.ImageryLayer.fromProviderAsync(
        new Cesium.UrlTemplateImageryProvider({
          url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
          credit: "© OpenStreetMap contributors © Stadia Maps",
        })
      ),
    });

    viewer.scene.skyBox.show = false;
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.enableLighting = false;
    viewer.clock.multiplier = 20;
    viewer.clock.shouldAnimate = true;

    viewerRef.current = viewer;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(initialLng, initialLat, 10000000),
    });

    // Click handler (toggle select/orbit)
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      if (!Cesium.defined(picked) || !picked.id) return;
      const ent = picked.id;
      if (ent.properties?._kind?.getValue() !== "sat") return;
      const id = ent.properties._sid.getValue();
      toggleSelectSatellite(id);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
    };
  }, [initialLat, initialLng]);

  // Load constellation via YOUR API
  const loadConstellation = useCallback(async (param) => {
    setStatus(`Loading ${param}...`);
    const res = await fetch(`/api/${param}/coverage?lat=${initialLat}&lng=${initialLng}&alt=100`);
    const data = await res.json();
    setSats(data.satellites.slice(0, maxSats));
    setStatus(`${data.satellites.length} sats loaded`);
  }, [initialLat, initialLng, maxSats]);

  // Auto-load initial
  useEffect(() => {
    loadConstellation(constellation);
  }, [loadConstellation]);

  // Real-time update (3Hz like main.js)
  useEffect(() => {
    const interval = setInterval(() => {
      loadConstellation(constellation);
    }, 1000 / UPDATE_HZ);
    return () => clearInterval(interval);
  }, [constellation, loadConstellation]);

  const toggleSelectSatellite = useCallback((id) => {
    const sat = sats.find(s => s.noradId == id);
    if (!sat) return;

    const obj = { id: sat.noradId, satEntity: null /* ref to entity */, satrec: null };
    if (selectedSatIds.current.has(id)) {
      selectedSatIds.current.delete(id);
      // Remove orbit entity
    } else {
      selectedSatIds.current.add(id);
      // Add/update orbit (simplified - use API positions)
    }
    setStatus(`Selected: ${selectedSatIds.current.size}`);
  }, [sats]);

  // Plot sats + footprints (from createEntitiesForSats)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeAll();

    // Ground station
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(initialLng, initialLat, 0),
      point: { pixelSize: 12, color: Cesium.Color.YELLOW },
      label: { text: "Ottawa", font: "12px sans-serif", fillColor: Cesium.Color.WHITE },
    });

    // Sats + footprints
    sats.forEach((sat, i) => {
      if (i >= MAX_FOOTPRINTS) return;
      const available = sat.available ?? sat.elevation > MIN_ELEV_DEG;
      viewer.entities.add({
        id: `sat-${sat.noradId}`,
        position: Cesium.Cartesian3.fromDegrees(sat.lng, sat.lat, sat.altitudeKm * 1000),
        point: { 
          pixelSize: available ? 6 : 4, 
          color: available ? Cesium.Color.YELLOW : Cesium.Color.CYAN 
        },
        properties: new Cesium.PropertyBag({ _kind: "sat", _sid: sat.noradId }),
        description: `<b>${sat.noradId}</b> | Elev: ${sat.elevation}° | Range: ${sat.rangeKm}km<br>Click to toggle orbit`,
      });

      if (showCoverage && available) {
        // Footprint ellipse (from footprintRadiusMetersFromAltitude logic)
        const rKm = 2000; // Approx from alt/pathloss
        viewer.entities.add({
          id: `fp-${sat.noradId}`,
          position: Cesium.Cartesian3.fromDegrees(sat.lng, sat.lat, 0),
          ellipse: {
            semiMajorAxis: rKm * 1000,
            semiMinorAxis: rKm * 1000,
            material: Cesium.Color.CYAN.withAlpha(0.05),
            outline: true,
            outlineColor: Cesium.Color.CYAN.withAlpha(0.45),
          },
        });
      }
    });
  }, [sats, showCoverage, initialLat, initialLng]);

  return (
    <div style={{ height: "80vh", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000, background: "rgba(0,0,0,0.7)", padding: 10, borderRadius: 5 }}>
        <select value={constellation} onChange={e => setConstellation(e.target.value)}>
          {CONSTELLATIONS.map(c => <option key={c.param} value={c.param}>{c.label}</option>)}
        </select>
        <label>
          <input type="checkbox" checked={showCoverage} onChange={e => setShowCoverage(e.target.checked)} /> Coverage
        </label>
        <div style={{ fontSize: "12px", color: "white" }}>{status}</div>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export default CesiumGlobe;
