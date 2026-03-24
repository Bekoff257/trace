import { create } from 'zustand';
import type { LocationPoint, VisitSession, TrackingState, TrackingMode } from '@/types/index';

export type TrailStyle = 'lines' | 'footsteps';

interface LocationState extends TrackingState {
  recentPoints: LocationPoint[];
  activeSessions: VisitSession[];
  trailStyle: TrailStyle;

  setTracking: (isTracking: boolean) => void;
  setTrackingMode: (mode: TrackingMode) => void;
  setTrailStyle: (style: TrailStyle) => void;
  addPoint: (point: LocationPoint) => void;
  setCurrentSession: (session: VisitSession | undefined) => void;
  endSession: (sessionId: string, endedAt: string) => void;
  clearPoints: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  isTracking: false,
  mode: 'medium',
  trailStyle: 'lines',
  lastPoint: undefined,
  currentSession: undefined,
  batteryLevel: undefined,
  recentPoints: [],
  activeSessions: [],

  setTracking: (isTracking) => set({ isTracking }),

  setTrackingMode: (mode) => set({ mode }),

  setTrailStyle: (trailStyle) => set({ trailStyle }),

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
