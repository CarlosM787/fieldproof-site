'use strict';
// Reproducible latency and cost ESTIMATES for WRITER_README.md and RESEARCH.md.
// Inputs are published numbers (cited in RESEARCH.md); outputs are estimates, not measurements.
const fs = require('fs');
const path = require('path');
const P = require('../extension/lib/prompts.js');

const CHARS_PER_TOKEN = 4;            // Anthropic pricing page: ~4 characters or 0.75 words per token (English)
const TOKENS_PER_WORD_EN = 1 / 0.75;  // same source
const ES_FACTOR = 1.3;                // ASSUMPTION: Spanish output uses ~30% more tokens than the English text
const LOCALSCORE_8B = { pp: 1444, tg: 57.6 };   // RTX 2070 SUPER, Llama 3.1 8B Q4_K_M (LocalScore, reported)
const LLAMACPP_7B = { pp: 2088, tg: 88.06 };    // RTX 2070 SUPER, Llama 2 7B Q4_0 (llama.cpp #15013)
const HAIKU = { in: 1.0, out: 5.0 };            // $/MTok, Claude Haiku 4.5 (platform.claude.com pricing, 2026-09-26)

const carlosGuide = fs.existsSync(path.join(__dirname, '..', 'private', 'carlos-style-guide.txt'))
  ? fs.readFileSync(path.join(__dirname, '..', 'private', 'carlos-style-guide.txt'), 'utf8') : P.NEUTRAL_STYLE_GUIDE;
const sysTokens = (action, guide) => Math.round(P.buildPrompt(action, '', Object.assign({}, P.DEFAULT_SETTINGS, { styleGuide: guide })).system.length / CHARS_PER_TOKEN);

const rows = [];
for (const words of [50, 150, 300]) {
  for (const action of ['proofread', 'carlos', 'en2es']) {
    const guide = carlosGuide;
    const inTok = sysTokens(action, guide) + Math.round(words * TOKENS_PER_WORD_EN) + 20;
    const outTok = Math.round(words * TOKENS_PER_WORD_EN * (action === 'en2es' ? ES_FACTOR : 1));
    const t8b = inTok / LOCALSCORE_8B.pp + outTok / LOCALSCORE_8B.tg;
    const t7b = inTok / LLAMACPP_7B.pp + outTok / LLAMACPP_7B.tg;
    rows.push({ words, action, inTok, outTok, llama31_8b_s: +t8b.toFixed(1), llama2_7b_q4_0_s: +t7b.toFixed(1) });
  }
}
console.log('System prompt tokens (est.): proofread', sysTokens('proofread', carlosGuide), '| carlos (Carlos guide)', sysTokens('carlos', carlosGuide), '| carlos (neutral guide)', sysTokens('carlos', P.NEUTRAL_STYLE_GUIDE), '| en2es (Carlos guide)', sysTokens('en2es', carlosGuide));
console.table(rows);

// Cost per 1,000 words with Claude Haiku 4.5.
const words = 1000;
const textTok = words * TOKENS_PER_WORD_EN;
function cost(calls, action, esOut) {
  const sys = sysTokens(action, carlosGuide);
  const inTok = calls * (sys + 20) + textTok;
  const outTok = textTok * (esOut ? ES_FACTOR : 1);
  return { calls, action, inTok: Math.round(inTok), outTok: Math.round(outTok), usd: +((inTok * HAIKU.in + outTok * HAIKU.out) / 1e6).toFixed(4) };
}
console.table([cost(1, 'proofread'), cost(5, 'proofread'), cost(1, 'carlos'), cost(5, 'carlos'), cost(5, 'en2es', true), cost(10, 'carlos')]);
