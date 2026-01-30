import React, { createContext, useState, useContext, useEffect } from 'react';
import { info, error as logError } from '../utils/logger';

const AuthContext = createContext(null);

/**
 * Decode JWT token without verification (client-side only)
 * For expiration checking only - server still validates signature
 */
function decodeJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    logError('Failed to decode JWT:', err);
    return null;
  }
}

/**
 * Check if JWT token is expired
 */
function isTokenExpired(token) {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) {
    return true;
  }
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load token from localStorage on mount with validation
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        // Check if token is expired
        if (isTokenExpired(storedToken)) {
          info('Stored token is expired, clearing session');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        } else {
          // Token is valid, restore session
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      }
    } catch (err) {
      logError('Failed to restore session from localStorage:', err);
      // Clear potentially corrupted data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = (token, userData) => {
    setToken(token);
    setUser(userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('recommendedProducts');
  };

  const register = (token, userData) => {
    // Registration automatically logs the user in
    login(token, userData);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, register, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
