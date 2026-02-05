import { request } from '@playwright/test';
import { validateRequiredEnv } from './env-validator.js';
import { API_ENDPOINTS } from './api-endpoints.js';

/**
 * API helper for making authenticated and unauthenticated requests
 * Connects to the API Gateway (API_BASE_URL), not the frontend
 */
class ApiHelper {
  constructor() {
    // Validate required environment variables
    validateRequiredEnv(['WEB_BASE_URL', 'API_BASE_URL'], 'API helper');

    this.apiBaseURL = process.env.API_BASE_URL;
    this.frontendOrigin = process.env.WEB_BASE_URL;

    this.token = null;
  }

  /**
   * Create a new API context
   */
  async createContext() {
    const headers = {
      'Origin': this.frontendOrigin
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return await request.newContext({
      baseURL: this.apiBaseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: headers
    });
  }

  /**
   * Set the JWT token for authenticated requests
   */
  setToken(token) {
    this.token = token;
  }

  /**
   * Clear the JWT token
   */
  clearToken() {
    this.token = null;
  }

  /**
   * Register a new user
   */
  async register(userData) {
    const context = await this.createContext();
    const response = await context.post(API_ENDPOINTS.AUTH.REGISTER, {
      data: userData
    });

    const responseData = await response.json();

    // Store token if registration successful
    if (response.ok() && responseData.token) {
      this.token = responseData.token;
    }

    await context.dispose();

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers()
    };
  }

  /**
   * Login a user
   */
  async login(credentials) {
    const context = await this.createContext();
    const response = await context.post(API_ENDPOINTS.AUTH.LOGIN, {
      data: credentials
    });

    const responseData = await response.json();

    // Store token if login successful
    if (response.ok() && responseData.token) {
      this.token = responseData.token;
    }

    await context.dispose();

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers()
    };
  }

  /**
   * Submit an order (requires authentication)
   */
  async submitOrder(orderData) {
    const context = await this.createContext();
    const response = await context.post(API_ENDPOINTS.ORDERS, {
      data: orderData,
      headers: this.token ? {
        'Authorization': `Bearer ${this.token}`
      } : {}
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = await response.text();
    }

    await context.dispose();

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers()
    };
  }

  /**
   * Get all products (requires authentication)
   */
  async getProducts() {
    const context = await this.createContext();
    const response = await context.get(API_ENDPOINTS.PRODUCTS, {
      headers: this.token ? {
        'Authorization': `Bearer ${this.token}`
      } : {}
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = await response.text();
    }

    await context.dispose();

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers()
    };
  }

  /**
   * Get user's orders (requires authentication)
   */
  async getOrders() {
    const context = await this.createContext();
    const response = await context.get(API_ENDPOINTS.ORDERS, {
      headers: this.token ? {
        'Authorization': `Bearer ${this.token}`
      } : {}
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = await response.text();
    }

    await context.dispose();

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers()
    };
  }

  /**
   * Check API health
   */
  async healthCheck() {
    const context = await this.createContext();
    const response = await context.get(API_ENDPOINTS.HEALTH);

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      responseData = await response.text();
    }

    await context.dispose();

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers()
    };
  }

  /**
   * Make a custom request
   */
  async request(method, path, options = {}) {
    const context = await this.createContext();
    const response = await context[method.toLowerCase()](path, {
      ...options,
      headers: {
        ...options.headers,
        ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
      }
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      try {
        responseData = await response.text();
      } catch (e2) {
        responseData = null;
      }
    }

    await context.dispose();

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers()
    };
  }
}

export default ApiHelper;
