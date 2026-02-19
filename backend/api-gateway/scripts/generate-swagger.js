#!/usr/bin/env node

/**
 * Pre-generates the Swagger/OpenAPI spec as static JSON.
 * Run at build time to eliminate the runtime dependency on swagger-jsdoc
 * (which pulls in glob@7 → minimatch, a known vulnerability).
 *
 * Usage: node scripts/generate-swagger.js
 * Output: config/swagger-spec.json
 */

const path = require('path');

// swagger-jsdoc must be available (devDependency)
const swaggerJsdoc = require('swagger-jsdoc');

// Import the options (definition + api file patterns)
// We need to resolve paths relative to the api-gateway root
const cwd = path.resolve(__dirname, '..');
process.chdir(cwd);

const options = require('../config/swagger-options');
const spec = swaggerJsdoc(options);

const outputPath = path.join(cwd, 'config', 'swagger-spec.json');
require('fs').writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n');

console.log(`Swagger spec written to ${outputPath}`);
