import React, { createContext, useState, useContext, useEffect } from 'react';
import { info } from '../utils/logger';
import {
  getUser as loadUser, setUser as saveUser,
  clearAuth,
} from '../utils/storage';
import { auth } from '../services/api';
import apiClient from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load user from storage on mount
  useEffect(() => {
    try {
      const storedUser = loadUser();
      if (storedUser) {
        setUser(storedUser);
      }
    } catch {
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, []);

  const login = (userData) => {
    setUser(userData);
    saveUser(userData);
  };

  const logout = async () => {
    // Clear local state synchronously first so callers that don't await
    // (e.g. handleLogout + navigate) still see an immediate cleanup.
    setUser(null);
    clearAuth();
    try {
      await auth.logout();
    } catch {
      // Best-effort server cookie clear
    }
  };

  // Register centralized 401 handler so individual pages don't need to string-match errors
  useEffect(() => {
    apiClient.onAuthExpired(() => {
      info('Received 401 from API, logging out');
      setUser(null);
      clearAuth();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const register = (userData) => {
    // Registration automatically logs the user in (cookie set by server)
    login(userData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, register, loading }}>
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
