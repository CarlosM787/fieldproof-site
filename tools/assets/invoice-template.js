// Free printable invoice template (EN + ES pages share this file; the page's <html lang> picks the words).
// The contractor fills in their business, the invoice # and dates, the estimate and change orders it bills, who it is
// billed to, one line per item (quantity x unit price, or a flat price when the quantity is blank), an optional sales
// tax %, the payments already received, how to pay, and notes. The balance due adds up as they type, and "Print or
// save PDF" prints only the invoice (#doc), built here from what was typed: empty lines are left off. Same pattern as
// estimate-template.js and change-order-template.js.
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
    need: 'Add a line with a price to see the balance due.',
    lines: (n) => (n === 1 ? '1 priced line' : `${n} priced lines`),
    noTax: 'no sales tax added', withTax: (p) => `${p}% sales tax added`, paidSub: (m) => `${m} already paid`,
    rows: { sub: 'Subtotal', tax: (p) => `Sales tax (${p}%)`, total: 'Total', paid: 'Payments received', bal: 'Balance due' },
    warn: {
      noPrice: (n) => `Line ${n} has a quantity but no price, so it adds nothing to the total.`,
      noDesc: (n) => `Line ${n} has a price but no description. Say what the customer is paying for.`,
      paidOver: 'The payments are more than the total. Check the payments before you print.',
      dueBefore: 'The due date is before the invoice date.',
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
    need: 'Agrega una línea con precio para ver el saldo.',
    lines: (n) => (n === 1 ? '1 línea con precio' : `${n} líneas con precio`),
    noTax: 'sin impuesto sobre la venta', withTax: (p) => `con ${p}% de impuesto sobre la venta`, paidSub: (m) => `${m} ya pagado`,
    rows: { sub: 'Subtotal', tax: (p) => `Impuesto sobre la venta (${p}%)`, total: 'Total', paid: 'Pagos recibidos', bal: 'Saldo' },
    warn: {
      noPrice: (n) => `La línea ${n} tiene cantidad pero no precio, así que no suma nada al total.`,
      noDesc: (n) => `La línea ${n} tiene precio pero no descripción. Di qué está pagando el cliente.`,
      paidOver: 'Los pagos son más que el total. Revisa los pagos antes de imprimir.',
      dueBefore: 'La fecha de vencimiento es antes de la fecha de la factura.',
      taxHigh: 'Un impuesto sobre la venta de más de 15% es raro. Revisa la tasa.',
      tooBig: 'Esos números son más grandes de lo que maneja esta plantilla.',
    },
    confirmClear: '¿Borrar todo lo que escribiste? No se guarda nada, así que no se puede deshacer.',
    confirmExample: '¿Cambiar lo que escribiste por el ejemplo? No se guarda nada, así que no se puede deshacer.',
  },
}[LANG];

// The printed invoice's own words, in the language picked under "Printout language" (both pages offer both).
// Only these labels change: whatever the contractor typed prints exactly as typed.
const DOC = {
  en: {
    locale: 'en-US', title: 'Invoice', no: 'Invoice #', date: 'Date', due: 'Due date', est: 'Estimate #', co: 'Change order #',
    biz: 'Business', phone: 'Phone', email: 'Email', billTo: 'Bill to', name: 'Name', jobAddr: 'Job address',
    desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price', amt: 'Amount', flat: 'flat price',
    sub: 'Subtotal', tax: (p) => `Sales tax (${p}%)`, taxBlank: 'Sales tax', total: 'Total', paid: 'Payments received', bal: 'Balance due',
    pay: 'How to pay', notes: 'Notes and terms', thanks: 'Thank you for your business.',
    fix: 'This invoice can’t print yet: fix what’s marked on the form, then print again.',
  },
  es: {
    locale: 'es-US', title: 'Factura', no: 'Núm. de factura', date: 'Fecha', due: 'Fecha de vencimiento', est: 'Núm. de estimado', co: 'Núm. de orden de cambio',
    biz: 'Negocio', phone: 'Teléfono', email: 'Correo', billTo: 'Facturar a', name: 'Nombre', jobAddr: 'Dirección del trabajo',
    desc: 'Descripción', qty: 'Cant.', unit: 'Unidad', price: 'Precio unitario', amt: 'Monto', flat: 'precio fijo',
    sub: 'Subtotal', tax: (p) => `Impuesto sobre la venta (${p}%)`, taxBlank: 'Impuesto sobre la venta', total: 'Total', paid: 'Pagos recibidos', bal: 'Saldo',
    pay: 'Forma de pago', notes: 'Notas y condiciones', thanks: 'Gracias por elegirnos.',
    fix: 'Esta factura todavía no se puede imprimir: corrige lo que está marcado en el formulario y vuelve a imprimir.',
  },
};

