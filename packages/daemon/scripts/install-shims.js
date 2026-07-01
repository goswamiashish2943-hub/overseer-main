'use strict';

const fs = require('fs');
const path = require('path');

const packageRoot = path.resolve(__dirname, '..');
const cliPath = path.join(packageRoot, 'src', 'cli.js');
const nodePath = process.execPath;

function getBinDir() {
  const globalInstall = process.env.npm_config_global === 'true';
  const localPrefix = process.env.npm_config_local_prefix;
  const prefix = process.env.npm_config_prefix;

  if (globalInstall && prefix) {
    return prefix;
  }

  if (localPrefix) {
    return path.join(localPrefix, 'node_modules', '.bin');
  }

  if (prefix) {
    return path.join(prefix, 'node_modules', '.bin');
  }

  return path.join(packageRoot, 'node_modules', '.bin');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(file, contents) {
  fs.writeFileSync(file, contents, 'utf8');
}

function writeWindowsShim(binDir) {
  const cmdPath = path.join(binDir, 'overseer.cmd');
  const ps1Path = path.join(binDir, 'overseer.ps1');

  const cmd = [
    '@ECHO off',
    'SETLOCAL',
    `"${nodePath}" "${cliPath}" %*`,
    '',
  ].join('\r\n');

  const ps1 = [
    '#!/usr/bin/env pwsh',
    `$node = '${nodePath.replace(/'/g, "''")}'`,
    `$cli = '${cliPath.replace(/'/g, "''")}'`,
    '& $node $cli @args',
    '',
  ].join('\r\n');

  writeFile(cmdPath, cmd);
  writeFile(ps1Path, ps1);
}

function writeUnixShim(binDir) {
  const shellPath = path.join(binDir, 'overseer');
  const sh = [
    '#!/usr/bin/env sh',
    `exec "${nodePath}" "${cliPath}" "$@"`,
    '',
  ].join('\n');

  writeFile(shellPath, sh);
  try {
    fs.chmodSync(shellPath, 0o755);
  } catch {
    /* ignore on platforms that do not support chmod */
  }
}

function main() {
  const binDir = getBinDir();
  ensureDir(binDir);
  writeWindowsShim(binDir);
  writeUnixShim(binDir);
  console.log(`[overseer] shims installed in ${binDir}`);
}

main();
