const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the application and its dependencies
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       503:
 *         description: System is degraded (one or more dependencies unhealthy)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 */
router.get('/', healthController.getHealth);

module.exports = router;
