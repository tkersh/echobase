/**
 * Theme Constants
 * Centralized design tokens for colors, spacing, and typography
 */

// Color Palette
export const colors = {
  // Primary colors
  primary: '#0056b3',
  primaryHover: '#004494',
  primaryLight: '#e7f1ff',

  // Danger/Error colors
  danger: '#dc3545',
  dangerLight: '#f8d7da',
  dangerBorder: '#f5c6cb',
  dangerText: '#721c24',

  // Error (alternative naming)
  errorRed: '#c41e3a',

  // Success colors
  success: '#28a745',
  successLight: '#d4edda',

  // Text colors
  textPrimary: '#1a1a1a',
  textSecondary: '#4a4a4a',
  textMuted: '#666',

  // Background colors
  white: '#ffffff',
  backgroundLight: '#f9f9f9',

  // Border colors
  borderLight: '#e0e0e0',
  border: '#d0d0d0',

  // Disabled/Loading
  disabled: '#6c757d',
};

// Spacing Scale (in pixels)
export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

// Typography
export const typography = {
  sizes: {
    small: '14px',
    base: '16px',
    medium: '17px',
    large: '18px',
    xlarge: '20px',
    heading: '32px',
  },
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeights: {
    tight: '1.2',
    normal: '1.4',
    relaxed: '1.5',
    loose: '1.6',
  },
};

// Layout
export const layout = {
  borderRadius: {
    small: '4px',
    medium: '8px',
  },
  maxWidth: {
    form: '600px',
  },
  shadows: {
    card: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
};

// Validation
export const validation = {
  username: {
    minLength: 3,
    maxLength: 50,
    pattern: '^[a-zA-Z0-9_]+$',
  },
  fullName: {
    minLength: 1,
    maxLength: 255,
    pattern: '^[a-zA-Z\\s\\-\'.]+$',
  },
  password: {
    minLength: 8,
  },
};

export default {
  colors,
  spacing,
  typography,
  layout,
  validation,
};
