// packages/backend/src/analyseRoute.js
// Local demo analysis pipeline.

'use strict';

const express = require('express');

const { authMiddleware } = require('./authMiddleware');
const { buildContext, fetchProjectContext, ensureSession, storeCodeSession, upsertFileKnowledge, storeChange } = require('./core/local-store');
const { computeCodeHash, checkCache, saveToCache } = require('./cacheService');
const { addToBatch } = require('./batchQueue');
const { sendToSession } = require('./websocket');
const { analyzeDependencyImpact } = require('./core/dependency-analyzer');

const router = express.Router();

router.post('/analyze', authMiddleware, async (req, res) => {
  const {
    project_id,
    session_id,
    file_path,
    diff_text,
    chunk_index = 0,
    total_chunks = 1,
    timestamp,
    project_root,
  } = req.body;

  if (!session_id || !file_path || !diff_text) {
    return res.status(400).json({
      error: 'project_id, session_id, file_path, and diff_text are required',
    });
  }

  res.status(202).json({ status: 'accepted', session_id, file_path });

  try {
    ensureSession(session_id, project_id, req.user?.id);

    const fileContext = await buildContext(project_id, file_path);
    console.log(`[analyseRoute] 2/8 - Per-file context built (len=${fileContext?.length || 0})`);

    const projectContext = fetchProjectContext(project_id);
    console.log(`[analyseRoute] 3/8 - Project context fetched (len=${projectContext?.length || 0})`);

    console.log('[analyseRoute] 4/8 - Checking cache...');
    const contextContent = `${projectContext || ''}\n${fileContext || ''}`;
    const codeHash = computeCodeHash({ filename: file_path, diff: diff_text, fileContent: '' }, contextContent.length);

    let result = await checkCache(codeHash);

    if (result) {
      console.log(`[analyseRoute] 5/8 - Cache hit for ${file_path}`);
    } else {
      console.log(`[analyseRoute] 5/8 - Cache miss. Queueing for batch analysis...`);
      result = await addToBatch(
        { filename: file_path, diff: diff_text },
        contextContent,
        session_id
      );
      saveToCache(codeHash, result).catch((e) => console.error('Cache save error:', e));
    }

    const logTag = result.usedFallback ? '(fallback)' : '(enhanced)';
    console.log(`[analyseRoute] 6/8 - Analysis complete ${logTag} severity=${result.severity}`);

    const impact = analyzeDependencyImpact(file_path, project_root);
    const memoryId = storeChange(
      session_id,
      project_id,
      file_path,
      diff_text,
      impact.impactRadius || 0,
      impact
    );
    console.log(`[analyseRoute] Memory DB stored change ${memoryId} with impact radius ${impact.impactRadius}`);

    console.log('[analyseRoute] 7/8 - Saving event to code_sessions...');
    const sessionDbId = storeCodeSession({
      session_id,
      project_id,
      file_path,
      diff_text,
      severity: result.severity,
      suggestion: result.suggestion || null,
      better_approach: result.betterApproach || null,
      alignment: result.alignment || null,
      decisions: result.decisions || null,
      change_analysis: result.changeAnalysis || [],
      explanations: result.explanations || null,
      used_fallback: Boolean(result.usedFallback),
      created_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
    });

    console.log('[analyseRoute] 8/8 - Updating file knowledge...');
    upsertFileKnowledge(
      project_id,
      file_path,
      result.file_relevance,
      result.severity === 'critical' ? [result.title] : []
    );

    sendToSession(session_id, {
      type: 'analysis_complete',
      enhanced: true,
      result: {
        ...result,
        id: sessionDbId,
        memoryId,
        impactRadius: impact.impactRadius,
      },
      filePath: file_path,
      sessionId: session_id,
    });

    console.log(`[analyseRoute] Done: ${file_path} severity=${result.severity}`);
  } catch (err) {
    console.error('[analyseRoute] Pipeline error:', err.message);

    try {
      sendToSession(session_id, {
        type: 'analysis_complete',
        result: {
          severity: 'warning',
          title: 'Backend Analysis Failed',
          body: `The pipeline encountered an error: ${err.message}`,
          file_relevance: 'Pipeline Error',
        },
        filePath: file_path,
        sessionId: session_id,
      });
    } catch {
      /* non-fatal */
    }
  }
});

module.exports = router;
