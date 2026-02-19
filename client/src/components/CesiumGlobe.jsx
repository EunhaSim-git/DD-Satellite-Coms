import { useEffect, useRef, useState, useCallback } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

const MIN_ELEV_DEG = 25;
const UPDATE_HZ = 3;
const ORBIT_SPAN_MINUTES = 90;
const ORBIT_POINTS = 180;

function CesiumGlobe({ lat = 45.42, lng = -75.7, constellation = "iridium", maxSats = 30 }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  const [showCoverage, setShowCoverage] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [sats, setSats] = useState([]);

  const selectedSatIds = useRef(new Set());
  const orbitEntities = useRef(new Map());

  // Initialize Cesium Viewer
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

    // Initial camera
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, 10000000),
    });

    // Click handler for selecting satellites
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
  }, [lat, lng]);

  // Fetch satellites from API
  const fetchSats = useCallback(async () => {
    setStatus(`Loading ${constellation}...`);
    try {
      const res = await fetch(
        `/api/${constellation}/coverage?lat=${lat}&lng=${lng}&alt=100&maxSats=${maxSats}`
      );
      const data = await res.json();
      setSats(data.satellites || []);
      setStatus(`${Math.min(data.satellites.length, maxSats)} sats loaded`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }, [constellation, lat, lng, maxSats]);

  useEffect(() => {
    fetchSats();
  }, [fetchSats]);

  // Update satellite positions periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const now = new Date();

      sats.forEach((sat) => {
        const satEntity = viewer.entities.getById(`sat-${sat.noradId}`);
        const fpEntity = viewer.entities.getById(`fp-${sat.noradId}`);
        if (!satEntity) return;

        // Update satellite position
        satEntity.position = Cesium.Cartesian3.fromDegrees(
          sat.lng,
          sat.lat,
          sat.altitudeKm * 1000
        );

        // Update coverage footprint
        if (fpEntity && showCoverage && sat.coverageRadiusKm) {
          fpEntity.position = Cesium.Cartesian3.fromDegrees(sat.lng, sat.lat, 0);
          fpEntity.ellipse.semiMajorAxis = sat.coverageRadiusKm * 1000;
          fpEntity.ellipse.semiMinorAxis = sat.coverageRadiusKm * 1000;
        }
      });
    }, 1000 / UPDATE_HZ);

    return () => clearInterval(interval);
  }, [sats, showCoverage]);

  // Toggle satellite selection and orbit display
  const toggleSelectSatellite = useCallback(
    (id) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const sat = sats.find((s) => s.noradId === id);
      if (!sat) return;

      if (selectedSatIds.current.has(id)) {
        selectedSatIds.current.delete(id);
        const ent = orbitEntities.current.get(id);
        if (ent) {
          viewer.entities.remove(ent);
          orbitEntities.current.delete(id);
        }
      } else {
        selectedSatIds.current.add(id);
        const positions = [];
        const now = new Date();
        const halfSpanSec = (ORBIT_SPAN_MINUTES * 60) / 2;
        const stepSec = Math.max(10, Math.round((ORBIT_SPAN_MINUTES * 60) / ORBIT_POINTS));

        const satrec = window.satellite?.twoline2satrec(sat.line1, sat.line2);
        if (!satrec) return;

        for (let dt = -halfSpanSec; dt <= halfSpanSec; dt += stepSec) {
          const t = new Date(now.getTime() + dt * 1000);
          const pv = window.satellite.propagate(satrec, t);
          if (!pv.position) continue;
          const gmst = window.satellite.gstime(t);
          const ecf = window.satellite.eciToEcf(pv.position, gmst);
          positions.push(new Cesium.Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000));
        }

        const orbitEnt = viewer.entities.add({
          id: `orbit-${id}`,
          name: `${sat.noradId} orbit`,
          polyline: {
            positions,
            width: 2,
            material: Cesium.Color.YELLOW.withAlpha(0.9),
            clampToGround: false,
          },
        });
        orbitEntities.current.set(id, orbitEnt);
      }
    },
    [sats]
  );

  // Render satellites and coverage
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeAll();

    // Ground station
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat, 0),
      point: { pixelSize: 12, color: Cesium.Color.YELLOW },
      label: { text: "Ground Station", font: "12px sans-serif", fillColor: Cesium.Color.WHITE },
    });

    sats.forEach((sat) => {
      const available = sat.available ?? sat.elevation > MIN_ELEV_DEG;

      // Satellite entity
      viewer.entities.add({
        id: `sat-${sat.noradId}`,
        position: Cesium.Cartesian3.fromDegrees(sat.lng, sat.lat, sat.altitudeKm * 1000),
        point: {
          pixelSize: available ? 6 : 4,
          color: available ? Cesium.Color.YELLOW : Cesium.Color.CYAN,
        },
        properties: new Cesium.PropertyBag({ _kind: "sat", _sid: sat.noradId }),
        description: `<b>${sat.noradId}</b> | Elev: ${sat.elevation}° | Range: ${sat.rangeKm}km<br>Click to toggle orbit`,
      });

      // Coverage footprint
      if (showCoverage && available && sat.coverageRadiusKm) {
        viewer.entities.add({
          id: `fp-${sat.noradId}`,
          position: Cesium.Cartesian3.fromDegrees(sat.lng, sat.lat, 0),
          ellipse: {
            semiMajorAxis: sat.coverageRadiusKm * 1000,
            semiMinorAxis: sat.coverageRadiusKm * 1000,
            material: Cesium.Color.CYAN.withAlpha(0.05),
            outline: true,
            outlineColor: Cesium.Color.CYAN.withAlpha(0.45),
          },
        });
      }
    });
  }, [sats, showCoverage, lat, lng]);

  return (
    <div style={{ height: "80vh", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          background: "rgba(0,0,0,0.7)",
          padding: 10,
          borderRadius: 5,
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={showCoverage}
            onChange={(e) => setShowCoverage(e.target.checked)}
          />{" "}
          Coverage
        </label>
        <div style={{ fontSize: "12px", color: "white", marginTop: 4 }}>{status}</div>
      </div>

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export default CesiumGlobe;