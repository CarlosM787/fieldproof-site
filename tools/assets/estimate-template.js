// Free printable estimate template (EN + ES pages share this file; the page's <html lang> picks the words).
// The contractor fills in their business, the estimate details, the customer, line items (quantity x unit price, or a
// flat price when the quantity is blank), an optional sales tax % and deposit. The totals add up as they type, and
// "Print or save PDF" prints only the estimate (#doc), built here from what was typed: empty lines are left off.
// Nothing typed leaves this tab and nothing is stored (no network, no browser storage). Analytics (only on
// talkestimate.com) gets the tool name and the event name, never an amount or typed text.
import { lineTotal, estimateTotals, formatMoney, MAX_CENTS } from './estimate-math.js';
import {
  LANG, $, money, fmtPct, fmtNum, readMoney, readNumber, makeTracker, makeErrorReporter, ln, esc,
  pricebar, FIX_MSG, revealInvalid, keepFocusAboveBar,
} from './tool-ui.js';

const T = {
  en: {
    line: (n) => `Line ${n}`, rmLine: (n) => `Remove line ${n}`, remove: 'Remove',
    desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price',
    descPh: 'e.g. Paint the hallway walls, 2 coats', unitPh: 'hr, sq ft',
    flat: 'flat price', noPrice: 'no price yet',
    need: 'Add a line with a price to see the total.',
    lines: (n) => (n === 1 ? '1 priced line' : `${n} priced lines`),
    noTax: 'no sales tax added', withTax: (p) => `${p}% sales tax added`,
    rows: { sub: 'Subtotal', tax: (p) => `Sales tax (${p}%)`, total: 'Total', dep: 'Deposit', bal: 'Balance due' },
    warn: {
      noPrice: (n) => `Line ${n} has a quantity but no price, so it adds nothing to the total.`,
      noDesc: (n) => `Line ${n} has a price but no description. Say what the customer is paying for.`,
      depositOver: 'The deposit is more than the total. Check the deposit before you print.',
      validBefore: '“Valid until” is before the estimate date.',
      taxHigh: 'A sales tax over 15% is unusual. Check the rate.',
      tooBig: 'Those numbers are larger than this template handles.',
    },
    confirmClear: 'Clear everything you typed? Nothing is saved, so this can’t be undone.',
    confirmExample: 'Replace what you typed with the example? Nothing is saved, so this can’t be undone.',
  },
  es: {
    line: (n) => `Línea ${n}`, rmLine: (n) => `Quitar línea ${n}`, remove: 'Quitar',
    desc: 'Descripción', qty: 'Cant.', unit: 'Unidad', price: 'Precio unitario',
    descPh: 'ej. Pintar las paredes del pasillo, 2 manos', unitPh: 'h, pies²',
    flat: 'precio fijo', noPrice: 'sin precio',
    need: 'Agrega una línea con precio para ver el total.',
    lines: (n) => (n === 1 ? '1 línea con precio' : `${n} líneas con precio`),
    noTax: 'sin impuesto sobre la venta', withTax: (p) => `con ${p}% de impuesto sobre la venta`,
    rows: { sub: 'Subtotal', tax: (p) => `Impuesto sobre la venta (${p}%)`, total: 'Total', dep: 'Anticipo', bal: 'Saldo' },
    warn: {
      noPrice: (n) => `La línea ${n} tiene cantidad pero no precio, así que no suma nada al total.`,
      noDesc: (n) => `La línea ${n} tiene precio pero no descripción. Di qué está pagando el cliente.`,
      depositOver: 'El anticipo es más que el total. Revisa el anticipo antes de imprimir.',
      validBefore: 'La fecha de “Válido hasta” es antes de la fecha del estimado.',
      taxHigh: 'Un impuesto sobre la venta de más de 15% es raro. Revisa la tasa.',
      tooBig: 'Esos números son más grandes de lo que maneja esta plantilla.',
    },
    confirmClear: '¿Borrar todo lo que escribiste? No se guarda nada, así que no se puede deshacer.',
    confirmExample: '¿Cambiar lo que escribiste por el ejemplo? No se guarda nada, así que no se puede deshacer.',
  },
}[LANG];

