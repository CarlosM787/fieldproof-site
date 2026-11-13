// FAQPage structured data from the FAQ that is already on the page (G W-10). The visible <details> text is the
// source of truth: this writes it, tags stripped, into one <script type="application/ld+json" id="faq-ld"> per page.
//   node scripts/faq-ld.mjs           rewrite the block on every page below (idempotent)
//   node scripts/faq-ld.mjs --check   exit 1 if any page's block does not match its visible FAQ
// Answers that quote a plan price (/month, /mo, /mes) are left out on purpose: plan prices change with the Stripe
// cutover and must exist in one visible place only. scripts/tests/g-batch.test.ts runs the same check.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
export const FAQ_PAGES = [
  'index.html', 'es.html',
  'tools/markup-margin-calculator.html', 'tools/painting-estimate-calculator.html', 'tools/labor-job-quote-calculator.html', 'tools/labor-cost-per-hour-calculator.html',
  'es/herramientas/calculadora-markup-margen.html', 'es/herramientas/calculadora-estimado-pintura.html',
  'es/herramientas/calculadora-mano-de-obra-cotizacion.html', 'es/herramientas/calculadora-costo-hora-mano-de-obra.html',
  'tools/estimate-template.html', 'es/herramientas/plantilla-de-estimado.html',
];
const PLAN_PRICE = /\$\s?\d[\d.,]*\s?\/\s?(mo|month|mes)\b/i;
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export function faqItems(html) {
  const start = html.indexOf('<div class="faq"');
  if (start < 0) return [];
  const block = html.slice(start, html.indexOf('</div>', html.lastIndexOf('</details>')));
  return [...block.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map(([, q, a]) => ({ q: text(q), a: text(a) }))
    .filter(({ a }) => !PLAN_PRICE.test(a));
}

export function faqBlock(html) {
  const lang = /<html lang="(\w+)"/.exec(html)?.[1] ?? 'en';
  const data = {
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
    mainEntity: faqItems(html).map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return `<script type="application/ld+json" id="faq-ld">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

const RE = /<script type="application\/ld\+json" id="faq-ld">[\s\S]*?<\/script>/;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const f of FAQ_PAGES) {
    const p = path.join(ROOT, f);
    const raw = readFileSync(p, 'utf8');
    const crlf = raw.includes('\r\n');
    const html = raw.replace(/\r\n/g, '\n');
    const block = faqBlock(html);
    const cur = RE.exec(html)?.[0];
    if (check) { if (cur !== block) { bad++; console.error(`out of date: ${f}`); } continue; }
    const next = cur ? html.replace(RE, block) : html.replace('\n</head>', `\n  ${block}\n</head>`);
    writeFileSync(p, crlf ? next.replace(/\n/g, '\r\n') : next);
    console.log(`${f}: ${faqItems(html).length} questions`);
  }
  if (check) { console.log(bad ? `${bad} page(s) out of date` : 'faq-ld: all pages match their visible FAQ'); process.exit(bad ? 1 : 0); }
}