const track = makeTracker('invoice_template');
const reportInputError = makeErrorReporter(track);
const START_ROWS = 5;
const MAX_ROWS = 40;
const BLANK_ROWS = 10; // ruled lines on a printout with no lines filled in (a form to fill in by hand); keeps it to one Letter page
const MINUS = '−';
let rowSeq = 0;

// ── Dates (local calendar days, never parsed as UTC) ─────────────────────────────
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayYmd = () => ymdOf(new Date());
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
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

/** THE FLAT-PRICE RULE (same as the estimate template): a blank quantity means the price typed IS the line total
 *  ({ fixedPriceCents }); with a quantity, the line total is quantity x unit price ({ qty, unitPriceCents }), half-up
 *  to the cent once. */
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
  const L = readLines();
  const tax = readNumber('taxPct', { max: 100 });
  const paid = readMoney('paid');
  if (L.bad || tax.bad || paid.bad) { revealInvalid(); reportInputError(); return renderBlocked(FIX_MSG); }

  const priced = L.lines.filter((l) => l.cents !== null);
  if (priced.some((l) => l.cents > MAX_CENTS)) return renderBlocked('', T.warn.tooBig);
  // Subtotal, tax (half-up once on the subtotal) and total come from estimate-math.js, in whole cents, exactly as on the
  // estimate template; the balance due is the total minus the payments received, a whole-cent difference.
  const t = estimateTotals(priced.map(helperLine), tax.empty ? 0 : tax.value);
  if (!t.ok || t.totalCents > MAX_CENTS) return renderBlocked('', T.warn.tooBig);
  const paidCents = paid.empty ? null : paid.cents;
  const blank = L.lines.every((l) => l.empty); // no line filled in: the printout is a form to fill in by hand
  if (paidCents !== null && !blank && paidCents > t.totalCents) return renderBlocked('', T.warn.paidOver);

  const s = {
    lines: L.lines, priced, t, tax, paidCents, blank,
    balanceCents: t.totalCents - (paidCents ?? 0),
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
  const { priced, t, tax, paidCents, balanceCents } = s;
  const R = T.rows;
  const has = priced.length > 0;
  setText($('rTotal'), money(balanceCents));
  $('rTotal').classList.toggle('dim', !has);
  const sub = [T.lines(priced.length), tax.empty ? T.noTax : T.withTax(fmtPct(tax.value))];
  if (paidCents !== null) sub.push(T.paidSub(money(paidCents)));
  setText($('rSub'), has ? sub.join(' · ') : T.need);

  const rows = [];
  if (has) {
    rows.push(ln(R.sub, '', money(t.subtotalCents)));
    if (!tax.empty) rows.push(ln(R.tax(fmtPct(tax.value)), '', money(t.taxCents)));
    rows.push(ln(R.total, '', money(t.totalCents), 'total'));
    if (paidCents !== null) rows.push(ln(R.paid, '', MINUS + money(paidCents)));
    rows.push(ln(R.bal, '', money(balanceCents), 'key'));
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
  if (isYmd($('invDate').value) && isYmd($('dueDate').value) && $('dueDate').value < $('invDate').value) w.push(T.warn.dueBefore);
  setHTML($('warns'), w.map((x) => `<li>${x}</li>`).join(''));
  $('printBtn').disabled = false;
  setBar(has ? balanceCents : null);
}

// ── Render: the printed invoice (#doc, print-only) ───────────────────────────────
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

  // The invoice date fills itself in with today, so a form to fill in by hand leaves both dates blank.
  const date = blank ? '' : longDate($('invDate').value, D.locale);
  const due = blank ? '' : longDate($('dueDate').value, D.locale);
  const phone = v('bizPhone'); const email = v('bizEmail');
  const contact = !blank && phone && email ? `<div>${esc(phone)} · ${esc(email)}</div>` : line(D.phone, phone) + line(D.email, email);

  const out = [];
  out.push('<div class="d-head"><div class="d-biz">'
    + line(D.biz, v('bizName'), 'd-bizname') + contact
    + `</div><div class="d-meta"><div class="d-title">${D.title}</div><table class="d-kv">`
    + kv(D.no, v('invNo')) + kv(D.date, date) + kv(D.due, due) + kv(D.est, v('estNo')) + kv(D.co, v('coNos')) + '</table></div></div>');

  const cust = line(D.name, v('custName'), 'd-custname') + line(D.jobAddr, v('custAddr'), '', v('custAddr') ? `${D.jobAddr}:` : '');
  if (cust) out.push(`<div class="d-sec"><div class="d-h">${D.billTo}</div>${cust}</div>`);

  const head = `<thead><tr><th>${D.desc}</th><th class="d-num">${D.qty}</th><th>${D.unit}</th><th class="d-num">${D.price}</th><th class="d-num">${D.amt}</th></tr></thead>`;
  let body;
  if (blank) body = '<tr><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(BLANK_ROWS);
  else {
    body = s.lines.filter((l) => !l.empty).map((l) => {
      const flat = l.qty === null;
      return `<tr><td>${esc(l.desc)}</td><td class="d-num">${flat ? '' : fmtNum(l.qty, 4)}</td><td>${l.unit ? esc(l.unit) : flat ? D.flat : ''}</td>`
        + `<td class="d-num">${l.priceCents === null || flat ? '' : m(l.priceCents)}</td><td class="d-num">${l.cents === null ? '' : m(l.cents)}</td></tr>`;
    }).join('');
  }
  out.push(`<table class="d-items${blank ? ' d-blank' : ''}">${head}<tbody>${body}</tbody></table>`);

  // Subtotal, tax, total, what was already paid (taken off, so it prints with a minus) and the balance due.
  const { t, tax, paidCents, balanceCents } = s;
  const tot = [];
  const amt = (label, cents, cls = '', minus = false) => tot.push(`<tr${cls ? ` class="${cls}"` : ''}><th>${label}</th>${blank || cents === null ? '<td class="d-rule-cell"></td>' : `<td>${minus ? MINUS : ''}${m(cents)}</td>`}</tr>`);
  amt(D.sub, t.subtotalCents);
  if (!tax.empty) amt(D.tax(fmtPct(tax.value)), t.taxCents);
  else if (blank) amt(D.taxBlank, null);
  amt(D.total, t.totalCents, 'd-bal');
  if (blank || paidCents !== null) amt(D.paid, paidCents, '', true);
  amt(D.bal, balanceCents, 'd-total');
  out.push(`<table class="d-totals"><tbody>${tot.join('')}</tbody></table>`);

  const pay = text(v('payHow'), 2);
  if (pay) out.push(`<div class="d-sec"><div class="d-h">${D.pay}</div>${pay}</div>`);
  const notes = text(v('notes'));
  if (notes) out.push(`<div class="d-sec"><div class="d-h">${D.notes}</div>${notes}</div>`);
  out.push(`<p class="d-thanks">${D.thanks}</p>`);
  // No TalkEstimate credit on the printout: it is the contractor's own document for the customer (as on the estimate template).
  setHTML($('doc'), out.join(''));
}

