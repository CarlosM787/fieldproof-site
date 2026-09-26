// "Quick-quick-slow": the rhythm words of the basic, derived from the step table (phase three).
// A step followed by another step is quick (one beat); a step followed by a hold is slow (it takes
// the step's beat and the held beat). The group of four starts on the first step after a hold, so
// On1 and the Torres count read 1-2-3-(4), 5-6-7-(8) and the 2-3-4 count reads 2-3-4-(5), 6-7-8-(1).
export function rhythmWord(P, k) {
  if (!P.steps[k]) return 'hold';
  return P.steps[k % 8 + 1] ? 'quick' : 'slow';
}
// the four counts of the group that contains count k
export function rhythmGroup(P, k) {
  let s = k;
  for (let i = 0; i < 8; i++) {
    const prev = ((s + 6) % 8) + 1;
    if (!P.steps[prev] && P.steps[s]) break;
    s = prev;
  }
  return [0, 1, 2, 3].map((i) => ((s - 1 + i) % 8) + 1);
}
export const RHYTHM_WORDS = {
  en: { quick: 'quick', slow: 'slow', hold: 'hold' },
  es: { quick: 'rápido', slow: 'lento', hold: 'pausa' },
};
