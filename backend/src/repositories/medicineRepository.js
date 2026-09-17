const { pool } = require('../config/db');

const ALLOWED_SORT_FIELDS = {
  name: 'm.name',
  created_at: 'm.created_at',
  sellable_stock: 'sellable_stock',
};

/**
 * Creates a new medicine record.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.description]
 * @returns {Promise<Object>}
 */
async function createMedicine({ name, description = null }) {
  const query = `
    INSERT INTO medicines (name, description)
    VALUES (?, ?)
  `;
  const [result] = await pool.execute(query, [name.trim(), description ? description.trim() : null]);
  return {
    id: result.insertId,
    name: name.trim(),
    description: description ? description.trim() : null,
  };
}

/**
 * Retrieves paginated medicines with optional search, sorting, and sellable stock.
 * @param {Object} options
 * @param {string} [options.search]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {string} [options.sortBy='name']
 * @param {string} [options.order='asc']
 * @returns {Promise<Object>} { data, pagination: { page, limit, total, totalPages } }
 */
async function getMedicines({ search = '', page = 1, limit = 10, sortBy = 'name', order = 'asc' } = {}) {
  // Validate and sanitize pagination
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  let safeLimit = parseInt(limit, 10) || 10;
  if (safeLimit < 1) safeLimit = 10;
  if (safeLimit > 50) safeLimit = 50;
  const offset = (safePage - 1) * safeLimit;

  // Validate sorting fields
  const sortKey = (sortBy || 'name').toLowerCase();
  if (!ALLOWED_SORT_FIELDS[sortKey]) {
    const error = new Error(`Invalid sort field '${sortBy}'. Allowed fields: ${Object.keys(ALLOWED_SORT_FIELDS).join(', ')}`);
    error.status = 400;
    throw error;
  }
  const sortColumn = ALLOWED_SORT_FIELDS[sortKey];

  const sortOrder = (order || 'asc').toLowerCase();
  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    const error = new Error(`Invalid sort order '${order}'. Must be 'asc' or 'desc'`);
    error.status = 400;
    throw error;
  }

  // Build search condition
  const searchPattern = `%${search.trim()}%`;

  // Count total matching records
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM medicines m
    WHERE m.name LIKE ?
  `;
  const [countRows] = await pool.execute(countQuery, [searchPattern]);
  const total = Number(countRows[0].total);
  const totalPages = Math.ceil(total / safeLimit) || 1;

  // Data query with calculated sellable stock
  const dataQuery = `
    SELECT 
      m.id,
      m.name,
      m.description,
      m.created_at AS createdAt,
      m.updated_at AS updatedAt,
      COALESCE(SUM(CASE WHEN b.quantity > 0 AND b.expiry_date >= CURDATE() AND b.status = 'ACTIVE' THEN b.quantity ELSE 0 END), 0) AS sellableStock
    FROM medicines m
    LEFT JOIN batches b ON m.id = b.medicine_id
    WHERE m.name LIKE ?
    GROUP BY m.id
    ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  const [rows] = await pool.execute(dataQuery, [searchPattern]);

  const formattedData = rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sellableStock: Number(row.sellableStock),
  }));

  return {
    data: formattedData,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
}

/**
 * Retrieves a medicine by ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getMedicineById(id) {
  const query = `
    SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
    FROM medicines
    WHERE id = ?
  `;
  const [rows] = await pool.execute(query, [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Updates an existing medicine.
 * @param {number} id
 * @param {Object} updates
 * @param {string} updates.name
 * @param {string} [updates.description]
 * @returns {Promise<Object|null>}
 */
async function updateMedicine(id, { name, description = null }) {
  const query = `
    UPDATE medicines
    SET name = ?, description = ?
    WHERE id = ?
  `;
  const [result] = await pool.execute(query, [name.trim(), description ? description.trim() : null, id]);
  if (result.affectedRows === 0) return null;
  return getMedicineById(id);
}

/**
 * Checks count of batches associated with a medicine.
 * @param {number} medicineId
 * @returns {Promise<number>}
 */
async function getBatchCountForMedicine(medicineId) {
  const query = `
    SELECT COUNT(*) AS count
    FROM batches
    WHERE medicine_id = ?
  `;
  const [rows] = await pool.execute(query, [medicineId]);
  return Number(rows[0].count);
}

/**
 * Deletes a medicine by ID.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function deleteMedicine(id) {
  const query = `DELETE FROM medicines WHERE id = ?`;
  const [result] = await pool.execute(query, [id]);
  return result.affectedRows > 0;
}

module.exports = {
  createMedicine,
  getMedicines,
  getMedicineById,
  updateMedicine,
  getBatchCountForMedicine,
  deleteMedicine,
};
