require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkPolicies() {
  const { data, error } = await supabase.from('pg_policies').select('*').eq('tablename', 'code_sessions');
  console.log("pg_policies error:", error);
  console.log("pg_policies data:", data);

  if (error) {
    // maybe need to use RPC or direct query
    const { data: d2, error: e2 } = await supabase.rpc('get_policies');
    console.log("RPC error:", e2?.message);
  }
}

checkPolicies();
