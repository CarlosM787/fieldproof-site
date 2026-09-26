// Builds the Count Lab from src/: checks the model, writes the step tables
// from the same model the animation uses, and inlines everything.
//   node build.mjs  ->  count-lab.html (artifact body) + dist/index.html (full page)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PATTERNS, loops, describe } from './src/model.js';

const here = new URL('.', import.meta.url).pathname;
const read = (f) => readFileSync(here + f, 'utf8');

for (const [id, p] of Object.entries(PATTERNS)) {
  if (!loops(p)) throw new Error(`pattern ${id} does not loop: state after 8 != state before 1`);
  for (const k of p.holds) if (p.steps[k]) throw new Error(`pattern ${id} steps on its hold count ${k}`);
  for (const k of p.breaks) if (!p.steps[k] || p.steps[k][2] !== 'break') throw new Error(`pattern ${id} has no break on ${k}`);
}

const TXT = {
  en: {
    head: ['Count', 'Leader', 'Follower'],
    names: { on1: 'On1', on2t: 'On2 · Torres count', on2c: 'On2 · 2-3-4 count' },
    rules: {
      on1: 'Steps on 1-2-3 and 5-6-7, pause on 4 and 8. Breaks on 1 and 5.',
      on2t: 'Steps on 1-2-3 and 5-6-7, pause on 4 and 8. Breaks on 2 and 6; counts 1 and 5 are small preparation steps.',
      on2c: 'Steps on 2-3-4 and 6-7-8, pause on 1 and 5. Breaks on 2 and 6. This is the count the SalsaCoach app scores. Which way the leader breaks on 2 is disputed; this page shows back, as the app does.',
    },
    body: `      <h2>How to read the floor</h2>
      <p>Filled shoe: the weight is on that foot. Outlined shoe: the free foot. The ring on the floor sits under the hips, and the dotted line drops from the hips to show which foot carries the weight. The leader is celeste and the follower is pink. They face each other, so when the leader breaks forward the follower breaks back, and the couple moves as one.</p>
      <h2>Where is the 1?</h2>
      <p>This band plays 2-3 son clave (gold). It strikes 2, 3, 5, the “and” of 6, and 8, and never the 1. The bell’s big strokes (coral) fall on 1, 3, 5 and 7. The congas (mint) slap on 2 and 6, the classic On2 reference, and play two open tones on 4 and 4&amp; and on 8 and 8&amp;, right before 5 and 1. The bass (violet) plays the “and” of 2 and beat 4, so it skips the 1. The bell and the congas mark 1 and 5 the same way. In this band the difference is the clave: silent on 1, sounding on 5.</p>
      <h2>The steps, count by count</h2>
{{TABLES}}
      <h2>Open questions for an instructor</h2>
      <ol>
        <li>Which count should the site call On2: the Torres count, the 2-3-4 count, or both under clear names?</li>
        <li>In the 2-3-4 count, does the leader break back or forward on 2? Sources disagree. This page shows back, as the SalsaCoach app does.</li>
        <li>In the Torres count, is the 1 danced on the beat or just before it? This page puts the weight on the beat.</li>
        <li>When does the foot leave the floor? This page lifts it in the last 40% of the beat, so the weight lands on the count.</li>
        <li>What happens on the pause: nothing, a tap, or either?</li>
        <li>Default camera: behind the teacher, or facing a mirror?</li>
      </ol>
      <p class="status"><b>Status:</b> prototype, not on mysalsacoach.com. The band is synthesized in your browser from traditional patterns; no recordings are used. Step conventions follow the SalsaCoach timing research notes (sections 2, 3, 6 and 7); no instructor has reviewed them yet. Timing was measured in a desktop browser, not yet on a phone or with Bluetooth headphones.</p>`,
  },
  es: {
    head: ['Tiempo', 'Líder', 'Seguidor(a)'],
    names: { on1: 'On1', on2t: 'On2 · conteo Torres', on2c: 'On2 · conteo 2-3-4' },
    rules: {
      on1: 'Pasos en 1-2-3 y 5-6-7, pausa en 4 y 8. Breaks en 1 y 5.',
      on2t: 'Pasos en 1-2-3 y 5-6-7, pausa en 4 y 8. Breaks en 2 y 6; el 1 y el 5 son pasos pequeños de preparación.',
      on2c: 'Pasos en 2-3-4 y 6-7-8, pausa en 1 y 5. Breaks en 2 y 6. Es el conteo que califica la app SalsaCoach. Hacia dónde hace el break el líder en el 2 está en disputa; esta página lo muestra hacia atrás, como la app.',
    },
    body: `      <h2>Cómo leer el piso</h2>
      <p>Zapato relleno: el peso está en ese pie. Zapato con contorno: el pie libre. El anillo en el piso queda debajo de la cadera, y la línea punteada baja desde la cadera para mostrar qué pie carga el peso. El líder es celeste y el seguidor(a) es rosa. Están frente a frente: cuando el líder hace el break hacia adelante, el seguidor(a) lo hace hacia atrás, y la pareja se mueve como una sola.</p>
      <h2>¿Dónde está el uno?</h2>
      <p>Esta banda toca clave de son 2-3 (dorado). Suena en 2, 3, 5, el «y» del 6 y el 8, y nunca en el 1. Los golpes fuertes de la campana (coral) caen en 1, 3, 5 y 7. Las congas (menta) dan el golpe seco en 2 y 6, la referencia clásica del On2, y tocan dos tonos abiertos en 4 y 4-y, y en 8 y 8-y, justo antes del 5 y del 1. El bajo (violeta) toca el «y» del 2 y el tiempo 4, así que se salta el 1. La campana y las congas marcan el 1 y el 5 igual. En esta banda la diferencia es la clave: calla en el 1 y suena en el 5.</p>
      <h2>Los pasos, tiempo por tiempo</h2>
{{TABLES}}
      <h2>Preguntas abiertas para un instructor</h2>
      <ol>
        <li>¿Qué conteo debe llamar On2 el sitio: el conteo Torres, el conteo 2-3-4, o los dos con nombres claros?</li>
        <li>En el conteo 2-3-4, ¿el líder hace el break hacia atrás o hacia adelante en el 2? Las fuentes no coinciden. Esta página lo muestra hacia atrás, como la app SalsaCoach.</li>
        <li>En el conteo Torres, ¿el 1 se baila en el tiempo o justo antes? Esta página pone el peso en el tiempo.</li>
        <li>¿Cuándo se levanta el pie? Esta página lo levanta en el último 40&nbsp;% del tiempo, para que el peso caiga en el conteo.</li>
        <li>¿Qué pasa en la pausa: nada, un toque, o cualquiera de los dos?</li>
        <li>Cámara por defecto: ¿detrás del maestro, o frente a un espejo?</li>
      </ol>
      <p class="status"><b>Estado:</b> prototipo, no está en mysalsacoach.com. La banda se sintetiza en tu navegador a partir de patrones tradicionales; no se usan grabaciones. Las convenciones de pasos siguen las notas de investigación de SalsaCoach (secciones 2, 3, 6 y 7); ningún instructor las ha revisado todavía. La sincronización se midió en un navegador de escritorio, todavía no en un teléfono ni con audífonos Bluetooth.</p>`,
  },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function tables(lang) {
  const T = TXT[lang];
  return Object.entries(PATTERNS).map(([id, p]) => {
    const rows = [];
    for (let k = 1; k <= 8; k++) {
      const hold = p.holds.includes(k);
      rows.push(`<tr${hold ? ' class="hold"' : ''}><td class="c">${k}</td><td class="l">${esc(describe(p, k, 'leader', lang))}</td><td class="f">${esc(describe(p, k, 'follower', lang))}</td></tr>`);
    }
    return `      <h3>${T.names[id]}</h3>
      <p>${T.rules[id]}</p>
      <div class="tw"><table><thead><tr>${T.head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>
      ${rows.join('\n      ')}
      </tbody></table></div>`;
  }).join('\n');
}

const model = read('src/model.js').replace(/^export /gm, '');
const app = read('src/app.js').replace('/*__MODEL__*/', model);
const css = read('src/style.css');
const body = read('src/body.html')
  .replace('{{NOTES_EN}}', TXT.en.body.replace('{{TABLES}}', tables('en')))
  .replace('{{NOTES_ES}}', TXT.es.body.replace('{{TABLES}}', tables('es')));

const FONTS = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Big+Shoulders+Display:wght@800&family=JetBrains+Mono:wght@500&display=optional';
const head = `<title>SalsaCoach Count Lab</title>
<meta name="description" content="See each salsa step land on the count and practise hearing the 1, On1 and On2, leader and follower.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}</style>`;

const fragment = `${head}\n${body}\n<script>\n${app}</script>\n`;
writeFileSync(here + 'count-lab.html', fragment);

mkdirSync(here + 'dist', { recursive: true });
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
${head}
</head>
<body>
${body}
<script>
${app}</script>
</body>
</html>
`;
writeFileSync(here + 'dist/index.html', full);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const report = {
  html_total: kb(Buffer.byteLength(full)), html_total_gz: kb(gzipSync(full, { level: 9 }).length),
  js: kb(Buffer.byteLength(app)), js_gz: kb(gzipSync(app, { level: 9 }).length),
  css: kb(Buffer.byteLength(css)), css_gz: kb(gzipSync(css, { level: 9 }).length),
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(here + 'evidence/size.json', JSON.stringify(report, null, 2) + '\n');
