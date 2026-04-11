const { upgradeBatchAnalysis } = require('./upgradeAnalysis');
const { sendToSession } = require('./websocket');

// State
let pendingBatch = [];
let batchTimer = null;
const BATCH_SIZE_LIMIT = 5;
const BATCH_TIMEOUT_MS = 2000;

// Rate limiting (30 RPM -> 30 tokens per 60 seconds)
const RPM_LIMIT = 30;
const WINDOW_MS = 60000;
let requestTimestamps = [];

function isRateLimited() {
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(ts => now - ts < WINDOW_MS);
    return requestTimestamps.length >= RPM_LIMIT;
}

function recordApiCall() {
    requestTimestamps.push(Date.now());
}

/**
 * Adds an analysis request to the queue and returns a Promise that resolves 
 * when the batch is flushed and processed by the LLM.
 */
function addToBatch(reqChunk, contextFilesContent, sessionId) {
    return new Promise((resolve, reject) => {
        pendingBatch.push({
            chunk: reqChunk,
            contextContent: contextFilesContent,
            sessionId: sessionId,
            resolve,
            reject,
            addedAt: Date.now()
        });

        if (pendingBatch.length >= BATCH_SIZE_LIMIT) {
            if (batchTimer) {
                clearTimeout(batchTimer);
                batchTimer = null;
            }
            processBatch();
        } else if (!batchTimer) {
            batchTimer = setTimeout(() => {
                batchTimer = null;
                processBatch();
            }, BATCH_TIMEOUT_MS);
        }
    });
}

/**
 * Processes the queue. Uses exponential-like delay if rate-limited.
 */
async function processBatch() {
    if (pendingBatch.length === 0) return;

    if (isRateLimited()) {
        console.log(`[BatchQueue] Rate limit approaching (${requestTimestamps.length}/${RPM_LIMIT}). Delaying batch...`);
        batchTimer = setTimeout(() => {
            batchTimer = null;
            processBatch();
        }, 2000);
        return;
    }

    const batchToProcess = pendingBatch.splice(0, BATCH_SIZE_LIMIT);
    recordApiCall();
    recordApiCall();

    console.log(`[BatchQueue] Flushing batch of ${batchToProcess.length} files...`);

    try {
        const results = await upgradeBatchAnalysis(batchToProcess);

        for (let i = 0; i < batchToProcess.length; i++) {
            const item = batchToProcess[i];
            const result = results[i];

            if (result) {
                sendToSession(item.sessionId, {
                    type: 'analysis_complete',
                    enhanced: true,
                    result: result,
                    filePath: item.chunk.filename
                });
                item.resolve(result); // Pass it back to analyseRoute for DB hooks
            } else {
                console.error(`[BatchQueue] empty result for ${item.chunk.filename}`);
                item.reject(new Error("Empty result"));
            }
        }
    } catch (e) {
        console.error("[BatchQueue] Error processing batch:", e);
        // We reject the batch so analyseRoute can gracefully fallback or log
        batchToProcess.forEach(item => item.reject(e));
    }

    if (pendingBatch.length > 0) {
        processBatch();
    }
}

module.exports = {
    addToBatch
};
