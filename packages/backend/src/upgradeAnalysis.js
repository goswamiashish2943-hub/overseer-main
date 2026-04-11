// packages/backend/src/upgradeAnalysis.js
//
// Enhanced analysis engine: 2 Groq calls instead of 6.
//
// Call 1 (Deep Analysis):  suggestion + betterApproach + alignment + decisions
// Call 2 (Change Breakdown): changeAnalysis + explanations (line-by-line)
//
// Fallback chain:
//   upgradeAnalysis() → fails → analyseWithGemini() → fails → static error card

'use strict';

const axios = require('axios');
const { analyseWithGemini } = require('./geminiAnalyser');

// ─── Groq config (matches geminiAnalyser.js) ──────────────────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const TIMEOUT_MS   = 30000;

// ─── Rate limiting — mirror the approach in geminiAnalyser.js ─────────────────

const MIN_INTERVAL_MS  = 3000;
const _lastCallTime    = new Map();

async function _waitForRateLimit(keyIndex) {
  const last = _lastCallTime.get(keyIndex) || 0;
  const wait = MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  _lastCallTime.set(keyIndex, Date.now());
}

// ─── Key rotation — reuse the same keys as geminiAnalyser.js ─────────────────

function loadKeys() {
  const keys = [];
  if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY);
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return [...new Set(keys)];
}

let _keys = null;
let _idx  = 0;

function getNextKey() {
  if (!_keys) {
    _keys = loadKeys();
    if (!_keys.length) throw new Error('upgradeAnalysis: No Groq API keys found');
  }
  const key   = _keys[_idx];
  const index = _idx;
  _idx = (_idx + 1) % _keys.length;
  return { key, index };
}

// ─── System prompts ───────────────────────────────────────────────────────────

const DEEP_ANALYSIS_SYSTEM = `You are a senior architect reviewing a code change. You have access to the project context (README, architecture docs, etc.).

Analyse the diff and return ONLY a JSON object (no markdown, no backticks):

{
  "suggestion": {
    "severity": "critical|warning|hallucination|good|info|context",
    "title": "Short title under 8 words",
    "body": "Detailed explanation under 120 words. Name exact variables/functions. Explain why it matters.",
    "fix": "Concrete action or null"
  },
  "betterApproach": {
    "exists": true or false,
    "description": "Specific alternative approach if one exists, or null",
    "reason": "Why this approach is better given the project context, or null"
  },
  "alignment": {
    "aligned": true or false,
    "score": 0-100,
    "issues": ["list of specific misalignments with project context, or empty array"],
    "notes": "Brief summary of alignment check"
  },
  "decisions": {
    "found": true or false,
    "list": ["architectural decision 1", "architectural decision 2"],
    "impact": "Brief description of impact on the project"
  }
}

Severity guide:
- critical: hardcoded secret, SQL injection, auth bypass, data exposure
- warning: missing error handling, no validation, insecure pattern
- hallucination: importing non-existent package, calling undefined function
- good: correct security, clean architecture, best practice
- info: standard implementation, neutral change
- context: config, imports, boilerplate only`;

const CHANGE_BREAKDOWN_SYSTEM = `You are a code reviewer explaining code changes to a developer.

Given a code diff, return ONLY a JSON object (no markdown, no backticks):

{
  "changeAnalysis": [
    {
      "type": "add|remove|modify",
      "description": "What changed in plain English",
      "impact": "Why this matters",
      "lines": "approximate line range, e.g. 12-15"
    }
  ],
  "explanations": "A single coherent paragraph explaining all the changes together, written for a developer who wasn't there when the code was written. Under 150 words."
}

Be specific. Name variables, functions, patterns. Avoid vague statements. Max 5 items in changeAnalysis.`;

// ─── Core Groq caller ─────────────────────────────────────────────────────────

async function _callGroq(systemPrompt, userMessage) {
  const keys = loadKeys();
  let lastErr;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const { key, index } = getNextKey();
    await _waitForRateLimit(index);

    try {
      const response = await axios.post(
        GROQ_API_URL,
        {
          model:           GROQ_MODEL,
          temperature:     0.1,
          max_tokens:      800,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMessage  },
          ],
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type':  'application/json',
          },
          timeout: TIMEOUT_MS,
        }
      );

      const raw = response.data?.choices?.[0]?.message?.content || '';
      return JSON.parse(raw.trim());

    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 429) {
        _lastCallTime.set(attempt, Date.now() + 60000); // back-off this key
        continue;
      }
      throw err; // non-rate-limit error — escalate immediately
    }
  }

  throw lastErr;
}

// ─── Call 1: Deep Analysis ────────────────────────────────────────────────────

async function _deepAnalysis(filePath, diffText, projectContext, fileContext) {
  const parts = [`File: ${filePath}`];
  if (projectContext) parts.push(`Project Context:\n${projectContext}`);
  if (fileContext)    parts.push(`Previous File History:\n${fileContext}`);
  parts.push(`Code Diff:\n${diffText}`);

  return _callGroq(DEEP_ANALYSIS_SYSTEM, parts.join('\n\n'));
}