// The printed estimate's own words, in the language picked under "Printout language" (both pages offer both).
// Only these labels change: whatever the contractor typed prints exactly as typed.
const DOC = {
  en: {
    locale: 'en-US', title: 'Estimate', no: 'Estimate #', date: 'Date', valid: 'Valid until',
    biz: 'Business', addr: 'Address', phone: 'Phone', email: 'Email', lic: 'License #',
    cust: 'Customer', name: 'Name', jobAddr: 'Job address', contact: 'Phone / email',
    job: 'Job description', desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price', amt: 'Amount',
    sub: 'Subtotal', tax: (p) => `Sales tax (${p}%)`, taxBlank: 'Sales tax', total: 'Total', dep: 'Deposit', bal: 'Balance due',
    notes: 'Notes and terms', sigC: 'Contractor signature', sigK: 'Customer signature', sigDate: 'Date',
    accept: 'Customer acceptance: I accept this estimate, its price and its terms.',
    fix: 'This estimate can’t print yet: fix what’s marked on the form, then print again.',
  },
  es: {
    locale: 'es-US', title: 'Estimado', no: 'Núm. de estimado', date: 'Fecha', valid: 'Válido hasta',
    biz: 'Negocio', addr: 'Dirección', phone: 'Teléfono', email: 'Correo', lic: 'Núm. de licencia',
    cust: 'Cliente', name: 'Nombre', jobAddr: 'Dirección del trabajo', contact: 'Teléfono / correo',
    job: 'Descripción del trabajo', desc: 'Descripción', qty: 'Cant.', unit: 'Unidad', price: 'Precio unitario', amt: 'Monto',
    sub: 'Subtotal', tax: (p) => `Impuesto sobre la venta (${p}%)`, taxBlank: 'Impuesto sobre la venta', total: 'Total', dep: 'Anticipo', bal: 'Saldo',
    notes: 'Notas y condiciones', sigC: 'Firma del contratista', sigK: 'Firma del cliente', sigDate: 'Fecha',
    accept: 'Aceptación del cliente: acepto este estimado, su precio y sus condiciones.',
    fix: 'Este estimado todavía no se puede imprimir: corrige lo que está marcado en el formulario y vuelve a imprimir.',
  },
};

const track = makeTracker('estimate_template');
const reportInputError = makeErrorReporter(track);
const START_ROWS = 5;
const MAX_ROWS = 40;
const BLANK_ROWS = 10; // ruled lines on a printout with no lines filled in (a form to fill in by hand); keeps it to one Letter page
let rowSeq = 0;

