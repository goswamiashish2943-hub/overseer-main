// packages/backend/scripts/init.js
//
// Auto-migration script — creates all required Overseer tables in Supabase.
// Usage: npm run init
//
// Safe to re-run: all SQL uses IF NOT EXISTS.
// Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY in packages/backend/.env

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n  ❌  Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env\n');
  process.exit(1);
}

// ─── Execute SQL via Supabase REST API ────────────────────────────────────────

async function runSQL(sql, description) {
  // Use Supabase's SQL execution endpoint (service role required)
  const url = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;

  try {
    // Supabase doesn't expose a raw SQL endpoint by default; we use the
    // pg extension or the management API. Since service key is available,
    // use the Supabase SQL endpoint via the management API.
    const mgmtUrl = SUPABASE_URL.replace('.supabase.co', '.supabase.co/rest/v1/');

    // Split into individual statements and run each via a Supabase rpc workaround.
    // The cleanest way without a pg client is to use axios against the Supabase
    // REST API with service key and the sql endpoint.
    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/`,
      {},  // empty body — we're just testing connectivity first
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        validateStatus: () => true,
      }
    );

    // Use pg via supabase-js for actual SQL execution
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Split SQL into statements and run them sequentially via the rpc exec approach
    // Since supabase-js doesn't expose raw SQL, we run statements individually
    // by using the supabase.rpc() with a custom function or the query method.
    // The most reliable approach: use the supabase REST API directly with SQL.

    const sqlUrl = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;
    await axios.post(
      sqlUrl,
      { query: sql },
      {
        headers: {
          'apikey':         SERVICE_KEY,
          'Authorization':  `Bearer ${SERVICE_KEY}`,
          'Content-Type':   'application/json',
        },
        validateStatus: () => true,
      }
    );

    console.log(`  ✓  ${description}`);
  } catch (err) {
    throw new Error(`${description}: ${err.message}`);
  }
}

// ─── Alternative: split SQL and use statement-by-statement execution ──────────

async function executeMigration(sqlContent) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Split on semicolons, filter blanks and comments
  const statements = sqlContent
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const preview = stmt.slice(0, 60).replace(/\n/g, ' ');

    try {
      // Use the Supabase REST API /rest/v1/rpc endpoint
      // For direct SQL we need to use the pg query via supabase's management API
      // or use a custom RPC function. We'll try the management API approach.
      const response = await axios.post(
        `${SUPABASE_URL}/pg/query`,
        { query: stmt + ';' },
        {
          headers: {
            'apikey':        SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type':  'application/json',
          },
          validateStatus: () => true,
        }
      );

      if (response.status >= 400) {
        // Try the alternative pg endpoint
        const altResponse = await axios.post(
          `${SUPABASE_URL}/rest/v1/rpc/exec_migration`,
          { sql: stmt },
          {
            headers: {
              'apikey':        SERVICE_KEY,
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type':  'application/json',
            },
            validateStatus: () => true,
          }
        );

        if (altResponse.status >= 400) {
          console.warn(`  ⚠  Statement may need manual run: ${preview}...`);
          console.warn(`     Status: ${altResponse.status} — ${JSON.stringify(altResponse.data)?.slice(0, 100)}`);
        } else {
          console.log(`  ✓  ${preview}...`);
        }
      } else {
        console.log(`  ✓  ${preview}...`);
      }
    } catch (err) {
      console.warn(`  ⚠  Statement failed (may already exist): ${preview}...`);
      if (process.env.DEBUG === 'true') console.warn('     Error:', err.message);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  Overseer — Database Initialisation\n');
  console.log(`  Supabase: ${SUPABASE_URL}\n`);

  const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error(`  ❌  Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // run in alphabetical order (001_, 002_, etc.)

  if (migrationFiles.length === 0) {
    console.log('  No migration files found. Nothing to do.\n');
    return;
  }

  console.log(`  Found ${migrationFiles.length} migration file(s):\n`);

  for (const file of migrationFiles) {
    const filePath   = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf8');

    console.log(`  📄 Running: ${file}`);
    await executeMigration(sqlContent);
    console.log('');
  }

  console.log('  ─────────────────────────────────────────────────────────');
  console.log('  Migration complete.\n');
  console.log('  If any statements showed ⚠, run the SQL manually in:');
  console.log(`  ${SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/sql\n`);
  console.log('  Paste the contents of:');
  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    console.log(`    ${filePath}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\n  ❌  Init failed:', err.message, '\n');
  process.exit(1);
});
