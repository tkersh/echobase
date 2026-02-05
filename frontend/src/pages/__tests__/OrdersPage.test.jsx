import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OrdersPage from '../OrdersPage';
import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';

// Mock the api module
vi.mock('../../services/api', () => ({
  orders: {
    getAll: vi.fn(),
  },
}));

// Mock useAuth to provide test user data
vi.mock('../../context/AuthContext', async () => {
  const actual = await vi.importActual('../../context/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: { id: 1, username: 'testuser', fullName: 'Test User' },
      token: 'test-token',
      logout: vi.fn(),
      loading: false,
    })),
  };
});

// Helper to render component with router context
const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching orders', async () => {
      // Set up a promise that never resolves to keep it in loading state
      api.orders.getAll.mockImplementation(() => new Promise(() => {}));

      renderWithRouter(<OrdersPage />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows "No orders yet" when orders array is empty', async () => {
      api.orders.getAll.mockResolvedValue({
        data: { success: true, orders: [], count: 0 },
      });

      renderWithRouter(<OrdersPage />);

      await waitFor(() => {
        expect(screen.getByText(/no orders yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('Orders Display', () => {
    const mockOrders = [
      {
        id: 1,
        productName: 'Quantum Stabilizer',
        sku: 'QS-001',
        quantity: 2,
        totalPrice: 499.98,
        status: 'completed',
        createdAt: '2026-02-01T10:30:00.000Z',
      },
      {
        id: 2,
        productName: 'Plasma Conduit',
        sku: 'PC-042',
        quantity: 1,
        totalPrice: 89.50,
        status: 'pending',
        createdAt: '2026-02-02T14:45:00.000Z',
      },
    ];

    it('renders orders in a table with correct columns', async () => {
      api.orders.getAll.mockResolvedValue({
        data: { success: true, orders: mockOrders, count: 2 },
      });

      renderWithRouter(<OrdersPage />);

      await waitFor(() => {
        // Check table headers
        expect(screen.getByText('Product')).toBeInTheDocument();
        expect(screen.getByText('SKU')).toBeInTheDocument();
        expect(screen.getByText('Quantity')).toBeInTheDocument();
        expect(screen.getByText('Total')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Date')).toBeInTheDocument();
      });

      // Check order data is displayed
      expect(screen.getByText('Quantum Stabilizer')).toBeInTheDocument();
      expect(screen.getByText('Plasma Conduit')).toBeInTheDocument();
    });

    it('displays formatted dates (not raw ISO strings)', async () => {
      api.orders.getAll.mockResolvedValue({
        data: { success: true, orders: mockOrders, count: 2 },
      });

      renderWithRouter(<OrdersPage />);

      await waitFor(() => {
        // Should NOT show raw ISO format
        expect(screen.queryByText('2026-02-01T10:30:00.000Z')).not.toBeInTheDocument();
        expect(screen.queryByText('2026-02-02T14:45:00.000Z')).not.toBeInTheDocument();
      });
    });

    it('displays formatted prices ($X.XX)', async () => {
      api.orders.getAll.mockResolvedValue({
        data: { success: true, orders: mockOrders, count: 2 },
      });

      renderWithRouter(<OrdersPage />);

      await waitFor(() => {
        expect(screen.getByText('$499.98')).toBeInTheDocument();
        expect(screen.getByText('$89.50')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('shows error message on API failure', async () => {
      api.orders.getAll.mockRejectedValue(new Error('Network error'));

      renderWithRouter(<OrdersPage />);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('has link to place new order', async () => {
      api.orders.getAll.mockResolvedValue({
        data: { success: true, orders: [], count: 0 },
      });

      renderWithRouter(<OrdersPage />);

      await waitFor(() => {
        const placeOrderLink = screen.getByRole('link', { name: /place.*order/i });
        expect(placeOrderLink).toBeInTheDocument();
        expect(placeOrderLink).toHaveAttribute('href', '/orders');
      });
    });
  });
});
