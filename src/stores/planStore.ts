import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'user_plan_premium';

export type UserPlan = 'free' | 'premium';

interface PlanState {
  userPlan: UserPlan;
  /** True while the RC status check is in flight on launch. */
  isVerifyingPlan: boolean;

  /** Load cached plan from AsyncStorage (call once on startup for instant UI). */
  loadCachedPlan: () => Promise<void>;
  /** Set premium status from a RevenueCat result and persist it. */
  setPremium: (isPremium: boolean) => Promise<void>;
  /** Convenience setter used internally. */
  setUserPlan: (plan: UserPlan) => void;
  setVerifyingPlan: (v: boolean) => void;
}

export const usePlanStore = create<PlanState>((set) => ({
  userPlan: 'free',
  isVerifyingPlan: false,

  loadCachedPlan: async () => {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached === 'premium') {
        set({ userPlan: 'premium' });
      }
    } catch {
      // no-op — free plan remains
    }
  },

  setPremium: async (isPremium) => {
    const plan: UserPlan = isPremium ? 'premium' : 'free';
    set({ userPlan: plan });
    try {
      if (isPremium) {
        await AsyncStorage.setItem(STORAGE_KEY, 'premium');
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // persist failure is non-critical
    }
  },

  setUserPlan: (userPlan) => set({ userPlan }),

  setVerifyingPlan: (isVerifyingPlan) => set({ isVerifyingPlan }),
}));
