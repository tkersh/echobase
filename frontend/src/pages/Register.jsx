import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Use same-origin for API calls (nginx proxies to backend)
// This prevents mixed content issues with HTTPS
const API_URL = import.meta.env.REACT_APP_API_URL || window.location.origin;

function Register() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);

  const { register } = useAuth();
  const navigate = useNavigate();

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
      errors.push('At least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('One uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('One lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('One number');
    }
    return errors;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Validate password in real-time
    if (name === 'password') {
      setPasswordErrors(validatePassword(value));
    }

    // Clear error on input change
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password requirements
    const errors = validatePassword(formData.password);
    if (errors.length > 0) {
      setError('Password does not meet requirements');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          fullName: formData.fullName,
          password: formData.password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      // Register and login the user
      register(data.token, { username: data.user.username, email: data.user.email, fullName: data.user.fullName });

      // Redirect to orders page
      navigate('/orders');
    } catch (err) {
      setError(err.message || 'An error occurred during registration');
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
        Create Account
      </h1>
      <p style={{
        fontSize: '18px',
        color: '#4a4a4a',
        marginBottom: '32px',
        lineHeight: '1.6'
      }}>
        Please fill out the form below to create your account.
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
            minLength={3}
            maxLength={50}
            pattern="^[a-zA-Z0-9_]+$"
            aria-describedby="username-requirements"
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
          <div
            id="username-requirements"
            style={{
              marginTop: '8px',
              fontSize: '16px',
              color: '#4a4a4a',
              lineHeight: '1.6'
            }}
          >
            3-50 characters, letters, numbers, and underscores only
          </div>
        </div>

        <div style={{ marginBottom: '28px' }}>
          <label
            htmlFor="email"
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
              lineHeight: '1.5'
            }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={formData.email}
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

        <div style={{ marginBottom: '28px' }}>
          <label
            htmlFor="fullName"
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
              lineHeight: '1.5'
            }}
          >
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            required
            minLength={1}
            maxLength={255}
            pattern="^[a-zA-Z\s\-'.]+$"
            aria-describedby="fullname-requirements"
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
          <div
            id="fullname-requirements"
            style={{
              marginTop: '8px',
              fontSize: '16px',
              color: '#4a4a4a',
              lineHeight: '1.6'
            }}
          >
            Your full name (letters, spaces, hyphens, apostrophes, and periods only)
          </div>
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
            aria-describedby="password-requirements"
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
          {formData.password && (
            <div
              id="password-requirements"
              style={{
                marginTop: '16px',
                padding: '20px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                border: '2px solid #d0d0d0'
              }}
              role="status"
              aria-live="polite"
            >
              <div style={{
                fontSize: '17px',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '16px',
                lineHeight: '1.4'
              }}>
                Password Requirements:
              </div>
              <ul style={{
                margin: '0',
                padding: '0',
                listStyle: 'none'
              }}>
                <li style={{
                  marginBottom: '12px',
                  fontSize: '17px',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#1a1a1a',
                  lineHeight: '1.6'
                }}>
                  <span
                    style={{
                      display: 'inline-block',
                      marginRight: '12px',
                      fontWeight: 'bold',
                      fontSize: '20px',
                      minWidth: '20px',
                      color: passwordErrors.includes('At least 8 characters') ? '#c41e3a' : '#28a745'
                    }}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes('At least 8 characters') ? '✗' : '✓'}
                  </span>
                  <span>
                    At least 8 characters
                    <span className="sr-only">
                      {passwordErrors.includes('At least 8 characters') ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
                <li style={{
                  marginBottom: '12px',
                  fontSize: '17px',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#1a1a1a',
                  lineHeight: '1.6'
                }}>
                  <span
                    style={{
                      display: 'inline-block',
                      marginRight: '12px',
                      fontWeight: 'bold',
                      fontSize: '20px',
                      minWidth: '20px',
                      color: passwordErrors.includes('One uppercase letter') ? '#c41e3a' : '#28a745'
                    }}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes('One uppercase letter') ? '✗' : '✓'}
                  </span>
                  <span>
                    One uppercase letter
                    <span className="sr-only">
                      {passwordErrors.includes('One uppercase letter') ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
                <li style={{
                  marginBottom: '12px',
                  fontSize: '17px',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#1a1a1a',
                  lineHeight: '1.6'
                }}>
                  <span
                    style={{
                      display: 'inline-block',
                      marginRight: '12px',
                      fontWeight: 'bold',
                      fontSize: '20px',
                      minWidth: '20px',
                      color: passwordErrors.includes('One lowercase letter') ? '#c41e3a' : '#28a745'
                    }}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes('One lowercase letter') ? '✗' : '✓'}
                  </span>
                  <span>
                    One lowercase letter
                    <span className="sr-only">
                      {passwordErrors.includes('One lowercase letter') ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
                <li style={{
                  marginBottom: '0',
                  fontSize: '17px',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#1a1a1a',
                  lineHeight: '1.6'
                }}>
                  <span
                    style={{
                      display: 'inline-block',
                      marginRight: '12px',
                      fontWeight: 'bold',
                      fontSize: '20px',
                      minWidth: '20px',
                      color: passwordErrors.includes('One number') ? '#c41e3a' : '#28a745'
                    }}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes('One number') ? '✗' : '✓'}
                  </span>
                  <span>
                    One number
                    <span className="sr-only">
                      {passwordErrors.includes('One number') ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div style={{ marginBottom: '28px' }}>
          <label
            htmlFor="confirmPassword"
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '18px',
              fontWeight: '600',
              color: '#1a1a1a',
              lineHeight: '1.5'
            }}
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
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
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      <div style={{ marginTop: '32px', borderTop: '1px solid #e0e0e0', paddingTop: '24px' }}>
        <p style={{ fontSize: '17px', color: '#1a1a1a', lineHeight: '1.6' }}>
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: '#0056b3',
              textDecoration: 'underline',
              fontWeight: '600'
            }}
          >
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
