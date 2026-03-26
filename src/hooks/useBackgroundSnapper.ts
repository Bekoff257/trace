/**
 * useBackgroundSnapper
 *
 * Hybrid real-time + road-snapped rendering pipeline:
 *
 *   Raw GPS  ──► always rendered instantly (source of truth)
 *      └─ multi-condition throttle ──► OSRM map-matching ──► replace historical portion
 *
 * Snapping triggers — fires when ANY condition is true, subject to THROTTLE_MS:
 *   • ≥ PTS_TRIGGER new GPS points since last snap
 *   • ≥ DIST_TRIGGER_M metres travelled since last snap position
 *   • ≥ TIME_TRIGGER_MS elapsed since last snap (while new data exists)
 *
 * This replaces the old 8-second idle debounce: snapping now runs continuously
 * during movement and never waits for the user to stop.
 *
 * For each path segment the display is split into two regions:
 *   [snapped historical] + [raw live tail (last LIVE_TAIL_PTS points)]
 *
 * The raw tail is NEVER replaced by snapped data so new GPS fixes appear
 * on-screen immediately without waiting for any API response.
 *
 * On OSRM failure the segment stays as raw — rendering is never broken.
 * Snapping never crosses GPS gaps (segments are processed independently).
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { snapToRoads } from '@services/roadSnapper';
import type { LatLng } from '@stores/locationStore';

// ─── Tuning ───────────────────────────────────────────────────────────────────

/** Raw GPS points always kept at the tip — never overwritten by snapped data. */
const LIVE_TAIL_PTS = 5;

/** Minimum new raw points needed before issuing another snap request. */
const MIN_NEW_PTS = 5;

/** Re-send this many already-snapped points as anchor context so the new
 *  snapped geometry connects smoothly to the previous snapped batch. */
const OVERLAP_PTS = 3;

/** Hard minimum between any two snap requests (prevents rapid-fire API calls). */
const THROTTLE_MS = 5_000;

/** Snap when at least this many new points have accumulated since last snap. */
const PTS_TRIGGER = 8;

/** Snap when moved at least this many metres since the last snap position. */
const DIST_TRIGGER_M = 150;

/** Snap when this many ms have elapsed since last snap AND new data exists. */
const TIME_TRIGGER_MS = 8_000;

/** Skip snapping if the total path length of the window is below this threshold.
 *  When the user is stationary or barely moving, road-snapping adds no value and
 *  wastes an OSRM round-trip. */
