require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkPolicies() {
  const { data, error } = await supabase.rpc('run_sql', { query: "SELECT * FROM pg_policies WHERE tablename = 'code_sessions';" });
  console.log("RPC error:", error?.message);

  if (error) {
    // maybe try selecting from postgres view via raw query if possible?
    // Supabase JS doesn't have raw SQL without RPC.
    console.log("Need another way to check RLS");
  }
}
checkPolicies();