// ── Dates (local calendar days, never parsed as UTC) ─────────────────────────────
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayYmd = () => ymdOf(new Date());
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return ymdOf(new Date(y, m - 1, d + n));
}
function longDate(ymd, locale) {
  if (!isYmd(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Line items ───────────────────────────────────────────────────────────────────
function addRow(focus) {
  const box = $('lineRows');
  if (box.children.length >= MAX_ROWS) return null;
  const id = `l${++rowSeq}`;
  const first = box.children.length === 0;
  const field = (suffix, label, attrs, wrap) => `<div class="field"><label for="${id}-${suffix}">${label}</label><div class="${wrap}"><input type="text" id="${id}-${suffix}" ${attrs} aria-describedby="${id}-${suffix}-err"></div><div class="err" id="${id}-${suffix}-err" role="alert"></div></div>`;
  const row = document.createElement('div');
  row.className = 'dimrow est-line';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-labelledby', `${id}-t`);
  row.innerHTML = `<div class="dimhead"><span class="dimtitle" id="${id}-t"></span><span class="est-amt"></span><button type="button" class="linkish rm">${T.remove}</button></div>`
    + `<div class="field est-desc"><label for="${id}-d">${T.desc}</label><input type="text" id="${id}-d" maxlength="200"${first ? ` placeholder="${T.descPh}"` : ''}></div>`
    + `<div class="row3 dims">${field('q', T.qty, 'inputmode="decimal"', 'num')}${field('u', T.unit, `maxlength="12"${first ? ` placeholder="${T.unitPh}"` : ''}`, 'num')}${field('p', T.price, 'inputmode="decimal" placeholder="0.00"', 'money')}</div>`;
  row.querySelector('.rm').addEventListener('click', () => removeRow(row));
  box.appendChild(row);
  renumber();
  if (focus) row.querySelector('input').focus();
  return row;
}

function removeRow(row) {
  const box = $('lineRows');
  const i = [...box.children].indexOf(row);
  row.remove();
  renumber();
  const left = [...box.children];
  const next = left[i] || left[i - 1];
  (next ? next.querySelector('input') : $('addLine')).focus();
  compute();
}

function renumber() {
  const rows = [...$('lineRows').children];
  rows.forEach((row, i) => {
    row.querySelector('.dimtitle').textContent = T.line(i + 1);
    const rm = row.querySelector('.rm');
    rm.setAttribute('aria-label', T.rmLine(i + 1));
    rm.hidden = rows.length === 1;
  });
  $('addLine').hidden = rows.length >= MAX_ROWS;
}

/** THE FLAT-PRICE RULE: a blank quantity means the price typed IS the line total ({ fixedPriceCents });
 *  with a quantity, the line total is quantity x unit price ({ qty, unitPriceCents }), half-up to the cent once. */
const helperLine = (l) => (l.qty === null ? { fixedPriceCents: l.priceCents } : { qty: l.qty, unitPriceCents: l.priceCents });

function readLines() {
  const lines = [];
  let bad = false;
  [...$('lineRows').children].forEach((row, i) => {
    const [dEl, qEl, uEl, pEl] = row.querySelectorAll('input');
    const amt = row.querySelector('.est-amt');
    const desc = dEl.value.trim();
    const unit = uEl.value.trim();
    const q = readNumber(qEl, { max: 1000000 });
    const p = readMoney(pEl);
    if (q.bad || p.bad) { bad = true; amt.textContent = ''; return; }
    const line = { n: i + 1, desc, unit, qty: q.empty ? null : q.value, priceCents: p.empty ? null : p.cents, cents: null };
    line.empty = !desc && !unit && q.empty && p.empty;
    if (line.priceCents !== null) line.cents = lineTotal(helperLine(line)).cents;
    amt.textContent = line.empty ? '' : line.cents === null ? T.noPrice : `${money(line.cents)}${line.qty === null ? ` · ${T.flat}` : ''}`;
    lines.push(line);
  });
  return bad ? { bad: true } : { lines };
}

// ── Compute ──────────────────────────────────────────────────────────────────────
let completeSent = false;
let completeTimer = null;
const setBar = pricebar();
// Only touch the page when something changed, so the live total isn't re-announced on every keystroke.
const setHTML = (el, html) => { if (el.innerHTML !== html) el.innerHTML = html; };
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

function compute() {
  syncValidChips();
  const L = readLines();
  const tax = readNumber('taxPct', { max: 100 });
  const dep = readMoney('deposit');
  if (L.bad || tax.bad || dep.bad) { revealInvalid(); reportInputError(); return renderBlocked(FIX_MSG); }

  const priced = L.lines.filter((l) => l.cents !== null);
  if (priced.some((l) => l.cents > MAX_CENTS)) return renderBlocked('', T.warn.tooBig);
  const t = estimateTotals(priced.map(helperLine), tax.empty ? 0 : tax.value);
  if (!t.ok || t.totalCents > MAX_CENTS) return renderBlocked('', T.warn.tooBig);
  const depositCents = dep.empty ? null : dep.cents;
  const blank = L.lines.every((l) => l.empty); // no line filled in: the printout is a form to fill in by hand
  if (depositCents !== null && !blank && depositCents > t.totalCents) return renderBlocked('', T.warn.depositOver);

  const s = {
    lines: L.lines, priced, t, tax, depositCents, blank,
    balanceCents: depositCents === null ? null : t.totalCents - depositCents,
  };
  render(s);
  renderDoc(s);

  if (!completeSent && t.subtotalCents > 0) {
    clearTimeout(completeTimer);
    completeTimer = setTimeout(() => { if (!completeSent) { completeSent = true; track('tool_calc_complete'); } }, 1200);
  }
}

// ── Render: the totals panel ─────────────────────────────────────────────────────
function renderBlocked(msg, warn) {
  setText($('rTotal'), money(0));
  $('rTotal').classList.add('dim');
  setText($('rSub'), msg || '');
  $('sheetHead').hidden = true; $('sheet').hidden = true;
  setHTML($('sheet'), '');
  setHTML($('warns'), warn ? `<li class="bad">${warn}</li>` : '');
  $('printBtn').disabled = true;
  setHTML($('doc'), `<p class="d-fix">${DOC[docLang()].fix}</p>`);
  setBar(null);
}

function render(s) {
  const { priced, t, tax, depositCents, balanceCents } = s;
  const R = T.rows;
  const has = priced.length > 0;
  setText($('rTotal'), money(t.totalCents));
  $('rTotal').classList.toggle('dim', !has);
  setText($('rSub'), has ? `${T.lines(priced.length)} · ${tax.empty ? T.noTax : T.withTax(fmtPct(tax.value))}` : T.need);

  const rows = [];
  if (has) {
    rows.push(ln(R.sub, '', money(t.subtotalCents)));
    if (!tax.empty) rows.push(ln(R.tax(fmtPct(tax.value)), '', money(t.taxCents)));
    rows.push(ln(R.total, '', money(t.totalCents), 'total'));
    if (depositCents !== null) {
      rows.push(ln(R.dep, '', money(depositCents)));
      rows.push(ln(R.bal, '', money(balanceCents), 'key'));
    }
  }
  $('sheetHead').hidden = !has; $('sheet').hidden = !has;
  setHTML($('sheet'), rows.join(''));

  const w = [];
  for (const l of s.lines) {
    if (l.empty) continue;
    if (l.cents === null && (l.qty !== null || l.unit)) w.push(T.warn.noPrice(l.n));
    if (l.cents !== null && !l.desc) w.push(T.warn.noDesc(l.n));
  }
  if (!tax.empty && tax.value > 15) w.push(T.warn.taxHigh);
  if (isYmd($('estDate').value) && isYmd($('estValid').value) && $('estValid').value < $('estDate').value) w.push(T.warn.validBefore);
  setHTML($('warns'), w.map((x) => `<li>${x}</li>`).join(''));
  $('printBtn').disabled = false;
  setBar(has ? t.totalCents : null);
}

// ── Render: the printed estimate (#doc, print-only) ──────────────────────────────
const docLang = () => ($('docLang').value === 'es' ? 'es' : 'en');

function renderDoc(s) {
  const D = DOC[docLang()];
  const m = (c) => formatMoney(c, docLang());
  const { blank } = s;
  const v = (id) => $(id).value.trim();
  const rule = '<span class="d-rule"></span>';
  // A filled-in field prints its value; an empty one prints nothing, or a labelled blank line on a form to fill by hand.
  const line = (label, value, cls = '', prefix = '') => {
    if (value) return `<div class="${cls}">${prefix ? `<span class="d-lbl">${prefix}</span> ` : ''}${esc(value)}</div>`;
    return blank ? `<div class="d-f ${cls}"><span class="d-lbl">${label}</span>${rule}</div>` : '';
  };
  const text = (value, rules = 3) => (value ? `<div class="d-text">${esc(value)}</div>` : blank ? `<div class="d-rules">${'<span></span>'.repeat(rules)}</div>` : '');
  const kv = (label, value) => (value ? `<tr><th>${label}</th><td>${esc(value)}</td></tr>` : blank ? `<tr><th>${label}</th><td class="d-rule-cell"></td></tr>` : '');

  // On a form to fill in by hand, dates and amounts are left blank: they belong to each job.
  const date = blank ? '' : longDate($('estDate').value, D.locale);
  const valid = blank ? '' : longDate($('estValid').value, D.locale);
  const phone = v('bizPhone'); const email = v('bizEmail');
  const contact = !blank && phone && email ? `<div>${esc(phone)} · ${esc(email)}</div>` : line(D.phone, phone) + line(D.email, email);

  const out = [];
  out.push('<div class="d-head"><div class="d-biz">'
    + line(D.biz, v('bizName'), 'd-bizname') + line(D.addr, v('bizAddr')) + contact + line(D.lic, v('bizLic'), '', D.lic)
    + `</div><div class="d-meta"><div class="d-title">${D.title}</div><table class="d-kv">`
    + kv(D.no, v('estNo')) + kv(D.date, date) + kv(D.valid, valid) + '</table></div></div>');

  const cust = line(D.name, v('custName'), 'd-custname') + line(D.jobAddr, v('custAddr'), '', v('custAddr') ? `${D.jobAddr}:` : '') + line(D.contact, v('custContact'));
  if (cust) out.push(`<div class="d-sec"><div class="d-h">${D.cust}</div>${cust}</div>`);
  const job = text(v('jobDesc'), 2);
  if (job) out.push(`<div class="d-sec"><div class="d-h">${D.job}</div>${job}</div>`);

  const head = `<thead><tr><th>${D.desc}</th><th class="d-num">${D.qty}</th><th>${D.unit}</th><th class="d-num">${D.price}</th><th class="d-num">${D.amt}</th></tr></thead>`;
  let body;
  if (blank) body = '<tr><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(BLANK_ROWS);
  else {
    body = s.lines.filter((l) => !l.empty).map((l) => {
      const flat = l.qty === null;
      return `<tr><td>${esc(l.desc)}</td><td class="d-num">${flat ? '' : fmtNum(l.qty, 4)}</td><td>${esc(l.unit)}</td>`
        + `<td class="d-num">${l.priceCents === null || flat ? '' : m(l.priceCents)}</td><td class="d-num">${l.cents === null ? '' : m(l.cents)}</td></tr>`;
    }).join('');
  }
  out.push(`<table class="d-items${blank ? ' d-blank' : ''}">${head}<tbody>${body}</tbody></table>`);

  const { t, tax, depositCents, balanceCents } = s;
  const tot = [];
  const amt = (label, cents, cls = '') => tot.push(`<tr${cls ? ` class="${cls}"` : ''}><th>${label}</th>${blank || cents === null ? '<td class="d-rule-cell"></td>' : `<td>${m(cents)}</td>`}</tr>`);
  amt(D.sub, t.subtotalCents);
  if (!tax.empty) amt(D.tax(fmtPct(tax.value)), t.taxCents);
  else if (blank) amt(D.taxBlank, null);
  amt(D.total, t.totalCents, 'd-total');
  if (blank || depositCents !== null) { amt(D.dep, depositCents); amt(D.bal, balanceCents, 'd-bal'); }
  out.push(`<table class="d-totals"><tbody>${tot.join('')}</tbody></table>`);

  const notes = text(v('notes'));
  if (notes) out.push(`<div class="d-sec"><div class="d-h">${D.notes}</div>${notes}</div>`);

  const sig = (label) => `<div class="d-sigrow"><div>${label}</div><div>${D.sigDate}</div></div>`;
  out.push(`<div class="d-sign"><div class="d-sig">${sig(D.sigC)}</div><div class="d-sig"><p class="d-accept">${D.accept}</p>${sig(D.sigK)}</div></div>`);
  // No TalkEstimate credit on the printout: it is the contractor's own document for his customer (owner review 11/12).
  setHTML($('doc'), out.join(''));
}

// ── Valid-until chips (15 / 30 / 60 days after the estimate date) ────────────────
function syncValidChips() {
  const base = isYmd($('estDate').value) ? $('estDate').value : todayYmd();
  const cur = $('estValid').value;
  document.querySelectorAll('#valid-chips button').forEach((b) => b.setAttribute('aria-pressed', String(!!cur && cur === addDays(base, Number(b.dataset.v)))));
}

// ── Print / reset / example ──────────────────────────────────────────────────────
const hasContent = () => [...document.querySelectorAll('#calc input, #calc textarea')].some((el) => el.id !== 'estDate' && el.value.trim() !== '');

function doPrint() {
  if ($('printBtn').disabled) return;
  track('tool_print');
  window.print();
}

function doReset(skipFocus) {
  document.querySelectorAll('#calc input, #calc textarea').forEach((el) => { el.value = ''; });
  $('estDate').value = todayYmd();
  $('docLang').value = LANG;
  $('lineRows').innerHTML = '';
  for (let i = 0; i < START_ROWS; i++) addRow();
  compute();
  if (!skipFocus) $('bizName').focus();
}

// Example: a water-damaged bathroom ceiling, five lines. Every price is an example, not a market rate.
// qty '' = a flat price. scripts/tests/estimate-template.test.ts recomputes these lines and the deposit with
// estimate-math.js and checks every figure the two pages print about them. Change them together.
const EXAMPLE_LINES = [
  { qty: '', unit: ['', ''], price: '285', text: ['Cut out and replace the water-damaged drywall, about 4 × 4 ft', 'Cortar y reemplazar el drywall dañado por agua, unos 4 × 4 pies'] },
  { qty: '4.5', unit: ['hr', 'h'], price: '62', text: ['Tape, mud and sand the patch, 3 coats', 'Poner cinta, masilla y lijar el parche, 3 manos'] },
  { qty: '64', unit: ['sq ft', 'pies²'], price: '2.25', text: ['Prime and paint the whole ceiling, 2 coats', 'Sellar y pintar todo el techo, 2 manos'] },
  { qty: '1', unit: ['lot', 'lote'], price: '86.40', text: ['Materials: drywall, tape, compound, primer, ceiling paint', 'Materiales: drywall, cinta, masilla, sellador, pintura para techo'] },
  { qty: '', unit: ['', ''], price: '60', text: ['Protect the floor and fixtures, clean up, haul away the debris', 'Proteger el piso y los muebles del baño, limpiar, retirar el escombro'] },
];
const EXAMPLE_DEPOSIT = '250';
const EXAMPLE = {
  en: {
    bizName: 'Example Home Repair LLC', bizPhone: '(555) 010-0123', bizEmail: 'office@example.com', estNo: '1001',
    custName: 'Alex Johnson', custAddr: '123 Main St', custContact: '(555) 010-0199',
    jobDesc: 'Repair the water-damaged drywall in the hall bathroom ceiling and repaint the whole ceiling. A plumber already fixed the leak; plumbing is not part of this estimate.',
    notes: 'Price good for 30 days.\nNot included: plumbing, or damage found beyond the area above once the ceiling is open (priced as a change order).\nAny change to the work is written as a change order and approved before it’s done.\nDeposit to schedule the work; balance due when the work is done.',
  },
  es: {
    bizName: 'Reparaciones Ejemplo LLC', bizPhone: '(555) 010-0123', bizEmail: 'oficina@example.com', estNo: '1001',
    custName: 'Ana Torres', custAddr: '123 Main St', custContact: '(555) 010-0199',
    jobDesc: 'Reparar el drywall dañado por agua en el techo del baño del pasillo y volver a pintar todo el techo. Un plomero ya arregló la fuga; la plomería no es parte de este estimado.',
    notes: 'Este estimado vale por 30 días.\nNo incluye: plomería, ni daños que aparezcan fuera del área de arriba al abrir el techo (se cotizan con una orden de cambio).\nCualquier cambio al trabajo se hace por escrito como una orden de cambio y se aprueba antes de hacerlo.\nAnticipo para agendar el trabajo; el saldo se paga al terminar.',
  },
}[LANG];

function loadExample() {
  if (hasContent() && !window.confirm(T.confirmExample)) return;
  doReset(true);
  for (const [id, value] of Object.entries(EXAMPLE)) $(id).value = value;
  $('estValid').value = addDays($('estDate').value, 30);
  const k = LANG === 'es' ? 1 : 0;
  EXAMPLE_LINES.forEach((l, i) => {
    const row = $('lineRows').children[i] || addRow();
    const [d, q, u, p] = row.querySelectorAll('input');
    d.value = l.text[k]; q.value = l.qty; u.value = l.unit[k]; p.value = l.price;
  });
  $('deposit').value = EXAMPLE_DEPOSIT;
  compute();
}

// ── Wire up ──────────────────────────────────────────────────────────────────────
let touched = false;
const firstTouch = () => { if (!touched) { touched = true; track('tool_first_interaction'); } };
$('calc').addEventListener('input', () => { firstTouch(); compute(); });
$('calc').addEventListener('change', compute);
$('calc').addEventListener('submit', (e) => e.preventDefault());
document.querySelectorAll('#valid-chips button').forEach((b) => b.addEventListener('click', () => {
  firstTouch();
  $('estValid').value = addDays(isYmd($('estDate').value) ? $('estDate').value : todayYmd(), Number(b.dataset.v));
  compute();
}));
$('addLine').addEventListener('click', () => { addRow(true); compute(); });
$('printBtn').addEventListener('click', doPrint);
$('resetBtn').addEventListener('click', () => { if (hasContent() && !window.confirm(T.confirmClear)) return; doReset(); });
$('exampleBtn').addEventListener('click', () => { firstTouch(); loadExample(); });

doReset(true);
track('tool_view');
keepFocusAboveBar();
