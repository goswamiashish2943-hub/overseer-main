require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const tables = [
  'project_context_files',
  'code_sessions',
  'codebase_patterns',
  'analysis_cache',
  'projects',
  'sessions',
  'file_knowledge',
  'memory_changes'
];
(async () => {
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`${table}: MISSING or schema error -> ${error.message}`);
      } else {
        console.log(`${table}: EXISTS (${data.length} rows max)`);
      }
    } catch (err) {
      console.log(`${table}: ERROR -> ${err.message}`);
    }
  }
})();
