# Frontend Testing

This directory contains frontend tests for the Echobase order system.

## Test Setup

To run tests, you'll need to install testing dependencies:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

## Configuration

Create a `vitest.config.js` file in the frontend directory:

```javascript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
  },
});
```

Create a test setup file at `src/test/setup.js`:

```javascript
import '@testing-library/jest-dom';
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Test Files

- `src/components/__tests__/LoadingSpinner.test.jsx` - Tests for LoadingSpinner component
- `src/components/__tests__/ErrorBoundary.test.jsx` - Tests for ErrorBoundary component

## Writing New Tests

Place test files next to the components they test, using the naming convention:
- Component: `ComponentName.jsx`
- Test: `ComponentName.test.jsx`

Or use the `__tests__` directory within each module.
