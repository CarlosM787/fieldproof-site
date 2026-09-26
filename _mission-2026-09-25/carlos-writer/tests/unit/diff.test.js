'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../../extension/lib/diff.js');

test('word diff marks only the changed words', () => {
  const ops = D.diffWords('I recieve teh mail every morning.', 'I receive the mail every morning.');
  assert.deepEqual(ops, [
    { t: '=', s: 'I ' },
    { t: '-', s: 'recieve teh' },
    { t: '+', s: 'receive the' },
    { t: '=', s: ' mail every morning.' },
  ]);
  assert.equal(D.countChanges(ops), 1);
});

test('punctuation is its own token', () => {
  const ops = D.diffWords('Hello world', 'Hello, world!');
  const s = D.sides(ops);
  assert.equal(s.before, 'Hello world');
  assert.equal(s.after, 'Hello, world!');
  assert.equal(D.countChanges(ops), 2);
});

test('identical text has no changes', () => {
  const ops = D.diffWords('Same text.', 'Same text.');
  assert.equal(D.countChanges(ops), 0);
});

test('round trip holds for random edits (2,000 cases)', () => {
  const words = ['a', 'b', 'c', 'dd', 'ée', 'ñ', '29.39', ',', '.', '\n', 'x'];
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gen = () => Array.from({ length: Math.floor(rnd() * 14) }, () => words[Math.floor(rnd() * words.length)]).join(' ');
  for (let i = 0; i < 2000; i++) {
    const a = gen();
    const b = gen();
    const s = D.sides(D.diffWords(a, b));
    assert.equal(s.before, a);
    assert.equal(s.after, b);
  }
});

test('very different long texts fall back to a bounded coarse diff', () => {
  const a = Array.from({ length: 3000 }, (_, i) => 'w' + (i % 97)).join(' ');
  const b = Array.from({ length: 3000 }, (_, i) => 'z' + (i % 89)).join(' ');
  const t0 = Date.now();
  const s = D.sides(D.diffWords(a, b));
  assert.equal(s.before, a);
  assert.equal(s.after, b);
  assert.ok(Date.now() - t0 < 3000);
});

test('Spanish accents and ñ stay inside words', () => {
  assert.deepEqual(D.tokenize('Corrí mañana, sí.'), ['Corrí', ' ', 'mañana', ',', ' ', 'sí', '.']);
});
