// packages/backend/src/geminiAnalyser.js
// WRITTEN BY CLAUDE — do not modify (see overseer-forbidden-files)
//
// Calls Gemini 2.5 Flash with a diff + file context.
// Features:
//   - Round-robin rotation across multiple API keys
//   - Automatic fallback to next key on 429
//   - Rate limiter: max 4 requests/minute per key (safe under free tier)
//   - Robust JSON parsing — handles markdown fences and truncated streams
//   - analysis_complete message includes filePath for dashboard cards

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Gemini 2.5 Flash free tier: 5 RPM, 20 RPD per key.
// We target 4/min to stay safely under the limit.

const MIN_INTERVAL_MS = 15000; // 15 seconds between calls per key (4/min)
const _lastCallTime   = new Map();

async function _waitForRateLimit(keyIndex) {
  const last = _lastCallTime.get(keyIndex) || 0;
  const now  = Date.now();
  const wait = MIN_INTERVAL_MS - (now - last);
  if (wait > 0) {
    console.log(`[geminiAnalyser] Rate limiting key ${keyIndex} — waiting ${Math.ceil(wait/1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  _lastCallTime.set(keyIndex, Date.now());
}

// ─── Multi-key round robin ────────────────────────────────────────────────────

function loadKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
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
      throw new Error('geminiAnalyser: No Gemini API keys found. Set GEMINI_API_KEY_1 in .env');
    }
    console.log(`[geminiAnalyser] Loaded ${_keys.length} API key(s)`);
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

const SYSTEM_PROMPT = `You are a senior software engineer narrating what an AI coding agent is building in real time. A developer is watching your feed — they may not be a deep technical expert. Be precise, plain, and useful.

You receive a code diff — lines added (+) or removed (-) from a file. Analyse it carefully and respond with a JSON object only, no other text, no markdown fences:

{"severity":"critical|warning|hallucination|good|info|context","title":"Short title under 8 words","body":"Plain English explanation, 1-3 sentences.","file_relevance":"What this file does in the overall system"}

Severity guide:
- critical: security vulnerability, hardcoded secret, SQL injection, auth bypass, exposed API key
- warning: missing error handling, no rate limiting, incomplete implementation, logic error
- hallucination: importing non-existent package, calling undefined function, fabricated API usage
- good: correct security practice, proper error handling, clean architecture
- info: factual description, no concerns, standard implementation
- context: scaffolding, config, imports, boilerplate, comments

Keep body under 60 words. Never say "the code" — say what it does specifically.
IMPORTANT: Respond with raw JSON only. No markdown. No backticks. No explanation.`;

// ─── analyseWithGemini ────────────────────────────────────────────────────────

async function analyseWithGemini({ filePath, diffText, fileContext, wsClient, sessionId }) {
  const keys = getKeys();
  let lastError = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const { key, index } = getNextKey();

    await _waitForRateLimit(index);

    try {
      const result = await _callGemini({
        key, index, filePath, diffText, fileContext, wsClient, sessionId,
      });
      if (attempt > 0) {
        console.log(`[geminiAnalyser] Succeeded with key ${index} after ${attempt} fallback(s)`);
      }
      return result;

    } catch (err) {
      lastError = err;
      const is429 = err.message && err.message.includes('429');

      if (is429) {
        _lastCallTime.set(index, Date.now() + 60000); // back off this key for 60s
        console.warn(`[geminiAnalyser] Key ${index} hit 429 — trying next key`);
        continue;
      }

      console.error(`[geminiAnalyser] Gemini API error:`, err.message);
      throw err;
    }
  }

  console.error(`[geminiAnalyser] All ${keys.length} key(s) exhausted`);
  throw lastError;
}

// ─── Internal Gemini call ─────────────────────────────────────────────────────

async function _callGemini({ key, filePath, diffText, fileContext, wsClient, sessionId }) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature:     0.1, // lower = more consistent JSON output
      maxOutputTokens: 300, // keep response short and complete
    },
  });

  const parts = [];
  parts.push(`File: ${filePath}\n`);
  if (fileContext) {
    parts.push(`Prior context:\n${fileContext}\n`);
  }
  parts.push(`Diff:\n${diffText}`);
  const userPrompt = parts.join('\n');

  // Collect full response before parsing — avoids truncated stream issues
  let fullText = '';

  try {
    const result = await model.generateContentStream([
      { text: SYSTEM_PROMPT },
      { text: userPrompt },
    ]);

    for await (const chunk of result.stream) {
      const token = chunk.text();
      fullText += token;

      // Stream tokens to dashboard for live typing effect
      if (wsClient && wsClient.readyState === 1) {
        wsClient.send(JSON.stringify({ type: 'token', token }));
      }
    }
  } catch (err) {
    throw err;
  }

  // Parse the complete response
  const parsed = _parseResponse(fullText);

  // Send final analysis_complete with filePath included
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

// ─── Robust response parser ───────────────────────────────────────────────────

function _parseResponse(raw) {
  const fallback = {
    severity:       'info',
    title:          'Analysis unavailable',
    body:           'Could not parse Gemini response.',
    file_relevance: 'Unknown',
  };

  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) return fallback;

  let cleaned = raw.trim();

  // Strip markdown code fences — handles ```json, ```JSON, ``` variations
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  cleaned = cleaned.trim();

  // If response is truncated (no closing brace), try to repair it
  if (!cleaned.endsWith('}')) {
    // Find the last complete field we can salvage
    const severityMatch = cleaned.match(/"severity"\s*:\s*"([^"]+)"/);
    const titleMatch    = cleaned.match(/"title"\s*:\s*"([^"]+)"/);

    if (severityMatch || titleMatch) {
      console.warn('[geminiAnalyser] Truncated response — attempting repair');
      return {
        severity:       severityMatch ? severityMatch[1] : 'info',
        title:          titleMatch    ? titleMatch[1]    : 'Partial analysis',
        body:           'Response was truncated. The change was detected but full analysis was not completed.',
        file_relevance: 'Unknown',
      };
    }

    console.warn('[geminiAnalyser] Truncated response — using fallback');
    return fallback;
  }

  try {
    const parsed = JSON.parse(cleaned);

    if (!parsed.severity || !parsed.title || !parsed.body) {
      console.warn('[geminiAnalyser] Response missing required fields');
      return fallback;
    }

    const validSeverities = ['critical', 'warning', 'hallucination', 'good', 'info', 'context'];
    if (!validSeverities.includes(parsed.severity)) {
      parsed.severity = 'info';
    }

    return {
      severity:       parsed.severity,
      title:          String(parsed.title).slice(0, 100),
      body:           String(parsed.body).slice(0, 500),
      file_relevance: String(parsed.file_relevance || 'Unknown').slice(0, 200),
    };

  } catch (err) {
    console.error('[geminiAnalyser] JSON parse error:', err.message, '| raw:', raw.slice(0, 300));
    return fallback;
  }
}

module.exports = { analyseWithGemini };
