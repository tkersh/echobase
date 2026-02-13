/**
 * Centralized API Endpoint Constants
 * Single source of truth for all API endpoint paths
 *
 * Usage (ES Modules):
 *   import { API_ENDPOINTS } from './api-endpoints.js';
 *   await context.post(API_ENDPOINTS.AUTH.LOGIN, { data });
 */

export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/api/v1/auth/register',
    LOGIN: '/api/v1/auth/login',
    LOGOUT: '/api/v1/auth/logout',
  },
  ORDERS: '/api/v1/orders',
  PRODUCTS: '/api/v1/products',
  HEALTH: '/health',
};
