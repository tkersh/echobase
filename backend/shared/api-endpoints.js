/**
 * Centralized API Endpoint Constants
 * Single source of truth for all API endpoint paths
 *
 * Usage (CommonJS):
 *   const { API_ENDPOINTS } = require('./api-endpoints');
 *   app.post(API_ENDPOINTS.AUTH.LOGIN, handler);
 */

const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/api/v1/auth/register',
    LOGIN: '/api/v1/auth/login',
  },
  ORDERS: '/api/v1/orders',
  PRODUCTS: '/api/v1/products',
  HEALTH: '/health',
};

module.exports = { API_ENDPOINTS };
