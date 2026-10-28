// Markup vs margin calculator (EN + ES pages share this file; the page's <html lang> picks the words).
// Everything happens in this browser tab: no request carries a typed number, and analytics events
// (only on talkestimate.com, via analytics.js) carry the tool name and mode, never an amount.
import {
  parseAmount, amountProblem, toCents, priceJob, laborCost, markupToMargin, marginToMarkup, pct1, formatMoney, MAX_CENTS,
} from './estimate-math.js';

const LANG = (document.documentElement.lang || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
const T = {
  en: {
    empty: 'Enter your job costs and a percentage to see the price.',
    needPct: { markup: 'Enter your markup % to see the price.', margin: 'Enter your target margin % to see the price.' },
    sub: { markup: (p) => `Job costs + ${p}% markup`, margin: (p) => `Priced to keep a ${p}% gross margin` },
    subOh: { markup: (p) => `Job costs + overhead + ${p}% markup`, margin: (p) => `Priced to keep ${p}% of the price after overhead` },
    unclear: (a, b) => `Is that ${a} or ${b}? Type it without the dot, or with a comma for thousands.`,
    invalid: 'Use numbers only, like 1250 or 1,250.50.',
    tooBig: 'That amount is larger than this calculator handles.',
    wholeCrew: 'Use a whole number of people.',
    pctMax: 'Use a number from 0 to 1000.',
    legend: { mat: 'Materials', lab: 'Labor', oth: 'Other job costs', oh: 'Overhead', pro: 'Left after overhead', gp: 'Gross profit' },
    rows: {
      direct: 'Direct job cost', directSmall: 'materials + labor + other',
      oh: 'Overhead share', ohSmall: (d) => d,
      gp: 'Gross profit', gpSmall: (m) => `${m}% gross margin`,
      after: 'Left after overhead', afterSmall: (m) => `${m}% of the price — not net profit`,
      mk: 'Markup on job cost',
    },
    ohDesc: { pct: (p) => `${p}% of job cost`, flat: 'flat amount' },
    callout: {
      markup: (p, m, k) => `Your <b>${p}% markup</b> is a <b>${m}% gross margin</b>.` + (k === null ? '' : ` To keep ${p}% of the price as gross profit, you'd need a <b>${k}% markup</b>.`),
      margin: (p, k, m) => `A <b>${p}% gross margin</b> needs a <b>${k}% markup</b> on cost. A ${p}% markup would only keep <b>${m}%</b> of the price.`,
      zero: 'At 0% you charge exactly your cost: no gross profit.',
      ohMargin: (p, gm, k) => `After overhead you keep <b>${p}%</b> of the price; your gross margin before overhead is <b>${gm}%</b>. That takes a <b>${k}% markup</b> on job costs + overhead.`,
      ohMarkup: (p, ao, gm) => `A ${p}% markup on job costs + overhead leaves <b>${ao}%</b> of the price after overhead (gross margin before overhead: <b>${gm}%</b>).`,
    },
    warn: {
      margin_100: 'A margin can’t be 100% or more — that would mean the job costs you nothing. Use a margin below 100%.',
      no_cost: 'Enter at least one cost to price the job.',
      below_overhead: (s) => `This price doesn’t cover the overhead you entered: you’d be ${s} short after overhead.`,
      margin_very_high: 'A 90%+ margin means a price at least 10× your cost. Did you mean markup?',
      markup_very_high: 'That markup more than quadruples your cost. Double-check the number.',
      overhead_not_in_base: { markup: 'Your markup is applied to job costs only, so the overhead comes out of your gross profit. Tick “Price on top of overhead” to cover it in the price.', margin: 'Your margin is figured on job costs only, so the overhead comes out of your gross profit. Tick “Price on top of overhead” to cover it in the price.' },
    },
    copied: 'Copied. Paste it into a text, email or your notes.',
    copyFail: 'Your browser blocked copying. Select the numbers and copy them by hand.',
    copyHead: 'Job price — TalkEstimate markup & margin calculator',
    copy: { mat: 'Materials', lab: 'Labor', oth: 'Other job costs', oh: 'Overhead', with: 'Priced with', price: 'Selling price', direct: 'Direct job cost', gp: 'Gross profit', after: 'Left after overhead', gm: 'gross margin', ofPrice: 'of price', methodMarkup: (p) => `${p}% markup`, methodMargin: (p) => `${p}% target gross margin`, onDirect: 'on job costs', onBoth: 'on job costs + overhead', note: 'Gross margin is not net profit: income tax and costs not entered here are not included.' },
    printed: (d) => `Printed ${d} · talkestimate.com/tools/markup-margin-calculator`,
  },
  es: {
    empty: 'Escribe los costos del trabajo y un porcentaje para ver el precio.',
    needPct: { markup: 'Escribe tu % de markup para ver el precio.', margin: 'Escribe el % de margen que quieres para ver el precio.' },
    sub: { markup: (p) => `Costos del trabajo + ${p}% de markup`, margin: (p) => `Precio para quedarte con ${p}% de margen bruto` },
    subOh: { markup: (p) => `Costos + gastos generales + ${p}% de markup`, margin: (p) => `Precio para quedarte con ${p}% del precio después de gastos generales` },
    unclear: (a, b) => `¿Es ${a} o ${b}? Escríbelo sin el punto, o con coma para los miles.`,
    invalid: 'Usa solo números, como 1250 o 1,250.50.',
    tooBig: 'Esa cantidad es más grande de lo que maneja esta calculadora.',
    wholeCrew: 'Usa un número entero de personas.',
    pctMax: 'Usa un número de 0 a 1000.',
    legend: { mat: 'Materiales', lab: 'Mano de obra', oth: 'Otros costos', oh: 'Gastos generales', pro: 'Queda después de gastos generales', gp: 'Ganancia bruta' },
    rows: {
      direct: 'Costo directo del trabajo', directSmall: 'materiales + mano de obra + otros',
      oh: 'Parte de gastos generales', ohSmall: (d) => d,
      gp: 'Ganancia bruta', gpSmall: (m) => `${m}% de margen bruto`,
      after: 'Queda después de gastos generales', afterSmall: (m) => `${m}% del precio — no es ganancia neta`,
      mk: 'Markup sobre el costo',
    },
    ohDesc: { pct: (p) => `${p}% del costo del trabajo`, flat: 'cantidad fija' },
    callout: {
      markup: (p, m, k) => `Tu <b>${p}% de markup</b> equivale a <b>${m}% de margen bruto</b>.` + (k === null ? '' : ` Para quedarte con ${p}% del precio como ganancia bruta, necesitas <b>${k}% de markup</b>.`),
      margin: (p, k, m) => `Un <b>${p}% de margen bruto</b> necesita <b>${k}% de markup</b> sobre el costo. Un ${p}% de markup solo te deja <b>${m}%</b> del precio.`,
      zero: 'Con 0% cobras exactamente tu costo: sin ganancia bruta.',
      ohMargin: (p, gm, k) => `Después de gastos generales te quedas con <b>${p}%</b> del precio; tu margen bruto antes de gastos generales es <b>${gm}%</b>. Eso requiere <b>${k}% de markup</b> sobre costos + gastos generales.`,
      ohMarkup: (p, ao, gm) => `Un ${p}% de markup sobre costos + gastos generales deja <b>${ao}%</b> del precio después de gastos generales (margen bruto antes de gastos generales: <b>${gm}%</b>).`,
    },
    warn: {
      margin_100: 'El margen no puede ser 100% o más — significaría que el trabajo no te cuesta nada. Usa un margen menor a 100%.',
      no_cost: 'Escribe al menos un costo para calcular el precio.',
      below_overhead: (s) => `Este precio no cubre los gastos generales que escribiste: te faltarían ${s} después de gastos generales.`,
      margin_very_high: 'Un margen de 90% o más significa un precio de al menos 10 veces tu costo. ¿Querías decir markup?',
      markup_very_high: 'Ese markup más que cuadruplica tu costo. Revisa el número.',
      overhead_not_in_base: { markup: 'Tu markup se aplica solo a los costos del trabajo, así que los gastos generales salen de tu ganancia bruta. Marca “Cobrar encima de los gastos generales” para cubrirlos en el precio.', margin: 'Tu margen se calcula solo sobre los costos del trabajo, así que los gastos generales salen de tu ganancia bruta. Marca “Cobrar encima de los gastos generales” para cubrirlos en el precio.' },
    },
    copied: 'Copiado. Pégalo en un mensaje, correo o tus notas.',
    copyFail: 'Tu navegador bloqueó la copia. Selecciona los números y cópialos a mano.',
    copyHead: 'Precio del trabajo — calculadora de markup y margen de TalkEstimate',
    copy: { mat: 'Materiales', lab: 'Mano de obra', oth: 'Otros costos', oh: 'Gastos generales', with: 'Calculado con', price: 'Precio de venta', direct: 'Costo directo', gp: 'Ganancia bruta', after: 'Queda después de gastos generales', gm: 'de margen bruto', ofPrice: 'del precio', methodMarkup: (p) => `${p}% de markup`, methodMargin: (p) => `${p}% de margen bruto`, onDirect: 'sobre los costos del trabajo', onBoth: 'sobre costos + gastos generales', note: 'El margen bruto no es ganancia neta: no incluye impuestos sobre la renta ni costos que no escribiste aquí.' },
    printed: (d) => `Impreso ${d} · talkestimate.com/es/herramientas/calculadora-markup-margen`,
  },
}[LANG];

const $ = (id) => document.getElementById(id);
const money = (c) => formatMoney(c, LANG);
const fmtPct = (p) => (p === null ? '—' : new Intl.NumberFormat(LANG === 'es' ? 'es-US' : 'en-US', { maximumFractionDigits: 1 }).format(pct1(p)));

const track = (event, params) => { try { if (typeof window.teTrack === 'function') window.teTrack(event, Object.assign({ tool_name: 'markup_margin' }, params || {})); } catch (e) { /* never break the tool */ } };

// ── Reading fields ───────────────────────────────────────────────────────────
/** Reads one field; marks it invalid with a message when it can't be read. Empty = 0 unless required. */
function readMoney(id) {
  const el = $(id);
  const raw = el.value;
  const errEl = $(id + '-err');
  const fail = (msg) => { el.setAttribute('aria-invalid', 'true'); if (errEl) errEl.textContent = msg; return { bad: true }; };
  el.removeAttribute('aria-invalid'); if (errEl) errEl.textContent = '';
  if (raw.trim() === '') return { empty: true, cents: 0 };
  const n = parseAmount(raw);
  if (n === null) {
    const p = amountProblem(raw);
    return fail(p && p.kind === 'unclear_thousands' ? T.unclear(money(toCents(p.thousands)), money(toCents(p.decimal))) : T.invalid);
  }
  const c = toCents(n);
  if (c > MAX_CENTS) return fail(T.tooBig);
  return { cents: c, value: n };
}

function readNumber(id, { integer = false, max = Infinity } = {}) {
  const el = $(id);
  const raw = el.value;
  const errEl = $(id + '-err');
  const fail = (msg) => { el.setAttribute('aria-invalid', 'true'); if (errEl) errEl.textContent = msg; return { bad: true }; };
  el.removeAttribute('aria-invalid'); if (errEl) errEl.textContent = '';
  if (raw.trim() === '') return { empty: true, value: 0 };
  const n = parseAmount(raw);
  if (n === null) {
    const p = amountProblem(raw);
    return fail(p && p.kind === 'unclear_thousands' ? T.unclear(String(p.thousands), String(p.decimal)) : T.invalid);
  }
  if (integer && !Number.isInteger(n)) return fail(T.wholeCrew);
  if (n > max) return fail(T.pctMax);
  return { value: n };
}

const mode = () => (document.querySelector('input[name=mode]:checked') || {}).value === 'margin' ? 'margin' : 'markup';
let laborHelperOn = false;

// ── Compute + render ─────────────────────────────────────────────────────────
let lastResult = null;
let completeTimer = null;
let completeSent = false;

function compute() {
  const m = mode();
  $('pct-label').textContent = $('pct-label').dataset[m];
  $('pct-hint').textContent = $('pct-hint').dataset[m];

  const mat = readMoney('mat');
  const oth = readMoney('oth');
  let lab;
  if (laborHelperOn) {
    const crew = readNumber('crew', { integer: true, max: 1000 });
    const hours = readNumber('hours', { max: 100000 });
    const rate = readMoney('rate');
    if (crew.bad || hours.bad || rate.bad) lab = { bad: true };
    else {
      const lc = laborCost({ workers: crew.empty ? 1 : crew.value, hours: hours.value, rateCents: rate.cents });
      lab = lc.ok && lc.cents <= MAX_CENTS ? { cents: lc.cents } : { bad: true };
      $('lab').value = lab.bad ? '' : (lab.cents / 100).toFixed(2);
    }
  } else {
    lab = readMoney('lab');
  }

  const ohMode = $('ohMode').value;
  $('ohVal-wrap').hidden = ohMode === 'none';
  $('ohVal-box').className = ohMode === 'pct' ? 'pct' : 'money';
  $('ohInBase-wrap').hidden = ohMode === 'none';
  let oh = { mode: 'none' };
  let ohBad = false;
  if (ohMode === 'flat') { const v = readMoney('ohVal'); ohBad = !!v.bad; oh = { mode: 'flat', cents: v.cents || 0 }; }
  else if (ohMode === 'pct') { const v = readNumber('ohVal', { max: 1000 }); ohBad = !!v.bad; oh = { mode: 'pct', pct: v.value || 0 }; }
  else { $('ohVal').removeAttribute('aria-invalid'); $('ohVal-err').textContent = ''; }

  const pct = readNumber('pct', { max: 1000 });
  syncChips(pct.value, pct.empty);

  const anyBad = mat.bad || lab.bad || oth.bad || ohBad || pct.bad;
  const anyCost = !(mat.empty && (laborHelperOn ? false : lab.empty) && oth.empty) || (laborHelperOn && lab.cents > 0);
  if (anyBad || pct.empty || !anyCost) {
    renderEmpty(anyBad ? '' : (!anyCost ? T.empty : T.needPct[m]));
    return;
  }

  const r = priceJob({
    materialsCents: mat.cents, laborCents: lab.cents, otherCents: oth.cents, overhead: oh,
    priceOn: ohMode !== 'none' && $('ohInBase').checked ? 'direct_plus_overhead' : 'direct',
    method: m, pct: pct.value,
  });
  if (!r.ok) { renderEmpty('', r.reason); return; }
  render(r, m, pct.value, oh);

  if (!completeSent && r.priceCents > 0) {
    clearTimeout(completeTimer);
    completeTimer = setTimeout(() => { if (!completeSent) { completeSent = true; track('tool_calc_complete', { calc_mode: m }); } }, 1200);
  }
}

function renderEmpty(msg, reason) {
  lastResult = null;
  $('rPrice').textContent = money(0);
  $('rPrice').classList.add('dim');
  $('rSub').textContent = msg || '';
  $('bar').innerHTML = '';
  $('legend').innerHTML = '';
  $('sheet').innerHTML = '';
  $('callout').hidden = true;
  $('warns').innerHTML = reason ? `<li class="bad">${T.warn[reason] || T.invalid}</li>` : '';
  $('copyBtn').disabled = true; $('printBtn').disabled = true;
  syncPricebar();
}

function render(r, m, pct, oh) {
  const p = fmtPct(pct);
  lastResult = { r, m, pct, oh };
  $('rPrice').classList.remove('dim');
  $('rPrice').textContent = money(r.priceCents);
  const ohInBase = r.baseCents !== r.directCents;
  $('rSub').textContent = (ohInBase ? T.subOh : T.sub)[m](p);

  // Composition bar: what the price is made of.
  const segs = [
    ['mat', r.materialsCents, 'var(--c-mat)'], ['lab', r.laborCents, 'var(--c-lab)'], ['oth', r.otherCents, 'var(--c-oth)'],
  ];
  if (r.overheadCents > 0) segs.push(['oh', Math.min(r.overheadCents, Math.max(r.grossProfitCents, 0)), 'var(--c-oh)']);
  const profitPart = r.overheadCents > 0 ? Math.max(r.afterOverheadCents, 0) : Math.max(r.grossProfitCents, 0);
  segs.push([r.overheadCents > 0 ? 'pro' : 'gp', profitPart, 'var(--c-pro)']);
  const total = Math.max(segs.reduce((a, s) => a + s[1], 0), 1);
  $('bar').innerHTML = segs.filter((s) => s[1] > 0).map((s) => `<span style="width:${(s[1] / total) * 100}%;background:${s[2]}"></span>`).join('');
  $('bar').setAttribute('aria-hidden', 'true');
  $('legend').innerHTML = segs.filter((s) => s[1] > 0).map((s) => `<span><i style="background:${s[2]}"></i>${T.legend[s[0]]} ${money(s[1])}</span>`).join('');

  const rows = [];
  rows.push(ln(T.rows.direct, T.rows.directSmall, money(r.directCents)));
  if (r.overheadCents > 0) rows.push(ln(T.rows.oh, T.rows.ohSmall(oh.mode === 'pct' ? T.ohDesc.pct(fmtPct(oh.pct)) : T.ohDesc.flat), money(r.overheadCents)));
  rows.push(ln(T.rows.gp, T.rows.gpSmall(fmtPct(r.grossMarginPct)), money(r.grossProfitCents), r.overheadCents > 0 ? '' : 'key', r.grossProfitCents < 0));
  if (r.overheadCents > 0) rows.push(ln(T.rows.after, T.rows.afterSmall(fmtPct(r.afterOverheadPct)), money(r.afterOverheadCents), 'key', r.afterOverheadCents < 0));
  if (r.markupOnDirectPct !== null) rows.push(ln(T.rows.mk, '', fmtPct(r.markupOnDirectPct) + '%'));
  $('sheet').innerHTML = rows.join('');

  // The one thing people get wrong: markup is not margin.
  if (pct === 0) { $('callout').innerHTML = T.callout.zero; }
  else if (ohInBase && m === 'margin') { $('callout').innerHTML = T.callout.ohMargin(p, fmtPct(r.grossMarginPct), fmtPct(marginToMarkup(pct))); }
  else if (ohInBase) { $('callout').innerHTML = T.callout.ohMarkup(p, fmtPct(r.afterOverheadPct), fmtPct(r.grossMarginPct)); }
  else if (m === 'markup') { const k = marginToMarkup(pct); $('callout').innerHTML = T.callout.markup(p, fmtPct(markupToMargin(pct)), k === null ? null : fmtPct(k)); }
  else { $('callout').innerHTML = T.callout.margin(p, fmtPct(marginToMarkup(pct)), fmtPct(markupToMargin(pct))); }
  $('callout').hidden = false;

  $('warns').innerHTML = r.warnings.map((w) => {
    const text = w === 'below_overhead' ? T.warn.below_overhead(money(-r.afterOverheadCents)) : w === 'overhead_not_in_base' ? T.warn[w][m] : T.warn[w];
    return `<li${w === 'below_overhead' || w === 'no_cost' ? ' class="bad"' : ''}>${text}</li>`;
  }).join('');
  $('copyBtn').disabled = false; $('printBtn').disabled = false;
  syncPricebar();
}

function ln(k, small, v, cls = '', neg = false) {
  return `<div class="ln ${cls}${neg ? ' neg' : ''}"><span class="k">${k}${small ? `<small>${small}</small>` : ''}</span><span class="v">${v}</span></div>`;
}

// ── Chips ────────────────────────────────────────────────────────────────────
function syncChips(v, empty) {
  document.querySelectorAll('#pct-chips button').forEach((b) => b.setAttribute('aria-pressed', String(!empty && Number(b.dataset.v) === v)));
}

// ── Copy / print / reset ─────────────────────────────────────────────────────
function copyText() {
  const { r, m, pct, oh } = lastResult;
  const C = T.copy;
  const lines = [T.copyHead, `${C.mat}: ${money(r.materialsCents)}`, `${C.lab}: ${money(r.laborCents)}`, `${C.oth}: ${money(r.otherCents)}`];
  if (r.overheadCents > 0) lines.push(`${C.oh}: ${money(r.overheadCents)}${oh.mode === 'pct' ? ` (${T.ohDesc.pct(fmtPct(oh.pct))})` : ''}`);
  lines.push(`${C.with}: ${m === 'markup' ? C.methodMarkup(fmtPct(pct)) : C.methodMargin(fmtPct(pct))} ${r.baseCents !== r.directCents ? C.onBoth : C.onDirect}`);
  lines.push('---');
  lines.push(`${C.price}: ${money(r.priceCents)}`);
  lines.push(`${C.direct}: ${money(r.directCents)}`);
  lines.push(`${C.gp}: ${money(r.grossProfitCents)} (${fmtPct(r.grossMarginPct)}% ${C.gm})`);
  if (r.overheadCents > 0) lines.push(`${C.after}: ${money(r.afterOverheadCents)} (${fmtPct(r.afterOverheadPct)}% ${C.ofPrice})`);
  lines.push(C.note);
  lines.push(location.origin.indexOf('talkestimate.com') >= 0 ? location.origin + location.pathname : 'talkestimate.com');
  return lines.join('\n');
}

async function doCopy() {
  if (!lastResult) return;
  const text = copyText();
  try {
    await navigator.clipboard.writeText(text);
    $('toast').textContent = T.copied;
  } catch (e) {
    $('toast').textContent = T.copyFail;
  }
  track('tool_copy');
}

function doPrint() {
  if (!lastResult) return;
  $('printStamp').textContent = T.printed(new Date().toLocaleDateString(LANG === 'es' ? 'es-US' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  track('tool_print');
  window.print();
}

function doReset() {
  ['mat', 'lab', 'oth', 'pct', 'ohVal', 'crew', 'hours', 'rate'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
  $('ohMode').value = 'none';
  $('ohInBase').checked = true;
  $('toast').textContent = '';
  compute();
  $('mat').focus();
}

function setLaborHelper(on) {
  laborHelperOn = on;
  $('labHelper').hidden = !on;
  $('lab').readOnly = on;
  $('labHelperToggle').setAttribute('aria-expanded', String(on));
  $('labHelperToggle').textContent = $('labHelperToggle').dataset[on ? 'off' : 'on'];
  if (!on) $('lab').value = '';
  compute();
}

// ── Example ──────────────────────────────────────────────────────────────────
function loadExample() {
  doReset();
  $('mat').value = '400'; $('lab').value = '600'; $('pct').value = '20';
  document.querySelector('input[name=mode][value=markup]').checked = true;
  compute();
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

// ── Wire up ──────────────────────────────────────────────────────────────────
let touched = false;
document.getElementById('calc').addEventListener('input', () => {
  if (!touched) { touched = true; track('tool_first_interaction'); }
  $('toast').textContent = '';
  compute();
});
document.getElementById('calc').addEventListener('change', compute);
document.getElementById('calc').addEventListener('submit', (e) => e.preventDefault());
document.querySelectorAll('#pct-chips button').forEach((b) => b.addEventListener('click', () => {
  $('pct').value = b.dataset.v;
  if (!touched) { touched = true; track('tool_first_interaction'); }
  compute();
}));
$('labHelperToggle').addEventListener('click', () => setLaborHelper(!laborHelperOn));
$('copyBtn').addEventListener('click', doCopy);
$('printBtn').addEventListener('click', doPrint);
$('resetBtn').addEventListener('click', doReset);
$('exampleBtn').addEventListener('click', loadExample);

// Phones: show the price bar while the full result is off screen and there is a price to show.
let resultVisible = true;
function syncPricebar() {
  const bar = $('pricebar');
  if (!bar) return;
  $('pbPrice').textContent = lastResult ? money(lastResult.r.priceCents) : money(0);
  bar.classList.toggle('show', !!lastResult && !resultVisible);
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => { resultVisible = entries[0].isIntersecting; syncPricebar(); }, { threshold: 0.15 }).observe($('result'));
}

track('tool_view');
compute();
syncPricebar();
