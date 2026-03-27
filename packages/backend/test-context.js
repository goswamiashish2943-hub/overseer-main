require('dotenv').config();
const { buildContext } = require('./src/contextBuilder');

async function test() {
  const projectId = 'd1fc85eb-ea73-4fb8-bc5d-105852ce9ea8';
  const filePath = 'packages/daemon/src/watcher.js';
  
  console.log(`Testing buildContext for ${filePath}...`);
  
  const timeout = setTimeout(() => {
    console.error('TIMED OUT after 10s');
    process.exit(1);
  }, 10000);

  try {
    const context = await buildContext(projectId, filePath);
    clearTimeout(timeout);
    console.log('Result:', context === null ? 'null' : 'Found context');
    console.log('Content:', context);
  } catch (err) {
    clearTimeout(timeout);
    console.error('Error:', err.message);
  }
}

test();
