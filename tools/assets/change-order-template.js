// Free printable change order template (EN + ES pages share this file; the page's <html lang> picks the words).
// The contractor fills in their business, the change order and the estimate it changes, the customer and job address,
// why the work changed, one line per change (added work or a credit; quantity x unit price, or a flat price when the
// quantity is blank), the original contract amount, any change orders already approved, and the days the change adds.
// The totals add up as they type, and "Print or save PDF" prints only the change order (#doc), built here from what
// was typed: empty lines are left off. Same pattern as estimate-template.js.
// Nothing typed leaves this tab and nothing is stored (no network, no browser storage). Analytics (only on
// talkestimate.com) gets the tool name and the event name, never an amount or typed text.
import { lineTotal, estimateTotals, formatMoney, MAX_CENTS } from './estimate-math.js';
import {
  LANG, $, money, fmtNum, readMoney, readNumber, makeTracker, makeErrorReporter, ln, esc,
  pricebar, FIX_MSG, revealInvalid, keepFocusAboveBar,
} from './tool-ui.js';

const T = {
  en: {
    line: (n) => `Line ${n}`, rmLine: (n) => `Remove line ${n}`, remove: 'Remove',
    kind: 'Type', add: 'Added work', credit: 'Credit (comes off the price)',
    desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price',
    descPh: 'e.g. Replace 2 more sheets of damaged drywall', unitPh: 'hr, sq ft',
    flat: 'flat price', noPrice: 'no price yet', credited: 'credit',
    need: 'Add a line with a price to see the change total.',
    lines: (n) => (n === 1 ? '1 priced line' : `${n} priced lines`),
    newTotal: (m) => `new contract total ${m}`, noOrig: 'no original amount yet',
    rows: { add: 'Added work', credit: 'Credits', change: 'This change order', orig: 'Original contract', prev: 'Earlier change orders', total: 'New contract total' },
    warn: {
      noPrice: (n) => `Line ${n} has a quantity but no price, so it adds nothing to the change.`,
      noDesc: (n) => `Line ${n} has a price but no description. Say what changed.`,
      noOrig: 'Add the original estimate or contract amount to show the new contract total.',
      noReason: 'Say why the work changed. It’s the first thing a customer asks.',
      before: 'The change order date is before the estimate date.',
      negTotal: 'The credits are more than the contract total. Check the amounts before you print.',
      tooBig: 'Those numbers are larger than this template handles.',
    },
    confirmClear: 'Clear everything you typed? Nothing is saved, so this can’t be undone.',
    confirmExample: 'Replace what you typed with the example? Nothing is saved, so this can’t be undone.',
  },
  es: {
    line: (n) => `Línea ${n}`, rmLine: (n) => `Quitar línea ${n}`, remove: 'Quitar',
    kind: 'Tipo', add: 'Trabajo agregado', credit: 'Crédito (se resta del precio)',
    desc: 'Descripción', qty: 'Cant.', unit: 'Unidad', price: 'Precio unitario',
    descPh: 'ej. Reemplazar 2 hojas más de drywall dañado', unitPh: 'h, pies²',
    flat: 'precio fijo', noPrice: 'sin precio', credited: 'crédito',
    need: 'Agrega una línea con precio para ver el total del cambio.',
    lines: (n) => (n === 1 ? '1 línea con precio' : `${n} líneas con precio`),
    newTotal: (m) => `nuevo total del contrato ${m}`, noOrig: 'falta el monto original',
    rows: { add: 'Trabajo agregado', credit: 'Créditos', change: 'Esta orden de cambio', orig: 'Contrato original', prev: 'Órdenes de cambio anteriores', total: 'Nuevo total del contrato' },
    warn: {
      noPrice: (n) => `La línea ${n} tiene cantidad pero no precio, así que no suma nada al cambio.`,
      noDesc: (n) => `La línea ${n} tiene precio pero no descripción. Di qué cambió.`,
      noOrig: 'Escribe el monto del estimado o contrato original para ver el nuevo total del contrato.',
      noReason: 'Di por qué cambió el trabajo. Es lo primero que pregunta el cliente.',
      before: 'La fecha de la orden de cambio es antes de la fecha del estimado.',
      negTotal: 'Los créditos son más que el total del contrato. Revisa las cantidades antes de imprimir.',
      tooBig: 'Esos números son más grandes de lo que maneja esta plantilla.',
    },
    confirmClear: '¿Borrar todo lo que escribiste? No se guarda nada, así que no se puede deshacer.',
    confirmExample: '¿Cambiar lo que escribiste por el ejemplo? No se guarda nada, así que no se puede deshacer.',
  },
}[LANG];

