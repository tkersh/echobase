import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        // Check table headers (each has a sort indicator)
        expect(screen.getByText(/^Date/)).toBeInTheDocument();
        expect(screen.getByText(/^Product/)).toBeInTheDocument();
        expect(screen.getByText(/^SKU/)).toBeInTheDocument();
        expect(screen.getByText(/^Quantity/)).toBeInTheDocument();
        expect(screen.getByText(/^Total/)).toBeInTheDocument();
        expect(screen.getByText(/^Status/)).toBeInTheDocument();
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

  describe('Sorting', () => {
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
        quantity: 5,
        totalPrice: 89.50,
        status: 'pending',
        createdAt: '2026-02-03T14:45:00.000Z',
      },
      {
        id: 3,
        productName: 'Alpha Module',
        sku: 'AM-100',
        quantity: 1,
        totalPrice: 250.00,
        status: 'processing',
        createdAt: '2026-02-02T08:00:00.000Z',
      },
    ];

    const setupWithOrders = async () => {
      api.orders.getAll.mockResolvedValue({
        data: { success: true, orders: mockOrders, count: 3 },
      });
      renderWithRouter(<OrdersPage />);
      await waitFor(() => {
        expect(screen.getByText('Quantum Stabilizer')).toBeInTheDocument();
      });
    };

    const getRowProductNames = () => {
      const rows = screen.getAllByRole('row').slice(1); // skip header row
      return rows.map((row) => within(row).getAllByRole('cell')[1].textContent);
    };

    it('defaults to date descending sort', async () => {
      await setupWithOrders();

      const names = getRowProductNames();
      // Sorted by date desc: Feb 3 (Plasma), Feb 2 (Alpha), Feb 1 (Quantum)
      expect(names).toEqual(['Plasma Conduit', 'Alpha Module', 'Quantum Stabilizer']);
    });

    it('shows sort indicator on the active column and sortable indicators on others', async () => {
      await setupWithOrders();

      const dateHeader = screen.getByText(/^Date/);
      expect(dateHeader).toHaveAttribute('aria-sort', 'descending');
      expect(dateHeader.querySelector('.sort-indicator.active')).toBeInTheDocument();

      const productHeader = screen.getByText(/^Product/);
      expect(productHeader).toHaveAttribute('aria-sort', 'none');
      expect(productHeader.querySelector('.sort-indicator.inactive')).toBeInTheDocument();
    });

    it('sorts ascending when clicking a different column', async () => {
      const user = userEvent.setup();
      await setupWithOrders();

      await user.click(screen.getByText(/^Product/));

      const names = getRowProductNames();
      expect(names).toEqual(['Alpha Module', 'Plasma Conduit', 'Quantum Stabilizer']);
    });

    it('toggles direction when clicking the same column again', async () => {
      const user = userEvent.setup();
      await setupWithOrders();

      // Click Product to sort ascending
      await user.click(screen.getByText(/^Product/));
      expect(getRowProductNames()).toEqual(['Alpha Module', 'Plasma Conduit', 'Quantum Stabilizer']);

      // Click Product again to sort descending
      await user.click(screen.getByText(/^Product/));
      expect(getRowProductNames()).toEqual(['Quantum Stabilizer', 'Plasma Conduit', 'Alpha Module']);
    });

    it('sorts numeric columns correctly', async () => {
      const user = userEvent.setup();
      await setupWithOrders();

      await user.click(screen.getByText(/^Quantity/));

      const rows = screen.getAllByRole('row').slice(1);
      const quantities = rows.map((row) => within(row).getAllByRole('cell')[3].textContent);
      expect(quantities).toEqual(['1', '2', '5']);
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
