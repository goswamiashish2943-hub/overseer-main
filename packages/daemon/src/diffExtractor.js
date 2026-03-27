// packages/daemon/src/diffExtractor.js
// OVERSEER — Diff extraction and chunking engine
// Written by Claude (senior architect) — do not modify
// ==========================================================
// Responsibilities:
//   1. Compare two versions of a file (previous vs current)
//   2. Extract only the meaningful changed lines
//   3. Split large diffs into 50-line chunks
//   4. Return structured chunk objects ready for Gemini analysis
//
// Why chunking matters:
//   Gemini Flash has a context window limit and a cost per token.
//   Sending 400 lines at once = one expensive call with diluted focus.
//   Sending 50-line chunks = 8 cheap calls, each precisely analysed.
//   The 50-line size was chosen as the sweet spot: enough context for
//   Gemini to understand a function or logical block, small enough to
//   keep each analysis focused and cost-effective.
// ==========================================================

'use strict'

const Diff = require('diff')

// ── Constants ─────────────────────────────────────────────────────────────────

// Maximum lines per chunk sent to Gemini.
// Below this threshold the diff is sent as a single chunk.
const CHUNK_SIZE = 50

// If a diff is at or below this line count, skip chunking entirely.
// Avoids unnecessary overhead for small changes.
const CHUNK_THRESHOLD = 60

// Lines of surrounding context to include around each changed block.
// Gives Gemini visibility into what the changed code connects to.
// e.g. if line 47 changed, we include lines 44–50 as context.
const CONTEXT_LINES = 3

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compare two versions of a file and return an array of diff chunks
 * ready to be sent to Gemini for analysis.
 *
 * @param {string} previousContent  The file content before the change
 * @param {string} newContent       The file content after the change
 * @returns {DiffChunk[]}           Array of chunks (1 if small, N if large)
 *
 * @typedef {object} DiffChunk
 * @property {string} diffText      The formatted diff text (unified format)
 * @property {number} lineStart     First line number of this chunk (1-indexed)
 * @property {number} lineEnd       Last line number of this chunk (1-indexed)
 * @property {number} chunkIndex    0-based index of this chunk
 * @property {number} totalChunks   Total number of chunks for this file change
 * @property {number} linesAdded    Count of lines added in this chunk
 * @property {number} linesRemoved  Count of lines removed in this chunk
 * @property {boolean} isLargeFile  True if the file was split into multiple chunks
 */
