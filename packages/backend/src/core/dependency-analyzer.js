// packages/backend/src/core/dependency-analyzer.js
// Local file import extractor.

'use strict';

const fs = require('fs');
const path = require('path');

const IMPORT_RE = /(?:require\s*\(\s*['"`]|from\s+['"`]|import\s*\(\s*['"`])([^'"`\s)]+)['"`]/g;

function extractImports(fileContent) {
  const imports = [];
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(fileContent)) !== null) {
    const spec = match[1];
    if (spec.startsWith('.')) imports.push(spec);
  }
  return [...new Set(imports)];
}

function resolveImport(fromFile, spec) {
  const dir = path.dirname(fromFile);
  const base = path.resolve(dir, spec);
  const candidates = [base, `${base}.js`, `${base}.ts`, path.join(base, 'index.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function analyzeDependencyImpact(filePath, projectRoot = process.cwd()) {
  try {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectRoot || process.cwd(), filePath);

    if (!fs.existsSync(absPath)) {
      return { filePath: absPath, impactRadius: 0, dependencies: [], error: 'File not found' };
    }

    const content = fs.readFileSync(absPath, 'utf8');
    const rawImports = extractImports(content);
    const deps = rawImports.map((spec) => resolveImport(absPath, spec)).filter(Boolean);

    return {
      filePath: absPath,
      impactRadius: deps.length,
      dependencies: deps,
      analyzedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[DependencyAnalyzer] Error analyzing', filePath, e.message);
    return { filePath, impactRadius: 0, dependencies: [], error: e.message };
  }
}

module.exports = { analyzeDependencyImpact };
