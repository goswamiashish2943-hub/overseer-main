// Fix script: replaces openBrowser function in cli.js
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'cli.js');
let code = fs.readFileSync(file, 'utf8');

// Find and replace the openBrowser function by line scanning
const lines = code.split('\n');
let startIdx = -1;
let endIdx = -1;
let braceDepth = 0;
let inFunction = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function openBrowser(url)')) {
    startIdx = i;
    // Also capture the comment block above it
    let j = i - 1;
    while (j >= 0 && (lines[j].startsWith('//') || lines[j].trim() === '')) {
      if (lines[j].startsWith('// ─── Explicit browser')) {
        startIdx = j;
        break;
      }
      j--;
    }
    inFunction = true;
    braceDepth = 0;
  }
  if (inFunction) {
    for (const ch of lines[i]) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth === 0 && i > startIdx + 1) {
      endIdx = i;
      break;
    }
  }
}

if (startIdx === -1 || endIdx === -1) {
  console.log('ERROR: Could not find openBrowser function boundaries');
  console.log('startIdx:', startIdx, 'endIdx:', endIdx);
  process.exit(1);
}

console.log(`Found openBrowser: lines ${startIdx + 1} to ${endIdx + 1}`);

const newFunction = `// ─── Explicit browser launcher ────────────────────────────────────────────────
// On Windows, a generic OS URL-open can land in VS Code if Code is registered
// as the default http/https handler.  We instead try real browsers directly.
// NEVER falls back to the generic 'open' package — that causes the VS Code issue.

function openBrowser(url) {
  const isWin = process.platform === 'win32';

  if (isWin) {
    // Ordered preference: Edge → Chrome → Firefox
    const candidates = [
      { name: 'Edge',    exe: 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe' },
      { name: 'Edge',    exe: 'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe' },
      { name: 'Chrome',  exe: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe' },
      { name: 'Chrome',  exe: 'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe' },
      { name: 'Firefox', exe: 'C:\\\\Program Files\\\\Mozilla Firefox\\\\firefox.exe' },
    ];

    for (const { name, exe } of candidates) {
      if (fs.existsSync(exe)) {
        console.log('  [browser] Found ' + name + ': ' + exe);
        try {
          execSync('start "" "' + exe + '" "' + url + '"', { stdio: 'ignore', windowsHide: true });
          console.log('  [browser] Launched ' + name + '.');
          return;
        } catch (err) {
          console.log('  [browser] cmd start failed for ' + name + ': ' + err.message);
        }
      }
    }

    // Fallback: try App Paths registry names
    console.log('  [browser] No exe path worked. Trying App Paths...');
    for (const cmd of ['start msedge', 'start chrome', 'start firefox']) {
      try {
        execSync(cmd + ' "' + url + '"', { stdio: 'ignore', windowsHide: true });
        console.log('  [browser] Launched via: ' + cmd);
        return;
      } catch { /* not registered */ }
    }

    console.log('  [browser] WARNING: Could not open any browser. Open manually:');
    console.log('  ' + url);
    return;
  }

  // macOS / Linux
  try {
    if (process.platform === 'darwin') {
      execSync('open "' + url + '"', { stdio: 'ignore' });
    } else {
      execSync('xdg-open "' + url + '"', { stdio: 'ignore' });
    }
  } catch { /* silently ignore */ }
}`;

// Replace lines
lines.splice(startIdx, endIdx - startIdx + 1, ...newFunction.split('\n'));

// Also remove 'await' before openBrowser calls since it's no longer async
const result = lines.join('\n').replace(/await openBrowser\(/g, 'openBrowser(');

fs.writeFileSync(file, result, 'utf8');
console.log('cli.js updated successfully!');
console.log('Removed async, added logging, removed open package fallback.');
