/**
 * API Client
 * Centralized API communication layer with error handling
 *
 * @example
 * // Using auth API
 * const { data } = await auth.login({ email, password });
 * const token = data.token;
 *
 * // Using orders API with token
 * await orders.create(orderData, token);
 */

import { API_URL } from '../config/api';

/**
 * APIClient class for making HTTP requests
 * Provides standardized error handling and JSON parsing
 */
const DEFAULT_TIMEOUT_MS = 30000;

class APIClient {
  /**
   * Create an API client instance
   * @param {string} baseURL - Base URL for all API requests
   * @param {number} timeoutMs - Default request timeout in milliseconds
   */
  constructor(baseURL, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.baseURL = baseURL;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Make a fetch request with standardized error handling and timeout
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {object} options - Fetch options
   * @returns {Promise<object>} Response data
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || `Request failed with status ${response.status}`);
      }

      return { data, status: response.status };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error occurred');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * GET request
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options (headers, etc.)
   * @returns {Promise<{data: object, status: number}>} Response data and status
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {object} body - Request body (will be JSON stringified)
   * @param {object} options - Fetch options (headers, etc.)
   * @returns {Promise<{data: object, status: number}>} Response data and status
   */
  async post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options,
    });
  }

  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {object} body - Request body (will be JSON stringified)
   * @param {object} options - Fetch options (headers, etc.)
   * @returns {Promise<{data: object, status: number}>} Response data and status
   */
  async put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...options,
    });
  }

  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options (headers, etc.)
   * @returns {Promise<{data: object, status: number}>} Response data and status
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options,
    });
  }

}

// Create singleton instance
const apiClient = new APIClient(API_URL);

// Auth API methods (v1)
export const auth = {
  login: (credentials) =>
    apiClient.post('/api/v1/auth/login', credentials),

  register: (userData) =>
    apiClient.post('/api/v1/auth/register', userData),
};

// Products API methods (v1)
export const products = {
  getAll: (token) =>
    apiClient.get('/api/v1/products', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }),
};

// Orders API methods (v1)
export const orders = {
  create: (orderData, token) =>
    apiClient.post('/api/v1/orders', orderData, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }),
};

export default apiClient;
