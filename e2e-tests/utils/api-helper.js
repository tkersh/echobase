import { request } from '@playwright/test';

/**
 * API helper for making authenticated and unauthenticated requests
 */
class ApiHelper {
  constructor(baseURL = process.env.API_BASE_URL || 'https://localhost:3001') {
    this.baseURL = baseURL;
    this.token = null;
  }

  /**
   * Create a new API context
   */
  async createContext() {
    return await request.newContext({
      baseURL: this.baseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: this.token ? {
        'Authorization': `Bearer ${this.token}`
      } : {}
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
    const response = await context.post('/api/v1/auth/register', {
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
    const response = await context.post('/api/v1/auth/login', {
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
    const response = await context.post('/api/v1/orders', {
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
   * Get orders info (unauthenticated endpoint)
   */
  async getOrdersInfo() {
    const context = await this.createContext();
    const response = await context.get('/api/v1/orders');

    const responseData = await response.json();

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
    const response = await context.get('/health');

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
