require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testInsert() {
  const { data: project } = await supabase.from('projects').select('id').limit(1).single();
  if (!project) {
    console.log("No project found");
    return;
  }
  
  const { data: session } = await supabase.from('sessions').select('session_id').eq('project_id', project.id).limit(1).single();

  const payload = {
    session_id: session ? session.session_id : null,
    project_id: project.id,
    file_path: 'test.txt',
    diff_text: '+ test',
    severity: 'info',
    suggestion: { title: 'Test', body: 'body', severity: 'info' },
    used_fallback: false
  };

  if (!payload.session_id) {
     const { data: newSession } = await supabase.from('sessions').insert({project_id: project.id}).select('session_id').single();
     payload.session_id = newSession.session_id;
  }

  const { data, error } = await supabase
    .from('code_sessions')
    .insert(payload)
    .select('*')
    .single();

  console.log("Insert result:");
  console.log("Error:", error);
  console.log("Data:", data);
}

testInsert();
