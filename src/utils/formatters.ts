import { format, formatDuration, intervalToDuration, parseISO } from 'date-fns';

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

export function formatDurationFromMin(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatTimeRange(startedAt: string, endedAt?: string): string {
  const start = format(parseISO(startedAt), 'h:mm a');
  if (!endedAt) return `${start} – Now`;
  const end = format(parseISO(endedAt), 'h:mm a');
  return `${start} – ${end}`;
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, MMMM d');
}

export function formatShortDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d');
}

export function metersToMiles(meters: number): number {
  return meters / 1609.34;
}

export function estimateSteps(meters: number): number {
  // Average step length ~0.762m
  return Math.round(meters / 0.762);
}
