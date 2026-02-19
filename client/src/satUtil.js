// satUtil.js
function greatCircleDistance(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS = 6371; 
  
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS * c;
}

function generateHeatmap(satellites) {
  const POINT_SPACING_KM = 300;
  const coveragePoints = [];

  satellites.forEach((sat) => {
    if (!sat.coverageRadiusKm) return;

    const coverageAreaKm2 = Math.PI * sat.coverageRadiusKm * sat.coverageRadiusKm;
    const pointsNeeded = Math.ceil(
      coverageAreaKm2 / (POINT_SPACING_KM * POINT_SPACING_KM)
    );

    const points = generatePointsInCircle(
      sat.lat,
      sat.lng,
      sat.coverageRadiusKm,
      pointsNeeded
    );

    coveragePoints.push(...points);
  });

  return coveragePoints;
}

function generatePointsInCircle(centerLat, centerLng, radiusKm, numPoints) {
  const EARTH_RADIUS = 6371;
  const points = [];
  
  // Use Fibonacci spiral for even distribution
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = 2 * Math.PI / goldenRatio;
  
  for (let i = 0; i < numPoints; i++) {
    // Fibonacci spiral parameters
    const t = i / numPoints;
    const angle = i * angleIncrement;
    
    // Distance from center (0 to radiusKm), with sqrt for uniform area distribution
    const distance = radiusKm * Math.sqrt(t);
    
    // Generate point at distance and angle from center
    const point = pointAtDistanceAndBearing(centerLat, centerLng, distance, angle * 180 / Math.PI);
    
    if (point) {
      points.push([point.lat, point.lng]);
    }
  }
  
  return points;
}

function pointAtDistanceAndBearing(lat, lng, distanceKm, bearingDeg) {
  const EARTH_RADIUS = 6371;
  
  const δ = distanceKm / EARTH_RADIUS; // Angular distance
  const θ = bearingDeg * Math.PI / 180; // Bearing in radians
  const φ1 = lat * Math.PI / 180;
  const λ1 = lng * Math.PI / 180;
  
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  
  let lat2 = φ2 * 180 / Math.PI;
  let lng2 = λ2 * 180 / Math.PI;
  
  // Normalize longitude
  while (lng2 < -180) lng2 += 360;
  while (lng2 >= 180) lng2 -= 360;
  
  // Clamp latitude
  lat2 = Math.max(-90, Math.min(90, lat2));
  
  return { lat: lat2, lng: lng2 };
}

function latLngToCartesian(lat, lng) {
  const φ = lat * Math.PI / 180;
  const λ = lng * Math.PI / 180;
  
  return {
    x: Math.cos(φ) * Math.cos(λ),
    y: Math.cos(φ) * Math.sin(λ),
    z: Math.sin(φ)
  };
}

export { generateHeatmap };