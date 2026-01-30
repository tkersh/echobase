import { getRecommendedProducts } from '../src/tools/getRecommendedProducts';
import { Product } from '../src/types';

describe('getRecommendedProducts', () => {
  let products: Product[];

  beforeAll(() => {
    products = getRecommendedProducts();
  });

  it('should return exactly 5 products', () => {
    expect(products).toHaveLength(5);
  });

  it('should return products with correct schema', () => {
    products.forEach((product) => {
      expect(product).toHaveProperty('name');
      expect(product).toHaveProperty('cost');
      expect(product).toHaveProperty('sku');
      expect(typeof product.name).toBe('string');
      expect(typeof product.cost).toBe('number');
      expect(typeof product.sku).toBe('string');
    });
  });

  it('should return products with positive costs', () => {
    products.forEach((product) => {
      expect(product.cost).toBeGreaterThan(0);
    });
  });

  it('should return products with non-empty SKUs', () => {
    products.forEach((product) => {
      expect(product.sku.length).toBeGreaterThan(0);
    });
  });

  it('should return products with non-empty names', () => {
    products.forEach((product) => {
      expect(product.name.length).toBeGreaterThan(0);
    });
  });
});
