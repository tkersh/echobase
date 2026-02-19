/**
 * Swagger/OpenAPI Spec Loader
 *
 * In production/CI: loads pre-generated swagger-spec.json (no swagger-jsdoc dependency)
 * In local dev: falls back to runtime generation via swagger-jsdoc (devDependency)
 */

const fs = require('fs');
const path = require('path');

const specPath = path.join(__dirname, 'swagger-spec.json');

let swaggerSpec;

if (fs.existsSync(specPath)) {
  // Pre-generated spec exists (Docker build / CI)
  swaggerSpec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
} else {
  // Local dev fallback — generate at runtime
  try {
    const swaggerJsdoc = require('swagger-jsdoc');
    const options = require('./swagger-options');
    swaggerSpec = swaggerJsdoc(options);
  } catch (err) {
    console.warn('swagger-jsdoc not available and no pre-generated spec found. Run: node scripts/generate-swagger.js');
    swaggerSpec = { openapi: '3.0.0', info: { title: 'API', version: '1.0.0' }, paths: {} };
  }
}

module.exports = swaggerSpec;
