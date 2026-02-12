import React, { createContext, useState, useContext, useEffect } from 'react';
import { info, error as logError } from '../utils/logger';
import {
  getToken, setToken as saveToken, removeToken,
  getUser as loadUser, setUser as saveUser, removeUser,
  clearAuth,
} from '../utils/storage';
import apiClient from '../services/api';

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

  // Load token from storage on mount with validation
  useEffect(() => {
    try {
      const storedToken = getToken();
      const storedUser = loadUser();

      if (storedToken && storedUser) {
        // Check if token is expired
        if (isTokenExpired(storedToken)) {
          info('Stored token is expired, clearing session');
          clearAuth();
        } else {
          // Token is valid, restore session
          setToken(storedToken);
          setUser(storedUser);
        }
      }
    } catch (err) {
      logError('Failed to restore session from storage:', err);
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  // Periodically check token expiry (every 60 seconds)
  useEffect(() => {
    if (!token) return;
    const intervalId = setInterval(() => {
      if (isTokenExpired(token)) {
        info('Token expired during session, logging out');
        setToken(null);
        setUser(null);
        clearAuth();
      }
    }, 60000);
    return () => clearInterval(intervalId);
  }, [token]);

  const login = (token, userData) => {
    setToken(token);
    setUser(userData);
    saveToken(token);
    saveUser(userData);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    clearAuth();
  };

  // Register centralized 401 handler so individual pages don't need to string-match errors
  useEffect(() => {
    apiClient.onAuthExpired(() => {
      info('Received 401 from API, logging out');
      logout();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
