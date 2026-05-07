require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Using ANON KEY
const supabase = createClient(
  'https://oewhiqcbmvezwqrtxukw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld2hpcWNibXZlendxcnR4dWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NDExODUsImV4cCI6MjA4OTIxNzE4NX0._KVIWfWLJBi-Ra8RGkr4AqUzXENNziVihP3z_OTi-nY'
);

async function testAnonQuery() {
  const { data, error } = await supabase.from('code_sessions').select('*');
  console.log("Anon code_sessions error:", error);
  console.log("Anon code_sessions data length:", data ? data.length : 0);
}

testAnonQuery();
