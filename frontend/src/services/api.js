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
class APIClient {
  /**
   * Create an API client instance
   * @param {string} baseURL - Base URL for all API requests
   */
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  /**
   * Make a fetch request with standardized error handling
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {object} options - Fetch options
   * @returns {Promise<object>} Response data
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
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
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error occurred');
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

  /**
   * Set authentication token for subsequent requests
   * Note: Currently not used - tokens are passed manually per request
   * Consider using this method for automatic token management
   * @param {string} token - JWT token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Get headers with authentication if token is set
   */
  getAuthHeaders() {
    if (this.authToken) {
      return {
        'Authorization': `Bearer ${this.authToken}`,
      };
    }
    return {};
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
