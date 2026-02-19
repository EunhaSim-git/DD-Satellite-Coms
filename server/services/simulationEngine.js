const satellite = require('satellite.js');

const EARTH_RADIUS_KM = 6371;

const CONSTELLATION_CONFIG = {
  iridium: {
    frequencyGHz: 1.6,
    minElevationDeg: 10,
    maxPathLossDb: 160
  },
  starlink: {
    frequencyGHz: 12.0,
    minElevationDeg: 25,
    maxPathLossDb: 155
  },
  kuiper: {
    frequencyGHz: 12.0,
    minElevationDeg: 25,
    maxPathLossDb: 155
  }
};

function computeSatelliteState(satrec, observer, constellationKey, now = new Date()) {
  const config = CONSTELLATION_CONFIG[constellationKey];
  if (!config) throw new Error("Unknown constellation config");

  const pv = satellite.propagate(satrec, now);
  if (!pv.position) return null;

  const gmst = satellite.gstime(now);

  const geo = satellite.eciToGeodetic(pv.position, gmst);
  const satLat = satellite.degreesLat(geo.latitude);
  const satLng = satellite.degreesLong(geo.longitude);
  const altitudeKm = geo.height;

  // Observer
  const observerGd = {
    longitude: satellite.degreesToRadians(observer.lng),
    latitude: satellite.degreesToRadians(observer.lat),
    height: observer.alt / 1000
  };

  const satEcf = satellite.eciToEcf(pv.position, gmst);
  const lookAngles = satellite.ecfToLookAngles(observerGd, satEcf);

  const elevation = satellite.radiansToDegrees(lookAngles.elevation);
  const rangeKm = lookAngles.rangeSat;

  // Free-space path loss
  const pathLossDb =
    32.44 +
    20 * Math.log10(rangeKm) +
    20 * Math.log10(config.frequencyGHz);

  // Coverage radius
  const elevRad = config.minElevationDeg * Math.PI / 180;
  const centralAngle =
    Math.acos(
      EARTH_RADIUS_KM * Math.cos(elevRad) /
      (EARTH_RADIUS_KM + altitudeKm)
    ) - elevRad;

  const coverageRadiusKm = EARTH_RADIUS_KM * centralAngle;

  const available =
    elevation > config.minElevationDeg &&
    pathLossDb < config.maxPathLossDb;

  return {
    lat: satLat,
    lng: satLng,
    altitudeKm,
    elevation: +elevation.toFixed(1),
    rangeKm: Math.round(rangeKm),
    pathLossDb: Math.round(pathLossDb),
    coverageRadiusKm,
    available
  };
}

module.exports = {
  computeSatelliteState,
  CONSTELLATION_CONFIG
};
