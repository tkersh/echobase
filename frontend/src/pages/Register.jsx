import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/api';
import { setRecommendedProducts } from '../utils/storage';
import { validation } from '../constants/theme';
import styles from '../styles/AuthForms.module.css';

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
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const { register, user } = useAuth();
  const navigate = useNavigate();

  // Navigate to orders page after successful registration
  useEffect(() => {
    if (registrationSuccess && user) {
      navigate('/orders');
    }
  }, [user, registrationSuccess, navigate]);

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < validation.password.minLength) {
      errors.push(`At least ${validation.password.minLength} characters`);
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
      const { data } = await auth.register({
        username: formData.username,
        email: formData.email,
        fullName: formData.fullName,
        password: formData.password
      });

      // Register and login the user (token is set as HttpOnly cookie by server)
      register(data.user);

      // Store recommended products if available
      if (data.recommendedProducts && data.recommendedProducts.length > 0) {
        setRecommendedProducts(data.recommendedProducts);
      }

      // Set flag to trigger navigation after user state updates
      setRegistrationSuccess(true);
    } catch (err) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Create Account</h1>
      <p className={styles.subtitle}>
        Please fill out the form below to create your account.
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
            minLength={validation.username.minLength}
            maxLength={validation.username.maxLength}
            pattern={validation.username.pattern}
            aria-describedby="username-requirements"
            aria-required="true"
            className={styles.input}
          />
          <div id="username-requirements" className={styles.helpText}>
            {validation.username.minLength}-{validation.username.maxLength} characters, letters, numbers, and underscores only
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="email" className={styles.label}>
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
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="fullName" className={styles.label}>
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            required
            minLength={validation.fullName.minLength}
            maxLength={validation.fullName.maxLength}
            pattern={validation.fullName.pattern}
            aria-describedby="fullname-requirements"
            aria-required="true"
            className={styles.input}
          />
          <div id="fullname-requirements" className={styles.helpText}>
            Your full name (letters, spaces, hyphens, apostrophes, and periods only)
          </div>
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
            aria-describedby="password-requirements"
            aria-required="true"
            className={styles.input}
          />
          {formData.password && (
            <div
              id="password-requirements"
              className={styles.passwordRequirements}
              role="status"
              aria-live="polite"
            >
              <div className={styles.requirementsTitle}>
                Password Requirements:
              </div>
              <ul className={styles.requirementsList}>
                <li className={styles.requirementItem}>
                  <span
                    className={`${styles.checkIcon} ${
                      passwordErrors.includes(`At least ${validation.password.minLength} characters`)
                        ? styles.invalid
                        : styles.valid
                    }`}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes(`At least ${validation.password.minLength} characters`) ? '✗' : '✓'}
                  </span>
                  <span>
                    At least {validation.password.minLength} characters
                    <span className={styles.srOnly}>
                      {passwordErrors.includes(`At least ${validation.password.minLength} characters`) ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
                <li className={styles.requirementItem}>
                  <span
                    className={`${styles.checkIcon} ${
                      passwordErrors.includes('One uppercase letter') ? styles.invalid : styles.valid
                    }`}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes('One uppercase letter') ? '✗' : '✓'}
                  </span>
                  <span>
                    One uppercase letter
                    <span className={styles.srOnly}>
                      {passwordErrors.includes('One uppercase letter') ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
                <li className={styles.requirementItem}>
                  <span
                    className={`${styles.checkIcon} ${
                      passwordErrors.includes('One lowercase letter') ? styles.invalid : styles.valid
                    }`}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes('One lowercase letter') ? '✗' : '✓'}
                  </span>
                  <span>
                    One lowercase letter
                    <span className={styles.srOnly}>
                      {passwordErrors.includes('One lowercase letter') ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
                <li className={styles.requirementItem}>
                  <span
                    className={`${styles.checkIcon} ${
                      passwordErrors.includes('One number') ? styles.invalid : styles.valid
                    }`}
                    aria-hidden="true"
                  >
                    {passwordErrors.includes('One number') ? '✗' : '✓'}
                  </span>
                  <span>
                    One number
                    <span className={styles.srOnly}>
                      {passwordErrors.includes('One number') ? ' - Not met' : ' - Met'}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="confirmPassword" className={styles.label}>
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
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Already have an account?{' '}
          <Link to="/login" className={styles.link}>
            Login here
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
