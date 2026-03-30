// packages/backend/src/geminiAnalyser.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Calls Groq API (Llama 3.3 70B) with a diff + file context.
// Groq is OpenAI-compatible — uses axios with JSON mode for reliable output.

'use strict';

const axios = require('axios');

// ─── Groq config ─────────────────────────────────────────────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Groq free tier: 30 RPM. We target 20 RPM to stay safe.

const MIN_INTERVAL_MS = 3000;
const _lastCallTime   = new Map();

async function _waitForRateLimit(keyIndex) {
  const last = _lastCallTime.get(keyIndex) || 0;
  const now  = Date.now();
  const wait = MIN_INTERVAL_MS - (now - last);
  if (wait > 0) {
    console.log(`[analyser] Rate limiting key ${keyIndex} — waiting ${Math.ceil(wait / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  _lastCallTime.set(keyIndex, Date.now());
}

// ─── Multi-key round robin ────────────────────────────────────────────────────

function loadKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GROQ_API_KEY_${i}`];
    if (key) keys.push(key);
  }
  return [...new Set(keys)];
}

let _keys         = null;
let _currentIndex = 0;

function getKeys() {
  if (!_keys) {
    _keys = loadKeys();
    if (_keys.length === 0) {
      throw new Error('analyser: No Groq API keys found. Set GROQ_API_KEY in backend .env');
    }
    console.log(`[analyser] Loaded ${_keys.length} Groq API key(s)`);
  }
  return _keys;
}

function getNextKey() {
  const keys  = getKeys();
  const key   = keys[_currentIndex];
  const index = _currentIndex;
  _currentIndex = (_currentIndex + 1) % keys.length;
  return { key, index };
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior software engineer reviewing code that an AI coding agent just wrote. A developer is watching your live feed — they need to understand exactly what was built, what is dangerous, and what to do about it.

You receive a code diff — lines added (+) or removed (-). Analyse it carefully and respond with a JSON object only. No markdown, no backticks, raw JSON:

{"severity":"critical|warning|hallucination|good|info|context","title":"Short title under 8 words","body":"Your detailed explanation here.","file_relevance":"What this file does in the system","fix":"Specific fix or action the developer should take, or null if no action needed"}

Severity guide:
- critical: hardcoded secret/password/key, SQL injection, auth bypass, data exposure, sending sensitive data externally, missing authentication
- warning: missing error handling, no input validation, no rate limiting, incomplete implementation, potential data leak, insecure pattern
- hallucination: importing non-existent package, calling undefined function, fabricated API, variable used before definition
- good: correct security practice, proper validation, clean architecture, best practice
- info: standard implementation, neutral change, no concerns
- context: scaffolding, config, imports, boilerplate, comments only

For the body field — be specific and detailed:
- Name the exact variable, function, or line that is the problem
- Explain WHY it is dangerous in plain English (what can an attacker do with it?)
- Explain what the correct approach should be
- Keep it under 100 words but make every word count

For the fix field — give a concrete action:
- "Remove SECRET_KEY from code. Use process.env.SECRET_KEY instead."
- "Replace string concatenation with parameterised query: db.query('SELECT * FROM users WHERE id = ?', [userId])"
- "Delete the bypass_auth_token check — it allows anyone to impersonate an admin."
- null if no action needed

Never say "the code". Say what the specific function or variable does.
Never be vague. A developer reading this at 2am needs to know exactly what to fix.`;

// ─── analyseWithGemini ────────────────────────────────────────────────────────

async function analyseWithGemini({ filePath, diffText, fileContext, wsClient, sessionId }) {
  const keys = getKeys();
  let lastError = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const { key, index } = getNextKey();

    await _waitForRateLimit(index);

    try {
      const result = await _callGroq({
        key, index, filePath, diffText, fileContext, wsClient, sessionId,
      });

      if (attempt > 0) {
        console.log(`[analyser] Succeeded with key ${index} after ${attempt} fallback(s)`);
      }
      return result;

    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const is429  = status === 429 || (err.message && err.message.includes('429'));

      if (is429) {
        _lastCallTime.set(index, Date.now() + 60000);
        console.warn(`[analyser] Key ${index} hit rate limit — trying next key`);
        continue;
      }

      console.error(`[analyser] API error:`, err.response?.data || err.message);
      throw err;
    }
  }

  console.error(`[analyser] All ${keys.length} key(s) exhausted`);
  throw lastError;
}

// ─── Internal Groq call ───────────────────────────────────────────────────────

async function _callGroq({ key, filePath, diffText, fileContext, wsClient, sessionId }) {
  const parts = [`File: ${filePath}`];
  if (fileContext) parts.push(`Prior context:\n${fileContext}`);
  parts.push(`Diff:\n${diffText}`);
  const userMessage = parts.join('\n\n');

  const response = await axios.post(
    GROQ_API_URL,
    {
      model:       GROQ_MODEL,
      temperature: 0.1,
      max_tokens:  500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
      ],
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
      },
      timeout: 30000,
    }
  );

  const rawText = response.data?.choices?.[0]?.message?.content || '';
  console.log(`[analyser] Raw response (${rawText.length} chars): ${rawText.slice(0, 150)}`);

  const parsed = _parseResponse(rawText);

  if (wsClient && wsClient.readyState === 1) {
    wsClient.send(JSON.stringify({
      type:      'analysis_complete',
      result:    parsed,
      filePath,
      sessionId,
    }));
  }

  return parsed;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function _parseResponse(raw) {
  const fallback = {
    severity:       'info',
    title:          'Analysis unavailable',
    body:           'Could not parse response.',
    file_relevance: 'Unknown',
    fix:            null,
  };

  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) return fallback;

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  if (!cleaned.endsWith('}')) {
    const severityMatch = cleaned.match(/"severity"\s*:\s*"([^"]+)"/);
    const titleMatch    = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
    if (severityMatch || titleMatch) {
      return {
        severity:       severityMatch?.[1] || 'info',
        title:          titleMatch?.[1]    || 'Partial analysis',
        body:           'Response was truncated. Change detected but full analysis incomplete.',
        file_relevance: 'Unknown',
        fix:            null,
      };
    }
    return fallback;
  }

  try {
    const parsed = JSON.parse(cleaned);

    if (!parsed.severity || !parsed.title || !parsed.body) {
      console.warn('[analyser] Response missing required fields');
      return fallback;
    }

    const validSeverities = ['critical', 'warning', 'hallucination', 'good', 'info', 'context'];
    if (!validSeverities.includes(parsed.severity)) parsed.severity = 'info';

    return {
      severity:       parsed.severity,
      title:          String(parsed.title).slice(0, 100),
      body:           String(parsed.body).slice(0, 600),
      file_relevance: String(parsed.file_relevance || 'Unknown').slice(0, 200),
      fix:            parsed.fix ? String(parsed.fix).slice(0, 300) : null,
    };

  } catch (err) {
    console.error('[analyser] JSON parse error:', err.message, '| raw:', raw.slice(0, 200));
    return fallback;
  }
}

module.exports = { analyseWithGemini };
