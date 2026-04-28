require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function test() {
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('table_name, column_name')
    .in('table_name', ['sessions', 'code_sessions'])
    .order('table_name');
    
  console.log("Columns:", JSON.stringify(data, null, 2));
  console.log("Error:", error);
}

test();
