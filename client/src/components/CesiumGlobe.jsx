// src/components/CesiumGlobe.jsx
import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN; // ✅ fixed

function CesiumGlobe({ positions = [], lat = 45.42, lng = -75.7 }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (viewerRef.current) return;

    console.log("🌍 Mounting Cesium Viewer...");
    console.log("Token:", import.meta.env.VITE_CESIUM_TOKEN ? "✅ found" : "❌ missing");

    viewerRef.current = new Cesium.Viewer(containerRef.current, { // ✅ fixed
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      homeButton: false,
      sceneModePicker: false,
      geocoder: false,
      fullscreenButton: false,
    });

    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, 10000000), // ✅ fixed
    });

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeAll();

    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat, 0), // ✅ fixed
      point: {
        pixelSize: 12,
        color: Cesium.Color.YELLOW, // ✅ fixed
      },
      label: {
        text: "Ground Station",
        font: "12px sans-serif",
        fillColor: Cesium.Color.WHITE, // ✅ fixed
        pixelOffset: new Cesium.Cartesian2(0, -20), // ✅ fixed
      },
    });

    positions.forEach((sat) => {
      if (sat.lat == null || sat.lng == null) return;

      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees( // ✅ fixed
          sat.lng,
          sat.lat,
          (sat.altitudeKm ?? 550) * 1000
        ),
        point: {
          pixelSize: 6,
          color: sat.available ? Cesium.Color.LIME : Cesium.Color.RED, // ✅ fixed
        },
      });
    });
  }, [positions, lat, lng]);

  return <div ref={containerRef} style={{ width: "100%", height: "70vh" }} />;
}

export default CesiumGlobe;