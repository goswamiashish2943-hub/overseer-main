'use strict';

const crypto = require('crypto');
const { getAnalysisCache, saveAnalysisCache } = require('./core/supabase-store');

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
  return saveAnalysisCache(codeHash, analysisResult);
}

module.exports = {
  computeCodeHash,
  checkCache,
  saveToCache,
};
 */
function getCacheStatistics() {
  return {
    hits: cacheHits,
    misses: cacheMisses,
    size: memoryCache.size,
    ratio: cacheHits + cacheMisses === 0 ? 0 : (cacheHits / (cacheHits + cacheMisses)) * 100
  };
}

module.exports = {
  computeCodeHash,
  checkCache,
  saveToCache,
  getCacheStatistics,
};
