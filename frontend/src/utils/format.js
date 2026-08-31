/**
 * format.js — Formatting helpers.
 */

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function formatNumber(n) {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

export function formatFps(fps) {
  if (!fps) return '—';
  return fps.toFixed(1);
}

export function formatPercent(value, total) {
  if (!total) return '0%';
  return ((value / total) * 100).toFixed(1) + '%';
}

export function truncate(str, len = 24) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}
