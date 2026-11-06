// Labor cost per hour calculator (EN + ES pages share this file; the page's <html lang> picks the words).
// A year of pay + payroll taxes + workers' comp + other costs, divided by the hours you actually bill:
// what one billable hour of a worker costs you. That number is the "cost / hour" the job quote calculator asks for.
// Nothing typed leaves this tab; analytics (only on talkestimate.com) gets the tool name, never an amount or typed text.
import { laborHourCost } from './estimate-math.js';
import {
  LANG, $, money, fmtPct, fmtNum, readMoney, readNumber, makeTracker, syncChips, ln, esc, todayLong,
  pricebar, copyToClipboard, pageAddress, FIX_MSG, revealInvalid, keepFocusAboveBar, makeErrorReporter,
} from './tool-ui.js';

const T = {
  en: {
    need: {
      wage: 'Enter the hourly wage to see what an hour costs you.',
      paid: 'Enter the hours you pay in a year.',
      billable: 'Enter the hours that end up on a job you charge for.',
    },
    sub: (w) => `Wage ${w}/h plus everything you pay on top, spread over billable hours`,
    rows: {
      pay: 'Yearly pay', paySmall: (w, h) => `${w}/h × ${h} paid hours`,
      tax: 'Payroll taxes', taxSmall: (p) => `${p}% of pay`,
      comp: 'Workers’ comp', compSmall: (r) => `${r} per $100 of pay`,
      other: 'Other yearly costs', otherSmall: 'benefits, phone, tools you provide',
      total: 'What this worker costs you a year',
      billable: 'Billable hours', billableSmall: (u) => `${u} paid hours are not billed`,
      perHour: 'Cost per billable hour', perHourSmall: 'yearly cost ÷ billable hours',
      onCost: 'Paid on top of wages', onCostSmall: 'payroll taxes + comp + other, as a % of pay',
      unbilled: 'Paid hours nobody is billed for', unbilledSmall: 'adds this much to every billable hour',
      above: 'Above the wage', aboveSmall: 'cost per billable hour vs the hourly wage',
      hrs: (n) => `${n} h`,
    },
    callout: (c) => `Use <b>${c}</b> as this worker’s <b>cost per hour</b> in the <a href="/tools/labor-job-quote-calculator" data-cta="rate_to_quote">labor and job quote calculator</a>. It is a cost, not your billing rate: overhead and your markup go on top there.`,
    warn: {
      no_cost: 'Everything is $0: enter the wage to see a cost.',
      billable_over_paid: 'Billable hours can’t be more than paid hours: every hour you bill is also an hour you pay.',
      billable_low: 'Fewer than half the paid hours are billed. If that’s right, it is the biggest thing to fix in your pricing.',
      no_payroll_tax: 'No payroll taxes entered. For an employee you pay at least Social Security and Medicare (7.65% of pay), plus unemployment tax.',
      tax_very_high: 'Payroll taxes over 30% of pay are unusual. Check the number with your payroll records.',
      comp_very_high: 'A workers’ comp rate over $40 per $100 of pay is unusual. Check your policy.',
      too_big: 'Those numbers are larger than this calculator handles.',
      paid_hours_invalid: 'Paid hours must be from 1 to 8,784 (every hour of a year).',
      billable_invalid: 'Billable hours must be from 1 to 8,784.',
    },
    copied: 'Copied. Paste it into a text, email or your notes.',
    copyFail: 'Your browser blocked copying. Select the numbers and copy them by hand.',
    copyHead: 'Labor cost per hour — TalkEstimate',
    copyWorker: 'Worker',
    copyNote: 'This is a cost, not a billing rate: overhead and markup are not in it.',
    printed: (d) => `Printed ${d} · talkestimate.com/tools/labor-cost-per-hour-calculator`,
    workerLine: (j) => `Worker: ${j}`,
  },
  es: {
    need: {
      wage: 'Escribe el sueldo por hora para ver lo que te cuesta una hora.',
      paid: 'Escribe las horas que pagas en un año.',
      billable: 'Escribe las horas que terminan en un trabajo que cobras.',
    },
    sub: (w) => `Sueldo de ${w}/h más todo lo que pagas encima, repartido en las horas que cobras`,
    rows: {
      pay: 'Sueldo del año', paySmall: (w, h) => `${w}/h × ${h} horas pagadas`,
      tax: 'Impuestos de nómina', taxSmall: (p) => `${p}% del sueldo`,
      comp: 'Seguro de accidentes (workers’ comp)', compSmall: (r) => `${r} por cada $100 de sueldo`,
      other: 'Otros costos del año', otherSmall: 'prestaciones, teléfono, herramienta que pones',
      total: 'Lo que te cuesta esta persona al año',
      billable: 'Horas que cobras', billableSmall: (u) => `${u} horas pagadas no se cobran`,
      perHour: 'Costo por hora cobrada', perHourSmall: 'costo del año ÷ horas que cobras',
      onCost: 'Lo que pagas encima del sueldo', onCostSmall: 'impuestos + seguro + otros, como % del sueldo',
      unbilled: 'Horas pagadas que no cobras', unbilledSmall: 'esto se suma a cada hora que cobras',
      above: 'Arriba del sueldo', aboveSmall: 'costo por hora cobrada vs el sueldo por hora',
      hrs: (n) => `${n} h`,
    },
    callout: (c) => `Usa <b>${c}</b> como el <b>costo por hora</b> de esta persona en la <a href="/es/herramientas/calculadora-mano-de-obra-cotizacion" data-cta="rate_to_quote">calculadora de mano de obra y cotización</a>. Es un costo, no lo que cobras: los gastos generales y tu markup van encima allí.`,
    warn: {
      no_cost: 'Todo está en $0: escribe el sueldo para ver un costo.',
      billable_over_paid: 'Las horas que cobras no pueden ser más que las horas pagadas: cada hora que cobras también la pagas.',
      billable_low: 'Cobras menos de la mitad de las horas que pagas. Si es así, es lo primero que hay que arreglar en tus precios.',
      no_payroll_tax: 'No escribiste impuestos de nómina. Por un empleado pagas al menos Seguro Social y Medicare (7.65% del sueldo), más el impuesto de desempleo.',
      tax_very_high: 'Impuestos de nómina de más de 30% del sueldo no son comunes. Revisa el número con tu nómina.',
      comp_very_high: 'Un seguro de accidentes de más de $40 por cada $100 de sueldo no es común. Revisa tu póliza.',
      too_big: 'Esos números son más grandes de lo que maneja esta calculadora.',
      paid_hours_invalid: 'Las horas pagadas van de 1 a 8,784 (todas las horas de un año).',
      billable_invalid: 'Las horas que cobras van de 1 a 8,784.',
    },
    copied: 'Copiado. Pégalo en un mensaje, correo o tus notas.',
    copyFail: 'Tu navegador bloqueó la copia. Selecciona los números y cópialos a mano.',
    copyHead: 'Costo de mano de obra por hora — TalkEstimate',
    copyWorker: 'Persona',
    copyNote: 'Es un costo, no lo que cobras: no incluye gastos generales ni markup.',
    printed: (d) => `Impreso ${d} · talkestimate.com/es/herramientas/calculadora-costo-hora-mano-de-obra`,
    workerLine: (j) => `Persona: ${j}`,
  },
}[LANG];

