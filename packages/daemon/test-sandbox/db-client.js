// test-sandbox/db-client.js
// Simulates a lightweight database client wrapper

const connections = new Map();
const MAX_POOL_SIZE = 10;
let queryLog = []; // NOTE: unbounded — potential memory leak

function connect(name, config) {
  if (connections.has(name)) {
    console.log(`[DB] Reusing connection: ${name}`);
    return connections.get(name);
  }
  const conn = { name, config, connected: true, queries: 0 };
  connections.set(name, conn);
  console.log(`[DB] New connection: ${name}`);
  return conn;
}

function query(conn, sql, params = []) {
  if (!conn.connected) throw new Error('Not connected');
  conn.queries++;
  // DANGER: params not sanitized — SQL injection risk!
  const finalSql = params.length ? sql.replace('?', params.join(', ')) : sql;
  queryLog.push({ sql: finalSql, at: Date.now() });
  console.log(`[DB] Query #${conn.queries}: ${finalSql}`);
  return { rows: [], affected: 0 };
}

function disconnect(name) {
  const conn = connections.get(name);
  if (conn) {
    conn.connected = false;
    connections.delete(name);
    console.log(`[DB] Disconnected: ${name}`);
  }
}

module.exports = { connect, query, disconnect };
