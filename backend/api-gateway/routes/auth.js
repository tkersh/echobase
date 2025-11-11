const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { log, logError } = require('../../shared/logger');
const {
  JWT_EXPIRATION,
  BCRYPT_SALT_ROUNDS,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  FULLNAME_MIN_LENGTH,
  FULLNAME_MAX_LENGTH,
  FULLNAME_PATTERN,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} = require('../../shared/constants');

const router = express.Router();

// Validation rules for registration
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
    .withMessage(`Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`)
    .matches(USERNAME_PATTERN)
    .withMessage('Username can only contain letters, numbers, and underscores')
    .escape(),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('fullName')
    .trim()
    .isLength({ min: FULLNAME_MIN_LENGTH, max: FULLNAME_MAX_LENGTH })
    .withMessage(`Full name must be between ${FULLNAME_MIN_LENGTH} and ${FULLNAME_MAX_LENGTH} characters`)
    .matches(FULLNAME_PATTERN)
    .withMessage('Full name contains invalid characters')
    .escape(),

  body('password')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`)
    .matches(PASSWORD_PATTERN)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
];

// Validation rules for login
const loginValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .escape(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', registerValidation, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { username, email, fullName, password } = req.body;

    // Check if user already exists
    const [existingUsers] = await req.db.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'Username or email is already registered',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Insert new user
    const [result] = await req.db.execute(
      'INSERT INTO users (username, email, full_name, password_hash) VALUES (?, ?, ?, ?)',
      [username, email, fullName, passwordHash]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertId, username, fullName },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    log(`New user registered: ${username} (${fullName}) - ID: ${result.insertId}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: result.insertId,
        username,
        email,
        fullName,
      },
    });
  } catch (error) {
    logError('Error during registration:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration. Please try again later.',
    });
  }
});

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post('/login', loginValidation, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { username, password } = req.body;

    // Find user by username
    const [users] = await req.db.execute(
      'SELECT id, username, email, full_name, password_hash FROM users WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password',
      });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, fullName: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    log(`User logged in: ${username} (${user.full_name}) - ID: ${user.id}`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
      },
    });
  } catch (error) {
    logError('Error during login:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login. Please try again later.',
    });
  }
});

module.exports = router;