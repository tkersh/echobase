const jwt = require('jsonwebtoken');
const { logError } = require('../../shared/logger');
const {
  JWT_EXPIRATION,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
} = require('../../shared/constants');

// Constants for JWT authentication
const BEARER_PREFIX = 'Bearer ';
const BEARER_PREFIX_LENGTH = 7; // Length of 'Bearer '

/**
 * Set the auth cookie on the response.
 * httpOnly prevents JavaScript access; secure requires HTTPS;
 * sameSite 'strict' mitigates CSRF.
 */
function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

/**
 * Clear the auth cookie on the response.
 */
function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
}

/**
 * JWT Authentication Middleware
 * Reads token from HttpOnly cookie first, falls back to Authorization header.
 * On successful verification, issues a fresh token (sliding window refresh).
 */
const authenticateJWT = async (req, res, next) => {
  try {
    // Read token from cookie first, fall back to Bearer header
    let token = req.cookies && req.cookies[AUTH_COOKIE_NAME];

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith(BEARER_PREFIX)) {
        token = authHeader.substring(BEARER_PREFIX_LENGTH);
      }
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing or invalid authentication',
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      fullName: decoded.fullName,
    };

    // Sliding window refresh: issue a fresh token on every authenticated request
    const freshToken = jwt.sign(
      { userId: decoded.userId, username: decoded.username, fullName: decoded.fullName },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );
    setAuthCookie(res, freshToken);

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
  setAuthCookie,
  clearAuthCookie,
};
