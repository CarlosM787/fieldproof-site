// Painting estimate calculator (EN + ES pages share this file; the page's <html lang> picks the words).
// Area -> coats -> gallons (rounded UP to whole gallons) -> the contractor's own paint price, materials and labor
// -> markup or target margin. No coverage or price is filled in for you. Nothing typed leaves this tab; analytics
// (only on talkestimate.com) gets the tool name and the pricing mode, never an amount or typed text.
import { paintQuantities, laborCost, lineTotal, quoteJob, pricePerUnit, markupToMargin, marginToMarkup, MAX_CENTS } from './estimate-math.js';
import {
  LANG, $, money, fmtPct, fmtNum, readMoney, readNumber, clearField, makeTracker, syncChips, ln, esc, todayLong,
  pricebar, copyToClipboard, pageAddress,
} from './tool-ui.js';

const T = {
  en: {
    wall: (n) => `Wall ${n}`, opening: (n) => `Door or window ${n}`,
    rmWall: (n) => `Remove wall ${n}`, rmOpening: (n) => `Remove door or window ${n}`, remove: 'Remove',
    width: 'Width', height: 'Height', count: 'How many', ft: 'ft',
    need: {
      area: 'Enter the wall sizes, or switch to the total area.',
      areaTotal: 'Enter the total wall area in square feet.',
      rowIncomplete: (t) => `${t} needs both a width and a height.`,
      coats: 'Enter how many coats.',
      coverage: 'Enter the coverage from your paint’s label (square feet per gallon).',
      ppg: 'Enter what you pay per gallon to price the paint.',
      pct: { markup: 'Enter your markup % to see the price.', margin: 'Enter your target margin % to see the price.' },
    },
    sub: { markup: (p) => `Job costs + ${p}% markup`, margin: (p) => `Priced to keep a ${p}% gross margin` },
    subOh: { markup: (p) => `Job costs + overhead + ${p}% markup`, margin: (p) => `Priced to keep ${p}% of the price after overhead` },
    qtyHead: 'Paint you need',
    costHead: 'Cost and price',
    q: {
      gross: 'Wall area', grossWalls: (n) => (n === 1 ? '1 wall measured' : `${n} walls measured`), grossTotal: 'total you entered',
      open: 'Doors and windows', openSmall: (n) => (n === 1 ? '1 opening, not painted' : `${n} openings, not painted`),
      paintable: 'Paintable area',
      coat: 'Area to cover', coatSmall: (c) => `× ${c} ${c === 1 ? 'coat' : 'coats'}`,
      exact: 'Paint needed', exactSmall: (cov, w) => `÷ ${cov} sq ft per gallon${w > 0 ? ` + ${w}% extra` : ''}`,
      buy: 'Gallons to buy', buySmall: 'rounded up to whole gallons',
      sqft: (n) => `${n} sq ft`, gal: (n) => `${n} gal`,
    },
    rows: {
      paint: 'Paint', paintSmall: (g, p) => `${g} gal × ${p}`,
      mat: 'Other materials', lab: 'Labor', labSmall: (w, h, r) => `${w} × ${h} h × ${r}/h`,
      direct: 'Direct job cost', directSmall: 'paint + materials + labor',
      oh: 'Overhead share', ohPct: (p) => `${p}% of job cost`, ohFlat: 'flat amount',
      price: 'Selling price',
      gp: 'Gross profit', gpSmall: (m) => `${m}% gross margin`,
      after: 'Left after overhead', afterSmall: (m) => `${m}% of the price — not net profit`,
      mk: 'Markup on job cost',
      perSqft: 'Price per paintable sq ft',
    },
    legend: { paint: 'Paint', mat: 'Materials', lab: 'Labor', oh: 'Overhead', pro: 'Left after overhead', gp: 'Gross profit' },
    leftover: (need, buy, left) => `You need <b>${need} gal</b>, so you buy <b>${buy} gal</b>: paint comes in whole gallons here, so the count is rounded up. About <b>${left} gal</b> is left for touch-ups.`,
    exactBuy: (buy) => `You need exactly <b>${buy} gal</b>, so nothing is rounded up.`,
    mmNote: {
      markup: (p, m) => ` Your ${p}% markup is a <b>${m}% gross margin</b>.`,
      margin: (p, k) => ` A ${p}% gross margin takes a <b>${k}% markup</b> on cost.`,
    },
    warn: {
      openings_exceed_area: 'The doors and windows add up to more than the wall area. Check the measurements.',
      coverage_invalid: 'Coverage can’t be 0. Use the square feet per gallon from your paint’s label.',
      coats_invalid: 'Use a whole number of coats from 1 to 10.',
      no_area: 'There is nothing left to paint: the paintable area is 0.',
      margin_100: 'A margin can’t be 100% or more — that would mean the job costs you nothing. Use a margin below 100%.',
      no_cost: 'Enter at least one cost to price the job.',
      below_overhead: (s) => `This price doesn’t cover the overhead you entered: you’d be ${s} short after overhead.`,
      margin_very_high: 'A 90%+ margin means a price at least 10× your cost. Did you mean markup?',
      markup_very_high: 'That markup more than quadruples your cost. Double-check the number.',
      overhead_not_in_base: 'Your markup or margin is applied to job costs only, so the overhead comes out of your gross profit. Tick “Price on top of overhead” to cover it in the price.',
      ppg_zero: 'Paint at $0 per gallon: fine if the customer supplies it, otherwise enter what you pay.',
      too_big: 'Those numbers are larger than this calculator handles.',
    },
    copied: 'Copied. Paste it into a text, email or your notes.',
    copyFail: 'Your browser blocked copying. Select the numbers and copy them by hand.',
    copyHead: 'Painting estimate — TalkEstimate',
    copy: { job: 'Job', with: 'Priced with', methodMarkup: (p) => `${p}% markup`, methodMargin: (p) => `${p}% target gross margin`, onDirect: 'on job costs', onBoth: 'on job costs + overhead', note: 'Gross margin is not net profit: income tax and costs not entered here are not included.' },
    printed: (d) => `Printed ${d} · talkestimate.com/tools/painting-estimate-calculator`,
    jobLine: (j) => `Job: ${j}`,
  },
  es: {
    wall: (n) => `Pared ${n}`, opening: (n) => `Puerta o ventana ${n}`,
    rmWall: (n) => `Quitar pared ${n}`, rmOpening: (n) => `Quitar puerta o ventana ${n}`, remove: 'Quitar',
    width: 'Ancho', height: 'Alto', count: 'Cuántas', ft: 'pies',
    need: {
      area: 'Escribe las medidas de las paredes, o cambia al área total.',
      areaTotal: 'Escribe el área total de paredes en pies cuadrados.',
      rowIncomplete: (t) => `A la ${t.toLowerCase()} le falta el ancho o el alto.`,
      coats: 'Escribe cuántas manos (capas) vas a dar.',
      coverage: 'Escribe el rendimiento que dice la etiqueta de tu pintura (pies cuadrados por galón).',
      ppg: 'Escribe lo que pagas por galón para calcular la pintura.',
      pct: { markup: 'Escribe tu % de markup para ver el precio.', margin: 'Escribe el % de margen que quieres para ver el precio.' },
    },
    sub: { markup: (p) => `Costos del trabajo + ${p}% de markup`, margin: (p) => `Precio para quedarte con ${p}% de margen bruto` },
    subOh: { markup: (p) => `Costos + gastos generales + ${p}% de markup`, margin: (p) => `Precio para quedarte con ${p}% del precio después de gastos generales` },
    qtyHead: 'Pintura que necesitas',
    costHead: 'Costo y precio',
    q: {
      gross: 'Área de paredes', grossWalls: (n) => (n === 1 ? '1 pared medida' : `${n} paredes medidas`), grossTotal: 'el total que escribiste',
      open: 'Puertas y ventanas', openSmall: (n) => (n === 1 ? '1 hueco, no se pinta' : `${n} huecos, no se pintan`),
      paintable: 'Área a pintar',
      coat: 'Área a cubrir', coatSmall: (c) => `× ${c} ${c === 1 ? 'mano' : 'manos'}`,
      exact: 'Pintura necesaria', exactSmall: (cov, w) => `÷ ${cov} pies² por galón${w > 0 ? ` + ${w}% extra` : ''}`,
      buy: 'Galones a comprar', buySmall: 'redondeado hacia arriba a galones enteros',
      sqft: (n) => `${n} pies²`, gal: (n) => `${n} gal`,
    },
    rows: {
      paint: 'Pintura', paintSmall: (g, p) => `${g} gal × ${p}`,
      mat: 'Otros materiales', lab: 'Mano de obra', labSmall: (w, h, r) => `${w} × ${h} h × ${r}/h`,
      direct: 'Costo directo del trabajo', directSmall: 'pintura + materiales + mano de obra',
      oh: 'Parte de gastos generales', ohPct: (p) => `${p}% del costo del trabajo`, ohFlat: 'cantidad fija',
      price: 'Precio de venta',
      gp: 'Ganancia bruta', gpSmall: (m) => `${m}% de margen bruto`,
      after: 'Queda después de gastos generales', afterSmall: (m) => `${m}% del precio — no es ganancia neta`,
      mk: 'Markup sobre el costo',
      perSqft: 'Precio por pie² a pintar',
    },
    legend: { paint: 'Pintura', mat: 'Materiales', lab: 'Mano de obra', oh: 'Gastos generales', pro: 'Queda después de gastos generales', gp: 'Ganancia bruta' },
    leftover: (need, buy, left) => `Necesitas <b>${need} gal</b>, así que compras <b>${buy} gal</b>: aquí la pintura se cuenta en galones enteros, así que se redondea hacia arriba. Te sobran como <b>${left} gal</b> para retoques.`,
    exactBuy: (buy) => `Necesitas exactamente <b>${buy} gal</b>, así que no se redondea nada.`,
    mmNote: {
      markup: (p, m) => ` Tu ${p}% de markup equivale a <b>${m}% de margen bruto</b>.`,
      margin: (p, k) => ` Un ${p}% de margen bruto requiere <b>${k}% de markup</b> sobre el costo.`,
    },
    warn: {
      openings_exceed_area: 'Las puertas y ventanas suman más que el área de las paredes. Revisa las medidas.',
      coverage_invalid: 'El rendimiento no puede ser 0. Usa los pies cuadrados por galón de la etiqueta de tu pintura.',
      coats_invalid: 'Usa un número entero de manos, de 1 a 10.',
      no_area: 'No queda nada que pintar: el área a pintar es 0.',
      margin_100: 'El margen no puede ser 100% o más — significaría que el trabajo no te cuesta nada. Usa un margen menor a 100%.',
      no_cost: 'Escribe al menos un costo para calcular el precio.',
      below_overhead: (s) => `Este precio no cubre los gastos generales que escribiste: te faltarían ${s} después de gastos generales.`,
      margin_very_high: 'Un margen de 90% o más significa un precio de al menos 10 veces tu costo. ¿Querías decir markup?',
      markup_very_high: 'Ese markup más que cuadruplica tu costo. Revisa el número.',
      overhead_not_in_base: 'Tu markup o margen se aplica solo a los costos del trabajo, así que los gastos generales salen de tu ganancia bruta. Marca “Cobrar encima de los gastos generales” para cubrirlos en el precio.',
      ppg_zero: 'Pintura a $0 por galón: está bien si el cliente la pone; si no, escribe lo que pagas.',
      too_big: 'Esos números son más grandes de lo que maneja esta calculadora.',
    },
    copied: 'Copiado. Pégalo en un mensaje, correo o tus notas.',
    copyFail: 'Tu navegador bloqueó la copia. Selecciona los números y cópialos a mano.',
    copyHead: 'Estimado de pintura — TalkEstimate',
    copy: { job: 'Trabajo', with: 'Calculado con', methodMarkup: (p) => `${p}% de markup`, methodMargin: (p) => `${p}% de margen bruto`, onDirect: 'sobre los costos del trabajo', onBoth: 'sobre costos + gastos generales', note: 'El margen bruto no es ganancia neta: no incluye impuestos sobre la renta ni costos que no escribiste aquí.' },
    printed: (d) => `Impreso ${d} · talkestimate.com/es/herramientas/calculadora-estimado-pintura`,
    jobLine: (j) => `Trabajo: ${j}`,
  },
}[LANG];

