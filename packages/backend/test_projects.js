require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkProjects() {
  const { data, error } = await supabase.from('projects').select('*');
  console.log("projects:", data);
  console.log("projects error:", error);

  const { data: fk, error: fkError } = await supabase.from('code_sessions').select('*').limit(1);
  console.log("code_sessions data:", fk);
}

checkProjects();
