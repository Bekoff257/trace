import { create } from 'zustand';

export type UserPlan = 'free' | 'premium';

interface PlanState {
  userPlan: UserPlan;
  setUserPlan: (plan: UserPlan) => void;
}

export const usePlanStore = create<PlanState>((set) => ({
  userPlan: 'free',
  setUserPlan: (userPlan) => set({ userPlan }),
}));
