const express = require('express');
const { log, logError } = require('../../shared/logger');

const router = express.Router();

/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     summary: Get all products
 *     description: Returns all available products sorted alphabetically by name
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const [products] = await req.db.execute(
      'SELECT id, name, cost, sku FROM products ORDER BY name ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    res.json({
      success: true,
      products,
      pagination: { limit, offset },
    });
  } catch (error) {
    logError('Error fetching products:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      message: 'An error occurred while fetching products. Please try again later.',
    });
  }
});

module.exports = router;
