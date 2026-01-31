/**
 * Test data generators and fixtures
 */

/**
 * Generate a unique username with timestamp
 */
export function generateUsername(prefix = 'testuser') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a unique email
 */
export function generateEmail(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}_${timestamp}_${random}@example.com`;
}

/**
 * Generate a valid password (meets requirements: 8+ chars, uppercase, lowercase, number)
 */
export function generateValidPassword() {
  const timestamp = Date.now();
  return `TestPass${timestamp}123`;
}

/**
 * Generate invalid passwords for testing validation
 */
export const invalidPasswords = {
  tooShort: 'Pass1',
  noUppercase: 'testpass123',
  noLowercase: 'TESTPASS123',
  noNumber: 'TestPassword',
  empty: '',
  onlySpaces: '        '
};

/**
 * Create a complete valid user registration object
 */
export function createValidUser(customFields = {}) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const randomAlpha = convertLargeIntToAlpha(random) + convertLargeIntToAlpha(timestamp % 10000);

  return {
    username: generateUsername(),
    email: generateEmail(),
    fullName: `Test User ${randomAlpha}`,
    password: generateValidPassword(),
    ...customFields
  };
}

/**
 * Create valid login credentials
 */
export function createLoginCredentials(username, password) {
  return {
    username,
    password
  };
}

/**
 * Create a valid order object
 */
export function createValidOrder(customFields = {}) {
  // Product IDs 1-11 match the seeded products table
  const randomProductId = Math.floor(Math.random() * 11) + 1;
  const randomQuantity = Math.floor(Math.random() * 10) + 1;

  return {
    productId: randomProductId,
    quantity: randomQuantity,
    ...customFields
  };
}

/**
 * Invalid order data for validation testing
 */
export const invalidOrders = {
  missingProductId: {
    quantity: 1
  },
  invalidProductId: {
    productId: 99999,
    quantity: 1
  },
  negativeProductId: {
    productId: -1,
    quantity: 1
  },
  zeroProductId: {
    productId: 0,
    quantity: 1
  },
  stringProductId: {
    productId: 'invalid',
    quantity: 1
  },
  missingQuantity: {
    productId: 1
  },
  negativeQuantity: {
    productId: 1,
    quantity: -1
  },
  zeroQuantity: {
    productId: 1,
    quantity: 0
  },
  invalidQuantityType: {
    productId: 1,
    quantity: 'invalid'
  }
};

/**
 * SQL Injection test payloads
 */
export const sqlInjectionPayloads = [
  "'; DROP TABLE users; --",
  "' OR '1'='1",
  "admin'--",
  "' OR 1=1--",
  "1' UNION SELECT NULL,NULL,NULL--"
];

/**
 * XSS test payloads
 */
export const xssPayloads = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror=alert("XSS")>',
  'javascript:alert("XSS")',
  '<svg onload=alert("XSS")>',
  '<iframe src="javascript:alert(\'XSS\')"></iframe>'
];

/**
 * Wait for a condition with timeout
 */
export async function waitFor(conditionFn, timeoutMs = 10000, checkIntervalMs = 500) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await conditionFn();
    if (result) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Converts an integer (0-9) to a single uppercase letter (A-I).
 * * @param {number|string} inputInt - The integer to convert (must be between 0 and 9).
 * @returns {string} The corresponding letter (A-I) or an error message/null.
 */
const convertIntToAlpha = (inputInt) => {
  // Define the mapping (0 to 9)
  const ALPHA_MAP = 'ABCDEFGHIJ'; // 0=A, 1=B, 2=C, ..., 9=J (We only use up to I for 0-9)

  // Ensure the input is treated as a number
  const digit = Number(inputInt);

  // Validation
  if (isNaN(digit) || digit < 0 || digit > 9 || !Number.isInteger(digit)) {
    console.error(`Input must be an integer between 0 and 9. Received: ${inputInt}`);
    return null;
  }

  // The digit (0-9) is used directly as the index for the ALPHA_MAP string.
  return ALPHA_MAP.charAt(digit);
};

/**
 * Converts a non-negative integer to an alphabetic string (0=A, 1=B, ..., 9=I).
 * It uses padStart to ensure the resulting string has a minimum length.
 * * @param {number} largeInt - The integer to convert.
 * @param {number} [minLength=0] - The minimum length of the digit string (padded with '0').
 * @returns {string} The resulting alphabetic string.
 */
const convertLargeIntToAlpha = (largeInt, minLength = 0) => {
  if (typeof largeInt !== 'number' || !Number.isInteger(largeInt) || largeInt < 0) {
    console.error("Input must be a non-negative integer.");
    return '';
  }

  // 1. Convert the integer to its string representation.
  let intString = String(largeInt);

  // 2. Apply padStart based on the optional minLength parameter.
  //    This ensures numbers like 12 become "0012" if minLength is 4.
  if (minLength > 0) {
    intString = intString.padStart(minLength, '0');
  }

  // 3. Map each digit to its corresponding letter.
  const alphaArray = intString.split('').map(digitChar => {
    return convertIntToAlpha(digitChar);
  });

  // 4. Join the resulting letters back into a single string.
  return alphaArray.join('');
};