const track = makeTracker('painting_estimate');
const MAX_ROWS = 20;
let rowSeq = 0;

// ── Wall and opening rows ────────────────────────────────────────────────────
function addRow(kind, focus) {
  const box = $(kind === 'wall' ? 'walls' : 'openings');
  if (box.children.length >= MAX_ROWS) return;
  const id = `${kind[0]}${++rowSeq}`;
  const field = (suffix, label, mode, ph) => `<div class="field"><label for="${id}-${suffix}">${label}${suffix !== 'n' ? ` <span class="hint">${T.ft}</span>` : ''}</label><div class="num"><input type="text" id="${id}-${suffix}" inputmode="${mode}" placeholder="${ph}" aria-describedby="${id}-${suffix}-err"></div><div class="err" id="${id}-${suffix}-err" role="alert"></div></div>`;
  const row = document.createElement('div');
  row.className = 'dimrow';
  row.dataset.kind = kind;
  row.setAttribute('role', 'group');
  row.setAttribute('aria-labelledby', `${id}-t`);
  row.innerHTML = `<div class="dimhead"><span class="dimtitle" id="${id}-t"></span><button type="button" class="linkish rm">${T.remove}</button></div>`
    + `<div class="row3 dims">${field('w', T.width, 'decimal', '0')}${field('h', T.height, 'decimal', '0')}${field('n', T.count, 'numeric', '1')}</div>`;
  row.querySelector('.rm').addEventListener('click', () => removeRow(row));
  box.appendChild(row);
  renumber();
  if (focus) row.querySelector('input').focus();
}

