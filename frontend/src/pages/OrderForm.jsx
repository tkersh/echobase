import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { orders } from '../services/api';

function OrderForm() {
  const [formData, setFormData] = useState({
    productName: '',
    quantity: 1,
    totalPrice: 0,
  });

  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'quantity' || name === 'totalPrice' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const { data } = await orders.create(formData, token);

      setMessage({
        type: 'success',
        text: `Order submitted successfully! Message ID: ${data.messageId}`,
      });
      setFormData({
        productName: '',
        quantity: 1,
        totalPrice: 0,
      });
    } catch (error) {
      // Handle authentication errors
      if (error.message.includes('Authentication') || error.message.includes('Token')) {
        setMessage({
          type: 'error',
          text: 'Session expired. Please login again.',
        });
        setTimeout(() => {
          logout();
          navigate('/login');
        }, 2000);
      } else {
        setMessage({
          type: 'error',
          text: `Error: ${error.message || 'Failed to submit order'}`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="App">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1>Echobase Order System</h1>
            <p className="subtitle">Place your order and it will be processed asynchronously</p>
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

        <form onSubmit={handleSubmit} className="order-form">
          <div className="form-group">
            <label htmlFor="productName">Product Name</label>
            <input
              type="text"
              id="productName"
              name="productName"
              value={formData.productName}
              onChange={handleChange}
              required
              placeholder="Enter product name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="quantity">Quantity</label>
            <input
              type="number"
              id="quantity"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              required
              min="1"
            />
          </div>

          <div className="form-group">
            <label htmlFor="totalPrice">Total Price ($)</label>
            <input
              type="number"
              id="totalPrice"
              name="totalPrice"
              value={formData.totalPrice}
              onChange={handleChange}
              required
              min="0"
              step="0.01"
            />
          </div>

          <button type="submit" disabled={loading} className="submit-btn">
            {loading ? 'Submitting...' : 'Submit Order'}
          </button>
        </form>

        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="info-section">
          <h3>How it works:</h3>
          <ol>
            <li>Submit an order using the form above</li>
            <li>Order is sent to SQS queue via API Gateway</li>
            <li>Background processor reads from the queue</li>
            <li>Order is stored in MariaDB database</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default OrderForm;
