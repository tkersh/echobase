/**
 * API Client
 * Centralized API communication layer with error handling
 * Uses HttpOnly cookies for authentication (credentials: 'include')
 */

import { API_URL } from '../config/api';
import { API_ENDPOINTS } from '../config/endpoints';

const DEFAULT_TIMEOUT_MS = 10000;

class APIClient {
  constructor(baseURL, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.baseURL = baseURL;
    this.timeoutMs = timeoutMs;
    this._onAuthExpired = null;
  }

  /**
   * Register a callback for 401 responses (centralized auth expiry handling).
   * Call this once from AuthContext to avoid per-component string matching.
   */
  onAuthExpired(callback) {
    this._onAuthExpired = callback;
  }

  /**
   * Make a fetch request with standardized error handling and timeout.
   * All requests include credentials so HttpOnly cookies are sent automatically.
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 && this._onAuthExpired) {
          this._onAuthExpired();
        }
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

  async get(endpoint, options = {}) {
    return this.request(endpoint, { method: 'GET', ...options });
  }

  async post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options,
    });
  }

  async put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...options,
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { method: 'DELETE', ...options });
  }
}

// Create singleton instance
const apiClient = new APIClient(API_URL);

// Auth API methods (v1)
export const auth = {
  login: (credentials) =>
    apiClient.post(API_ENDPOINTS.AUTH.LOGIN, credentials),

  register: (userData) =>
    apiClient.post(API_ENDPOINTS.AUTH.REGISTER, userData),

  logout: () =>
    apiClient.post(API_ENDPOINTS.AUTH.LOGOUT),
};

// Products API methods (v1) — no token param, cookies sent automatically
export const products = {
  getAll: () => apiClient.get(API_ENDPOINTS.PRODUCTS),
};

// Orders API methods (v1) — no token param, cookies sent automatically
export const orders = {
  create: (orderData) => apiClient.post(API_ENDPOINTS.ORDERS, orderData),
  getAll: () => apiClient.get(API_ENDPOINTS.ORDERS),
};

export default apiClient;
