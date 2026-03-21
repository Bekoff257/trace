const KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';

// MapTiler free tier — sign up at maptiler.com for a free key (100k requests/month)
export const MAP_STYLE_URL = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${KEY}`;

// Fallback: MapLibre's own dark demo style — no key required, works offline-ish
export const MAP_STYLE_FALLBACK = 'https://tiles.openfreemap.org/styles/dark';

export const MAP_STYLE = KEY ? MAP_STYLE_URL : MAP_STYLE_FALLBACK;
