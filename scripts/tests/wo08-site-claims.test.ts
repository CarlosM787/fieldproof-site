// WO-20261106-08 part C: homepage claims (sweep C-13 / T-3), extensionless store URLs, sales-tax note,
// and the tool_input_error analytics event. Run with:  npx deno test --allow-read scripts/tests/
import { assert } from 'jsr:@std/assert@1';

const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));

Deno.test('homepage never claims one flat price or no caps, in either language', () => {
  for (const p of ['index.html', 'es.html']) {
    const html = read(p);
    assert(!/one flat price|nothing gated|nothing capped|precio [úu]nico|nada limitado|sin l[ií]mites/i.test(html), p);
    assert(!/seven steps|siete pasos/i.test(html), `${p}: the flow is four steps everywhere`);
  }
  assert(read('index.html').includes('Four steps.'));
  assert(read('index.html').includes('one flow, four steps'));
  assert(read('es.html').includes('Cuatro pasos.'));
  assert(read('es.html').includes('un solo flujo, cuatro pasos'));
});

Deno.test('the Spanish homepage uses pies², not "sqft"', () => {
  assert(!/\bsqft\b/.test(read('es.html')));
});

Deno.test('/support and /delete-account work without .html (store listing URLs)', () => {
  const rules = read('_redirects').split(/\r?\n/).map((l) => l.trim().split(/\s+/));
  for (const [from, to] of [['/support', '/support.html'], ['/delete-account', '/delete-account.html']]) {
    assert(rules.some((r) => r[0] === from && r[1] === to && r[2] === '200'), from);
  }
});

Deno.test('price calculators say the price has no sales tax (EN + ES)', () => {
  for (const p of ['tools/markup-margin-calculator.html', 'tools/labor-job-quote-calculator.html', 'tools/painting-estimate-calculator.html']) {
    assert(read(p).includes("The price doesn't include sales tax."), p);
  }
  for (const p of ['es/herramientas/calculadora-markup-margen.html', 'es/herramientas/calculadora-mano-de-obra-cotizacion.html', 'es/herramientas/calculadora-estimado-pintura.html']) {
    assert(read(p).includes('El precio no incluye el impuesto sobre la venta'), p);
  }
});

Deno.test('every calculator reports tool_input_error with a field name only', () => {
  const ui = read('tools/assets/tool-ui.js');
  assert(/track\('tool_input_error', \{ field_name: [^}]*\}\)/.test(ui));
  assert(!/tool_input_error[^\n]*\.value/.test(ui), 'never the typed value');
  for (const f of ['markup-margin', 'labor-quote', 'labor-rate', 'painting-estimate', 'estimate-template']) {
    const js = read(`tools/assets/${f}.js`);
    assert(js.includes('const reportInputError = makeErrorReporter(track);'), f);
    assert(js.includes('reportInputError();'), f);
  }
});

Deno.test('the example button counts as the first interaction (funnel: view → interaction → complete)', () => {
  for (const f of ['markup-margin', 'labor-quote', 'labor-rate', 'painting-estimate', 'estimate-template']) {
    const js = read(`tools/assets/${f}.js`);
    assert(/\$\('exampleBtn'\)\.addEventListener\('click', \(\) => \{ (firstTouch\(\);|if \(!touched\) \{ touched = true; track\('tool_first_interaction'\); \}) loadExample\(\); \}\);/.test(js), f);
  }
});

Deno.test('phones: the fixed price bar never covers the tool-page footer links', () => {
  const css = read('tools/assets/tools.css');
  const m = css.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/);
  assert(m && /\.tool-page footer\.foot-wrap \{ padding-bottom: 112px; \}/.test(m[1]));
});
