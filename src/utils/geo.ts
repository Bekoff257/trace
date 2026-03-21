// Haversine formula — returns distance in meters between two lat/lng points
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Check if a coordinate is within a radius (meters) of a center point
export function isWithinRadius(
  lat: number, lng: number,
  centerLat: number, centerLng: number,
  radiusM: number
): boolean {
  return haversineDistance(lat, lng, centerLat, centerLng) <= radiusM;
}

// Compute centroid of a cluster of points
export function centroid(
  points: { lat: number; lng: number }[]
): { lat: number; lng: number } {
  const total = points.length;
  if (total === 0) return { lat: 0, lng: 0 };
  const lat = points.reduce((acc, p) => acc + p.lat, 0) / total;
  const lng = points.reduce((acc, p) => acc + p.lng, 0) / total;
  return { lat, lng };
}
