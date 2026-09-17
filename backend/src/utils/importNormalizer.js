/**
 * Import Normalization Utilities for PharmaStock (Twist 2 / T4)
 * Strictly normalizes messy inputs without locale dependency or silent data corruption.
 */

const QUANTITY_REGEX = /^(\d+)(?:\s*(?:units?|pcs?|tablets?|capsules?|packs?|boxes?|vials?|bottles?))?$/i;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const UK_DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Checks if a given year is a leap year according to Gregorian calendar.
 * @param {number} year
 * @returns {boolean}
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Validates and normalizes quantity input.
 * Accepts:
 *   - Integer number (>= 0)
 *   - String matching integer and optional unit suffix (e.g. "10", "10 units", "  25 pcs  ")
 * Rejects:
 *   - null, undefined, empty string
 *   - negative values (-5, "-5 units")
 *   - decimal values (10.5, "10.5 units")
 *   - malformed strings ("abc", "ten", "10 units and 5")
 * @param {*} rawVal
 * @returns {{ valid: boolean, value?: number, reason?: string }}
 */
function normalizeQuantity(rawVal) {
  if (rawVal === null || rawVal === undefined || typeof rawVal === 'boolean') {
    return { valid: false, reason: 'Quantity cannot be null or empty' };
  }

  if (typeof rawVal === 'number') {
    if (!Number.isFinite(rawVal) || !Number.isInteger(rawVal)) {
      return { valid: false, reason: 'Decimal or floating-point quantities are not supported' };
    }
    if (rawVal < 0) {
      return { valid: false, reason: 'Quantity cannot be negative' };
    }
    return { valid: true, value: rawVal };
  }

  if (typeof rawVal === 'string') {
    const trimmed = rawVal.trim();
    if (!trimmed) {
      return { valid: false, reason: 'Quantity cannot be empty' };
    }

    // Check for explicit decimal in string before regex
    if (trimmed.includes('.') || trimmed.includes(',')) {
      return { valid: false, reason: 'Decimal quantities are not supported' };
    }

    // Check for negative sign
    if (trimmed.startsWith('-')) {
      return { valid: false, reason: 'Quantity cannot be negative' };
    }

    const match = trimmed.match(QUANTITY_REGEX);
    if (!match) {
      return { valid: false, reason: `Malformed quantity: '${rawVal}'` };
    }

    const num = Number(match[1]);
    if (!Number.isSafeInteger(num) || num < 0) {
      return { valid: false, reason: 'Quantity must be a non-negative whole integer' };
    }

    return { valid: true, value: num };
  }

  return { valid: false, reason: 'Invalid quantity type' };
}

/**
 * Validates and normalizes expiry date.
 * Accepts:
 *   - ISO format: YYYY-MM-DD (e.g. "2026-09-25")
 *   - DD/MM/YYYY format (e.g. "25/09/2026")
 * Rejects:
 *   - null, undefined, empty string
 *   - Impossible dates (e.g. "31/02/2026", "29/02/2025", month > 12)
 *   - Ambiguous or malformed formats (e.g. "2026/09/25", "9-25-2026")
 * @param {*} rawVal
 * @returns {{ valid: boolean, value?: string, reason?: string }}
 */
function normalizeExpiryDate(rawVal) {
  if (!rawVal || typeof rawVal !== 'string') {
    return { valid: false, reason: 'Expiry date is required and must be a string' };
  }

  const trimmed = rawVal.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Expiry date cannot be empty' };
  }

  let year, month, day;

  const isoMatch = trimmed.match(ISO_DATE_REGEX);
  const ukMatch = trimmed.match(UK_DATE_REGEX);

  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else if (ukMatch) {
    day = parseInt(ukMatch[1], 10);
    month = parseInt(ukMatch[2], 10);
    year = parseInt(ukMatch[3], 10);
  } else {
    return {
      valid: false,
      reason: `Unsupported date format: '${rawVal}'. Supported formats are YYYY-MM-DD or DD/MM/YYYY`,
    };
  }

  // Range validation
  if (year < 1900 || year > 2100) {
    return { valid: false, reason: `Year ${year} is outside acceptable range (1900-2100)` };
  }

  if (month < 1 || month > 12) {
    return { valid: false, reason: `Month ${month} is invalid (must be 01-12)` };
  }

  const daysInMonth = [
    0,
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  const maxDay = daysInMonth[month];
  if (day < 1 || day > maxDay) {
    return {
      valid: false,
      reason: `Impossible date '${rawVal}': month ${month} has maximum of ${maxDay} days in year ${year}`,
    };
  }

  const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { valid: true, value: normalized };
}

/**
 * Validates batch number.
 * @param {*} rawVal
 * @returns {{ valid: boolean, value?: string, reason?: string }}
 */
function normalizeBatchNumber(rawVal) {
  if (!rawVal || typeof rawVal !== 'string') {
    return { valid: false, reason: 'Batch number is required and cannot be empty' };
  }
  const trimmed = rawVal.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Batch number cannot be blank' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates medicine identifier.
 * @param {*} rawVal
 * @returns {{ valid: boolean, value?: string, reason?: string }}
 */
function normalizeMedicineName(rawVal) {
  if (!rawVal || typeof rawVal !== 'string') {
    return { valid: false, reason: 'Medicine name is required and cannot be empty' };
  }
  const trimmed = rawVal.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Medicine name cannot be blank' };
  }
  return { valid: true, value: trimmed };
}

module.exports = {
  isLeapYear,
  normalizeQuantity,
  normalizeExpiryDate,
  normalizeBatchNumber,
  normalizeMedicineName,
};
