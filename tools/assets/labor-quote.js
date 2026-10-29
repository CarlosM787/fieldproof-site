// Labor and job quote calculator (EN + ES pages share this file; the page's <html lang> picks the words).
// Crew lines (people x hours x cost per hour) + materials, travel, disposal, other -> optional contingency and
// overhead -> markup or target margin, with a printable line-item breakdown. Nothing typed leaves this tab;
// analytics (only on talkestimate.com) gets the tool name and the pricing mode, never an amount or typed text.
import { crewLabor, quoteJob, pricePerUnit, markupToMargin, marginToMarkup } from './estimate-math.js';
import {
  LANG, $, money, fmtPct, fmtNum, readMoney, readNumber, clearField, makeTracker, syncChips, ln, esc, todayLong,
  pricebar, copyToClipboard, pageAddress,
} from './tool-ui.js';

const T = {
  en: {
    line: (n) => `Crew line ${n}`, rmLine: (n) => `Remove crew line ${n}`, remove: 'Remove',
    people: 'People', hours: 'Hours each', rate: 'Cost / hour',
    need: {
      cost: 'Enter your crew or your job costs to see the price.',
      rowIncomplete: (t) => `${t} needs both hours and a cost per hour.`,
      pct: { markup: 'Enter your markup % to see the price.', margin: 'Enter your target margin % to see the price.' },
    },
    sub: { markup: (p) => `Job cost + ${p}% markup`, margin: (p) => `Priced to keep a ${p}% gross margin` },
    subOh: { markup: (p) => `Job cost + overhead + ${p}% markup`, margin: (p) => `Priced to keep ${p}% of the price after overhead` },
    rows: {
      lab: 'Labor', labHours: (h) => `${h} crew hours`, crewLine: (w, h, r) => `${w} × ${h} h × ${r}/h`,
      crewItem: (n) => `Crew line ${n}`,
      mat: 'Materials', trav: 'Travel', disp: 'Disposal', oth: 'Other job costs',
      direct: 'Direct job cost',
      cont: 'Contingency', contSmall: (p) => `${p}% of direct cost, for the unknowns`,
      jobCost: 'Job cost', jobCostSmall: 'direct cost + contingency',
      oh: 'Overhead share', ohPct: (p) => `${p}% of direct cost`, ohFlat: 'flat amount',
      totalCost: 'Total cost', totalCostSmall: 'job cost + overhead',
      addMarkup: (p) => `Markup ${p}%`, addMargin: (p) => `Margin added for ${p}%`,
      onBoth: 'on job cost + overhead', onJob: 'on job cost',
      price: 'Selling price',
      gp: 'Gross profit', gpSmall: (m) => `${m}% gross margin · contingency counted as spent`, gpSmallNoCont: (m) => `${m}% gross margin`,
      after: 'Left after overhead', afterSmall: (m) => `${m}% of the price — not net profit`,
      unused: 'If the contingency isn’t needed', unusedSmall: 'gross profit, contingency kept',
      perHour: 'Price per crew hour', perHourSmall: 'selling price ÷ crew hours',
    },
    legend: { lab: 'Labor', mat: 'Materials', ext: 'Travel, disposal, other', cont: 'Contingency', oh: 'Overhead', pro: 'Left after overhead', gp: 'Gross profit' },
    note: {
      markup: (p, m) => `Your <b>${p}% markup</b> is a <b>${m}% gross margin</b>.`,
      margin: (p, k) => `A <b>${p}% gross margin</b> takes a <b>${k}% markup</b> on cost.`,
      zero: 'At 0% you charge exactly your cost: no gross profit.',
    },
    warn: {
      margin_100: 'A margin can’t be 100% or more — that would mean the job costs you nothing. Use a margin below 100%.',
      no_cost: 'Enter at least one cost to price the job.',
      below_overhead: (s) => `This price doesn’t cover the overhead you entered: you’d be ${s} short after overhead.`,
      margin_very_high: 'A 90%+ margin means a price at least 10× your cost. Did you mean markup?',
      markup_very_high: 'That markup more than quadruples your cost. Double-check the number.',
      contingency_very_high: 'A contingency over 50% is more than an allowance for surprises. If the job is that uncertain, price the risky part separately.',
      overhead_not_in_base: 'Your markup or margin is applied to the job cost only, so the overhead comes out of your gross profit. Tick “Price on top of overhead” to cover it in the price.',
      no_labor: 'No labor entered. If you or your crew do the work, your hours are a cost too.',
      too_big: 'Those numbers are larger than this calculator handles.',
      contingency_invalid: 'Use a contingency from 0% to 100%.',
    },
    copied: 'Copied. Paste it into a text, email or your notes.',
    copyFail: 'Your browser blocked copying. Select the numbers and copy them by hand.',
    copyHead: 'Job quote breakdown — TalkEstimate',
    copyJob: 'Job',
    copyNote: 'Gross margin is not net profit: income tax and costs not entered here are not included.',
    printed: (d) => `Printed ${d} · talkestimate.com/tools/labor-job-quote-calculator`,
    jobLine: (j) => `Job: ${j}`,
  },
  es: {
    line: (n) => `Línea de equipo ${n}`, rmLine: (n) => `Quitar línea de equipo ${n}`, remove: 'Quitar',
    people: 'Personas', hours: 'Horas c/u', rate: 'Costo / hora',
    need: {
      cost: 'Escribe tu equipo o los costos del trabajo para ver el precio.',
      rowIncomplete: (t) => `A la ${t.toLowerCase()} le faltan las horas o el costo por hora.`,
      pct: { markup: 'Escribe tu % de markup para ver el precio.', margin: 'Escribe el % de margen que quieres para ver el precio.' },
    },
    sub: { markup: (p) => `Costo del trabajo + ${p}% de markup`, margin: (p) => `Precio para quedarte con ${p}% de margen bruto` },
    subOh: { markup: (p) => `Costo + gastos generales + ${p}% de markup`, margin: (p) => `Precio para quedarte con ${p}% del precio después de gastos generales` },
    rows: {
      lab: 'Mano de obra', labHours: (h) => `${h} horas de equipo`, crewLine: (w, h, r) => `${w} × ${h} h × ${r}/h`,
      crewItem: (n) => `Línea de equipo ${n}`,
      mat: 'Materiales', trav: 'Traslado', disp: 'Escombro y basura', oth: 'Otros costos del trabajo',
      direct: 'Costo directo del trabajo',
      cont: 'Imprevistos', contSmall: (p) => `${p}% del costo directo, para lo inesperado`,
      jobCost: 'Costo del trabajo', jobCostSmall: 'costo directo + imprevistos',
      oh: 'Parte de gastos generales', ohPct: (p) => `${p}% del costo directo`, ohFlat: 'cantidad fija',
      totalCost: 'Costo total', totalCostSmall: 'costo del trabajo + gastos generales',
      addMarkup: (p) => `Markup ${p}%`, addMargin: (p) => `Margen sumado para ${p}%`,
      onBoth: 'sobre costo + gastos generales', onJob: 'sobre el costo del trabajo',
      price: 'Precio de venta',
      gp: 'Ganancia bruta', gpSmall: (m) => `${m}% de margen bruto · con los imprevistos gastados`, gpSmallNoCont: (m) => `${m}% de margen bruto`,
      after: 'Queda después de gastos generales', afterSmall: (m) => `${m}% del precio — no es ganancia neta`,
      unused: 'Si no usas los imprevistos', unusedSmall: 'ganancia bruta, con los imprevistos de vuelta',
      perHour: 'Precio por hora de equipo', perHourSmall: 'precio de venta ÷ horas de equipo',
    },
    legend: { lab: 'Mano de obra', mat: 'Materiales', ext: 'Traslado, escombro, otros', cont: 'Imprevistos', oh: 'Gastos generales', pro: 'Queda después de gastos generales', gp: 'Ganancia bruta' },
    note: {
      markup: (p, m) => `Tu <b>${p}% de markup</b> equivale a <b>${m}% de margen bruto</b>.`,
      margin: (p, k) => `Un <b>${p}% de margen bruto</b> requiere <b>${k}% de markup</b> sobre el costo.`,
      zero: 'Con 0% cobras exactamente tu costo: sin ganancia bruta.',
    },
    warn: {
      margin_100: 'El margen no puede ser 100% o más — significaría que el trabajo no te cuesta nada. Usa un margen menor a 100%.',
      no_cost: 'Escribe al menos un costo para calcular el precio.',
      below_overhead: (s) => `Este precio no cubre los gastos generales que escribiste: te faltarían ${s} después de gastos generales.`,
      margin_very_high: 'Un margen de 90% o más significa un precio de al menos 10 veces tu costo. ¿Querías decir markup?',
      markup_very_high: 'Ese markup más que cuadruplica tu costo. Revisa el número.',
      contingency_very_high: 'Unos imprevistos de más de 50% ya no son un colchón para sorpresas. Si el trabajo es tan incierto, cotiza aparte la parte riesgosa.',
      overhead_not_in_base: 'Tu markup o margen se aplica solo al costo del trabajo, así que los gastos generales salen de tu ganancia bruta. Marca “Cobrar encima de los gastos generales” para cubrirlos en el precio.',
      no_labor: 'No escribiste mano de obra. Si tú o tu equipo hacen el trabajo, sus horas también son un costo.',
      too_big: 'Esos números son más grandes de lo que maneja esta calculadora.',
      contingency_invalid: 'Usa imprevistos de 0% a 100%.',
    },
    copied: 'Copiado. Pégalo en un mensaje, correo o tus notas.',
    copyFail: 'Tu navegador bloqueó la copia. Selecciona los números y cópialos a mano.',
    copyHead: 'Desglose de la cotización — TalkEstimate',
    copyJob: 'Trabajo',
    copyNote: 'El margen bruto no es ganancia neta: no incluye impuestos sobre la renta ni costos que no escribiste aquí.',
    printed: (d) => `Impreso ${d} · talkestimate.com/es/herramientas/calculadora-mano-de-obra-cotizacion`,
    jobLine: (j) => `Trabajo: ${j}`,
  },
}[LANG];

