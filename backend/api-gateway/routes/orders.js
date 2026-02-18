const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const { orderValidation, submitOrder, getOrderHistory } = require('../controllers/orderController');
const { log } = require('../../shared/logger');

/**
 * @swagger
 * /api/v1/orders:
 *   post:
 *     summary: Submit a new order
 *     description: Submit an order to the processing queue (requires authentication)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Order submitted successfully
 *       400:
 *         description: Validation error or business rule violation
 *       401:
 *         description: Authentication required or invalid token
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticateJWT, orderValidation, submitOrder);

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     summary: Get user's order history
 *     description: Returns all orders for the authenticated user
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's orders retrieved successfully
 *       401:
 *         description: Authentication required or invalid token
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticateJWT, getOrderHistory);

module.exports = router;
