import type { CaptureSummary } from './types';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDims(w: number, h: number): string {
  return `${w.toLocaleString('en-US')} × ${h.toLocaleString('en-US')}`;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function downloadFilename(summary: Pick<CaptureSummary, 'createdAt'>): string {
  const d = new Date(summary.createdAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `PageSnap ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.png`;
}