// The printed change order's own words, in the language picked under "Printout language" (both pages offer both).
// Only these labels change: whatever the contractor typed prints exactly as typed.
const DOC = {
  en: {
    locale: 'en-US', title: 'Change order', no: 'Change order #', date: 'Date', est: 'Estimate #', estDate: 'Estimate date',
    biz: 'Business', phone: 'Phone', email: 'Email', cust: 'Customer', name: 'Name', jobAddr: 'Job address',
    reason: 'Reason for the change', desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price', amt: 'Amount', flat: 'flat price', credit: 'Credit',
    add: 'Added work', credits: 'Credits', change: 'This change order', orig: 'Original contract', prev: 'Earlier change orders', total: 'New contract total',
    blankHint: 'Write a credit as a minus amount.',
    sched: 'Schedule', days: (n) => (n === 0 ? 'This change doesn’t change the schedule.' : `This change adds ${n} ${n === 1 ? 'day' : 'days'} to the schedule.`),
    daysBlank: 'Days this change adds to the schedule',
    notes: 'Notes and terms', sigC: 'Contractor signature', sigK: 'Customer signature', sigDate: 'Date',
    accept: 'Customer approval: I approve this change order, its price and its effect on the schedule.',
    fix: 'This change order can’t print yet: fix what’s marked on the form, then print again.',
  },
  es: {
    locale: 'es-US', title: 'Orden de cambio', no: 'Núm. de orden', date: 'Fecha', est: 'Núm. de estimado', estDate: 'Fecha del estimado',
    biz: 'Negocio', phone: 'Teléfono', email: 'Correo', cust: 'Cliente', name: 'Nombre', jobAddr: 'Dirección del trabajo',
    reason: 'Motivo del cambio', desc: 'Descripción', qty: 'Cant.', unit: 'Unidad', price: 'Precio unitario', amt: 'Monto', flat: 'precio fijo', credit: 'Crédito',
    add: 'Trabajo agregado', credits: 'Créditos', change: 'Esta orden de cambio', orig: 'Contrato original', prev: 'Órdenes de cambio anteriores', total: 'Nuevo total del contrato',
    blankHint: 'Escribe un crédito como cantidad con signo de menos.',
    sched: 'Plazo', days: (n) => (n === 0 ? 'Este cambio no cambia el plazo del trabajo.' : `Este cambio agrega ${n} ${n === 1 ? 'día' : 'días'} al plazo del trabajo.`),
    daysBlank: 'Días que este cambio agrega al plazo',
    notes: 'Notas y condiciones', sigC: 'Firma del contratista', sigK: 'Firma del cliente', sigDate: 'Fecha',
    accept: 'Aprobación del cliente: apruebo esta orden de cambio, su precio y su efecto en el plazo del trabajo.',
    fix: 'Esta orden de cambio todavía no se puede imprimir: corrige lo que está marcado en el formulario y vuelve a imprimir.',
  },
};

const track = makeTracker('change_order_template');
const reportInputError = makeErrorReporter(track);
const START_ROWS = 3;
const MAX_ROWS = 40;
const BLANK_ROWS = 6; // ruled lines on a printout with no lines filled in (a form to fill in by hand); keeps it to one Letter page
const MINUS = '−';
let rowSeq = 0;

/** Signed cents for display: a credit (negative) gets a real minus sign in front of the formatted amount. */
const signed = (cents, fmt) => (cents < 0 ? MINUS + fmt(-cents) : fmt(cents));

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

