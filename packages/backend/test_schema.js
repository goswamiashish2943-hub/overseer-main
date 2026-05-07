require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkSchema() {
  const { data, error } = await supabase.rpc('get_foreign_keys');
  console.log("If RPC is not there, we'll try postgres query directly... Error:", error?.message);
}

checkSchema();