const track = makeTracker('labor_rate');
const reportInputError = makeErrorReporter(track);
const setBar = pricebar();
let last = null;
let completeSent = false;
let completeTimer = null;

function compute() {
  const wage = readMoney('wage');
  const paid = readNumber('paid', { min: 0, max: 8784 });
  const billable = readNumber('billable', { min: 0, max: 8784 });
  const tax = readNumber('tax', { max: 100 });
  const comp = readNumber('comp', { max: 100 });
  const other = readMoney('other');
  syncChips('paid-chips', paid.value, paid.empty);
  syncChips('tax-chips', tax.value, tax.empty);

  if (wage.bad || paid.bad || billable.bad || tax.bad || comp.bad || other.bad) { revealInvalid(); reportInputError(); return renderEmpty(FIX_MSG); }
  if (wage.empty) return renderEmpty(T.need.wage);
  if (paid.empty) return renderEmpty(T.need.paid);
  if (billable.empty) return renderEmpty(T.need.billable);
  if (billable.value > paid.value) {
    // An inline error on the field, like any other bad entry: a cost below the wage would underquote every job.
    $('billable').setAttribute('aria-invalid', 'true');
    $('billable-err').textContent = T.warn.billable_over_paid;
    reportInputError();
    return renderEmpty(FIX_MSG);
  }

  const r = laborHourCost({
    wageCents: wage.cents, paidHours: paid.value, billableHours: billable.value,
    payrollTaxPct: tax.value, compPer100: comp.value, otherYearCents: other.cents,
  });
  if (!r.ok) return renderEmpty('', r.reason);
  render(r, { wageCents: wage.cents, tax: tax.value, comp: comp.value });

  if (!completeSent && r.perHourCents > 0) {
    clearTimeout(completeTimer);
    completeTimer = setTimeout(() => { if (!completeSent) { completeSent = true; track('tool_calc_complete'); } }, 1200);
  }
}

