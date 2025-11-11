/**
 * Shared Constants
 * Centralized configuration values used across backend services
 */

// Authentication
const JWT_EXPIRATION = '24h';
const BCRYPT_SALT_ROUNDS = 12;

// Order Validation
const ORDER_MAX_VALUE = 1000000;
const ORDER_MAX_QUANTITY = 10000;
const ORDER_MIN_PRICE = 0.01;
const ORDER_MAX_PRICE = 1000000;

// Product Name Validation
const PRODUCT_NAME_MIN_LENGTH = 1;
const PRODUCT_NAME_MAX_LENGTH = 255;
const PRODUCT_NAME_PATTERN = /^[a-zA-Z0-9\s\-'.]+$/;

// User Validation
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const FULLNAME_MIN_LENGTH = 1;
const FULLNAME_MAX_LENGTH = 255;
const FULLNAME_PATTERN = /^[a-zA-Z0-9\s\-'.]+$/;

// Password Requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

module.exports = {
  JWT_EXPIRATION,
  BCRYPT_SALT_ROUNDS,
  ORDER_MAX_VALUE,
  ORDER_MAX_QUANTITY,
  ORDER_MIN_PRICE,
  ORDER_MAX_PRICE,
  PRODUCT_NAME_MIN_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_PATTERN,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  FULLNAME_MIN_LENGTH,
  FULLNAME_MAX_LENGTH,
  FULLNAME_PATTERN,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
};