// ─── Call 2: Change Breakdown ─────────────────────────────────────────────────

async function _changeBreakdown(filePath, diffText) {
  const userMessage = `File: ${filePath}\n\nDiff:\n${diffText}`;
  return _callGroq(CHANGE_BREAKDOWN_SYSTEM, userMessage);
}

// ─── Default shapes (used as fallback when parsing fails) ─────────────────────

function _defaultDeep() {
  return {
    suggestion:    { severity: 'info', title: 'Analysis unavailable', body: 'Context analysis could not complete.', fix: null },
    betterApproach:{ exists: false, description: null, reason: null },
    alignment:     { aligned: true, score: 50, issues: [], notes: 'Alignment check unavailable' },
    decisions:     { found: false, list: [], impact: null },
  };
}

function _defaultBreakdown() {
  return {
    changeAnalysis: [],
    explanations:   'Change breakdown unavailable.',
  };
}

// ─── Main export: upgradeAnalysis ─────────────────────────────────────────────

/**
 * Run enhanced 2-call Groq analysis on a code diff.
 *
 * @param {object} params
 * @param {string} params.filePath       - Relative path of the changed file
 * @param {string} params.diffText       - The diff content
 * @param {string} [params.projectContext] - Merged project .md context (from project_context_files)
 * @param {string} [params.fileContext]    - Per-file prior knowledge (from file_knowledge table)
 * @param {object} [params.wsClient]       - WebSocket proxy for streaming to dashboard
 * @param {string} [params.sessionId]      - Session ID for WS routing
 *
 * @returns {Promise<object>} Combined enhanced analysis result
 */
async function upgradeAnalysis({ filePath, diffText, projectContext = '', fileContext = '', wsClient, sessionId }) {
  let deepResult      = _defaultDeep();
  let breakdownResult = _defaultBreakdown();
  let usedFallback    = false;

  // ── Call 1: Deep Analysis ───────────────────────────────────────────────────
  try {
    const raw = await _deepAnalysis(filePath, diffText, projectContext, fileContext);
    deepResult = {
      suggestion:     raw.suggestion     || _defaultDeep().suggestion,
      betterApproach: raw.betterApproach || _defaultDeep().betterApproach,
      alignment:      raw.alignment      || _defaultDeep().alignment,
      decisions:      raw.decisions      || _defaultDeep().decisions,
    };
    console.log(`[upgradeAnalysis] Call 1 OK — severity=${deepResult.suggestion.severity}`);
  } catch (err) {
    console.warn('[upgradeAnalysis] Call 1 failed, using fallback basic analysis:', err.message);

    // Fallback: run original single-call analysis for the suggestion field
    try {
      const basic = await analyseWithGemini({ filePath, diffText, fileContext });
      deepResult.suggestion = {
        severity: basic.severity,
        title:    basic.title,
        body:     basic.body,
        fix:      basic.fix,
      };
      usedFallback = true;
    } catch (fallbackErr) {
      console.error('[upgradeAnalysis] Fallback also failed:', fallbackErr.message);
      // Keep default shape — analysis still proceeds with empty data
    }
  }

  // ── Call 2: Change Breakdown ────────────────────────────────────────────────
  if (!usedFallback) {
    try {
      const raw = await _changeBreakdown(filePath, diffText);
      breakdownResult = {
        changeAnalysis: Array.isArray(raw.changeAnalysis) ? raw.changeAnalysis : [],
        explanations:   raw.explanations || '',
      };
      console.log(`[upgradeAnalysis] Call 2 OK — ${breakdownResult.changeAnalysis.length} change(s)`);
    } catch (err) {
      console.warn('[upgradeAnalysis] Call 2 failed (non-fatal):', err.message);
      // Keep default — not critical, analysis still flows
    }
  }

  // ── Combine and broadcast ────────────────────────────────────────────────────
  const combined = {
    // Standard fields (backward-compatible with basic analysis)
    severity:       deepResult.suggestion.severity,
    title:          deepResult.suggestion.title,
    body:           deepResult.suggestion.body,
    fix:            deepResult.suggestion.fix,
    file_relevance: deepResult.alignment?.notes || 'Unknown',

    // Enhanced fields
    suggestion:     deepResult.suggestion,
    betterApproach: deepResult.betterApproach,
    alignment:      deepResult.alignment,
    decisions:      deepResult.decisions,
    changeAnalysis: breakdownResult.changeAnalysis,
    explanations:   breakdownResult.explanations,
    usedFallback,
  };

  if (wsClient && wsClient.readyState === 1) {
    wsClient.send(JSON.stringify({
      type:     'analysis_complete',
      enhanced: true,
      result:   combined,
      filePath,
      sessionId,
    }));
  }

  return combined;
}

