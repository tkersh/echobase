const { body, validationResult } = require('express-validator');
const { log, logError, debug } = require('../../shared/logger');
const { ORDER_MAX_QUANTITY } = require('../../shared/constants');
const { trace: otelTrace, SpanStatusCode } = (() => {
  try { return require('@opentelemetry/api'); }
  catch (_) { return {}; }
})();

// Input validation and sanitization middleware for orders
const orderValidation = [
  body('productId')
    .isInt({ min: 1 })
    .withMessage('Product ID must be a positive integer')
    .toInt(),

  body('quantity')
    .isInt({ min: 1, max: ORDER_MAX_QUANTITY })
    .withMessage(`Quantity must be an integer between 1 and ${ORDER_MAX_QUANTITY.toLocaleString()}`)
    .toInt(),
];

/**
 * Handles the submission of a new order.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
async function submitOrder(req, res, next) {
  try {
    // Debug logging for order submission (only when LOG_LEVEL=DEBUG)
    debug('POST /api/v1/orders - Content-Type:', req.get('content-type'));
    debug('POST /api/v1/orders - Request body:', JSON.stringify(req.body));
    debug('POST /api/v1/orders - Body keys:', Object.keys(req.body));
    debug('POST /api/v1/orders - Body values:', Object.values(req.body));
    debug('User from JWT:', req.user);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      debug('Validation errors:', JSON.stringify(errors.array()));
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { productId, quantity } = req.body;

    // Validate userId from JWT token
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User ID not found in token',
      });
    }

    // Look up product by ID (cached) - This logic will be moved to ProductService
    // For now, it remains here until ProductService is fully integrated
    const product = await req.services.productService.getProduct(productId);

    if (!product) {
      return res.status(400).json({
        error: 'Invalid product',
        message: `Product with ID ${productId} not found`,
      });
    }
    const totalPrice = parseFloat((product.cost * quantity).toFixed(2));

    // Use order service to handle business logic
    const result = await req.services.orderService.submitOrder(
      req.user.userId,
      { productId: product.id, productName: product.name, sku: product.sku, quantity, totalPrice },
      { fullName: req.user.fullName, username: req.user.username },
      req.correlationId
    );

    // Check if business validation failed
    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        message: result.message,
      });
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Order submitted successfully',
      messageId: result.messageId,
      order: result.order,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Handles retrieving the user's order history.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
async function getOrderHistory(req, res, next) {
  try {
    // Validate userId from JWT token
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User ID not found in token',
      });
    }

    const [orders] = await req.db.execute(
      `SELECT id, product_name as productName, sku, quantity,
              total_price as totalPrice, order_status as status, created_at as createdAt
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json({
      success: true,
      orders,
      count: orders.length,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  orderValidation,
  submitOrder,
  getOrderHistory,
};
