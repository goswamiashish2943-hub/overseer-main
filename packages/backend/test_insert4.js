require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testInsert() {
  const payload = {
    file_path: 'test.txt',
    code: '+ test',
    severity: 'info',
    suggestion: { title: 'Test', body: 'body', severity: 'info' }
  };

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
