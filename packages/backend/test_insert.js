require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testInsert() {
  const { data: project } = await supabase.from('projects').select('id').limit(1).single();
  const projectId = project?.id;

  console.log("Using projectId:", projectId);

  const payload = {
    session_id: '12345678-1234-1234-1234-123456789012', 
    project_id: projectId,
    file_path: 'test.txt',
    diff_text: '+ test',
    severity: 'info'
  };

  const { data, error } = await supabase
    .from('code_sessions')
    .insert(payload)
    .select('id')
    .single();

  console.log("Insert result:");
  console.log("Error:", error);
  console.log("Data:", data);
}

testInsert();