function removeRow(row) {
  const kind = row.dataset.kind;
  const box = row.parentElement;
  const rows = [...box.children];
  const i = rows.indexOf(row);
  row.remove();
  renumber();
  const left = [...box.children];
  // Focus goes somewhere sensible: the row that took its place, the one before, or the add button.
  const next = left[i] || left[i - 1];
  (next ? next.querySelector('input') : $(kind === 'wall' ? 'addWall' : 'addOpening')).focus();
  compute();
}

function renumber() {
  for (const kind of ['wall', 'opening']) {
    const rows = [...$(kind === 'wall' ? 'walls' : 'openings').children];
    rows.forEach((row, i) => {
      row.querySelector('.dimtitle').textContent = (kind === 'wall' ? T.wall : T.opening)(i + 1);
      const rm = row.querySelector('.rm');
      rm.setAttribute('aria-label', (kind === 'wall' ? T.rmWall : T.rmOpening)(i + 1));
      rm.hidden = kind === 'wall' && rows.length === 1; // always at least one wall row
    });
    const add = $(kind === 'wall' ? 'addWall' : 'addOpening');
    add.hidden = rows.length >= MAX_ROWS;
  }
}

/** Reads one kind of row. Returns { bad } | { incomplete: title } | { list, n } (blank rows are skipped). */
function readRows(kind) {
  const rows = [...$(kind === 'wall' ? 'walls' : 'openings').children];
  const list = [];
  let bad = false;
  let incomplete = null;
  rows.forEach((row, i) => {
    const [wEl, hEl, nEl] = row.querySelectorAll('input');
    const w = readNumber(wEl, { max: 1000 });
    const h = readNumber(hEl, { max: 1000 });
    const n = readNumber(nEl, { integer: true, max: 100 });
    if (w.bad || h.bad || n.bad) { bad = true; return; }
    if (w.empty && h.empty) return;
    if (w.empty || h.empty) { if (!incomplete) incomplete = (kind === 'wall' ? T.wall : T.opening)(i + 1); return; }
    list.push({ widthFt: w.value, heightFt: h.value, count: n.empty ? 1 : n.value });
  });
  if (bad) return { bad: true };
  if (incomplete) return { incomplete };
  return { list, n: list.reduce((a, x) => a + x.count, 0) };
}

