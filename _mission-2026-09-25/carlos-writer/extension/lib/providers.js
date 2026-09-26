/*
 * Carlos Writer: the only code that talks to a model.
 * Runs in the service worker. Two providers:
 *   - Ollama on this computer (default): http://localhost:11434 or http://127.0.0.1:11434
 *   - Anthropic Messages API (opt-in, off by default)
 * Nothing here logs text, settings or keys.
 */
(function (root) {
  'use strict';
  const P = root.CWPrompts;

  class ProviderError extends Error {
    constructor(code, message, detail) {
      super(message);
      this.code = code;
      this.detail = detail || null;
    }
  }

  function withTimeout(signal, ms) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort(signal.reason);
    if (signal) {
      if (signal.aborted) ctrl.abort(signal.reason);
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => ctrl.abort(new ProviderError('timeout', 'The model took longer than ' + Math.round(ms / 1000) + ' seconds.')), ms);
    return { signal: ctrl.signal, done: () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); } };
  }

  function abortReason(signal, fallbackMsg) {
    const r = signal && signal.reason;
    if (r instanceof ProviderError) return r;
    return new ProviderError('cancelled', fallbackMsg || 'Cancelled.');
  }

  async function ollamaVersion(settings, signal) {
    const s = P.mergeSettings(settings);
    const base = P.normalizeOllamaUrl(s.ollamaUrl);
    const t = withTimeout(signal, 5000);
    try {
      const [vr, tr] = await Promise.all([
        fetch(base + '/api/version', { signal: t.signal }),
        fetch(base + '/api/tags', { signal: t.signal }),
      ]);
      if (!vr.ok || !tr.ok) throw new ProviderError('http', 'Ollama answered HTTP ' + (!vr.ok ? vr.status : tr.status) + '.');
      const v = await vr.json();
      const tags = await tr.json();
      const models = (tags.models || []).map((m) => ({ name: m.name, size: m.size || null }));
      return { version: v.version || null, models };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (t.signal.aborted) throw abortReason(t.signal, 'Timed out.');
      throw new ProviderError('unreachable', 'Can\'t reach Ollama at ' + base + '. Is the Ollama app running?');
    } finally {
      t.done();
    }
  }

  /**
   * Ollama POST /api/chat with streaming NDJSON.
   * onProgress({tokens}) is called as chunks arrive.
   */
  async function runOllama(prompt, settings, signal, onProgress) {
    const s = P.mergeSettings(settings);
    const base = P.normalizeOllamaUrl(s.ollamaUrl);
    const body = P.buildOllamaBody(prompt, s, { stream: true });
    const t = withTimeout(signal, 180000);
    let res;
    try {
      res = await fetch(base + '/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: t.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (e) {
      t.done();
      if (t.signal.aborted) throw abortReason(t.signal);
      throw new ProviderError('unreachable', 'Can\'t reach Ollama at ' + base + '. Is the Ollama app running?');
    }
    try {
      if (!res.ok) {
        let msg = '';
        try { msg = (await res.json()).error || ''; } catch (_) { /* not JSON */ }
        if (res.status === 404) throw new ProviderError('model-missing', 'The model "' + s.ollamaModel + '" is not installed. In a terminal run: ollama pull ' + s.ollamaModel, msg);
        if (res.status === 403) throw new ProviderError('forbidden', 'Ollama refused the request (HTTP 403).', msg);
        throw new ProviderError('http', 'Ollama answered HTTP ' + res.status + (msg ? ': ' + msg : '.'), msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let text = '';
      let tokens = 0;
      let final = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let chunk;
          try { chunk = JSON.parse(line); } catch (_) { continue; }
          if (chunk.error) throw new ProviderError('http', 'Ollama error: ' + chunk.error);
          if (chunk.message && typeof chunk.message.content === 'string') {
            text += chunk.message.content;
            tokens++;
            if (onProgress && tokens % 8 === 0) onProgress({ tokens });
          }
          if (chunk.done) final = chunk;
        }
      }
      if (buf.trim()) {
        try {
          const chunk = JSON.parse(buf.trim());
          if (chunk.message && typeof chunk.message.content === 'string') text += chunk.message.content;
          if (chunk.done) final = chunk;
        } catch (_) { /* ignore partial line */ }
      }
      const stats = final ? {
        loadMs: final.load_duration ? final.load_duration / 1e6 : null,
        promptTokens: final.prompt_eval_count || null,
        promptMs: final.prompt_eval_duration ? final.prompt_eval_duration / 1e6 : null,
        outputTokens: final.eval_count || tokens,
        outputMs: final.eval_duration ? final.eval_duration / 1e6 : null,
        doneReason: final.done_reason || null,
      } : { outputTokens: tokens };
      return { text, stats };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (t.signal.aborted) throw abortReason(t.signal);
      throw new ProviderError('stream', 'The connection to Ollama dropped mid-answer.');
    } finally {
      t.done();
    }
  }

  async function runAnthropic(prompt, settings, apiKey, signal) {
    if (!apiKey) throw new ProviderError('no-key', 'The Anthropic API is on, but no API key is saved. Add it in Carlos Writer settings.');
    const s = P.mergeSettings(settings);
    const req = P.buildAnthropicRequest(prompt, s, apiKey);
    const t = withTimeout(signal, 90000);
    let res;
    try {
      res = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal: t.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (e) {
      t.done();
      if (t.signal.aborted) throw abortReason(t.signal);
      throw new ProviderError('unreachable', 'Can\'t reach api.anthropic.com. Check your connection.');
    }
    try {
      let data = null;
      try { data = await res.json(); } catch (_) { /* not JSON */ }
      if (!res.ok) {
        // Error bodies never contain the key; we still only surface the type and message.
        const type = data && data.error && data.error.type;
        const msg = data && data.error && data.error.message;
        if (res.status === 401) throw new ProviderError('auth', 'Anthropic rejected the API key (HTTP 401).');
        if (res.status === 429) throw new ProviderError('rate', 'Anthropic rate limit reached (HTTP 429). Try again in a minute.');
        if (res.status === 529 || res.status === 503) throw new ProviderError('overloaded', 'Anthropic is overloaded right now (HTTP ' + res.status + ').');
        throw new ProviderError('http', 'Anthropic answered HTTP ' + res.status + (type ? ' (' + type + ')' : '') + (msg ? ': ' + String(msg).slice(0, 200) : '.'));
      }
      if (data && data.stop_reason === 'refusal') throw new ProviderError('refusal', 'The model declined this request.');
      const text = (data && Array.isArray(data.content) ? data.content : [])
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text)
        .join('');
      const usage = (data && data.usage) || {};
      return { text, stats: { promptTokens: usage.input_tokens || null, outputTokens: usage.output_tokens || null, doneReason: data && data.stop_reason } };
    } finally {
      t.done();
    }
  }

  root.CWProviders = { ProviderError, ollamaVersion, runOllama, runAnthropic };
})(typeof self !== 'undefined' ? self : this);
