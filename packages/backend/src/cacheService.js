const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Computes a SHA256 hash across the chunk contents, context length, and filename.
 */
function computeCodeHash(chunk, contextLength) {
    const dataString = JSON.stringify({
        filename: chunk.filename,
        diff: chunk.diff,
        fileContent: chunk.fileContent,
        contextLength: contextLength
    });
    return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Queries the analysis_cache table to find an existing analysis.
 * If found, asynchronously increments the hit count and returns the parsed result.
 */
async function checkCache(codeHash) {
    const { data, error } = await supabase
        .from('analysis_cache')
        .select('*')
        .eq('code_hash', codeHash)
        .single();
    
    if (error || !data) return null;

    // Fire and forget update
    supabase.rpc('increment_cache_hit', { p_hash: codeHash }).catch(() => {
        // Fallback if RPC doesn't exist, just basic update
        supabase.from('analysis_cache')
            .update({ hits: data.hits + 1, last_accessed: new Date() })
            .eq('code_hash', codeHash)
            .then();
    });

    return data.analysis;
}

/**
 * Saves a new analysis into the analysis_cache table.
 */
async function saveToCache(codeHash, analysisResult) {
    await supabase
        .from('analysis_cache')
        .upsert({
            code_hash: codeHash,
            analysis: analysisResult,
            last_accessed: new Date()
        });
}

module.exports = {
    computeCodeHash,
    checkCache,
    saveToCache
};
