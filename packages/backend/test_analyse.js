require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testAnalyseInsert() {
  const project_id = 'd1fc85eb-ea73-4fb8-bc5d-105852ce9ea8'; // overseer project
  const session_id = '00000000-0000-0000-0000-000000000001';
  const file_path = 'test.js';
  const diff_text = '+ console.log("hello");';

  await supabase.from('sessions').upsert({
    session_id,
    project_id,
    user_id: 'e2b09f8c-39ba-4a8d-8152-9f4282eb0ad7',
    started_at: new Date().toISOString()
  }, { onConflict: 'session_id', ignoreDuplicates: true });

  const payload = {
    session_id,
    project_id,
    file_path,
    diff_text,
    severity: 'info',
    suggestion: null,
    better_approach: null,
    alignment: null,
    change_analysis: null,
    explanations: null,
    used_fallback: false,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('code_sessions')
    .insert(payload)
    .select('id')
    .single();

  console.log("Error:", error);
  console.log("Data:", data);
}

testAnalyseInsert();
