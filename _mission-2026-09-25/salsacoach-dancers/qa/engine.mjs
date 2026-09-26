// Fingerprints of the count engine: the functions in src/choreo.js that decide when a foot lifts,
// how it travels and when it lands. Phase three must leave every one of them byte-identical.
import { createHash } from 'node:crypto';
export const ENGINE = [
  /^export function beatState\(p, pattern, loop, reduced\) \{[\s\S]*?^\}$/m,
  /^export const ease = .*$/m, /^const mod = .*$/m, /^const lerp = .*$/m, /^const clamp01 = .*$/m,
  /^export const windowOff = .*$/m, /^export const windowLen = .*$/m, /^export const posFrom = .*$/m, /^export const slotOf = .*$/m,
  /^export const movingFoot = .*$/m, /^export const ownFoot = .*$/m,
  /^export function footXZ\(role, lf, y\) \{[\s\S]*?^\}$/m, /^function bodyXZ\(role, st\) \{[\s\S]*?^\}$/m,
  /^  (scale|gap|footX|lift|hipShift|frontShare|peel|ballLand): .*$/gm,
];
export function fingerprint(src) {
  const parts = [];
  for (const re of ENGINE) {
    const m = re.global ? [...src.matchAll(re)].map((x) => x[0]) : [(src.match(re) || [null])[0]];
    if (m.some((x) => x === null) || !m.length) return { ok: false, missing: String(re) };
    parts.push(...m);
  }
  return { ok: true, n: parts.length, hash: createHash('sha256').update(parts.join('\n')).digest('hex') };
}
// sha256 of the same parts in phase two (_mission-2026-09-25/salsacoach-dancers/src/choreo.js)
export const PHASE2_HASH = process.env.PHASE2_HASH || null;
