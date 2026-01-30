import { Product } from '../types';

export function getRecommendedProducts(userId: string): Product[] {
  return [
    { name: 'Quantum Stabilizer', cost: 249.99, sku: 'QS-001' },
    { name: 'Plasma Conduit', cost: 89.50, sku: 'PC-042' },
    { name: 'Neural Interface Module', cost: 599.00, sku: 'NIM-007' },
    { name: 'Gravity Dampener', cost: 175.25, sku: 'GD-113' },
    { name: 'Chrono Sync Unit', cost: 324.75, sku: 'CSU-088' },
  ];
}