// ── Print / reset / example ──────────────────────────────────────────────────────
const hasContent = () => [...document.querySelectorAll('#calc input, #calc textarea')].some((el) => el.id !== 'invDate' && el.value.trim() !== '');

function doPrint() {
  if ($('printBtn').disabled) return;
  track('tool_print');
  window.print();
}

function doReset(skipFocus) {
  document.querySelectorAll('#calc input, #calc textarea').forEach((el) => { el.value = ''; });
  $('invDate').value = todayYmd();
  $('docLang').value = LANG;
  $('lineRows').innerHTML = '';
  for (let i = 0; i < START_ROWS; i++) addRow();
  compute();
  if (!skipFocus) $('bizName').focus();
}

// Example: the invoice for the estimate template's own example job (estimate #1001, a water-damaged bathroom ceiling,
// $854.40) and the change order template's change order #1 on it ($335.60). The first five lines are the estimate's
// own five lines, word for word; the change order goes on as one flat-price line at its total. No sales tax; the
// $250 deposit from the estimate's example is the payment already received, so the balance due is $940.00. Every
// price is an example, not a market rate. qty '' = a flat price. scripts/tests/invoice-template.test.ts recomputes
// these lines and the payment with estimate-math.js, ties them to the estimate and change order examples, and checks
// every figure the two pages and their social cards print about them. Change them together.
const EXAMPLE_LINES = [
  { qty: '', unit: ['', ''], price: '285', text: ['Cut out and replace the water-damaged drywall, about 4 × 4 ft', 'Cortar y reemplazar el drywall dañado por agua, unos 4 × 4 pies'] },
  { qty: '4.5', unit: ['hr', 'h'], price: '62', text: ['Tape, mud and sand the patch, 3 coats', 'Poner cinta, masilla y lijar el parche, 3 manos'] },
  { qty: '64', unit: ['sq ft', 'pies²'], price: '2.25', text: ['Prime and paint the whole ceiling, 2 coats', 'Sellar y pintar todo el techo, 2 manos'] },
  { qty: '1', unit: ['lot', 'lote'], price: '86.40', text: ['Materials: drywall, tape, compound, primer, ceiling paint', 'Materiales: drywall, cinta, masilla, sellador, pintura para techo'] },
  { qty: '', unit: ['', ''], price: '60', text: ['Protect the floor and fixtures, clean up, haul away the debris', 'Proteger el piso y los muebles del baño, limpiar, retirar el escombro'] },
  { qty: '', unit: ['', ''], price: '335.60', text: ['Change order #1, approved: more drywall repair, the new towel bar and toilet paper holder, less the customer’s ceiling paint', 'Orden de cambio #1, aprobada: más reparación de drywall, el toallero y el portarrollos nuevos, menos la pintura para techo de la clienta'] },
];
const EXAMPLE_PAID = '250';
const EXAMPLE = {
  en: {
    bizName: 'Example Home Repair LLC', bizPhone: '(555) 010-0123', bizEmail: 'office@example.com',
    invNo: '1001', estNo: '1001', coNos: '1', custName: 'Alex Johnson', custAddr: '123 Main St',
    payHow: 'Check or cash. Make checks payable to Example Home Repair LLC.',
    notes: 'Work done as agreed in estimate #1001 and change order #1.\nThe balance is due when the work is done, as in estimate #1001.\nQuestions about this invoice? Call or email us.',
  },
  es: {
    bizName: 'Reparaciones Ejemplo LLC', bizPhone: '(555) 010-0123', bizEmail: 'oficina@example.com',
    invNo: '1001', estNo: '1001', coNos: '1', custName: 'Ana Torres', custAddr: '123 Main St',
    payHow: 'Cheque o efectivo. Cheques a nombre de Reparaciones Ejemplo LLC.',
    notes: 'Trabajo hecho según el estimado #1001 y la orden de cambio #1.\nEl saldo se paga al terminar el trabajo, como dice el estimado #1001.\n¿Preguntas sobre esta factura? Llámanos o escríbenos.',
  },
}[LANG];

