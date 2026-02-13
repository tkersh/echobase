/**
 * Centralized storage access layer.
 * All storage keys are defined here to prevent key drift across files.
 *
 * Auth tokens are now managed as HttpOnly cookies (not accessible from JS).
 * Only user metadata is stored client-side (in sessionStorage for XSS mitigation).
 */

export const STORAGE_KEYS = {
  USER: 'user',
  RECOMMENDED_PRODUCTS: 'recommendedProducts',
  LOG_LEVEL: 'LOG_LEVEL',
};

export function getUser() {
  const raw = sessionStorage.getItem(STORAGE_KEYS.USER);
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user) {
  sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

export function removeUser() {
  sessionStorage.removeItem(STORAGE_KEYS.USER);
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
  removeUser();
  removeRecommendedProducts();
  // Clean up any legacy keys from before cookie migration
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
