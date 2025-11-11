/**
 * API Configuration
 * Centralized API endpoint configuration
 */

// Use same-origin for API calls (nginx proxies to backend)
// This prevents mixed content issues with HTTPS
export const API_URL = import.meta.env.REACT_APP_API_URL || window.location.origin;

export default {
  API_URL,
};
