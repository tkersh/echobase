/**
 * API Client
 * Centralized API communication layer with error handling
 */

import { API_URL } from '../config/api';

class APIClient {
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
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
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
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * POST request
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
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options,
    });
  }

  /**
   * Set authentication token for subsequent requests
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

// Auth API methods
export const auth = {
  login: (credentials) =>
    apiClient.post('/api/auth/login', credentials),

  register: (userData) =>
    apiClient.post('/api/auth/register', userData),
};

// Orders API methods
export const orders = {
  create: (orderData, token) =>
    apiClient.post('/api/orders', orderData, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }),

  list: (token) =>
    apiClient.get('/api/orders', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }),
};

export default apiClient;
