const axios = require('axios');
require('dotenv').config({ path: './packages/daemon/.env' });

async function runTest() {
  const url = 'http://localhost:4000/analyze';
  const data = {
    project_id: process.env.OVERSEER_PROJECT_ID,
    session_id: 'test-session-' + Date.now(),
    file_path: 'src/test-file.js',
    diff_text: `
- console.log("old");
+ console.log("new");
    `,
    timestamp: new Date().toISOString()
  };

  console.log('Sending test analysis request to:', url);
  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${process.env.OVERSEER_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Response:', response.status, response.data);
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  }
}

runTest();
