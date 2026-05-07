require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function testQuery() {
  const { data, error } = await supabase.from('code_sessions').select('*').limit(1);
  console.log("code_sessions data:", data ? data.length : 0);
  console.log("code_sessions error:", error);

  const { data: sData, error: sError } = await supabase.from('sessions').select('*').limit(1);
  console.log("sessions data:", sData ? sData.length : 0);
  console.log("sessions error:", sError);
}
testQuery();
