import React, { useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SatelliteMap = ({ constellation, coverage = [], lat, lng }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    
    useEffect(() => {
        if (!mapRef.current || coverage.length === 0) return;

        // Init map
        if (mapInstance.current) {
        mapInstance.current.remove();
        }

        // New map
        mapInstance.current = L.map(mapRef.current).setView([lat, lng], 8);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
        }).addTo(mapInstance.current);

        // ALL satellites (your code → fixed)
        coverage.slice(0, 30).forEach((sat, index) => {
        const isVisible = sat.available || false;
        const elev = sat.elevation || 0;
        
        L.circleMarker([sat.lat, sat.lng], {
            radius: isVisible ? 10 : 5,
            fillColor: isVisible ? '#00ff00' : '#ff4444',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85
        })
        .bindPopup(
            `<b>${constellation.toUpperCase()}</b><br/>
            NORAD: ${sat.noradId}<br/>
            Lat/Lng: ${sat.lat?.toFixed(2)}°, ${sat.lng?.toFixed(2)}°<br/>
            Altitude: ${sat.altitudeKm?.toFixed(0)} km<br/>
            Elev: ${elev.toFixed(1)}°<br/>
            Range: ${sat.rangeKm}km<br/>
            Loss: ${sat.pathLossDb}dB<br/>
            ${isVisible ? 'Visible' : 'Below horizon'}`
        )
        .addTo(mapInstance.current);
        });

        // Ground station
        L.marker([lat, lng]).addTo(mapInstance.current)
        .bindPopup('Your Ottawa station')
        .openPopup();

        // Fit bounds (auto-zoom to satellites)
        if (coverage.length > 0) {
        const bounds = coverage.map(sat => [sat.lat, sat.lng]);
        mapInstance.current.fitBounds(bounds, { padding: [20, 20] });
            }
    }, [constellation, coverage, lat, lng]);

    // Cleanup
    return (
    <div className="map-container" style={{ height: '100%', minHeight: '500px' }}>
      <div className="constellation-label">
        {constellation.toUpperCase()}<br/>
        <small>{coverage.filter(s => s.available).length}/{coverage.length}</small>
      </div>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default SatelliteMap;