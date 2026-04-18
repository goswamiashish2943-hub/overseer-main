#!/usr/bin/env node
/**
 * packages/daemon/bin/overseer.js
 * 
 * Windows-compatible shim that ensures node is used.
 * Pointed to by package.json "bin" field.
 */
require('../src/cli.js');
