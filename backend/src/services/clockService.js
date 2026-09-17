const { pool } = require('../config/db');
const clockRepo = require('../repositories/clockRepository');

/**
 * Executes daily maintenance job:
 * 1. Finds active batches whose expiry_date is before CURRENT_DATE and quarantines them.
 * 2. Counts how many batches were quarantined.
 * 3. Finds active batches expiring within the next 7 days with quantity > 0 and counts them.
 * 4. Returns deterministic counts and processing metadata.
 * 
 * Idempotent: Subsequent calls with no new expired batches will report quarantinedCount = 0.
 * @returns {Promise<Object>} { message, data: { quarantinedCount, expiringSoonCount, processedAt } }
 */
async function processClock() {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // Step 1: Quarantine expired batches
    const quarantinedCount = await clockRepo.quarantineExpiredBatches(connection);

    // Step 2: Count actionable expiring-soon batches within 7 days
    const expiringSoonCount = await clockRepo.countExpiringSoonBatches(connection, 7);

    // Commit transaction
    await connection.commit();

    return {
      message: 'Clock processed successfully',
      data: {
        quarantinedCount,
        expiringSoonCount,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  processClock,
};