const track = makeTracker('labor_quote');
const MAX_ROWS = 8; // one printed page holds 8 crew lines with every other line and a warning
let rowSeq = 0;

// ── Crew lines ───────────────────────────────────────────────────────────────
function addRow(focus) {
  const box = $('crewRows');
  if (box.children.length >= MAX_ROWS) return;
  const id = `c${++rowSeq}`;
  const field = (suffix, label, mode, ph, wrap) => `<div class="field"><label for="${id}-${suffix}">${label}</label><div class="${wrap}"><input type="text" id="${id}-${suffix}" inputmode="${mode}" placeholder="${ph}" aria-describedby="${id}-${suffix}-err"></div><div class="err" id="${id}-${suffix}-err" role="alert"></div></div>`;
  const row = document.createElement('div');
  row.className = 'dimrow';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-labelledby', `${id}-t`);
  row.innerHTML = `<div class="dimhead"><span class="dimtitle" id="${id}-t"></span><button type="button" class="linkish rm">${T.remove}</button></div>`
    + `<div class="row3 dims">${field('n', T.people, 'numeric', '1', 'num')}${field('h', T.hours, 'decimal', '0', 'num')}${field('r', T.rate, 'decimal', '0.00', 'money')}</div>`;
  row.querySelector('.rm').addEventListener('click', () => removeRow(row));
  box.appendChild(row);
  renumber();
  if (focus) row.querySelector('input').focus();
}

