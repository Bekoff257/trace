export type PremiumFeature = 'replay' | 'footsteps' | 'full_history' | 'insights';

const PREMIUM_SET = new Set<PremiumFeature>([
  'replay',
  'footsteps',
  'full_history',
  'insights',
]);

export function isPremiumFeature(feature: PremiumFeature): boolean {
  return PREMIUM_SET.has(feature);
}