function loadExample() {
  if (hasContent() && !window.confirm(T.confirmExample)) return;
  doReset(true);
  for (const [id, value] of Object.entries(EXAMPLE)) $(id).value = value;
  $('dueDate').value = $('invDate').value; // due when the work is done, the day of the invoice
  const k = LANG === 'es' ? 1 : 0;
  EXAMPLE_LINES.forEach((l, i) => {
    const row = $('lineRows').children[i] || addRow();
    const [d, q, u, p] = row.querySelectorAll('input');
    d.value = l.text[k]; q.value = l.qty; u.value = l.unit[k]; p.value = l.price;
  });
  $('paid').value = EXAMPLE_PAID;
  compute();
}

// ── Wire up ──────────────────────────────────────────────────────────────────────
let touched = false;
const firstTouch = () => { if (!touched) { touched = true; track('tool_first_interaction'); } };
$('calc').addEventListener('input', () => { firstTouch(); compute(); });
$('calc').addEventListener('change', compute);
$('calc').addEventListener('submit', (e) => e.preventDefault());
$('addLine').addEventListener('click', () => { addRow(true); compute(); });
$('printBtn').addEventListener('click', doPrint);
$('resetBtn').addEventListener('click', () => { if (hasContent() && !window.confirm(T.confirmClear)) return; doReset(); });
$('exampleBtn').addEventListener('click', () => { firstTouch(); loadExample(); });

doReset(true);
track('tool_view');
keepFocusAboveBar();
