/**
 * Build Metadata Utility
 * Logs build information (Git SHA, build date) for all backend services
 */

const { log } = require('./logger');

/**
 * Logs build metadata from build-metadata.json file
 * This file is created during Docker build and contains Git SHA and build date
 */
function logBuildMetadata() {
  try {
    const buildMetadata = require('./build-metadata.json');
    log('='.repeat(80));
    log('BUILD METADATA:');
    log(`  Component: ${buildMetadata.component}`);
    log(`  Git SHA: ${buildMetadata.gitSha}`);
    log(`  Build Date: ${buildMetadata.buildDate}`);
    log('='.repeat(80));
  } catch (e) {
    log('Warning: Build metadata not found (development mode?)');
  }
}

module.exports = { logBuildMetadata };
