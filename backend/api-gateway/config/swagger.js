/**
 * Swagger/OpenAPI Configuration
 * Provides interactive API documentation
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Echobase Order System API',
      version: '1.0.0',
      description: 'Multi-tier order processing system with React frontend, SQS queue, and MariaDB backend',
      contact: {
        name: 'API Support',
        email: 'support@echobase.local',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'https://localhost:3001',
        description: 'Development server (HTTPS)',
      },
      {
        url: 'http://localhost:3001',
        description: 'Development server (HTTP fallback)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/v1/auth/login',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'User ID',
              example: 1,
            },
            username: {
              type: 'string',
              description: 'Username (3-50 characters, alphanumeric and underscores)',
              example: 'john_doe',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'john@example.com',
            },
            fullName: {
              type: 'string',
              description: 'Full name (1-255 characters)',
              example: 'John Doe',
            },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Product ID',
              example: 1,
            },
            name: {
              type: 'string',
              description: 'Product name',
              example: 'Quantum Stabilizer',
            },
            cost: {
              type: 'number',
              format: 'float',
              description: 'Unit cost in USD',
              example: 249.99,
            },
            sku: {
              type: 'string',
              description: 'Stock keeping unit',
              example: 'QS-001',
            },
          },
        },
        Order: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: {
              type: 'integer',
              description: 'Product ID (must reference an existing product)',
              example: 1,
              minimum: 1,
            },
            quantity: {
              type: 'integer',
              description: 'Order quantity (1-10,000)',
              example: 5,
              minimum: 1,
              maximum: 10000,
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error type',
              example: 'Validation failed',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Order total price cannot exceed $1,000,000',
            },
            details: {
              type: 'array',
              description: 'Detailed validation errors (if applicable)',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded'],
              description: 'Overall system health status',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp',
            },
            version: {
              type: 'string',
              description: 'API version',
              example: '1.0.0',
            },
            checks: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'unhealthy', 'unknown'] },
                    message: { type: 'string' },
                  },
                },
                sqs: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'unhealthy', 'unknown'] },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User registration and authentication endpoints',
      },
      {
        name: 'Products',
        description: 'Product catalog endpoints',
      },
      {
        name: 'Orders',
        description: 'Order submission and management endpoints',
      },
      {
        name: 'System',
        description: 'System health and monitoring endpoints',
      },
    ],
  },
  apis: [
    './routes/*.js',
    './server.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
