// S25 / app 11/10: "1 days left". The account page had the same wording: the trial title now uses a singular
// for exactly 1 day, EN + ES (same rule as the app's translate() .one strings).
import { assert } from 'jsr:@std/assert@1';

const JS = Deno.readTextFileSync(new URL('../../assets/account.js', import.meta.url)).replace(/\r\n/g, '\n');

Deno.test('account page: the trial title says "1 day" / "1 día" for exactly one day', () => {
  assert(JS.includes("previewOne: 'Free trial — {n} day left',"));
  assert(JS.includes("previewOne: 'Prueba gratis — te queda {n} día',"));
  assert(JS.includes("title = fmt(p.trialDaysLeft === 1 ? T.previewOne : T.preview, { n: p.trialDaysLeft });"));
  assert(JS.includes("preview: 'Free trial — {n} days left',") && JS.includes("preview: 'Prueba gratis — te quedan {n} días',"));
});
