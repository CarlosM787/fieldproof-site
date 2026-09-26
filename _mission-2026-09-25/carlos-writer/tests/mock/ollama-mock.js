/*
 * Deterministic mock of the Ollama HTTP API for tests.
 *
 * Implements the parts Carlos Writer uses:
 *   GET  /api/version, GET /api/tags, POST /api/chat (streaming NDJSON and non-streaming)
 * and copies Ollama's request filter (server/routes.go @ ollama main, read 2026-09-26):
 *   gin-contrib/cors: a request whose Origin header is set, is not "http://<Host>", and is not in
 *   the default allow-list (localhost / 127.0.0.1 / 0.0.0.0 on any port, app://, file://, tauri://,
 *   vscode-webview://, vscode-file://) gets HTTP 403. That is why a chrome-extension:// Origin fails.
 *
 * Test-only extras: /__log, /__reset, /__config, and static fixtures under /fixtures/.
 * Also serves the same fixtures on a second port (default 8765) as a "different website"
 * that is NOT covered by the extension's host permissions.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const MODELS = [
  { name: 'llama3.1:8b', model: 'llama3.1:8b', size: 4920753328, details: { family: 'llama', parameter_size: '8.0B', quantization_level: 'Q4_K_M' } },
  { name: 'mock-writer:latest', model: 'mock-writer:latest', size: 1000, details: { family: 'mock', parameter_size: '0B', quantization_level: 'none' } },
];

// Canned translations and rewrites for the fixture passages. Keys are exact passages.
const CANNED = {
  en2es: {
    'I ran 29.39 miles in Tucson on June 24, starting at 3:40 a.m. The details are at https://carlosmoralesjr.com/about/ and SalsaCoach is still in review.':
      'Corrí 29.39 millas en Tucson el 24 de junio, empezando a las 3:40 a.m. Los detalles están en https://carlosmoralesjr.com/about/ y SalsaCoach sigue en revisión.',
    'Four products went live. Nobody bought anything. The number was 0, and I kept the receipt.':
      'Cuatro productos salieron a la venta. Nadie compró nada. El número fue 0, y guardé el recibo.',
  },
  es2en: {
    'Corrí 29.39 millas en Tucson el 24 de junio, empezando a las 3:40 a.m. Escríbeme a carlos@moraleslabs.com si tienes preguntas sobre TalkEstimate.':
      'I ran 29.39 miles in Tucson on June 24, starting at 3:40 a.m. Email me at carlos@moraleslabs.com if you have questions about TalkEstimate.',
  },
  carlos: {
    'In today\'s fast-paced world, I am thrilled to announce that we have successfully utilized our innovative platform to deliver 4 products.':
      'I shipped 4 products. Here is what that looked like.',
  },
};

const TYPO = [
  [/\bteh\b/g, 'the'], [/\brecieve\b/g, 'receive'], [/\bbecuase\b/g, 'because'], [/\bseperate\b/g, 'separate'],
  [/\bdefinately\b/g, 'definitely'], [/\balot\b/g, 'a lot'], [/\bdont\b/g, 'don\'t'], [/\bi\b/g, 'I'],
  [/\bwierd\b/g, 'weird'], [/\buntill\b/g, 'until'], [/ {2,}/g, ' '], [/\bThier\b/g, 'Their'], [/\bthier\b/g, 'their'],
];

function actionOf(system) {
  if (/Task: Proofread/.test(system)) return 'proofread';
  if (/Task: Translate the passage from English/.test(system)) return 'en2es';
  if (/Task: Translate the passage from Spanish/.test(system)) return 'es2en';
  if (/more casual/.test(system)) return 'casual';
  if (/more professional/.test(system)) return 'professional';
  if (/sounds like the author/.test(system)) return 'carlos';
  return 'unknown';
}

function passageOf(user) {
  const m = /<passage>\n([\s\S]*)\n<\/passage>/.exec(user || '');
  return m ? m[1] : String(user || '');
}

function respond(action, passage) {
  if (passage.includes('EMPTY-OUTPUT-TEST')) return '';
  if (passage.includes('zz-drop-number')) return passage.replace(/\d+(\.\d+)?/, 'several').replace('zz-drop-number ', '');
  if (passage.includes('PREFACE-TEST')) return 'Here is the corrected text:\n\n' + passage.replace('teh', 'the');
  const canned = CANNED[action] && CANNED[action][passage];
  if (canned) return canned;
  switch (action) {
    case 'proofread': {
      let out = passage;
      for (const [re, rep] of TYPO) out = out.replace(re, rep);
      return out;
    }
    case 'carlos':
      return passage.replace(/In today's fast-paced world, /g, '').replace(/I am thrilled to announce that /g, '')
        .replace(/\butilize\b/g, 'use').replace(/\bvery /g, '').replace(/\bI am\b/g, 'I\'m');
    case 'casual':
      return passage.replace(/\bI am\b/g, 'I\'m').replace(/\bdo not\b/g, 'don\'t').replace(/\bcannot\b/g, 'can\'t')
        .replace(/\bHello\b/g, 'Hey').replace(/\bRegards\b/g, 'Thanks');
    case 'professional':
      return passage.replace(/\bI'm\b/g, 'I am').replace(/\bdon't\b/g, 'do not').replace(/\bgonna\b/g, 'going to')
        .replace(/\bHey\b/g, 'Hello').replace(/\bthx\b/gi, 'thank you');
    case 'en2es':
      return '[ES mock] ' + passage;
    case 'es2en':
      return '[EN mock] ' + passage;
    default:
      return passage;
  }
}

const ALLOWED_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?|app:\/\/.*|file:\/\/.*|tauri:\/\/.*|vscode-webview:\/\/.*|vscode-file:\/\/.*)$/;

function createMock(opts) {
  const port = (opts && opts.port) || 11434;
  const sitePort = (opts && opts.sitePort) || 8765;
  const state = { log: [], config: {} };

  function logReq(req, body, extra) {
    state.log.push(Object.assign({
      t: Date.now(), port: req.socket.localPort, method: req.method, url: req.url,
      origin: req.headers.origin || null, host: req.headers.host || null, body,
    }, extra || {}));
  }

  function serveFixture(req, res) {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/fixtures\//, '');
    const file = path.join(FIXTURES, path.normalize(rel));
    if (!file.startsWith(FIXTURES) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    const ext = path.extname(file);
    res.setHeader('content-type', ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'application/octet-stream');
    if (/csp/.test(rel)) res.setHeader('content-security-policy', "default-src 'none'; style-src 'self'; script-src 'self'; frame-src 'self'");
    res.end(fs.readFileSync(file));
  }

  function handleApi(req, res, raw) {
    const origin = req.headers.origin;
    const host = req.headers.host || '';
    if (origin && origin !== 'http://' + host && origin !== 'https://' + host && !ALLOWED_ORIGIN.test(origin)) {
      logReq(req, null, { status: 403 });
      res.statusCode = 403;
      return res.end();
    }
    if (req.method === 'GET' && (req.url === '/' || req.url === '')) { logReq(req, null); return res.end('Ollama is running'); }
    if (req.method === 'GET' && req.url === '/api/version') { logReq(req, null); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ version: '0.0.0-mock' })); }
    if (req.method === 'GET' && req.url === '/api/tags') { logReq(req, null); res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ models: MODELS })); }
    if (req.method === 'POST' && req.url === '/api/chat') {
      let body;
      try { body = JSON.parse(raw); } catch (_) { logReq(req, raw); res.statusCode = 400; return res.end(JSON.stringify({ error: 'invalid JSON' })); }
      logReq(req, body);
      if (state.config.down) { req.socket.destroy(); return; }
      if (!MODELS.some((m) => m.name === body.model || m.name === body.model + ':latest')) {
        res.statusCode = 404; res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify({ error: 'model \'' + body.model + '\' not found' }));
      }
      const msgs = Array.isArray(body.messages) ? body.messages : [];
      const system = (msgs.find((m) => m.role === 'system') || {}).content || '';
      const user = (msgs.find((m) => m.role === 'user') || {}).content || '';
      const action = actionOf(system);
      const out = respond(action, passageOf(user));
      const delay = Number(state.config.firstByteDelayMs || 0);
      const perChunkMs = Number(state.config.perChunkMs || 0);
      const pieces = out.match(/\S+\s*|\s+/g) || [];
      const finalChunk = {
        model: body.model, created_at: new Date().toISOString(), message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop',
        total_duration: 1000000, load_duration: 100000, prompt_eval_count: Math.ceil((system.length + user.length) / 4), prompt_eval_duration: 200000,
        eval_count: pieces.length, eval_duration: 500000,
      };
      setTimeout(async () => {
        if (body.stream === false) {
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify(Object.assign({}, finalChunk, { message: { role: 'assistant', content: out } })));
        }
        res.setHeader('content-type', 'application/x-ndjson');
        for (const p of pieces) {
          res.write(JSON.stringify({ model: body.model, created_at: new Date().toISOString(), message: { role: 'assistant', content: p }, done: false }) + '\n');
          if (perChunkMs) await new Promise((r) => setTimeout(r, perChunkMs));
        }
        res.end(JSON.stringify(finalChunk) + '\n');
      }, delay);
      return;
    }
    logReq(req, null, { status: 404 });
    res.statusCode = 404;
    res.end('404 page not found');
  }

  function handler(req, res) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (req.url === '/__log') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(state.log)); }
      if (req.url === '/__reset' && req.method === 'POST') { state.log = []; state.config = {}; return res.end('ok'); }
      if (req.url === '/__config' && req.method === 'POST') { state.config = Object.assign(state.config, JSON.parse(raw || '{}')); return res.end('ok'); }
      if (req.url.startsWith('/fixtures/')) { logReq(req, null); return serveFixture(req, res); }
      if (req.url === '/favicon.ico') { logReq(req, null); res.statusCode = 204; return res.end(); }
      if (req.socket.localPort === sitePort) { logReq(req, null, { status: 404 }); res.statusCode = 404; return res.end('not found'); }
      handleApi(req, res, raw);
    });
  }

  const api = http.createServer(handler);
  const site = http.createServer(handler);
  return {
    state,
    start: () => Promise.all([
      new Promise((r, j) => { api.once('error', j); api.listen(port, '127.0.0.1', r); }),
      new Promise((r, j) => { site.once('error', j); site.listen(sitePort, '127.0.0.1', r); }),
    ]),
    stop: () => Promise.all([new Promise((r) => api.close(r)), new Promise((r) => site.close(r))]),
    respond,
    actionOf,
  };
}

module.exports = { createMock, respond, actionOf, CANNED };

if (require.main === module) {
  const m = createMock({});
  m.start().then(() => console.log('mock ollama on 127.0.0.1:11434, site on 127.0.0.1:8765'));
}
