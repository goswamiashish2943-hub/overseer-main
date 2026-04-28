require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function test() {
  const { data: d1, error: e1 } = await supabase.from('code_sessions').select('*').limit(1);
  console.log("code_sessions data:", d1, "error:", e1);
  const { data: d2, error: e2 } = await supabase.from('sessions').select('*').limit(1);
  console.log("sessions data:", d2, "error:", e2);
}

test();
