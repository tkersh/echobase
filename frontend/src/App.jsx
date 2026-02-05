import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Register from './pages/Register';
import OrderForm from './pages/OrderForm';
import OrdersPage from './pages/OrdersPage';
import './App.css';

// Landing page component that redirects based on auth status
function Landing() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  // Redirect to orders if authenticated, otherwise to login
  return <Navigate to={user ? '/orders' : '/login'} replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
          {/* Landing page */}
          <Route path="/" element={<Landing />} />

          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrderForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-orders"
            element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
