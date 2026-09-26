'use strict';
// Provider tests: the Ollama client against the mock server, the Anthropic client against a stubbed fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMock } = require('../mock/ollama-mock.js');

globalThis.self = globalThis;
self.CWPrompts = require('../../extension/lib/prompts.js');
require('../../extension/lib/providers.js');
const { runOllama, runAnthropic, ollamaVersion, ProviderError } = self.CWProviders;
const P = self.CWPrompts;

const PORT = 11434;
let mock;

test.before(async () => {
  mock = createMock({ port: PORT, sitePort: 8766 });
  await mock.start();
});
test.after(async () => { await mock.stop(); });

const settings = Object.assign({}, P.DEFAULT_SETTINGS, { ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'llama3.1:8b' });

test('Ollama streaming chat returns the full text and Ollama timing stats', async () => {
  mock.state.log = [];
  const prompt = P.buildPrompt('proofread', 'I recieve teh mail.', settings);
  let progress = 0;
  const out = await runOllama(prompt, settings, undefined, () => { progress++; });
  assert.equal(out.text, 'I receive the mail.');
  assert.ok(out.stats.outputTokens > 0);
  const req = mock.state.log.find((r) => r.url === '/api/chat');
  assert.equal(req.body.stream, true);
  assert.equal(req.body.think, false);
  assert.equal(req.body.model, 'llama3.1:8b');
  assert.equal(req.origin, null, 'Node sends no Origin header');
});

test('missing model maps to a clear "ollama pull" message', async () => {
  const s = Object.assign({}, settings, { ollamaModel: 'not-installed:1b' });
  await assert.rejects(runOllama(P.buildPrompt('proofread', 'x y', s), s), (e) => e instanceof ProviderError && e.code === 'model-missing' && /ollama pull not-installed:1b/.test(e.message));
});

test('Ollama down maps to "is the Ollama app running?"', async () => {
  mock.state.config.down = true;
  try {
    await assert.rejects(runOllama(P.buildPrompt('proofread', 'x y', settings), settings), (e) => (e.code === 'unreachable' || e.code === 'stream') && /Ollama/.test(e.message));
  } finally { mock.state.config.down = false; }
});

test('cancel aborts an in-flight request', async () => {
  mock.state.config.firstByteDelayMs = 3000;
  const ctrl = new AbortController();
  const p = runOllama(P.buildPrompt('proofread', 'x y', settings), settings, ctrl.signal);
  setTimeout(() => ctrl.abort(new ProviderError('cancelled', 'Cancelled.')), 200);
  const t0 = Date.now();
  await assert.rejects(p, (e) => e.code === 'cancelled');
  assert.ok(Date.now() - t0 < 2000);
  mock.state.config.firstByteDelayMs = 0;
});

test('version and installed models', async () => {
  const v = await ollamaVersion(settings);
  assert.equal(v.version, '0.0.0-mock');
  assert.ok(v.models.some((m) => m.name === 'llama3.1:8b'));
});

test('Anthropic client: documented request, text joined from content blocks, errors never echo the key', async () => {
  const key = 'sk-ant-api03-TESTKEY-not-real-0000000000000000';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Fixed ' }, { type: 'text', text: 'text.' }], stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 4 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const out = await runAnthropic(P.buildPrompt('proofread', 'Fixd text.', settings), settings, key);
    assert.equal(out.text, 'Fixed text.');
    assert.equal(out.stats.promptTokens, 500);
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    assert.equal(calls[0].init.headers['x-api-key'], key);
    assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
    assert.equal(JSON.parse(calls[0].init.body).model, 'claude-haiku-4-5');
    assert.equal(calls[0].init.credentials, 'omit');

    globalThis.fetch = async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401 });
    await assert.rejects(runAnthropic(P.buildPrompt('proofread', 'x', settings), settings, key), (e) => e.code === 'auth' && !e.message.includes(key));
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    await assert.rejects(runAnthropic(P.buildPrompt('proofread', 'x', settings), settings, key), (e) => e.code === 'rate');
    await assert.rejects(runAnthropic(P.buildPrompt('proofread', 'x', settings), settings, ''), (e) => e.code === 'no-key');
  } finally {
    globalThis.fetch = realFetch;
  }
});
