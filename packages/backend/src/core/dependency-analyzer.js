// packages/backend/src/core/dependency-analyzer.js
const _dt = require('dependency-tree');
const dependencyTree = _dt.default || _dt; // Handle ESM interop
const path = require('path');
const fs = require('fs');

function analyzeDependencyImpact(filePath) {
    try {
        const absPath = path.resolve(filePath);
        if (!fs.existsSync(absPath)) {
            return { error: 'File not found', impactRadius: 0, dependencies: [] };
        }

        const dir = path.dirname(absPath);

        const list = dependencyTree.toList({
            filename: absPath,
            directory: dir,
            filter: p => p.indexOf('node_modules') === -1,
        });

        const dependencies = list.filter(p => p !== absPath);

        return {
            filePath: absPath,
            impactRadius: dependencies.length,
            dependencies,
            analyzedAt: new Date().toISOString()
        };
    } catch (e) {
        console.error('[DependencyAnalyzer] Error analyzing', filePath, e.message);
        return { error: e.message, impactRadius: 0, dependencies: [] };
    }
}

module.exports = { analyzeDependencyImpact };
