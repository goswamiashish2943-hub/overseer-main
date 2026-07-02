require('dotenv').config();
const axios = require('axios');
const url = process.env.SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;
const queries = [
  `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' ORDER BY ordinal_position;`,
  `SELECT conname, pg_get_constraintdef(oid) AS constraint_definition FROM pg_constraint WHERE conrelid = 'public.sessions'::regclass;`,
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('projects','sessions');`
];
(async () => {
  for (const sql of queries) {
    const res = await axios.post(`${url}/pg/query`, { query: sql }, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });
    console.log('--- QUERY ---');
    console.log(sql);
    console.log(JSON.stringify(res.data, null, 2));
  }
})();
