import { Platform } from 'react-native';

export const COLORS = {
  // Backgrounds
  background: '#0A0A0F',
  surface: '#12121A',
  surfaceElevated: '#1A1A26',
  glass: 'rgba(255, 255, 255, 0.07)',
  glassMedium: 'rgba(255, 255, 255, 0.11)',
  glassStrong: 'rgba(255, 255, 255, 0.16)',

  // Brand
  primary: '#4F6EF7',
  primaryGlow: 'rgba(79, 110, 247, 0.35)',
  accent: '#00D4FF',
  accentGlow: 'rgba(0, 212, 255, 0.30)',
  success: '#00E5A0',
  successGlow: 'rgba(0, 229, 160, 0.30)',
  warning: '#F7A74F',
  error: '#F75F5F',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#606080',

  // Borders
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.20)',

  // Category colors
  home: '#4F6EF7',
  work: '#00D4FF',
  food: '#F7A74F',
  transit: '#A074F7',
  fitness: '#00E5A0',
  shopping: '#F774C4',
  other: '#6080A0',
} as const;

export const GRADIENTS = {
  primary: ['#5B7FFF', '#8B5CF6'] as const,
  primaryReverse: ['#8B5CF6', '#5B7FFF'] as const,
  accent: ['#00D4FF', '#00FFB2'] as const,
  surface: ['#12121A', '#1A1A26'] as const,
  dark: ['#0A0A0F', '#12121A'] as const,
  glow: ['rgba(91,127,255,0.5)', 'rgba(91,127,255,0)'] as const,
  glowStrong: ['rgba(91,127,255,0.7)', 'rgba(91,127,255,0)'] as const,
  card: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)'] as const,
};

export const SHADOWS = {
  primary: {
    shadowColor: '#5B7FFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  accent: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 12,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 20,
  },
};

export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  full: 9999,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FONT = {
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 22,
    xxl: 28,
    display: 38,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
};

export const LAYOUT = {
  tabBarHeight: Platform.OS === 'ios' ? 84 : 64,
  headerHeight: 56,
  screenPadding: SPACING.md,
};
