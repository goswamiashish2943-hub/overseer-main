'use strict';

const crypto = require('crypto');
const { getAnalysisCache, saveAnalysisCache } = require('./core/local-store');

/**
 * Computes a SHA256 hash across the chunk contents, context length, and filename.
 */
function computeCodeHash(chunk, contextLength) {
  const dataString = JSON.stringify({
    filename: chunk.filename,
    diff: chunk.diff,
    fileContent: chunk.fileContent,
    contextLength,
  });
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Queries the analysis_cache table to find an existing analysis.
 * If found, increments the hit count and returns the parsed result.
 */
async function checkCache(codeHash) {
  return getAnalysisCache(codeHash);
}

/**
 * Saves a new analysis into the analysis_cache table.
 */
async function saveToCache(codeHash, analysisResult) {
  saveAnalysisCache(codeHash, analysisResult);
}

module.exports = {
  computeCodeHash,
  checkCache,
  saveToCache,
};
