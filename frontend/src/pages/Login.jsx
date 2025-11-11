import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/api';
import styles from '../styles/AuthForms.module.css';

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
      const { data } = await auth.login(formData);

      // Login the user
      login(data.token, data.user);

      // Redirect to orders page
      navigate('/orders');
    } catch (err) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Login</h1>
      <p className={styles.subtitle}>
        Welcome back! Please enter your credentials to continue.
      </p>

      <form onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="username" className={styles.label}>
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
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="password" className={styles.label}>
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
            className={styles.input}
          />
        </div>

        {error && (
          <div role="alert" aria-live="assertive" className={styles.errorAlert}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className={styles.button}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Don't have an account?{' '}
          <Link to="/register" className={styles.link}>
            Create one here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
