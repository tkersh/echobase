const jwt = require('jsonwebtoken');
const { logError } = require('../../shared/logger');

// Constants for JWT authentication
const BEARER_PREFIX = 'Bearer ';
const BEARER_PREFIX_LENGTH = 7; // Length of 'Bearer '

/**
 * JWT Authentication Middleware
 * Verifies JWT token from Authorization header (Bearer token)
 * All API endpoints require JWT authentication from logged-in users
 */
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing or invalid Authorization header',
      });
    }

    // Extract token by removing Bearer prefix
    const token = authHeader.substring(BEARER_PREFIX_LENGTH);

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      fullName: decoded.fullName,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Token expired',
      });
    }

    logError('JWT authentication error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication',
    });
  }
};

module.exports = {
  authenticateJWT,
};