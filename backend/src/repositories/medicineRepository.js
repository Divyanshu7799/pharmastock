const { pool } = require('../config/db');

/**
 * Creates a new medicine record.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.description]
 * @returns {Promise<Object>} Created medicine object with ID
 */
async function createMedicine({ name, description = null }) {
  if (!name || !name.trim()) {
    throw new Error('Medicine name is required');
  }

  const query = `
    INSERT INTO medicines (name, description)
    VALUES (?, ?)
  `;
  const [result] = await pool.execute(query, [name.trim(), description]);
  return {
    id: result.insertId,
    name: name.trim(),
    description,
  };
}

/**
 * Retrieves all medicines ordered by name.
 * @returns {Promise<Array>}
 */
async function getMedicines() {
  const query = `
    SELECT id, name, description, created_at, updated_at
    FROM medicines
    ORDER BY name ASC
  `;
  const [rows] = await pool.query(query);
  return rows;
}

/**
 * Retrieves a medicine by ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getMedicineById(id) {
  const query = `
    SELECT id, name, description, created_at, updated_at
    FROM medicines
    WHERE id = ?
  `;
  const [rows] = await pool.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  createMedicine,
  getMedicines,
  getMedicineById,
};
