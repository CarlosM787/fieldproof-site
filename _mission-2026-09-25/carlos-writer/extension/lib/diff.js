/*
 * Carlos Writer: word-level diff (Myers O(ND)) for the Original / Suggestion view.
 * Pure functions. Used by the service worker, the popup and the Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CWDiff = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Words (letters, marks, digits, inner apostrophes and hyphens), runs of
  // whitespace, and single punctuation characters are separate tokens.
  const TOKEN_RE = /\s+|[\p{L}\p{M}\p{N}_]+(?:['’\-][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu;

  function tokenize(text) {
    return String(text || '').match(TOKEN_RE) || [];
  }

  // Coarse fallback for very different texts: common prefix and suffix kept,
  // the middle shown as one replacement. Keeps memory bounded.
  function coarse(a, b) {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    const ops = [];
    for (let i = 0; i < p; i++) ops.push({ t: '=', s: a[i] });
    for (let i = p; i < a.length - s; i++) ops.push({ t: '-', s: a[i] });
    for (let i = p; i < b.length - s; i++) ops.push({ t: '+', s: b[i] });
    for (let i = a.length - s; i < a.length; i++) ops.push({ t: '=', s: a[i] });
    return ops;
  }

  const MAX_EDIT_DISTANCE = 1500;

  // Myers diff over token arrays. Returns [{t:'=', s}, {t:'-', s}, {t:'+', s}].
  // The trace stores only the live window of V for each d (O(D^2) memory).
  function diffTokens(a, b) {
    const n = a.length;
    const m = b.length;
    const max = n + m;
    if (max === 0) return [];
    const offset = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace = [];
    let found = false;
    for (let d = 0; d <= max && !found; d++) {
      if (d > MAX_EDIT_DISTANCE) return coarse(a, b);
      trace.push(v.slice(offset - d - 1, offset + d + 2)); // k from -d-1 .. d+1
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
        else x = v[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[offset + k] = x;
        if (x >= n && y >= m) { found = true; break; }
      }
    }
    const ops = [];
    let x = n;
    let y = m;
    for (let d = trace.length - 1; d >= 0; d--) {
      const w = trace[d];
      const at = (k) => w[k + d + 1];
      const k = x - y;
      let prevK;
      if (k === -d || (k !== d && at(k - 1) < at(k + 1))) prevK = k + 1;
      else prevK = k - 1;
      const prevX = d === 0 ? 0 : at(prevK);
      const prevY = d === 0 ? 0 : prevX - prevK;
      while (x > prevX && y > prevY) { ops.push({ t: '=', s: a[x - 1] }); x--; y--; }
      if (d > 0) {
        if (x === prevX) { ops.push({ t: '+', s: b[y - 1] }); y--; }
        else { ops.push({ t: '-', s: a[x - 1] }); x--; }
      }
    }
    ops.reverse();
    return ops;
  }

  function merge(ops) {
    const out = [];
    for (const op of ops) {
      const last = out[out.length - 1];
      if (last && last.t === op.t) last.s += op.s;
      else out.push({ t: op.t, s: op.s });
    }
    return out;
  }

  // Make changes readable: a lone whitespace "equal" between two changes is
  // folded into both sides, so "a b" -> "c d" reads as one change, not two.
  function cleanup(ops) {
    let res = merge(ops);
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 1; i < res.length - 1; i++) {
        const op = res[i];
        if (op.t === '=' && /^\s+$/.test(op.s) && res[i - 1].t !== '=' && res[i + 1].t !== '=') {
          res.splice(i, 1, { t: '-', s: op.s }, { t: '+', s: op.s });
          res = regroup(res);
          changed = true;
          break;
        }
      }
    }
    return res;
  }

  // Within each run of changes, put all deletions before all insertions.
  function regroup(ops) {
    const out = [];
    let dels = '';
    let ins = '';
    const flush = () => {
      if (dels) out.push({ t: '-', s: dels });
      if (ins) out.push({ t: '+', s: ins });
      dels = '';
      ins = '';
    };
    for (const op of ops) {
      if (op.t === '-') dels += op.s;
      else if (op.t === '+') ins += op.s;
      else { flush(); out.push({ t: '=', s: op.s }); }
    }
    flush();
    return merge(out);
  }

  /** Word diff between two strings. */
  function diffWords(original, suggestion) {
    const a = tokenize(original);
    const b = tokenize(suggestion);
    return cleanup(regroup(diffTokens(a, b)));
  }

  /** Number of separate change groups (for "3 changes"). */
  function countChanges(ops) {
    let n = 0;
    let inChange = false;
    for (const op of ops) {
      if (op.t === '=') inChange = false;
      else if (!inChange) { n++; inChange = true; }
    }
    return n;
  }

  /** Rebuild each side from the ops (used by tests as a round-trip check). */
  function sides(ops) {
    let before = '';
    let after = '';
    for (const op of ops) {
      if (op.t !== '+') before += op.s;
      if (op.t !== '-') after += op.s;
    }
    return { before, after };
  }

  return { tokenize, diffTokens, diffWords, countChanges, sides };
});