// ── Change lines ─────────────────────────────────────────────────────────────────
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
    + `<div class="field est-kind"><label for="${id}-k">${T.kind}</label><select id="${id}-k"><option value="add" selected>${T.add}</option><option value="credit">${T.credit}</option></select></div>`
    + `<div class="field est-desc"><label for="${id}-d">${T.desc}</label><input type="text" id="${id}-d" maxlength="200"${first ? ` placeholder="${T.descPh}"` : ''}></div>`
    + `<div class="row3 dims">${field('q', T.qty, 'inputmode="decimal"', 'num')}${field('u', T.unit, `maxlength="12"${first ? ` placeholder="${T.unitPh}"` : ''}`, 'num')}${field('p', T.price, 'inputmode="decimal" placeholder="0.00"', 'money')}</div>`;
  row.querySelector('.rm').addEventListener('click', () => removeRow(row));
  box.appendChild(row);
  renumber();
  if (focus) row.querySelector('select').focus();
  return row;
}

function removeRow(row) {
  const box = $('lineRows');
  const i = [...box.children].indexOf(row);
  row.remove();
  renumber();
  const left = [...box.children];
  const next = left[i] || left[i - 1];
  (next ? next.querySelector('select') : $('addLine')).focus();
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
 *  to the cent once. A credit is typed as a positive amount; its line total is taken off, never added. */
const helperLine = (l) => (l.qty === null ? { fixedPriceCents: l.priceCents } : { qty: l.qty, unitPriceCents: l.priceCents });

function readLines() {
  const lines = [];
  let bad = false;
  [...$('lineRows').children].forEach((row, i) => {
    const kEl = row.querySelector('select');
    const [dEl, qEl, uEl, pEl] = row.querySelectorAll('input');
    const amt = row.querySelector('.est-amt');
    const kind = kEl.value === 'credit' ? 'credit' : 'add';
    row.classList.toggle('est-credit', kind === 'credit');
    const desc = dEl.value.trim();
    const unit = uEl.value.trim();
    const q = readNumber(qEl, { max: 1000000 });
    const p = readMoney(pEl);
    if (q.bad || p.bad) { bad = true; amt.textContent = ''; return; }
    const line = { n: i + 1, kind, desc, unit, qty: q.empty ? null : q.value, priceCents: p.empty ? null : p.cents, cents: null };
    line.empty = !desc && !unit && q.empty && p.empty;
    if (line.priceCents !== null) line.cents = lineTotal(helperLine(line)).cents;
    amt.textContent = line.empty ? '' : line.cents === null ? T.noPrice
      : kind === 'credit' ? `${MINUS}${money(line.cents)} · ${T.credited}` : `${money(line.cents)}${line.qty === null ? ` · ${T.flat}` : ''}`;
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
  const orig = readMoney('origAmt');
  const prev = readMoney('prevAmt');
  const days = readNumber('days', { integer: true, max: 365 });
  if (L.bad || orig.bad || prev.bad || days.bad) { revealInvalid(); reportInputError(); return renderBlocked(FIX_MSG); }

  const priced = L.lines.filter((l) => l.cents !== null);
  if (priced.some((l) => l.cents > MAX_CENTS)) return renderBlocked('', T.warn.tooBig);
  // Added work and credits are each summed by estimate-math.js (every line rounded to the cent once, no tax);
  // the change is the difference, in whole cents.
  const adds = estimateTotals(priced.filter((l) => l.kind === 'add').map(helperLine), 0);
  const credits = estimateTotals(priced.filter((l) => l.kind === 'credit').map(helperLine), 0);
  if (!adds.ok || !credits.ok || adds.totalCents > MAX_CENTS || credits.totalCents > MAX_CENTS) return renderBlocked('', T.warn.tooBig);
  const changeCents = adds.totalCents - credits.totalCents;
  const origCents = orig.empty ? null : orig.cents;
  const prevCents = prev.empty ? null : $('prevKind').value === 'credit' ? -prev.cents : prev.cents;
  const newCents = origCents === null ? null : origCents + (prevCents ?? 0) + changeCents;
  if (newCents !== null && newCents > MAX_CENTS) return renderBlocked('', T.warn.tooBig);
  const blank = L.lines.every((l) => l.empty); // no line filled in: the printout is a form to fill in by hand
  if (newCents !== null && !blank && newCents < 0) return renderBlocked('', T.warn.negTotal);

  const s = {
    lines: L.lines, priced, blank, days,
    addCents: adds.totalCents, creditCents: credits.totalCents, hasCredit: priced.some((l) => l.kind === 'credit'),
    changeCents, origCents, prevCents, newCents,
  };
  render(s);
  renderDoc(s);

  if (!completeSent && priced.length > 0) {
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
  const { priced, changeCents, origCents, prevCents, newCents } = s;
  const R = T.rows;
  const has = priced.length > 0;
  setText($('rTotal'), signed(changeCents, money));
  $('rTotal').classList.toggle('dim', !has);
  setText($('rSub'), has ? `${T.lines(priced.length)} · ${newCents === null ? T.noOrig : T.newTotal(money(newCents))}` : T.need);

  const rows = [];
  if (has) {
    if (s.hasCredit) {
      rows.push(ln(R.add, '', money(s.addCents)));
      rows.push(ln(R.credit, '', MINUS + money(s.creditCents), '', true));
    }
    rows.push(ln(R.change, '', signed(changeCents, money), 'key'));
    if (origCents !== null) {
      rows.push(ln(R.orig, '', money(origCents)));
      if (prevCents !== null) rows.push(ln(R.prev, '', signed(prevCents, money)));
      rows.push(ln(R.change, '', signed(changeCents, money)));
      rows.push(ln(R.total, '', money(newCents), 'total'));
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
  if (has && origCents === null) w.push(T.warn.noOrig);
  if (has && !$('reason').value.trim()) w.push(T.warn.noReason);
  if (isYmd($('coDate').value) && isYmd($('estDate').value) && $('coDate').value < $('estDate').value) w.push(T.warn.before);
  setHTML($('warns'), w.map((x) => `<li>${x}</li>`).join(''));
  $('printBtn').disabled = false;
  setBar(has ? changeCents : null);
}

// ── Render: the printed change order (#doc, print-only) ──────────────────────────
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

  // The change order date fills itself in with today, so a form to fill in by hand leaves it blank; the estimate
  // date is only ever what was typed.
  const date = blank ? '' : longDate($('coDate').value, D.locale);
  const estDate = longDate($('estDate').value, D.locale);
  const phone = v('bizPhone'); const email = v('bizEmail');
  const contact = !blank && phone && email ? `<div>${esc(phone)} · ${esc(email)}</div>` : line(D.phone, phone) + line(D.email, email);

  const out = [];
  out.push('<div class="d-head"><div class="d-biz">'
    + line(D.biz, v('bizName'), 'd-bizname') + contact
    + `</div><div class="d-meta"><div class="d-title">${D.title}</div><table class="d-kv">`
    + kv(D.no, v('coNo')) + kv(D.date, date) + kv(D.est, v('estNo')) + kv(D.estDate, estDate) + '</table></div></div>');

  const cust = line(D.name, v('custName'), 'd-custname') + line(D.jobAddr, v('custAddr'), '', v('custAddr') ? `${D.jobAddr}:` : '');
  if (cust) out.push(`<div class="d-sec"><div class="d-h">${D.cust}</div>${cust}</div>`);
  const reason = text(v('reason'), 3);
  if (reason) out.push(`<div class="d-sec"><div class="d-h">${D.reason}</div>${reason}</div>`);

  const head = `<thead><tr><th>${D.desc}</th><th class="d-num">${D.qty}</th><th>${D.unit}</th><th class="d-num">${D.price}</th><th class="d-num">${D.amt}</th></tr></thead>`;
  let body;
  if (blank) body = '<tr><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(BLANK_ROWS);
  else {
    body = s.lines.filter((l) => !l.empty).map((l) => {
      const flat = l.qty === null;
      const credit = l.kind === 'credit';
      return `<tr${credit ? ' class="d-credit"' : ''}><td>${credit ? `<b class="d-tag">${D.credit}:</b> ` : ''}${esc(l.desc)}</td><td class="d-num">${flat ? '' : fmtNum(l.qty, 4)}</td><td>${l.unit ? esc(l.unit) : flat ? D.flat : ''}</td>`
        + `<td class="d-num">${l.priceCents === null || flat ? '' : m(l.priceCents)}</td><td class="d-num">${l.cents === null ? '' : `${credit ? MINUS : ''}${m(l.cents)}`}</td></tr>`;
    }).join('');
  }
  out.push(`<table class="d-items${blank ? ' d-blank' : ''}">${head}<tbody>${body}</tbody></table>`);
  if (blank) out.push(`<p class="d-hint">${D.blankHint}</p>`);

  // Two small tables: what this change order adds and takes off, then where the contract total stands after it.
  const { changeCents, origCents, prevCents, newCents } = s;
  const amt = (rows, label, cents, cls = '') => rows.push(`<tr${cls ? ` class="${cls}"` : ''}><th>${label}</th>${blank || cents === null ? '<td class="d-rule-cell"></td>' : `<td>${signed(cents, m)}</td>`}</tr>`);
  const chg = [];
  if (blank || s.hasCredit) { amt(chg, D.add, s.addCents); amt(chg, D.credits, -s.creditCents); }
  amt(chg, D.change, changeCents, 'd-total');
  out.push(`<table class="d-totals"><tbody>${chg.join('')}</tbody></table>`);
  if (blank || origCents !== null) {
    const con = [];
    // On a form to fill in by hand, a typed original amount still prints; everything that depends on the lines is blank.
    const show = (label, cents, cls) => (blank && cents !== null
      ? con.push(`<tr${cls ? ` class="${cls}"` : ''}><th>${label}</th><td>${signed(cents, m)}</td></tr>`) : amt(con, label, cents, cls));
    show(D.orig, origCents);
    if (blank || prevCents !== null) show(D.prev, prevCents);
    amt(con, D.change, changeCents);
    amt(con, D.total, newCents, 'd-total');
    out.push(`<table class="d-totals d-contract"><tbody>${con.join('')}</tbody></table>`);
  }

  if (!s.days.empty) out.push(`<div class="d-sec"><div class="d-h">${D.sched}</div><div>${D.days(s.days.value)}</div></div>`);
  else if (blank) out.push(`<div class="d-sec"><div class="d-f"><span class="d-lbl">${D.daysBlank}</span>${rule}</div></div>`);

  const notes = text(v('notes'));
  if (notes) out.push(`<div class="d-sec"><div class="d-h">${D.notes}</div>${notes}</div>`);

  const sig = (label) => `<div class="d-sigrow"><div>${label}</div><div>${D.sigDate}</div></div>`;
  out.push(`<div class="d-sign"><div class="d-sig">${sig(D.sigC)}</div><div class="d-sig"><p class="d-accept">${D.accept}</p>${sig(D.sigK)}</div></div>`);
  // No TalkEstimate credit on the printout: it is the contractor's own document for his customer (as on the estimate template).
  setHTML($('doc'), out.join(''));
}

// ── Print / reset / example ──────────────────────────────────────────────────────
const hasContent = () => [...document.querySelectorAll('#calc input, #calc textarea')].some((el) => el.id !== 'coDate' && el.value.trim() !== '');

function doPrint() {
  if ($('printBtn').disabled) return;
  track('tool_print');
  window.print();
}

function doReset(skipFocus) {
  document.querySelectorAll('#calc input, #calc textarea').forEach((el) => { el.value = ''; });
  $('coDate').value = todayYmd();
  $('prevKind').value = 'add';
  $('docLang').value = LANG;
  $('lineRows').innerHTML = '';
  for (let i = 0; i < START_ROWS; i++) addRow();
  compute();
  if (!skipFocus) $('bizName').focus();
}

// Example: change order #1 on the estimate template's own example job (estimate #1001, a water-damaged bathroom
// ceiling, $854.40). Opening the ceiling showed more damage, the customer asked for a new towel bar and toilet paper holder, and the
// customer already has the ceiling paint (a credit). Every price is an example, not a market rate; the hourly rate is
// the estimate's own $62. qty '' = a flat price. scripts/tests/change-order-template.test.ts recomputes these lines,
// the original amount and the days with estimate-math.js and checks every figure the two pages print about them.
const EXAMPLE_LINES = [
  { kind: 'add', qty: '', unit: ['', ''], price: '140', text: ['Cut out and replace about 2 × 4 ft more water-damaged drywall, found once the ceiling was open', 'Cortar y reemplazar unos 2 × 4 pies más de drywall dañado por agua, que aparecieron al abrir el techo'] },
  { kind: 'add', qty: '2', unit: ['hr', 'h'], price: '62', text: ['Tape, mud and sand the larger patch', 'Poner cinta, masilla y lijar el parche más grande'] },
  { kind: 'add', qty: '1', unit: ['lot', 'lote'], price: '28.60', text: ['Materials: more drywall, tape and compound', 'Materiales: más drywall, cinta y masilla'] },
  { kind: 'add', qty: '', unit: ['', ''], price: '85', text: ['Take down the old towel bar and toilet paper holder; put up the new ones the customer bought', 'Quitar el toallero y el portarrollos viejos; poner los nuevos que compró la clienta'] },
  { kind: 'credit', qty: '', unit: ['', ''], price: '42', text: ['Ceiling paint the customer already has', 'Pintura para techo que la clienta ya tiene'] },
];
const EXAMPLE_ORIGINAL = '854.40';
const EXAMPLE_DAYS = '1';
const EXAMPLE_ESTIMATE_AGE = 12; // the estimate was written 12 days before this change order
const EXAMPLE = {
  en: {
    bizName: 'Example Home Repair LLC', bizPhone: '(555) 010-0123', bizEmail: 'office@example.com',
    coNo: '1', estNo: '1001', custName: 'Alex Johnson', custAddr: '123 Main St',
    reason: 'Once we opened the ceiling, the water damage ran past the 4 × 4 ft area in estimate #1001: about 2 × 4 ft more drywall has to come out. The customer also asked us to put up the new towel bar and toilet paper holder they bought while we’re here, and already has the ceiling paint, so it comes off the price.',
    notes: 'Everything else in estimate #1001 stays the same.\nPayment for this change is due with the balance, when the work is done.\nWe start the work on this change order once it’s signed.',
  },
  es: {
    bizName: 'Reparaciones Ejemplo LLC', bizPhone: '(555) 010-0123', bizEmail: 'oficina@example.com',
    coNo: '1', estNo: '1001', custName: 'Ana Torres', custAddr: '123 Main St',
    reason: 'Al abrir el techo, el daño por agua pasaba del área de 4 × 4 pies del estimado #1001: hay que quitar unos 2 × 4 pies más de drywall. La clienta también nos pidió poner el toallero y el portarrollos nuevos que compró, ya que estamos aquí, y ya tiene la pintura para techo, así que se descuenta del precio.',
    notes: 'Todo lo demás del estimado #1001 sigue igual.\nEste cambio se paga junto con el saldo, al terminar el trabajo.\nEmpezamos el trabajo de esta orden de cambio cuando esté firmada.',
  },
}[LANG];

function loadExample() {
  if (hasContent() && !window.confirm(T.confirmExample)) return;
  doReset(true);
  for (const [id, value] of Object.entries(EXAMPLE)) $(id).value = value;
  $('estDate').value = addDays($('coDate').value, -EXAMPLE_ESTIMATE_AGE);
  const k = LANG === 'es' ? 1 : 0;
  EXAMPLE_LINES.forEach((l, i) => {
    const row = $('lineRows').children[i] || addRow();
    const [d, q, u, p] = row.querySelectorAll('input');
    row.querySelector('select').value = l.kind;
    d.value = l.text[k]; q.value = l.qty; u.value = l.unit[k]; p.value = l.price;
  });
  $('origAmt').value = EXAMPLE_ORIGINAL;
  $('days').value = EXAMPLE_DAYS;
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
