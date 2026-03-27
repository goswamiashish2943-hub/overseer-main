const fs = require('fs');

async function testPipeline() {
  try {
    const authData = JSON.parse(fs.readFileSync('C:\\Users\\Lenovo\\.overseer\\auth.json', 'utf8'));
    const token = authData.access_token;
    
    // Read project ID from daemon/.env
    const envData = fs.readFileSync('C:\\Users\\Lenovo\\Desktop\\New folder\\overseer\\packages\\daemon\\.env', 'utf8');
    const projectIdMatch = envData.match(/OVERSEER_PROJECT_ID=(.+)/);
    const projectId = projectIdMatch[1].trim();

    console.log(`Sending /analyze request for project ${projectId}...`);

    const res = await fetch('http://localhost:4000/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        project_id: projectId,
        session_id: 'test-session-1234',
        file_path: 'src/mockFile.js',
        diff_text: 'console.log("Mock change!");',
        chunk_index: 0,
        total_chunks: 1,
        from_queue: false
      })
    });

    const data = await res.json();
    console.log(`Success! Response: ${res.status}`, data);
  } catch (err) {
    if (err.response) {
      console.error(`Error: ${err.response.status}`, err.response.data);
    } else {
      console.error('Network or Parse Error:', err.message);
    }
  }
}

testPipeline();