function removeRow(row) {
  const box = $('crewRows');
  const i = [...box.children].indexOf(row);
  row.remove();
  renumber();
  const left = [...box.children];
  const next = left[i] || left[i - 1];
  (next ? next.querySelector('input') : $('addCrew')).focus();
  compute();
}

function renumber() {
  const rows = [...$('crewRows').children];
  rows.forEach((row, i) => {
    row.querySelector('.dimtitle').textContent = T.line(i + 1);
    const rm = row.querySelector('.rm');
    rm.setAttribute('aria-label', T.rmLine(i + 1));
    rm.hidden = rows.length === 1;
  });
  $('addCrew').hidden = rows.length >= MAX_ROWS;
}

function readCrew() {
  const rows = [...$('crewRows').children];
  const list = [];
  let bad = false;
  let incomplete = null;
  rows.forEach((row, i) => {
    const [nEl, hEl, rEl] = row.querySelectorAll('input');
    const n = readNumber(nEl, { integer: true, max: 1000 });
    const h = readNumber(hEl, { max: 100000 });
    const r = readMoney(rEl);
    if (n.bad || h.bad || r.bad) { bad = true; return; }
    if (h.empty && r.empty) return; // a blank line (a people count alone prices nothing)
    if (h.empty || r.empty) { if (!incomplete) incomplete = T.line(i + 1); return; }
    list.push({ workers: n.empty ? 1 : n.value, hours: h.value, rateCents: r.cents, line: i + 1 });
  });
  if (bad) return { bad: true };
  if (incomplete) return { incomplete };
  return { list };
}

