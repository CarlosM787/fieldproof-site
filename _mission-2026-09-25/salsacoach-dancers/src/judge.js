// Find the 1: the Count Lab's tap judge, as pure functions (phase three).
// Source: salsacoach-count-lab/src/app.js, onTap(): the same windows, in the same order.
//   within 150 ms of the 5 and nearer the 5 than the 1 -> "That was the 5"
//   within 110 ms of the 1 -> "On the 1"; within 450 ms -> early / late; else "Keep listening"
// p: heard position of the tap in the 8-count (0 = count 1, as posFrom returns it); beatMs: one
// beat in ms; offset: the listener's calibration in ms (kept in memory only, never stored).
const mod = (a, n) => ((a % n) + n) % n;
export function judgeTap(p, beatMs, offset = 0) {
  const d1 = (mod(p + 4, 8) - 4) * beatMs - offset;
  const d5 = (p - 4) * beatMs - offset;
  let v;
  if (Math.abs(d5) < Math.abs(d1) && Math.abs(d5) <= 150) v = 'five';
  else if (Math.abs(d1) <= 110) v = 'good';
  else if (Math.abs(d1) <= 450) v = d1 < 0 ? 'early' : 'late';
  else v = 'far';
  return { v, ms: v === 'five' ? d5 : d1 };
}
// calibration tap on a click (every beat): its signed distance from the nearest beat, in ms
export const calTap = (p, beatMs) => (p - Math.round(p)) * beatMs;
export function median(a) {
  const s = a.slice().sort((x, y) => x - y), n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
}
export const fmtMs = (ms) => (ms > 0 ? '+' : ms < 0 ? '−' : '') + Math.abs(Math.round(ms)) + ' ms';
