/**
 * purchaseService — thin wrapper around react-native-purchases (RevenueCat).
 *
 * Call initPurchases(userId) once after the user signs in.
 * All other functions are safe to call concurrently; they throw on failure
 * so callers can display appropriate error messages.
 */
import Purchases, {
  LOG_LEVEL,
  type PurchasesOfferings,
  type PurchasesPackage,
  type CustomerInfo,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { RC_IOS_KEY, RC_ANDROID_KEY, RC_ENTITLEMENT_ID } from '@constants/revenueCat';

let _initialized = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Configure the RevenueCat SDK for the signed-in user.
 * Safe to call multiple times — re-configures if the userId changes.
 */
export async function initPurchases(userId: string): Promise<void> {
  const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
  if (!apiKey) {
    console.warn('[Purchases] No RevenueCat API key set — purchases disabled.');
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey, appUserID: userId });
  _initialized = true;
}

/**
 * Sign out of RevenueCat (call on auth sign-out).
 * Resets to an anonymous user so a new sign-in starts fresh.
 */
export async function logOutRC(): Promise<void> {
  if (!_initialized) return;
  try {
    await Purchases.logOut();
  } catch {
    // best-effort
  }
  _initialized = false;
}

// ─── Offerings ────────────────────────────────────────────────────────────────

/**
 * Fetch the current offerings from RevenueCat.
 * Returns null if the SDK is not initialized or the fetch fails.
 */
export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
  if (!_initialized) return null;
  try {
    return await Purchases.getOfferings();
  } catch {
    return null;
  }
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export interface PurchaseResult {
  success: boolean;
  isPremium: boolean;
  /** Set when success is false and it was not a user cancellation. */
  error?: string;
  /** True if the user simply tapped "Cancel" — no error toast needed. */
  cancelled?: boolean;
}

/**
 * Initiate a purchase for the given package.
 * Handles cancellation silently; re-throws other errors as a user-friendly message.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!_initialized) {
    return { success: false, isPremium: false, error: 'Store not available. Please try again.' };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium = isEntitlementActive(customerInfo);
    return { success: true, isPremium };
  } catch (err: any) {
    // User cancelled — not an error worth surfacing
    if (err?.userCancelled === true) {
      return { success: false, isPremium: false, cancelled: true };
    }
    return {
      success: false,
      isPremium: false,
      error: err?.message ?? 'Purchase failed. Please try again.',
    };
  }
}

// ─── Restore ──────────────────────────────────────────────────────────────────

/**
 * Restore previous purchases for the current user.
 * Returns whether premium is now active.
 */
export async function restorePurchases(): Promise<{ isPremium: boolean; error?: string }> {
  if (!_initialized) {
    return { isPremium: false, error: 'Store not available. Please try again.' };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { isPremium: isEntitlementActive(customerInfo) };
  } catch (err: any) {
    return { isPremium: false, error: err?.message ?? 'Restore failed. Please try again.' };
  }
}

// ─── Status check ─────────────────────────────────────────────────────────────

/**
 * Fetch the current customer status from RevenueCat.
 * Returns null if the SDK is not initialized.
 */
export async function checkPremiumStatus(): Promise<boolean | null> {
  if (!_initialized) return null;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return isEntitlementActive(customerInfo);
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isEntitlementActive(customerInfo: CustomerInfo): boolean {
  return RC_ENTITLEMENT_ID in (customerInfo.entitlements.active ?? {});
}
