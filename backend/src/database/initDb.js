const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function initDatabase() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT, 10) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'pharmastock';

  console.log(`[InitDB] Connecting to MySQL at ${host}:${port} as ${user}...`);

  let connection;
  try {
    // Connect to MySQL server without selecting DB initially
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });

    console.log('[InitDB] Connected successfully.');

    // 1. Execute Schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('[InitDB] Applying database schema from schema.sql...');
    await connection.query(schemaSql);
    console.log('[InitDB] Database and tables created successfully.');

    // 2. Execute Seed Data
    const seedPath = path.join(__dirname, 'seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    console.log('[InitDB] Populating seed data from seed.sql...');
    await connection.query(seedSql);
    console.log('[InitDB] Seed data inserted successfully.');

    console.log('[InitDB] Database initialization complete!');
  } catch (error) {
    console.error('[InitDB] Error initializing database:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('[InitDB] Access denied. Please ensure DB_USER and DB_PASSWORD in backend/.env are correct.');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;