const MIN_SNAP_WINDOW_M = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SegSnapData {
  /** Road-snapped coordinates for the historical region of this segment. */
  snapped: LatLng[];
  /** How many raw points from the original segment are covered by `snapped`. */
  coveredRawCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.latitude - a.latitude) * (Math.PI / 180);
  const dLng = (b.longitude - a.longitude) * (Math.PI / 180);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * (Math.PI / 180)) *
      Math.cos(b.latitude * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param pathSegments - raw GPS segments from locationStore (the source of truth)
 * @returns displaySegments - road-snapped where processed, raw elsewhere
 */
export function useBackgroundSnapper(pathSegments: LatLng[][]): LatLng[][] {
  const [snapMap, setSnapMap] = useState<Record<number, SegSnapData>>({});

  // Always-current refs so async callbacks read the latest values
  const snapMapRef = useRef(snapMap);
  const segmentsRef = useRef(pathSegments);
  snapMapRef.current = snapMap;
  segmentsRef.current = pathSegments;

  // Throttle / trigger tracking
  const lastSnapTimeRef = useRef<number>(0);
  const lastSnapPosRef = useRef<LatLng | null>(null);
  const snapInFlightRef = useRef<boolean>(false);

  // ── Reset when tracking is cleared (sign-out / new day) ──────────────────
  const prevLenRef = useRef(pathSegments.length);
  useEffect(() => {
    if (pathSegments.length === 0 && prevLenRef.current > 0) {
      setSnapMap({});
      lastSnapTimeRef.current = 0;
      lastSnapPosRef.current = null;
    }
    prevLenRef.current = pathSegments.length;
  }, [pathSegments.length]);

  // ── Final snap of a completed segment ────────────────────────────────────
  // Fires whenever a new segment is started (meaning the previous one is done).
  useEffect(() => {
    if (pathSegments.length < 2) return;

    const completedIdx = pathSegments.length - 2;
    const seg = pathSegments[completedIdx];
    if (!seg || seg.length < 2) return;

    const existing = snapMapRef.current[completedIdx];
    if (existing && existing.coveredRawCount >= seg.length) return; // already done

    snapToRoads(seg)
      .then(({ coords, snapped }) => {
        if (!snapped) return;
        setSnapMap((prev) => ({
          ...prev,
          [completedIdx]: { snapped: coords, coveredRawCount: seg.length },
        }));
      })
      .catch(() => {}); // silently keep raw on error
  }, [pathSegments.length]);

  // ── Incremental snap of the active (last) segment ────────────────────────
  const doSnap = useCallback(async () => {
    // Only one snap in flight at a time — set flag before any await
    if (snapInFlightRef.current) return;

    const segments = segmentsRef.current;
    const lastIdx = segments.length - 1;
    if (lastIdx < 0) return;

    const rawSeg = segments[lastIdx];
    // The target is everything except the live tail
    const snapTarget = rawSeg.length - LIVE_TAIL_PTS;
    if (snapTarget < 2) return;

    const existing = snapMapRef.current[lastIdx];
    const alreadyCovered = existing?.coveredRawCount ?? 0;

    // Don't snap if we haven't accumulated enough new points
    if (snapTarget <= alreadyCovered + MIN_NEW_PTS) return;

    // Claim the slot before any await to prevent concurrent snaps
    snapInFlightRef.current = true;
    lastSnapTimeRef.current = Date.now();

    // Record current tip as the new "last snap position" for distance trigger
    const tipPt = rawSeg[snapTarget - 1];
    if (tipPt) lastSnapPosRef.current = tipPt;

    // Build an overlapping window: re-send last few snapped pts as anchor
    const windowStart = Math.max(0, alreadyCovered - OVERLAP_PTS);
    const window = rawSeg.slice(windowStart, snapTarget);

    try {
      if (window.length < 2) return;

      // Skip if the window's total path length is too short to benefit from snapping.
      // Stationary users or micro-movements don't need road alignment and would
      // waste an OSRM round-trip.
      let windowDistM = 0;
      for (let i = 1; i < window.length; i++) {
        windowDistM += haversineM(window[i - 1], window[i]);
      }
      if (windowDistM < MIN_SNAP_WINDOW_M) return;

      const { coords, snapped } = await snapToRoads(window);
      if (!snapped) return; // OSRM unavailable — keep raw

      setSnapMap((prev) => {
        const prevSnapped = prev[lastIdx]?.snapped ?? [];
        // Preserve everything before the overlap start, then append new result
        const merged = [...prevSnapped.slice(0, windowStart), ...coords];
        return {
          ...prev,
          [lastIdx]: { snapped: merged, coveredRawCount: snapTarget },
        };
      });
    } catch {
      // Network error — silently keep raw, will retry on next trigger
    } finally {
      snapInFlightRef.current = false;
    }
  }, []);

  // ── Multi-condition snap trigger ──────────────────────────────────────────
  // Runs on every new GPS point (activeSegLen change) or segment change.
  // Any one of the three conditions being true fires a snap request,
  // subject to the hard THROTTLE_MS minimum between requests.
  const activeSegLen = pathSegments[pathSegments.length - 1]?.length ?? 0;
  useEffect(() => {
    const segments = segmentsRef.current;
    const lastIdx = segments.length - 1;
    if (lastIdx < 0) return;

    const rawSeg = segments[lastIdx];
    if (!rawSeg || rawSeg.length < LIVE_TAIL_PTS + 2) return;

    const now = Date.now();
    const timeSinceLast = now - lastSnapTimeRef.current;

    // Hard throttle: never issue snap requests faster than THROTTLE_MS
    if (timeSinceLast < THROTTLE_MS) return;

    const existing = snapMapRef.current[lastIdx];
    const alreadyCovered = existing?.coveredRawCount ?? 0;
    const snapTarget = rawSeg.length - LIVE_TAIL_PTS;
    const newPts = snapTarget - alreadyCovered;

    // No new points to snap
    if (newPts <= 0) return;

    // Condition 1: enough new points accumulated
    const triggerByPts = newPts >= PTS_TRIGGER;

    // Condition 2: enough time elapsed since last snap
    const triggerByTime = timeSinceLast >= TIME_TRIGGER_MS;

    // Condition 3: travelled far enough since last snap position
    let triggerByDist = false;
    if (lastSnapPosRef.current && snapTarget > 0) {
      const tip = rawSeg[snapTarget - 1];
      if (tip) {
        triggerByDist = haversineM(lastSnapPosRef.current, tip) >= DIST_TRIGGER_M;
      }
    }

    if (triggerByPts || triggerByTime || triggerByDist) {
      doSnap();
    }
  }, [activeSegLen, pathSegments.length, doSnap]);

  // ── Merge raw + snapped into display segments ─────────────────────────────
  // For each segment:
  //   - If no snap data yet: show full raw segment
  //   - Otherwise: [snapped historical] + [raw live tail for instant updates]
  return useMemo(() => {
    return pathSegments.map((rawSeg, i) => {
      const data = snapMap[i];
      if (!data || data.snapped.length === 0) return rawSeg;
      // Road-snapped historical portion + raw live tail for instant updates
      return [...data.snapped, ...rawSeg.slice(data.coveredRawCount)];
    });
  }, [pathSegments, snapMap]);
}
