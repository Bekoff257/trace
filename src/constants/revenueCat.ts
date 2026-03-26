/**
 * RevenueCat configuration constants.
 *
 * Set your API keys in .env:
 *   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxxxxxxxxxxxxx
 *   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxxxxxxxxxxxxx
 *
 * The entitlement ID must match exactly what you set up in the
 * RevenueCat dashboard under Entitlements.
 */

export const RC_IOS_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY     ?? '';
export const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

/** Must match the entitlement identifier in your RevenueCat dashboard. */
export const RC_ENTITLEMENT_ID = 'premium';
