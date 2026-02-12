/**
 * Centralized localStorage access layer.
 * All storage keys are defined here to prevent key drift across files.
 */

export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  RECOMMENDED_PRODUCTS: 'recommendedProducts',
  LOG_LEVEL: 'LOG_LEVEL',
};

// Token stored in sessionStorage (not localStorage) to limit XSS exposure window.
// sessionStorage clears when the browser tab closes, reducing token persistence.
// NOTE: For full XSS-proof token storage, migrate to HttpOnly cookies (see audit-fix-plan.md).
export function getToken() {
  return sessionStorage.getItem(STORAGE_KEYS.TOKEN);
}

export function setToken(token) {
  sessionStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

export function removeToken() {
  sessionStorage.removeItem(STORAGE_KEYS.TOKEN);
}

export function getUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.USER);
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user) {
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

export function removeUser() {
  localStorage.removeItem(STORAGE_KEYS.USER);
}

export function getRecommendedProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECOMMENDED_PRODUCTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setRecommendedProducts(products) {
  localStorage.setItem(STORAGE_KEYS.RECOMMENDED_PRODUCTS, JSON.stringify(products));
}

export function removeRecommendedProducts() {
  localStorage.removeItem(STORAGE_KEYS.RECOMMENDED_PRODUCTS);
}

export function getLogLevel() {
  return localStorage.getItem(STORAGE_KEYS.LOG_LEVEL);
}

export function setLogLevel(level) {
  localStorage.setItem(STORAGE_KEYS.LOG_LEVEL, level);
}

/** Clear all auth-related keys (used on logout). */
export function clearAuth() {
  removeToken();
  removeUser();
  removeRecommendedProducts();
  // Clean up any legacy localStorage token from before sessionStorage migration
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
}
