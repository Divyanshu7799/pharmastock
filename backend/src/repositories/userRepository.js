const { pool } = require('../config/db');

/**
 * Creates a new user record.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.passwordHash
 * @returns {Promise<Object>}
 */
async function createUser({ name, email, passwordHash }) {
  const query = `
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `;
  const [result] = await pool.execute(query, [name.trim(), email.toLowerCase().trim(), passwordHash]);
  return {
    id: result.insertId,
    name: name.trim(),
    email: email.toLowerCase().trim(),
  };
}

/**
 * Finds user by email (includes password_hash for authentication check).
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function getUserByEmail(email) {
  const query = `
    SELECT id, name, email, password_hash, created_at, updated_at
    FROM users
    WHERE LOWER(email) = LOWER(?)
  `;
  const [rows] = await pool.execute(query, [email.trim()]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Finds user by ID (omits password_hash).
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getUserById(id) {
  const query = `
    SELECT id, name, email, created_at, updated_at
    FROM users
    WHERE id = ?
  `;
  const [rows] = await pool.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
};