function renderEmpty(msg, reason) {
  last = null;
  $('rPrice').textContent = money(0);
  $('rPrice').classList.add('dim');
  $('rSub').textContent = msg || '';
  for (const id of ['bar', 'legend', 'sheet', 'why']) $(id).innerHTML = '';
  $('sheetHead').hidden = true; $('whyHead').hidden = true;
  $('callout').hidden = true;
  $('warns').innerHTML = reason ? `<li class="bad">${T.warn[reason] || T.warn.too_big}</li>` : '';
  $('copyBtn').disabled = true; $('printBtn').disabled = true;
  setBar(null);
}

function render(r, ctx) {
  const R = T.rows;
  last = { r, ctx };
  $('rPrice').classList.remove('dim');
  $('rPrice').textContent = money(r.perHourCents);
  $('rSub').textContent = T.sub(money(ctx.wageCents));

  // What an hour is made of: the wage share, the on-costs, and the share paid for unbilled hours.
  const perBillable = (c) => c / r.billableHours;
  const wagePart = ctx.wageCents;                                     // the wage itself, for one hour
  const unbilledPart = Math.max(perBillable(r.wagesCents) - wagePart, 0); // wages for hours nobody pays for
  const onCostPart = perBillable(r.taxCents + r.compCents + r.otherCents);
  const segs = [['wage', wagePart, 'var(--c-lab)'], ['unb', unbilledPart, 'var(--c-oth)'], ['on', onCostPart, 'var(--c-oh)']].filter((s) => s[1] > 0);
  const total = Math.max(segs.reduce((a, s) => a + s[1], 0), 1);
  const L = LANG === 'es' ? { wage: 'Sueldo', unb: 'Horas sin cobrar', on: 'Impuestos, seguro, otros' } : { wage: 'Wage', unb: 'Unbilled hours', on: 'Taxes, comp, other' };
  $('bar').innerHTML = segs.map((s) => `<span style="width:${(s[1] / total) * 100}%;background:${s[2]}"></span>`).join('');
  $('bar').setAttribute('aria-hidden', 'true');
  $('legend').innerHTML = segs.map((s) => `<span><i style="background:${s[2]}"></i>${L[s[0]]} ${money(Math.round(s[1]))}</span>`).join('');

  const rows = [];
  rows.push(ln(R.pay, R.paySmall(money(ctx.wageCents), fmtNum(r.paidHours)), money(r.wagesCents)));
  if (r.taxCents > 0) rows.push(ln(R.tax, R.taxSmall(fmtPct(ctx.tax)), money(r.taxCents)));
  if (r.compCents > 0) rows.push(ln(R.comp, R.compSmall(money(Math.round(ctx.comp * 100))), money(r.compCents)));
  if (r.otherCents > 0) rows.push(ln(R.other, R.otherSmall, money(r.otherCents)));
  rows.push(ln(R.total, '', money(r.totalCents), 'sub'));
  rows.push(ln(R.billable, r.unbilledHours > 0 ? R.billableSmall(fmtNum(r.unbilledHours)) : '', R.hrs(fmtNum(r.billableHours))));
  rows.push(ln(R.perHour, R.perHourSmall, money(r.perHourCents), 'total'));
  $('sheetHead').hidden = false;
  $('sheet').innerHTML = rows.join('');

  const why = [];
  if (r.onCostPct !== null) why.push(ln(R.onCost, R.onCostSmall, fmtPct(r.onCostPct) + '%'));
  if (r.unbilledPct > 0) why.push(ln(R.unbilled, R.unbilledSmall, fmtPct(r.unbilledPct) + '%'));
  if (r.aboveWagePct !== null) why.push(ln(R.above, R.aboveSmall, fmtPct(r.aboveWagePct) + '%', 'sub'));
  $('whyHead').hidden = why.length === 0;
  $('why').innerHTML = why.join('');

  $('callout').innerHTML = T.callout(money(r.perHourCents));
  $('callout').hidden = false;
  $('warns').innerHTML = r.warnings.map((w) => `<li${w === 'no_cost' ? ' class="bad"' : ''}>${T.warn[w]}</li>`).join('');
  $('copyBtn').disabled = false; $('printBtn').disabled = false;
  setBar(r.perHourCents);
}