const mode = () => ((document.querySelector('input[name=mode]:checked') || {}).value === 'margin' ? 'margin' : 'markup');

// ── Compute ──────────────────────────────────────────────────────────────────
let last = null;
let completeSent = false;
let completeTimer = null;
const setBar = pricebar();

function compute() {
  const m = mode();
  $('pct-label').textContent = $('pct-label').dataset[m];
  $('pct-hint').textContent = $('pct-hint').dataset[m];

  const crew = readCrew();
  const mat = readMoney('mat');
  const trav = readMoney('trav');
  const disp = readMoney('disp');
  const oth = readMoney('oth');
  const cont = readNumber('cont', { max: 100 });
  const ohMode = $('ohMode').value;
  $('ohVal-wrap').hidden = ohMode === 'none';
  $('ohVal-box').className = ohMode === 'pct' ? 'pct' : 'money';
  $('ohInBase-wrap').hidden = ohMode === 'none';
  let oh = { mode: 'none' };
  let ohBad = false;
  if (ohMode === 'flat') { const v = readMoney('ohVal'); ohBad = !!v.bad; oh = { mode: 'flat', cents: v.cents || 0 }; }
  else if (ohMode === 'pct') { const v = readNumber('ohVal', { max: 1000 }); ohBad = !!v.bad; oh = { mode: 'pct', pct: v.value || 0 }; }
  else clearField('ohVal');
  const pct = readNumber('pct', { max: 1000 });
  syncChips('pct-chips', pct.value, pct.empty);

  if (crew.bad || mat.bad || trav.bad || disp.bad || oth.bad || cont.bad || ohBad || pct.bad) return renderEmpty('');
  if (crew.incomplete) return renderEmpty(T.need.rowIncomplete(crew.incomplete));
  const labor = crewLabor(crew.list);
  if (!labor.ok) return renderEmpty('', 'too_big');
  const anyCost = labor.cents > 0 || mat.cents > 0 || trav.cents > 0 || disp.cents > 0 || oth.cents > 0;
  if (!anyCost) return renderEmpty(T.need.cost);
  if (pct.empty) return renderEmpty(T.need.pct[m]);

  const r = quoteJob({
    costs: [{ id: 'lab', cents: labor.cents }, { id: 'mat', cents: mat.cents }, { id: 'trav', cents: trav.cents }, { id: 'disp', cents: disp.cents }, { id: 'oth', cents: oth.cents }],
    contingencyPct: cont.value,
    overhead: oh,
    priceOn: ohMode !== 'none' && $('ohInBase').checked ? 'cost_plus_overhead' : 'cost',
    method: m, pct: pct.value,
  });
  if (!r.ok) return renderEmpty('', r.reason);
  render(r, { m, pct: pct.value, oh, labor, crew: crew.list });

  if (!completeSent && r.priceCents > 0) {
    clearTimeout(completeTimer);
    completeTimer = setTimeout(() => { if (!completeSent) { completeSent = true; track('tool_calc_complete', { calc_mode: m }); } }, 1200);
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderEmpty(msg, reason) {
  last = null;
  $('rPrice').textContent = money(0);
  $('rPrice').classList.add('dim');
  $('rSub').textContent = msg || '';
  for (const id of ['bar', 'legend', 'sheet', 'keep']) $(id).innerHTML = '';
  $('sheetHead').hidden = true; $('keepHead').hidden = true;
  $('callout').hidden = true;
  $('warns').innerHTML = reason ? `<li class="bad">${T.warn[reason] || T.warn.too_big}</li>` : '';
  $('copyBtn').disabled = true; $('printBtn').disabled = true;
  setBar(null);
}

function render(r, ctx) {
  const { m, pct, oh, labor, crew } = ctx;
  const p = fmtPct(pct);
  const c = Object.fromEntries(r.costs.map((x) => [x.id, x.cents]));
  last = { r, ctx };
  const ohInBase = r.baseCents !== r.jobCostCents;
  $('rPrice').classList.remove('dim');
  $('rPrice').textContent = money(r.priceCents);
  $('rSub').textContent = (ohInBase ? T.subOh : T.sub)[m](p);

  const segs = [['lab', c.lab, 'var(--c-lab)'], ['mat', c.mat, 'var(--c-mat)'], ['ext', c.trav + c.disp + c.oth, 'var(--c-oth)'], ['cont', r.contingencyCents, 'var(--c-cont)']];
  if (r.overheadCents > 0) segs.push(['oh', Math.min(r.overheadCents, Math.max(r.grossProfitCents, 0)), 'var(--c-oh)']);
  segs.push([r.overheadCents > 0 ? 'pro' : 'gp', Math.max(r.overheadCents > 0 ? r.afterOverheadCents : r.grossProfitCents, 0), 'var(--c-pro)']);
  const shown = segs.filter((s) => s[1] > 0);
  const total = Math.max(shown.reduce((a, s) => a + s[1], 0), 1);
  $('bar').innerHTML = shown.map((s) => `<span style="width:${(s[1] / total) * 100}%;background:${s[2]}"></span>`).join('');
  $('bar').setAttribute('aria-hidden', 'true');
  $('legend').innerHTML = shown.map((s) => `<span><i style="background:${s[2]}"></i>${T.legend[s[0]]} ${money(s[1])}</span>`).join('');

  // The line-item breakdown (what prints).
  const R = T.rows;
  const rows = [];
  const lineDesc = (x) => R.crewLine(fmtNum(x.workers), fmtNum(x.hours), money(x.rateCents));
  if (crew.length === 1) rows.push(ln(R.lab, `${lineDesc(crew[0])} · ${R.labHours(fmtNum(labor.crewHours))}`, money(c.lab)));
  else if (crew.length > 1) {
    rows.push(ln(R.lab, R.labHours(fmtNum(labor.crewHours)), money(c.lab)));
    crew.forEach((x, i) => rows.push(ln(`<span class="indent">${R.crewItem(x.line)}</span>`, `<span class="indent">${lineDesc(x)}</span>`, money(labor.lines[i].cents), 'item')));
  }
  for (const k of ['mat', 'trav', 'disp', 'oth']) if (c[k] > 0) rows.push(ln(R[k], '', money(c[k])));
  rows.push(ln(R.direct, '', money(r.directCents), 'sub'));
  if (r.contingencyCents > 0) {
    rows.push(ln(R.cont, R.contSmall(fmtPct(r.contingencyPct)), money(r.contingencyCents)));
    rows.push(ln(R.jobCost, R.jobCostSmall, money(r.jobCostCents), 'sub'));
  }
  if (r.overheadCents > 0) {
    rows.push(ln(R.oh, oh.mode === 'pct' ? R.ohPct(fmtPct(oh.pct)) : R.ohFlat, money(r.overheadCents)));
    rows.push(ln(R.totalCost, R.totalCostSmall, money(r.totalCostCents), 'sub'));
  }
  rows.push(ln(m === 'markup' ? R.addMarkup(p) : R.addMargin(p), ohInBase ? R.onBoth : R.onJob, money(r.priceCents - r.baseCents)));
  rows.push(ln(R.price, '', money(r.priceCents), 'total'));
  $('sheetHead').hidden = false;
  $('sheet').innerHTML = rows.join('');

  const keep = [];
  keep.push(ln(R.gp, (r.contingencyCents > 0 ? R.gpSmall : R.gpSmallNoCont)(fmtPct(r.grossMarginPct)), money(r.grossProfitCents), r.overheadCents > 0 ? '' : 'key', r.grossProfitCents < 0));
  if (r.overheadCents > 0) keep.push(ln(R.after, R.afterSmall(fmtPct(r.afterOverheadPct)), money(r.afterOverheadCents), 'key', r.afterOverheadCents < 0));
  if (r.contingencyCents > 0) keep.push(ln(R.unused, R.unusedSmall, money(r.grossProfitIfUnusedCents)));
  const perHour = pricePerUnit(r.priceCents, labor.crewHours);
  if (perHour !== null) keep.push(ln(R.perHour, R.perHourSmall, money(perHour)));
  $('keepHead').hidden = false;
  $('keep').innerHTML = keep.join('');

  if (pct === 0) { $('callout').innerHTML = T.note.zero; $('callout').hidden = false; }
  else if (!ohInBase) {
    if (m === 'markup') $('callout').innerHTML = T.note.markup(p, fmtPct(markupToMargin(pct)));
    else { const k = marginToMarkup(pct); $('callout').innerHTML = k === null ? '' : T.note.margin(p, fmtPct(k)); }
    $('callout').hidden = !$('callout').innerHTML;
  } else $('callout').hidden = true;

  const w = [];
  if (c.lab === 0) w.push(`<li>${T.warn.no_labor}</li>`);
  for (const k of r.warnings) {
    const text = k === 'below_overhead' ? T.warn.below_overhead(money(-r.afterOverheadCents)) : T.warn[k];
    if (text) w.push(`<li${k === 'below_overhead' || k === 'no_cost' ? ' class="bad"' : ''}>${text}</li>`);
  }
  $('warns').innerHTML = w.join('');
  $('copyBtn').disabled = false; $('printBtn').disabled = false;
  setBar(r.priceCents);
}

// ── Copy / print / reset / example ───────────────────────────────────────────
function copyText() {
  const lines = [T.copyHead];
  const job = $('jobName').value.trim();
  if (job) lines.push(`${T.copyJob}: ${job}`);
  for (const row of document.querySelectorAll('#sheet .ln, #keep .ln')) {
    const kEl = row.querySelector('.k');
    const k = kEl.childNodes[0].textContent;
    const small = kEl.querySelector('small');
    lines.push(`${row.classList.contains('item') ? '  ' : ''}${k}${small ? ` (${small.textContent})` : ''}: ${row.querySelector('.v').textContent}`);
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
  const job = $('jobName').value.trim();
  $('printStamp').innerHTML = (job ? `<b>${esc(T.jobLine(job))}</b><br>` : '') + esc(T.printed(todayLong()));
  track('tool_print');
  window.print();
}

function doReset(skipFocus) {
  document.querySelectorAll('#calc input[type=text]').forEach((el) => { el.value = ''; });
  $('crewRows').innerHTML = '';
  addRow();
  $('ohMode').value = 'none';
  $('ohInBase').checked = true;
  $('toast').textContent = '';
  compute();
  if (!skipFocus) $('crewRows').querySelector('input').focus();
}

// Example: replacing a 12 × 8 ft section of rotted siding. Every number is an example, not a market price.
function loadExample() {
  doReset(true);
  const set = (row, vals) => row.querySelectorAll('input').forEach((el, i) => { el.value = vals[i]; });
  set($('crewRows').children[0], ['1', '9', '42']);
  addRow(); set($('crewRows').children[1], ['1', '9', '24']);
  $('mat').value = '310'; $('trav').value = '36'; $('disp').value = '55';
  $('cont').value = '10';
  $('ohMode').value = 'pct'; $('ohVal').value = '15'; $('ohInBase').checked = true;
  document.querySelector('input[name=mode][value=markup]').checked = true;
  $('pct').value = '30';
  compute();
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

// ── Wire up ──────────────────────────────────────────────────────────────────
let touched = false;
const firstTouch = () => { if (!touched) { touched = true; track('tool_first_interaction'); } };
$('calc').addEventListener('input', () => { firstTouch(); $('toast').textContent = ''; compute(); });
$('calc').addEventListener('change', compute);
$('calc').addEventListener('submit', (e) => e.preventDefault());
document.querySelectorAll('#pct-chips button').forEach((b) => b.addEventListener('click', () => { $('pct').value = b.dataset.v; firstTouch(); compute(); }));
$('addCrew').addEventListener('click', () => { addRow(true); compute(); });
$('copyBtn').addEventListener('click', doCopy);
$('printBtn').addEventListener('click', doPrint);
$('resetBtn').addEventListener('click', () => doReset());
$('exampleBtn').addEventListener('click', loadExample);

addRow();
track('tool_view');
compute();
