const fs = require('fs');
const path = require('path');
require('dotenv').config();
const axios = require('axios');
const url = process.env.SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;
const sql = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`;
(async () => {
  try {
    const res = await axios.post(`${url}/pg/query`, { query: sql }, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });
    console.log(JSON.stringify({ status: res.status, data: res.data }, null, 2));
  } catch (err) {
    console.error(err.toString());
    process.exit(1);
  }
})();
