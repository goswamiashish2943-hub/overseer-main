require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
(async () => {
  const projectId = 'd1fc85eb-ea73-4fb8-bc5d-105852ce9ea8';
  console.log('Checking project row:');
  const projectRes = await supabase.from('projects').select('*').eq('project_id', projectId).limit(1);
  console.log(JSON.stringify(projectRes, null, 2));
  console.log('Checking sessions row for same project:');
  const sessionRes = await supabase.from('sessions').select('*').eq('project_id', projectId).limit(1);
  console.log(JSON.stringify(sessionRes, null, 2));
  console.log('Checking project row by id column if exists:');
  const projectIdRes = await supabase.from('projects').select('*').eq('id', projectId).limit(1);
  console.log(JSON.stringify(projectIdRes, null, 2));
})();