const areaMode = () => ((document.querySelector('input[name=area]:checked') || {}).value === 'total' ? 'total' : 'walls');
const mode = () => ((document.querySelector('input[name=mode]:checked') || {}).value === 'margin' ? 'margin' : 'markup');
let laborHelperOn = false;

// ── Compute ──────────────────────────────────────────────────────────────────
let last = null;
let completeSent = false;
let completeTimer = null;
const setBar = pricebar();

function compute() {
  const m = mode();
  $('pct-label').textContent = $('pct-label').dataset[m];
  $('pct-hint').textContent = $('pct-hint').dataset[m];
  const am = areaMode();
  $('wallsBox').hidden = am !== 'walls';
  $('totalBox').hidden = am !== 'total';

  // Read everything first, so every bad field shows its own message at once.
  let walls = null;
  let area = null;
  if (am === 'walls') walls = readRows('wall'); else { area = readNumber('area', { max: 1000000 }); }
  if (am === 'walls') clearField('area');
  const openings = readRows('opening');
  const coats = readNumber('coats', { integer: true, min: 1, max: 10 });
  const cov = readNumber('cov', { max: 100000 });
  const waste = readNumber('waste', { max: 100 });
  const ppg = readMoney('ppg');
  const mat = readMoney('mat');
  let lab;
  let labDesc = null;
  if (laborHelperOn) {
    const crew = readNumber('crew', { integer: true, max: 1000 });
    const hours = readNumber('hours', { max: 100000 });
    const rate = readMoney('rate');
    if (crew.bad || hours.bad || rate.bad) lab = { bad: true };
    else {
      const w = crew.empty ? 1 : crew.value;
      const lc = laborCost({ workers: w, hours: hours.value, rateCents: rate.cents });
      lab = lc.ok && lc.cents <= MAX_CENTS ? { cents: lc.cents } : { bad: true };
      $('lab').value = lab.bad ? '' : (lab.cents / 100).toFixed(2);
      if (!lab.bad && lab.cents > 0) labDesc = T.rows.labSmall(fmtNum(w), fmtNum(hours.value), money(rate.cents));
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
  else clearField('ohVal');
  const pct = readNumber('pct', { max: 1000 });
  syncChips('pct-chips', pct.value, pct.empty);
  syncChips('coat-chips', coats.value, coats.empty);

  const anyBad = (walls && walls.bad) || (area && area.bad) || openings.bad || coats.bad || cov.bad || waste.bad || ppg.bad || mat.bad || lab.bad || ohBad || pct.bad;
  if (anyBad) return renderEmpty('');

  // 1. Quantities
  let need = null;
  if (am === 'walls') {
    if (walls.incomplete) need = T.need.rowIncomplete(walls.incomplete);
    else if (!walls.list.length) need = T.need.area;
  } else if (area.empty) need = T.need.areaTotal;
  if (!need && openings.incomplete) need = T.need.rowIncomplete(openings.incomplete);
  if (!need && coats.empty) need = T.need.coats;
  if (!need && cov.empty) need = T.need.coverage;
  if (need) return renderEmpty(need);

  const q = paintQuantities({
    walls: am === 'walls' ? walls.list : undefined,
    areaSqFt: am === 'total' ? area.value : undefined,
    openings: openings.list, coats: coats.value, coverageSqFtPerGallon: cov.value, wastePct: waste.value,
  });
  if (!q.ok) return renderEmpty('', q.reason);
  const qInfo = { q, wallCount: am === 'walls' ? walls.n : null, openCount: openings.n, coats: coats.value, cov: cov.value, waste: waste.value };

  // 2. Price
  if (ppg.empty) return renderQty(qInfo, T.need.ppg);
  if (pct.empty) return renderQty(qInfo, T.need.pct[m]);
  const paint = lineTotal({ qty: q.gallonsToBuy, unitPriceCents: ppg.cents });
  if (!paint.ok || paint.cents > MAX_CENTS) return renderQty(qInfo, '', 'too_big');
  const r = quoteJob({
    costs: [{ id: 'paint', cents: paint.cents }, { id: 'mat', cents: mat.cents }, { id: 'lab', cents: lab.cents }],
    overhead: oh,
    priceOn: ohMode !== 'none' && $('ohInBase').checked ? 'cost_plus_overhead' : 'cost',
    method: m, pct: pct.value,
  });
  if (!r.ok) return renderQty(qInfo, '', r.reason);
  render(qInfo, r, { m, pct: pct.value, oh, ppgCents: ppg.cents, labDesc });

  if (!completeSent && r.priceCents > 0) {
    clearTimeout(completeTimer);
    completeTimer = setTimeout(() => { if (!completeSent) { completeSent = true; track('tool_calc_complete', { calc_mode: m }); } }, 1200);
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function clearPrice(msg) {
  last = null;
  $('rPrice').textContent = money(0);
  $('rPrice').classList.add('dim');
  $('rSub').textContent = msg || '';
  $('bar').innerHTML = '';
  $('legend').innerHTML = '';
  $('sheet').innerHTML = '';
  $('costHead').hidden = true;
  $('callout').hidden = true;
  $('copyBtn').disabled = true; $('printBtn').disabled = true;
  setBar(null);
}

function renderEmpty(msg, reason) {
  clearPrice(msg);
  $('qty').innerHTML = '';
  $('qtyHead').hidden = true;
  $('warns').innerHTML = reason ? `<li class="bad">${T.warn[reason] || T.warn.too_big}</li>` : '';
}

function qtyRows(info) {
  const { q, wallCount, openCount, coats, cov, waste } = info;
  const sq = (n) => T.q.sqft(fmtNum(n));
  const rows = [ln(T.q.gross, wallCount === null ? T.q.grossTotal : T.q.grossWalls(wallCount), sq(q.grossSqFt))];
  if (q.openingsSqFt > 0) rows.push(ln(T.q.open, T.q.openSmall(openCount), '− ' + sq(q.openingsSqFt)));
  rows.push(ln(T.q.paintable, '', sq(q.paintableSqFt), 'sub'));
  rows.push(ln(T.q.coat, T.q.coatSmall(coats), sq(q.coatSqFt)));
  rows.push(ln(T.q.exact, T.q.exactSmall(fmtNum(cov), fmtNum(waste, 1)), T.q.gal(fmtNum(q.gallonsExact, 2, 2))));
  rows.push(ln(T.q.buy, T.q.buySmall, T.q.gal(fmtNum(q.gallonsToBuy, 0)), 'key'));
  return rows.join('');
}

function gallonNote(q) {
  if (q.gallonsToBuy === 0) return '';
  const left = Math.round((q.gallonsToBuy - q.gallonsExact) * 100) / 100;
  return left > 0 ? T.leftover(fmtNum(q.gallonsExact, 2, 2), fmtNum(q.gallonsToBuy, 0), fmtNum(left, 2, 2)) : T.exactBuy(fmtNum(q.gallonsToBuy, 0));
}

function renderQty(info, msg, reason) {
  clearPrice(msg);
  $('qtyHead').hidden = false;
  $('qty').innerHTML = qtyRows(info);
  const note = gallonNote(info.q);
  if (note) { $('callout').innerHTML = note; $('callout').hidden = false; }
  const w = [];
  if (info.q.paintableSqFt === 0) w.push(`<li>${T.warn.no_area}</li>`);
  if (reason) w.push(`<li class="bad">${T.warn[reason] || T.warn.too_big}</li>`);
  $('warns').innerHTML = w.join('');
}

function render(info, r, ctx) {
  const { m, pct, oh, ppgCents, labDesc } = ctx;
  const { q } = info;
  const p = fmtPct(pct);
  const [paint, mat, lab] = r.costs.map((c) => c.cents);
  last = { info, r, ctx };
  $('rPrice').classList.remove('dim');
  $('rPrice').textContent = money(r.priceCents);
  const ohInBase = r.baseCents !== r.jobCostCents;
  $('rSub').textContent = (ohInBase ? T.subOh : T.sub)[m](p);

  const segs = [['paint', paint, 'var(--c-mat)'], ['mat', mat, 'var(--c-oth)'], ['lab', lab, 'var(--c-lab)']];
  if (r.overheadCents > 0) segs.push(['oh', Math.min(r.overheadCents, Math.max(r.grossProfitCents, 0)), 'var(--c-oh)']);
  segs.push([r.overheadCents > 0 ? 'pro' : 'gp', Math.max(r.overheadCents > 0 ? r.afterOverheadCents : r.grossProfitCents, 0), 'var(--c-pro)']);
  const shown = segs.filter((s) => s[1] > 0);
  const total = Math.max(shown.reduce((a, s) => a + s[1], 0), 1);
  $('bar').innerHTML = shown.map((s) => `<span style="width:${(s[1] / total) * 100}%;background:${s[2]}"></span>`).join('');
  $('bar').setAttribute('aria-hidden', 'true');
  $('legend').innerHTML = shown.map((s) => `<span><i style="background:${s[2]}"></i>${T.legend[s[0]]} ${money(s[1])}</span>`).join('');

  $('qtyHead').hidden = false;
  $('qty').innerHTML = qtyRows(info);
  $('costHead').hidden = false;
  const rows = [];
  rows.push(ln(T.rows.paint, T.rows.paintSmall(fmtNum(q.gallonsToBuy, 0), money(ppgCents)), money(paint)));
  if (mat > 0) rows.push(ln(T.rows.mat, '', money(mat)));
  if (lab > 0) rows.push(ln(T.rows.lab, labDesc || '', money(lab)));
  rows.push(ln(T.rows.direct, T.rows.directSmall, money(r.directCents), 'sub'));
  if (r.overheadCents > 0) rows.push(ln(T.rows.oh, oh.mode === 'pct' ? T.rows.ohPct(fmtPct(oh.pct)) : T.rows.ohFlat, money(r.overheadCents)));
  rows.push(ln(T.rows.price, '', money(r.priceCents), 'total'));
  rows.push(ln(T.rows.gp, T.rows.gpSmall(fmtPct(r.grossMarginPct)), money(r.grossProfitCents), r.overheadCents > 0 ? '' : 'key', r.grossProfitCents < 0));
  if (r.overheadCents > 0) rows.push(ln(T.rows.after, T.rows.afterSmall(fmtPct(r.afterOverheadPct)), money(r.afterOverheadCents), 'key', r.afterOverheadCents < 0));
  if (r.markupOnJobCostPct !== null) rows.push(ln(T.rows.mk, '', fmtPct(r.markupOnJobCostPct) + '%'));
  const per = pricePerUnit(r.priceCents, q.paintableSqFt);
  if (per !== null) rows.push(ln(T.rows.perSqft, '', money(per)));
  $('sheet').innerHTML = rows.join('');

  let note = gallonNote(q);
  if (pct > 0 && !ohInBase) {
    if (m === 'markup') note += T.mmNote.markup(p, fmtPct(markupToMargin(pct)));
    else { const k = marginToMarkup(pct); if (k !== null) note += T.mmNote.margin(p, fmtPct(k)); }
  }
  $('callout').innerHTML = note;
  $('callout').hidden = !note;

  const w = [];
  if (q.paintableSqFt === 0) w.push(`<li>${T.warn.no_area}</li>`);
  if (ppgCents === 0) w.push(`<li>${T.warn.ppg_zero}</li>`);
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
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  const lines = [T.copyHead];
  const job = $('jobName').value.trim();
  if (job) lines.push(`${T.copy.job}: ${job}`);
  for (const row of document.querySelectorAll('#qty .ln, #sheet .ln')) {
    const k = row.querySelector('.k').childNodes[0].textContent;
    const small = row.querySelector('.k small');
    lines.push(`${k}${small ? ` (${strip(small.textContent)})` : ''}: ${row.querySelector('.v').textContent}`);
  }
  lines.push(T.copy.note);
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
  $('walls').innerHTML = ''; $('openings').innerHTML = '';
  addRow('wall');
  $('ohMode').value = 'none';
  $('ohInBase').checked = true;
  document.querySelector('input[name=area][value=walls]').checked = true;
  $('toast').textContent = '';
  if (laborHelperOn) setLaborHelper(false, true);
  compute();
  if (!skipFocus) $('walls').querySelector('input').focus();
}

function setLaborHelper(on, quiet) {
  laborHelperOn = on;
  $('labHelper').hidden = !on;
  $('lab').readOnly = on;
  $('labHelperToggle').setAttribute('aria-expanded', String(on));
  $('labHelperToggle').textContent = $('labHelperToggle').dataset[on ? 'off' : 'on'];
  if (!on) $('lab').value = '';
  if (!quiet) compute();
}

// Example: a 12 × 11 ft bedroom, 8 ft walls, two doors and a window. Every number is an example, not a market price.
function loadExample() {
  doReset(true);
  const set = (row, vals) => row.querySelectorAll('input').forEach((el, i) => { el.value = vals[i]; });
  set($('walls').children[0], ['12', '8', '2']);
  addRow('wall'); set($('walls').children[1], ['11', '8', '2']);
  addRow('opening'); set($('openings').children[0], ['3', '7', '2']);
  addRow('opening'); set($('openings').children[1], ['3', '4', '1']);
  $('coats').value = '2'; $('cov').value = '300'; $('waste').value = '10'; $('ppg').value = '42.50';
  $('mat').value = '38';
  setLaborHelper(true, true);
  $('crew').value = '2'; $('hours').value = '6'; $('rate').value = '32';
  $('ohMode').value = 'pct'; $('ohVal').value = '12'; $('ohInBase').checked = true;
  document.querySelector('input[name=mode][value=margin]').checked = true;
  $('pct').value = '25';
  compute();
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

// ── Wire up ──────────────────────────────────────────────────────────────────
let touched = false;
const firstTouch = () => { if (!touched) { touched = true; track('tool_first_interaction'); } };
$('calc').addEventListener('input', () => { firstTouch(); $('toast').textContent = ''; compute(); });
$('calc').addEventListener('change', compute);
$('calc').addEventListener('submit', (e) => e.preventDefault());
for (const [group, field] of [['pct-chips', 'pct'], ['coat-chips', 'coats']]) {
  document.querySelectorAll(`#${group} button`).forEach((b) => b.addEventListener('click', () => { $(field).value = b.dataset.v; firstTouch(); compute(); }));
}
$('addWall').addEventListener('click', () => { addRow('wall', true); compute(); });
$('addOpening').addEventListener('click', () => { addRow('opening', true); compute(); });
$('labHelperToggle').addEventListener('click', () => setLaborHelper(!laborHelperOn));
$('copyBtn').addEventListener('click', doCopy);
$('printBtn').addEventListener('click', doPrint);
$('resetBtn').addEventListener('click', () => doReset());
$('exampleBtn').addEventListener('click', loadExample);

addRow('wall');
track('tool_view');
compute();
