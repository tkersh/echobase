import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Use same-origin for API calls (nginx proxies to backend)
// This prevents mixed content issues with HTTPS
const API_URL = import.meta.env.REACT_APP_API_URL || window.location.origin;

function Login() {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error on input change
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Login the user
      login(data.token, { username: data.username });

      // Redirect to orders page
      navigate('/orders');
    } catch (err) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      maxWidth: '600px',
      margin: '40px auto',
      padding: '40px',
      background: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
    }}>
      <h1 style={{
        fontSize: '32px',
        marginBottom: '12px',
        color: '#1a1a1a',
        fontWeight: '700',
        lineHeight: '1.2',
        letterSpacing: '-0.02em'
      }}>
        Login
      </h1>
      <p style={{
        fontSize: '18px',
        color: '#4a4a4a',
        marginBottom: '32px',
        lineHeight: '1.6'
      }}>
        Welcome back! Please enter your credentials to continue.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '28px' }}>
          <label
            htmlFor="username"
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
              lineHeight: '1.5'
            }}
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
            autoFocus
            aria-required="true"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '18px',
              boxSizing: 'border-box',
              border: '2px solid #d0d0d0',
              borderRadius: '4px',
              lineHeight: '1.5',
              background: '#ffffff',
              color: '#1a1a1a'
            }}
          />
        </div>

        <div style={{ marginBottom: '28px' }}>
          <label
            htmlFor="password"
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
              lineHeight: '1.5'
            }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            aria-required="true"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '18px',
              boxSizing: 'border-box',
              border: '2px solid #d0d0d0',
              borderRadius: '4px',
              lineHeight: '1.5',
              background: '#ffffff',
              color: '#1a1a1a'
            }}
          />
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: '18px',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              border: '2px solid #f5c6cb',
              borderRadius: '4px',
              marginBottom: '24px',
              fontSize: '17px',
              fontWeight: '500',
              lineHeight: '1.6'
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: loading ? '#6c757d' : '#0056b3',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '20px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
            lineHeight: '1.5',
            letterSpacing: '0.01em'
          }}
          onMouseEnter={(e) => {
            if (!loading) e.target.style.backgroundColor = '#004494';
          }}
          onMouseLeave={(e) => {
            if (!loading) e.target.style.backgroundColor = '#0056b3';
          }}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <div style={{ marginTop: '32px', borderTop: '1px solid #e0e0e0', paddingTop: '24px' }}>
        <p style={{ fontSize: '17px', color: '#1a1a1a', lineHeight: '1.6' }}>
          Don't have an account?{' '}
          <Link
            to="/register"
            style={{
              color: '#0056b3',
              textDecoration: 'underline',
              fontWeight: '600'
            }}
          >
            Create one here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
