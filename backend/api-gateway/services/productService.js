const { PRODUCTS_CACHE_TTL_MS } = require('../../shared/constants');
const { log, logError } = require('../../shared/logger');

class ProductService {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.productsCache = null;
    this.productsCacheExpiry = 0;
    this.productsCacheRefreshPromise = null;
  }

  async getProduct(productId) {
    // Ensure productsCache is initialized and not expired
    if (!this.productsCache || Date.now() > this.productsCacheExpiry) {
      // If a refresh is already in-flight, await it instead of starting another
      if (!this.productsCacheRefreshPromise) {
        log('Refreshing products cache...');
        this.productsCacheRefreshPromise = this.dbPool.execute('SELECT id, name, cost, sku FROM products')
          .then(([rows]) => {
            this.productsCache = new Map(rows.map(p => [p.id, p]));
            this.productsCacheExpiry = Date.now() + PRODUCTS_CACHE_TTL_MS;
            log(`Products cache refreshed with ${rows.length} items. Next refresh in ${PRODUCTS_CACHE_TTL_MS / 1000} seconds.`);
          })
          .catch(error => {
            logError('Error refreshing products cache:', error);
            // If cache is empty and refresh failed, ensure cache is reset
            if (!this.productsCache) {
              this.productsCache = new Map();
            }
          })
          .finally(() => {
            this.productsCacheRefreshPromise = null;
          });
      }
      await this.productsCacheRefreshPromise;
    }
    return this.productsCache.get(productId);
  }
}

module.exports = ProductService;
