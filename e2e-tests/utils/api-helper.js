import { request } from '@playwright/test';
import { validateRequiredEnv } from './env-validator.js';
import { API_ENDPOINTS } from './api-endpoints.js';

/**
 * API helper for making authenticated and unauthenticated requests.
 * Uses a persistent request context so Set-Cookie headers from login/register
 * are automatically sent on subsequent requests (cookie jar behaviour).
 */
class ApiHelper {
  constructor() {
    validateRequiredEnv(['WEB_BASE_URL', 'API_BASE_URL'], 'API helper');

    this.apiBaseURL = process.env.API_BASE_URL;
    this.frontendOrigin = process.env.WEB_BASE_URL;

    this._context = null;
    this._cookies = []; // parsed cookies for Playwright browser injection
  }

  /**
   * Lazily create (or return existing) persistent API request context.
   * A single context is reused so that cookies set by the server persist
   * across calls within the same test.
   */
  async getContext() {
    if (!this._context) {
      this._context = await request.newContext({
        baseURL: this.apiBaseURL,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          'Origin': this.frontendOrigin,
        },
      });
    }
    return this._context;
  }

  /**
   * Extract Set-Cookie headers and store parsed cookies for browser injection.
   */
  _extractCookies(response) {
    const setCookieHeaders = response.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie');
    for (const header of setCookieHeaders) {
      const parts = header.value.split(';')[0].split('=');
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      // Update or add cookie
      const existing = this._cookies.findIndex(c => c.name === name);
      const cookie = {
        name,
        value,
        domain: new URL(this.frontendOrigin).hostname,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      };
      if (existing >= 0) {
        this._cookies[existing] = cookie;
      } else {
        this._cookies.push(cookie);
      }
    }
  }

  /**
   * Get parsed cookies for injecting into a Playwright browser context.
   * Usage: await context.addCookies(apiHelper.getCookies());
   */
  getCookies() {
    return [...this._cookies];
  }

  /**
   * Register a new user
   */
  async register(userData) {
    const context = await this.getContext();
    const response = await context.post(API_ENDPOINTS.AUTH.REGISTER, {
      data: userData,
    });

    const responseData = await response.json();
    this._extractCookies(response);

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Login a user
   */
  async login(credentials) {
    const context = await this.getContext();
    const response = await context.post(API_ENDPOINTS.AUTH.LOGIN, {
      data: credentials,
    });

    const responseData = await response.json();
    this._extractCookies(response);

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Logout (clear server-side cookie)
   */
  async logout() {
    const context = await this.getContext();
    const response = await context.post(API_ENDPOINTS.AUTH.LOGOUT);

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
    this._extractCookies(response);

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Submit an order (requires authentication via cookie)
   */
  async submitOrder(orderData) {
    const context = await this.getContext();
    const response = await context.post(API_ENDPOINTS.ORDERS, {
      data: orderData,
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }
    this._extractCookies(response);

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Get all products (requires authentication via cookie)
   */
  async getProducts() {
    const context = await this.getContext();
    const response = await context.get(API_ENDPOINTS.PRODUCTS);

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }
    this._extractCookies(response);

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Get user's orders (requires authentication via cookie)
   */
  async getOrders() {
    const context = await this.getContext();
    const response = await context.get(API_ENDPOINTS.ORDERS);

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }
    this._extractCookies(response);

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Check API health
   */
  async healthCheck() {
    const context = await this.getContext();
    const response = await context.get(API_ENDPOINTS.HEALTH);

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Make a custom request
   */
  async request(method, path, options = {}) {
    const context = await this.getContext();
    const response = await context[method.toLowerCase()](path, options);

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      try {
        responseData = await response.text();
      } catch {
        responseData = null;
      }
    }
    this._extractCookies(response);

    return {
      status: response.status(),
      ok: response.ok(),
      data: responseData,
      headers: response.headers(),
    };
  }

  /**
   * Manually set a cookie value (for testing invalid tokens, etc.).
   * Forces a new context on next request so the cookie header is included.
   */
  async setToken(tokenValue) {
    await this.dispose();
    this._context = await request.newContext({
      baseURL: this.apiBaseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Origin': this.frontendOrigin,
        'Cookie': `echobase_token=${tokenValue}`,
      },
    });
    this._cookies = [{
      name: 'echobase_token',
      value: tokenValue,
      domain: new URL(this.frontendOrigin).hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
    }];
  }

  /**
   * Clear auth state — next request will have no token.
   */
  async clearToken() {
    await this.dispose();
    // Next call to getContext() will create a fresh, unauthenticated context
  }

  /**
   * Dispose the persistent request context. Call in afterEach/afterAll.
   */
  async dispose() {
    if (this._context) {
      await this._context.dispose();
      this._context = null;
    }
    this._cookies = [];
  }
}

export default ApiHelper;
