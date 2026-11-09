// D1 (S25 run 11/08): get-public-proposal renders the header date in UTC; the page re-formats
// <span class="doc-date" data-iso> in the customer's clock, like the approval line. Old function output (no span)
// keeps working: nothing to replace.
import { assert } from 'jsr:@std/assert@1';

const page = Deno.readTextFileSync(new URL('../../p/index.html', import.meta.url));

Deno.test('proposal page re-formats the document date locally after injecting the body', () => {
  assert(page.includes("querySelectorAll('.doc-date[data-iso]')"));
  assert(page.includes("toLocaleDateString(data.language === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })"));
  const inject = page.indexOf("$('doc').innerHTML = data.bodyHtml;");
  assert(inject > 0 && page.indexOf('localDates();', inject) > inject, 'called right after the body is injected');
  // textContent only: the value never becomes HTML.
  assert(!/doc-date[^\n]*innerHTML/.test(page));
});

Deno.test('the date logic gives the local day for a late-evening UTC timestamp', () => {
  const iso = '2026-11-09T06:51:25.437398+00:00';
  const phx = new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' });
  assert(phx === 'November 8, 2026', phx);
});