// ── Copy / print / reset / example ───────────────────────────────────────────
function copyText() {
  const lines = [T.copyHead];
  const who = $('workerName').value.trim();
  if (who) lines.push(`${T.copyWorker}: ${who}`);
  for (const row of document.querySelectorAll('#sheet .ln, #why .ln')) {
    const kEl = row.querySelector('.k');
    const small = kEl.querySelector('small');
    lines.push(`${kEl.childNodes[0].textContent}${small ? ` (${small.textContent})` : ''}: ${row.querySelector('.v').textContent}`);
  }
  lines.push(T.copyNote);
  lines.push(pageAddress());
  return lines.join('\n');
}

async function doCopy() {
  if (!last) return;
  await copyToClipboard(copyText(), T.copied, T.copyFail);
  track('tool_copy');
}

function doPrint() {
  if (!last) return;
  const who = $('workerName').value.trim();
  $('printStamp').innerHTML = (who ? `<b>${esc(T.workerLine(who))}</b><br>` : '') + esc(T.printed(todayLong()));
  track('tool_print');
  window.print();
}

function doReset(skipFocus) {
  document.querySelectorAll('#calc input[type=text]').forEach((el) => { el.value = ''; });
  $('toast').textContent = '';
  compute();
  if (!skipFocus) $('wage').focus();
}

// Example: the lead from the labor guide. Every number is an example, not a market rate.
function loadExample() {
  doReset(true);
  $('wage').value = '28'; $('paid').value = '2080'; $('billable').value = '1664';
  $('tax').value = '9'; $('comp').value = '9'; $('other').value = '1500';
  compute();
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

// ── Wire up ──────────────────────────────────────────────────────────────────
let touched = false;
const firstTouch = () => { if (!touched) { touched = true; track('tool_first_interaction'); } };
$('calc').addEventListener('input', () => { firstTouch(); $('toast').textContent = ''; compute(); });
$('calc').addEventListener('change', compute);
$('calc').addEventListener('submit', (e) => e.preventDefault());
for (const [group, field] of [['paid-chips', 'paid'], ['tax-chips', 'tax']]) {
  document.querySelectorAll(`#${group} button`).forEach((b) => b.addEventListener('click', () => { $(field).value = b.dataset.v; firstTouch(); compute(); }));
}
$('copyBtn').addEventListener('click', doCopy);
$('printBtn').addEventListener('click', doPrint);
$('resetBtn').addEventListener('click', () => doReset());
$('exampleBtn').addEventListener('click', () => { firstTouch(); loadExample(); });

track('tool_view');
compute();
keepFocusAboveBar();
