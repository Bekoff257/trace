const KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';

// MapTiler — style.json with key inlined so MapLibre Native can resolve all sources
export const MAP_STYLE_URL = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${KEY}`;

// Fallback: CARTO dark matter — fully self-contained MapLibre GL style, no key needed
export const MAP_STYLE_FALLBACK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const MAP_STYLE = KEY ? MAP_STYLE_URL : MAP_STYLE_FALLBACK;
