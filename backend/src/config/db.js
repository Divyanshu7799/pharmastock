const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pharmastock',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

const pool = mysql.createPool(dbConfig);

/**
 * Tests database connectivity using the connection pool.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    console.log(`[Database] Successfully connected to MySQL database: ${dbConfig.database} at ${dbConfig.host}:${dbConfig.port}`);
    return true;
  } catch (error) {
    console.error('[Database] Connection failed:', {
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage || error.message,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
    });
    return false;
  }
}

module.exports = {
  pool,
  testConnection,
  dbConfig,
};
