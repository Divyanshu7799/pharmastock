const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepo = require('../repositories/userRepository');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generates signed JWT token for a user.
 * @param {Object} user
 * @returns {string}
 */
function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'pharmastock_dev_secret_key_2026_secure';
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    secret,
    { expiresIn }
  );
}

/**
 * Registers a new user.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} params.password
 * @returns {Promise<Object>} { token, user }
 */
async function register({ name, email, password }) {
  if (!name || !name.trim()) {
    const error = new Error('Name is required');
    error.status = 400;
    throw error;
  }
  if (!email || !email.trim()) {
    const error = new Error('Email is required');
    error.status = 400;
    throw error;
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    const error = new Error('Invalid email format');
    error.status = 400;
    throw error;
  }
  if (!password || password.length < 6) {
    const error = new Error('Password must be at least 6 characters long');
    error.status = 400;
    throw error;
  }

  // Check unique email
  const existingUser = await userRepo.getUserByEmail(email.trim());
  if (existingUser) {
    const error = new Error('An account with this email already exists');
    error.status = 409;
    throw error;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = await userRepo.createUser({
    name: name.trim(),
    email: email.trim(),
    passwordHash,
  });

  const token = generateToken(newUser);
  return {
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    },
  };
}

/**
 * Authenticates user credentials and returns JWT.
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @returns {Promise<Object>} { token, user }
 */
async function login({ email, password }) {
  if (!email || !email.trim() || !password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }

  const user = await userRepo.getUserByEmail(email.trim());
  if (!user) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  const token = generateToken(user);
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  };
}

/**
 * Gets user profile by ID without password hash.
 * @param {number} userId
 * @returns {Promise<Object>}
 */
async function getMe(userId) {
  const user = await userRepo.getUserById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  return user;
}

module.exports = {
  register,
  login,
  getMe,
};
