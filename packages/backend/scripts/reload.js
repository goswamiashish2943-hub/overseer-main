const axios = require('axios');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

async function reload() {
    console.log("Attempting schema reload on", SUPABASE_URL);
    try {
        const response = await axios.post(
          `${SUPABASE_URL}/pg/query`,
          { query: "NOTIFY pgrst, 'reload schema';" },
          { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' } }
        );
        console.log("NOTIFY sent, status:", response.status);
    } catch (e) {
        if (e.response) {
             console.error("Failed with pg endpoint", e.response.status, e.response.data);
        } else {
             console.error("Failed", e.message);
        }
        
        // Try falling back to RPC just in case
        console.log("Trying RPC endpoint...");
        try {
            const rpc = await axios.post(
              `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
              { query: "NOTIFY pgrst, 'reload schema';" },
              { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' } }
            );
            console.log("RPC NOTIFY sent, status:", rpc.status);
        } catch (e2) {
             if (e2.response) {
                  console.error("Failed RPC", e2.response.status, e2.response.data);
             } else {
                  console.error("Failed RPC ext", e2.message);
             }
        }
    }
}
reload();
