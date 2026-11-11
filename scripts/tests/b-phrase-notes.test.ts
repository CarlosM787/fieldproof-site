// Advisor pass 27 (11/10): the ES tools hub still said "Todavía sin lanzar · Android primero". Every CTA note now
// carries Carlos's public state B wording, like the pages released 11/10: EN "Not released yet — Android coming soon",
// ES "Todavía no disponible — pronto en Android". (The FAQ answer "Android first: that's where the build runs…" is
// about platform order, not release status, and stays.)
import { assert } from 'jsr:@std/assert@1';

const ROOT = new URL('../../', import.meta.url);

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of Deno.readDirSync(new URL(dir, ROOT))) {
    const rel = `${dir}${e.name}`;
    if (e.isDirectory && !['node_modules', '.cf-dist', '.git', 'scripts'].includes(e.name)) out.push(...htmlFiles(`${rel}/`));
    else if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

Deno.test('no page carries the old launch note; every Android CTA note uses the B wording', () => {
  let notes = 0;
  for (const f of htmlFiles('')) {
    const h = Deno.readTextFileSync(new URL(f, ROOT));
    assert(!h.includes('Todavía sin lanzar') && !h.includes('Not released yet · Android first'), `${f}: old launch note`);
    for (const m of h.matchAll(/<p class="note">([^<]*Android[^<]*)<\/p>/g)) {
      notes++;
      assert(m[1].startsWith('Not released yet — Android coming soon') || m[1].startsWith('Todavía no disponible — pronto en Android'), `${f}: ${m[1]}`);
    }
  }
  assert(notes >= 19, `checked ${notes} notes`);
});
