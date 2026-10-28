// Shared page plumbing for the Release B calculators (painting estimate, labor and job quote).
// Reading fields with inline errors, number formatting, analytics that never carries a typed value,
// the phone price bar, copy, print. No network: nothing typed here is sent anywhere.
import { parseAmount, amountProblem, toCents, formatMoney, pct1, MAX_CENTS } from './estimate-math.js';

export const LANG = (document.documentElement.lang || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
const LOCALE = LANG === 'es' ? 'es-US' : 'en-US';

export const $ = (id) => document.getElementById(id);
export const money = (c) => formatMoney(c, LANG);
export const fmtPct = (p) => (p === null || p === undefined ? '—' : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(pct1(p)));
export const fmtNum = (n, max = 2, min = 0) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: max, minimumFractionDigits: min }).format(n);

const MSG = {
  en: {
    unclear: (a, b) => `Is that ${a} or ${b}? Type it without the dot, or with a comma for thousands.`,
    invalid: 'Use numbers only, like 1250 or 1,250.50.',
    tooBig: 'That amount is larger than this calculator handles.',
    whole: 'Use a whole number.',
    range: (lo, hi) => `Use a number from ${fmtNum(lo)} to ${fmtNum(hi)}.`,
  },
  es: {
    unclear: (a, b) => `¿Es ${a} o ${b}? Escríbelo sin el punto, o con coma para los miles.`,
    invalid: 'Usa solo números, como 1250 o 1,250.50.',
    tooBig: 'Esa cantidad es más grande de lo que maneja esta calculadora.',
    whole: 'Usa un número entero.',
    range: (lo, hi) => `Usa un número de ${fmtNum(lo)} a ${fmtNum(hi)}.`,
  },
}[LANG];

function fieldState(el) {
  const errEl = document.getElementById(el.id + '-err');
  el.removeAttribute('aria-invalid');
  if (errEl) errEl.textContent = '';
  return (msg) => { el.setAttribute('aria-invalid', 'true'); if (errEl) errEl.textContent = msg; return { bad: true }; };
}

/** A money field -> { cents } | { empty, cents: 0 } | { bad }. The element can be passed or its id. */
export function readMoney(idOrEl) {
  const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
  const fail = fieldState(el);
  const raw = el.value;
  if (raw.trim() === '') return { empty: true, cents: 0 };
  const n = parseAmount(raw);
  if (n === null) {
    const p = amountProblem(raw);
    return fail(p && p.kind === 'unclear_thousands' ? MSG.unclear(money(toCents(p.thousands)), money(toCents(p.decimal))) : MSG.invalid);
  }
  const c = toCents(n);
  if (c > MAX_CENTS) return fail(MSG.tooBig);
  return { cents: c, value: n };
}

/** A plain number (feet, hours, %, people) -> { value } | { empty, value: 0 } | { bad }. */
export function readNumber(idOrEl, { integer = false, max = Infinity, min = 0 } = {}) {
  const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
  const fail = fieldState(el);
  const raw = el.value;
  if (raw.trim() === '') return { empty: true, value: 0 };
  const n = parseAmount(raw);
  if (n === null) {
    const p = amountProblem(raw);
    return fail(p && p.kind === 'unclear_thousands' ? MSG.unclear(fmtNum(p.thousands), fmtNum(p.decimal, 3)) : MSG.invalid);
  }
  if (integer && !Number.isInteger(n)) return fail(MSG.whole);
  if (n > max || n < min) return fail(MSG.range(min, max));
  return { value: n };
}

/** Clear a field's error without reading it (used when a field is hidden). */
export function clearField(id) { const el = $(id); if (el) fieldState(el); }

/** Analytics: event name + tool name + the pricing mode only. Never an amount, never typed text. */
export function makeTracker(toolName) {
  return (event, params) => {
    try { if (typeof window.teTrack === 'function') window.teTrack(event, Object.assign({ tool_name: toolName }, params || {})); } catch (e) { /* never break the tool */ }
  };
}

/** Chips that fill a field (percent, coats): aria-pressed follows the field. */
export function syncChips(groupId, v, empty) {
  document.querySelectorAll(`#${groupId} button`).forEach((b) => b.setAttribute('aria-pressed', String(!empty && Number(b.dataset.v) === v)));
}

/** One worksheet row. cls: '' | 'key' | 'sub' | 'total'. */
export function ln(k, small, v, cls = '', neg = false) {
  return `<div class="ln ${cls}${neg ? ' neg' : ''}"><span class="k">${k}${small ? `<small>${small}</small>` : ''}</span><span class="v">${v}</span></div>`;
}

/** Escape typed text before it goes into the page (the optional job name). */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function todayLong() {
  return new Date().toLocaleDateString(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Phones: show the price bar while the full result is off screen and there is a price to show. */
export function pricebar(resultId = 'result') {
  let visible = true;
  let cents = null;
  const sync = () => {
    const bar = $('pricebar');
    if (!bar) return;
    $('pbPrice').textContent = money(cents || 0);
    bar.classList.toggle('show', cents !== null && !visible);
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; sync(); }, { threshold: 0.15 }).observe($(resultId));
  }
  return (c) => { cents = c; sync(); };
}

export async function copyToClipboard(text, okMsg, failMsg) {
  try { await navigator.clipboard.writeText(text); $('toast').textContent = okMsg; }
  catch (e) { $('toast').textContent = failMsg; }
}

/** The address printed on a copy: the real page on talkestimate.com, never a local preview address. */
export function pageAddress() {
  return location.origin.indexOf('talkestimate.com') >= 0 ? location.origin + location.pathname : 'talkestimate.com';
}
