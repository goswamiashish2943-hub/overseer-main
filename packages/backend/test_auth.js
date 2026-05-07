require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 1. Get an active user's JWT using Service Key
const adminAuthClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testAuthQuery() {
  // We know there's a user 'e2b09f8c-39ba-4a8d-8152-9f4282eb0ad7'
  const { data: { users }, error: uError } = await adminAuthClient.auth.admin.listUsers();
  const user = users[0];
  if (!user) {
    console.log("No user found");
    return;
  }
  console.log("User:", user.email);

  // Instead of logging in, we can't easily get JWT for user without password.
  // But we can check if RLS is on 'code_sessions'.
  const supabaseAnon = createClient(process.env.SUPABASE_URL, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld2hpcWNibXZlendxcnR4dWt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NDExODUsImV4cCI6MjA4OTIxNzE4NX0._KVIWfWLJBi-Ra8RGkr4AqUzXENNziVihP3z_OTi-nY');
  
  // Can we sign in with a known user? 
  // Let's just create a new user and login, or we can check via RPC or a serverless function.
}

testAuthQuery();
