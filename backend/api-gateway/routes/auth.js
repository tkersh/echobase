const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { log, logError } = require('../../shared/logger');

const router = express.Router();

// Validation rules for registration
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores')
    .escape(),

  body('email')
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('fullName')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Full name must be between 1 and 255 characters')
    .matches(/^[a-zA-Z0-9\s\-'.]+$/)
    .withMessage('Full name contains invalid characters')
    .escape(),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
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
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const [result] = await req.db.execute(
      'INSERT INTO users (username, email, full_name, password_hash) VALUES (?, ?, ?, ?)',
      [username, email, fullName, passwordHash]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertId, username, fullName },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
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
      { expiresIn: '24h' }
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