const BATCH_DEEP_ANALYSIS_SYSTEM = `You are a senior architect reviewing a batch of code changes. You have access to the project context.
Analyse the diffs and return ONLY a JSON object containing an array named "results". The array must exactly match the number of input files.

{
  "results": [
    {
      "id": "match the input id",
      "suggestion": {
        "severity": "critical|warning|hallucination|good|info|context",
        "title": "Short title under 8 words",
        "body": "Detailed explanation under 120 words.",
        "fix": "Concrete action or null"
      },
      "betterApproach": {
        "exists": true or false,
        "description": "Alternative approach or null",
        "reason": "Why better or null"
      },
      "alignment": {
        "aligned": true or false,
        "score": 0-100,
        "issues": ["misalignments"],
        "notes": "Alignment summary"
      },
      "decisions": {
        "found": true or false,
        "list": ["decisions found"],
        "impact": "Impact description"
      }
    }
  ]
}

Severity guide: critical, warning, hallucination, good, info, context.`;

const BATCH_CHANGE_BREAKDOWN_SYSTEM = `You are a code reviewer explaining a batch of code changes.
Return ONLY a JSON object with a "results" array matching the inputs:

{
  "results": [
    {
      "id": "match the input id",
      "changeAnalysis": [
        { "type": "add|remove|modify", "description": "What changed", "impact": "Why", "lines": "12-15" }
      ],
      "explanations": "Single coherent paragraph explaining changes."
    }
  ]
}`;

async function _deepBatchAnalysis(batch) {
  let combinedUserMessage = batch.map((item, idx) => {
    return `[ID: ${idx}]\nFile: ${item.chunk.filename}\nProject Context:\n${item.contextContent}\nDiff:\n${item.chunk.diff}\n---`;
  }).join('\n\n');

  return _callGroq(BATCH_DEEP_ANALYSIS_SYSTEM, combinedUserMessage);
}

async function _changeBatchBreakdown(batch) {
  let combinedUserMessage = batch.map((item, idx) => {
    return `[ID: ${idx}]\nFile: ${item.chunk.filename}\nDiff:\n${item.chunk.diff}\n---`;
  }).join('\n\n');

  return _callGroq(BATCH_CHANGE_BREAKDOWN_SYSTEM, combinedUserMessage);
}

/**
 * Execute a batch analysis of up to 5 items.
 */
async function upgradeBatchAnalysis(batch) {
  if (!batch || batch.length === 0) return [];

  let deepResults = [];
  let breakdownResults = [];
  let usedFallback = false;

  try {
    const rawDeep = await _deepBatchAnalysis(batch);
    if (rawDeep && Array.isArray(rawDeep.results)) {
       deepResults = rawDeep.results;
       console.log(`[upgradeBatchAnalysis] Call 1 (Deep) OK for ${batch.length} files.`);
    } else {
       throw new Error("Invalid format from LLM");
    }
  } catch (err) {
    console.warn('[upgradeBatchAnalysis] Call 1 failed:', err.message);
    usedFallback = true;
    // Fallback: Give everyone default basic shapes
    for (let i = 0; i < batch.length; i++) {
        deepResults.push({ id: i, ..._defaultDeep() });
    }
  }

  if (!usedFallback) {
    try {
      const rawBreakdown = await _changeBatchBreakdown(batch);
      if (rawBreakdown && Array.isArray(rawBreakdown.results)) {
         breakdownResults = rawBreakdown.results;
         console.log(`[upgradeBatchAnalysis] Call 2 (Breakdown) OK for ${batch.length} files.`);
      } else {
         throw new Error("Invalid format from LLM");
      }
    } catch (err) {
      console.warn('[upgradeBatchAnalysis] Call 2 failed:', err.message);
      for (let i = 0; i < batch.length; i++) {
        breakdownResults.push({ id: i, ..._defaultBreakdown() });
      }
    }
  } else {
      for (let i = 0; i < batch.length; i++) {
        breakdownResults.push({ id: i, ..._defaultBreakdown() });
      }
  }

  // Combine results 1:1 with batch indices
  const combinedOut = [];
  for (let i = 0; i < batch.length; i++) {
     const deepMatch = deepResults.find(r => String(r.id) === String(i)) || _defaultDeep();
     const breakMatch = breakdownResults.find(r => String(r.id) === String(i)) || _defaultBreakdown();

     const suggestion = deepMatch.suggestion || _defaultDeep().suggestion;
     
     combinedOut.push({
       severity:       suggestion.severity || 'info',
       title:          suggestion.title || 'Unknown',
       body:           suggestion.body || '',
       fix:            suggestion.fix || null,
       file_relevance: deepMatch.alignment?.notes || 'Unknown',
       
       suggestion:     suggestion,
       betterApproach: deepMatch.betterApproach || _defaultDeep().betterApproach,
       alignment:      deepMatch.alignment || _defaultDeep().alignment,
       decisions:      deepMatch.decisions || _defaultDeep().decisions,
       changeAnalysis: Array.isArray(breakMatch.changeAnalysis) ? breakMatch.changeAnalysis : [],
       explanations:   breakMatch.explanations || '',
       usedFallback
     });
  }

  return combinedOut;
}

module.exports = { upgradeAnalysis, upgradeBatchAnalysis };
