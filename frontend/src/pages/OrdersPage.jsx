import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { orders } from '../services/api';
import { error as logError } from '../utils/logger';

function OrdersPage() {
  const [ordersList, setOrdersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function fetchOrders() {
      try {
        const { data } = await orders.getAll();
        if (!cancelled && data.success) {
          setOrdersList(data.orders);
        }
      } catch (err) {
        if (!cancelled) {
          logError('[OrdersPage] Failed to fetch orders:', err);
          setError(err.message || 'Failed to load orders');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (user) {
      fetchOrders();
    }
    return () => { cancelled = true; };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price) => {
    return `$${Number(price).toFixed(2)}`;
  };

  const handleSort = (column) => {
    if (column === sortColumn) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedOrders = useMemo(() => {
    const stringColumns = ['productName', 'sku', 'status'];
    const numericColumns = ['quantity', 'totalPrice'];

    return [...ordersList].sort((a, b) => {
      let comparison = 0;
      if (stringColumns.includes(sortColumn)) {
        comparison = String(a[sortColumn]).localeCompare(String(b[sortColumn]));
      } else if (numericColumns.includes(sortColumn)) {
        comparison = Number(a[sortColumn]) - Number(b[sortColumn]);
      } else {
        comparison = new Date(a[sortColumn]) - new Date(b[sortColumn]);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [ordersList, sortColumn, sortDirection]);

  const columns = [
    { key: 'createdAt', label: 'Date' },
    { key: 'productName', label: 'Product' },
    { key: 'sku', label: 'SKU' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'totalPrice', label: 'Total' },
    { key: 'status', label: 'Status' },
  ];

  if (loading) {
    return (
      <div className="App">
        <div className="container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1>Order History</h1>
            <p className="subtitle">View your past orders</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: '0 0 10px 0', color: '#666' }}>
              Logged in as: <strong>{user?.fullName || user?.username}</strong>
            </p>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="message error">
            {error}
          </div>
        )}

        {!error && ordersList.length === 0 && (
          <div className="message" style={{ backgroundColor: '#f8f9fa', color: '#666', border: '1px solid #e0e0e0' }}>
            <p>No orders yet. Place your first order to see it here.</p>
          </div>
        )}

        {ordersList.length > 0 && (
          <table className="orders-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="sortable-header"
                    aria-sort={sortColumn === col.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {col.label}
                    {sortColumn === col.key ? (
                      <span className="sort-indicator active" aria-hidden="true">
                        {sortDirection === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    ) : (
                      <span className="sort-indicator inactive" aria-hidden="true"> ⇅</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map((order) => (
                <tr key={order.id}>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>{order.productName}</td>
                  <td>{order.sku}</td>
                  <td>{order.quantity}</td>
                  <td>{formatPrice(order.totalPrice)}</td>
                  <td>
                    <span className={`status-${order.status}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="info-section">
          <Link to="/orders" className="submit-btn" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
            Place New Order
          </Link>
        </div>
      </div>
    </div>
  );
}

export default OrdersPage;
