/**
 * Centralized API Endpoint Constants
 * Single source of truth for all API endpoint paths
 *
 * Usage (ES Modules):
 *   import { API_ENDPOINTS } from '../config/endpoints';
 *   await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
 */

export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/api/v1/auth/register',
    LOGIN: '/api/v1/auth/login',
  },
  ORDERS: '/api/v1/orders',
  PRODUCTS: '/api/v1/products',
};
