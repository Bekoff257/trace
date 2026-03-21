import { create } from 'zustand';
import type { LocationPoint, VisitSession, TrackingState, TrackingMode } from '@/types/index';

interface LocationState extends TrackingState {
  recentPoints: LocationPoint[];
  activeSessions: VisitSession[];

  setTracking: (isTracking: boolean) => void;
  setTrackingMode: (mode: TrackingMode) => void;
  addPoint: (point: LocationPoint) => void;
  setCurrentSession: (session: VisitSession | undefined) => void;
  endSession: (sessionId: string, endedAt: string) => void;
  clearPoints: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  isTracking: false,
  mode: 'medium',
  lastPoint: undefined,
  currentSession: undefined,
  batteryLevel: undefined,
  recentPoints: [],
  activeSessions: [],

  setTracking: (isTracking) => set({ isTracking }),

  setTrackingMode: (mode) => set({ mode }),

  addPoint: (point) =>
    set((state) => ({
      lastPoint: point,
      recentPoints: [...state.recentPoints.slice(-299), point],
    })),

  setCurrentSession: (session) => set({ currentSession: session }),

  endSession: (sessionId, endedAt) =>
    set((state) => ({
      currentSession: state.currentSession?.id === sessionId ? undefined : state.currentSession,
      activeSessions: state.activeSessions.map((s) =>
        s.id === sessionId ? { ...s, endedAt } : s
      ),
    })),

  clearPoints: () => set({ recentPoints: [] }),
}));