function extractDiff(previousContent, newContent) {
  // Normalise line endings — Windows uses \r\n, Unix uses \n.
  // Diff library works correctly with either, but normalising
  // prevents spurious "every line changed" diffs on Windows machines.
  const prev = normaliseLineEndings(previousContent)
  const next = normaliseLineEndings(newContent)

  // Compute line-by-line diff using the Myers diff algorithm.
  // Returns an array of change objects: { value, added, removed }
  const changes = Diff.diffLines(prev, next)

  // Extract only the lines that changed (added or removed),
  // plus surrounding context lines
  const annotatedLines = buildAnnotatedLines(changes)

  // If nothing actually changed (e.g. only line ending normalisation)
  // return empty — the watcher will skip it
  if (annotatedLines.filter(l => l.type !== 'context').length === 0) {
    return []
  }

  // Count total changed lines to decide whether to chunk
  const changedLineCount = annotatedLines.filter(
    l => l.type === 'added' || l.type === 'removed'
  ).length

  if (changedLineCount <= CHUNK_THRESHOLD) {
    // Small diff — return as a single chunk
    const diffText = formatDiffText(annotatedLines)
    const { linesAdded, linesRemoved } = countChanges(annotatedLines)

    return [{
      diffText,
      lineStart: getLineStart(annotatedLines),
      lineEnd: getLineEnd(annotatedLines),
      chunkIndex: 0,
      totalChunks: 1,
      linesAdded,
      linesRemoved,
      isLargeFile: false,
    }]
  }

  // Large diff — split into chunks of CHUNK_SIZE lines each
  return splitIntoChunks(annotatedLines)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Convert the raw diff library output into a flat array of annotated lines.
 * Each line object knows its content, type, and line number.
 *
 * @param {object[]} changes  Output from Diff.diffLines()
 * @returns {AnnotatedLine[]}
 *
 * @typedef {object} AnnotatedLine
 * @property {string} content    The text of the line (without trailing newline)
 * @property {'added'|'removed'|'context'} type
 * @property {number} lineNumber  Line number in the NEW file (for added/context)
 *                                or OLD file (for removed)
 */
function buildAnnotatedLines(changes) {
  const allLines = []
  let newLineNum = 1
  let oldLineNum = 1

  for (const change of changes) {
    const lines = change.value.split('\n')
    // split('\n') on "abc\n" gives ['abc', ''] — remove the trailing empty string
    if (lines[lines.length - 1] === '') lines.pop()

    for (const line of lines) {
      if (change.added) {
        allLines.push({ content: line, type: 'added', lineNumber: newLineNum })
        newLineNum++
      } else if (change.removed) {
        allLines.push({ content: line, type: 'removed', lineNumber: oldLineNum })
        oldLineNum++
      } else {
        // Unchanged line — context
        allLines.push({ content: line, type: 'context', lineNumber: newLineNum })
        newLineNum++
        oldLineNum++
      }
    }
  }

  return pruneContextLines(allLines)
}

/**
 * Remove context lines that are far from any changed line.
 * We keep CONTEXT_LINES before and after each change block.
 * Everything else (unchanged code far from changes) is stripped.
 *
 * @param {AnnotatedLine[]} lines
 * @returns {AnnotatedLine[]}
 */
function pruneContextLines(lines) {
  // Find indices of all changed lines
  const changedIndices = new Set()
  lines.forEach((line, i) => {
    if (line.type !== 'context') {
      changedIndices.add(i)
    }
  })

  // Mark indices to keep: changed lines + CONTEXT_LINES around each
  const keepIndices = new Set()
  for (const idx of changedIndices) {
    for (let offset = -CONTEXT_LINES; offset <= CONTEXT_LINES; offset++) {
      const target = idx + offset
      if (target >= 0 && target < lines.length) {
        keepIndices.add(target)
      }
    }
  }

  return lines.filter((_, i) => keepIndices.has(i))
}

/**
 * Split a large array of annotated lines into chunks of CHUNK_SIZE.
 * Each chunk is formatted as a self-contained diff string.
 *
 * @param {AnnotatedLine[]} lines
 * @returns {DiffChunk[]}
 */
function splitIntoChunks(lines) {
  const chunks = []

  // We chunk by CHANGED lines (not total lines including context).
  // This ensures each chunk contains exactly CHUNK_SIZE new/removed lines,
  // plus their surrounding context.
  const changedLines = lines.filter(l => l.type !== 'context')
  const totalChunks = Math.ceil(changedLines.length / CHUNK_SIZE)

  let changedIndex = 0

  for (let chunkNum = 0; chunkNum < totalChunks; chunkNum++) {
    // Get the slice of changed lines for this chunk
    const chunkChanged = changedLines.slice(
      chunkNum * CHUNK_SIZE,
      (chunkNum + 1) * CHUNK_SIZE
    )

    if (chunkChanged.length === 0) break

    // Find the range of ALL lines (including context) that corresponds
    // to these changed lines
    const firstChangedLine = chunkChanged[0]
    const lastChangedLine = chunkChanged[chunkChanged.length - 1]

    const chunkLines = lines.filter(line => {
      // Include changed lines in this chunk's range
      if (line.type !== 'context') {
        const idx = changedLines.indexOf(line)
        return idx >= chunkNum * CHUNK_SIZE && idx < (chunkNum + 1) * CHUNK_SIZE
      }
      // Include context lines between first and last changed line of this chunk
      return (
        line.lineNumber >= firstChangedLine.lineNumber - CONTEXT_LINES &&
        line.lineNumber <= lastChangedLine.lineNumber + CONTEXT_LINES
      )
    })

    const diffText = formatDiffText(chunkLines)
    const { linesAdded, linesRemoved } = countChanges(chunkLines)

    chunks.push({
      diffText,
      lineStart: getLineStart(chunkLines),
      lineEnd: getLineEnd(chunkLines),
      chunkIndex: chunkNum,
      totalChunks,
      linesAdded,
      linesRemoved,
      isLargeFile: true,
    })
  }

  return chunks
}

/**
 * Format an array of annotated lines into a readable unified diff string.
 * This is the text that gets sent to Gemini in the prompt.
 *
 * Output format:
 *   + added line
 *   - removed line
 *     unchanged context line
 *
 * @param {AnnotatedLine[]} lines
 * @returns {string}
 */
function formatDiffText(lines) {
  return lines
    .map(line => {
      if (line.type === 'added')   return `+ ${line.content}`
      if (line.type === 'removed') return `- ${line.content}`
      return `  ${line.content}`  // two spaces for context (standard unified diff)
    })
    .join('\n')
}

/**
 * Count added and removed lines in a chunk.
 */
function countChanges(lines) {
  return {
    linesAdded:   lines.filter(l => l.type === 'added').length,
    linesRemoved: lines.filter(l => l.type === 'removed').length,
  }
}

/**
 * Get the first meaningful line number in a set of annotated lines.
 * Used to tell developers "this analysis covers lines X–Y".
 */
function getLineStart(lines) {
  const first = lines.find(l => l.type !== 'context') || lines[0]
  return first ? first.lineNumber : 1
}

/**
 * Get the last meaningful line number in a set of annotated lines.
 */
function getLineEnd(lines) {
  const changed = lines.filter(l => l.type !== 'context')
  const last = changed[changed.length - 1] || lines[lines.length - 1]
  return last ? last.lineNumber : 1
}

/**
 * Normalise \r\n (Windows) to \n (Unix).
 * Ensures diffs are consistent regardless of the developer's OS.
 *
 * @param {string} content
 * @returns {string}
 */
function normaliseLineEndings(content) {
  if (!content) return ''
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// ── Utility exports (used by tests and other modules) ─────────────────────────

module.exports = {
  extractDiff,

  // Exported for unit testing
  _internal: {
    buildAnnotatedLines,
    pruneContextLines,
    splitIntoChunks,
    formatDiffText,
    countChanges,
    normaliseLineEndings,
    CHUNK_SIZE,
    CHUNK_THRESHOLD,
    CONTEXT_LINES,
  },
}
