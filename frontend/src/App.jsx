import React, { useState } from 'react';
import './App.css';

function App() {
  const [formData, setFormData] = useState({
    customerName: '',
    productName: '',
    quantity: 1,
    totalPrice: 0,
  });

  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

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
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          type: 'success',
          text: `Order submitted successfully! Message ID: ${data.messageId}`,
        });
        setFormData({
          customerName: '',
          productName: '',
          quantity: 1,
          totalPrice: 0,
        });
      } else {
        setMessage({
          type: 'error',
          text: `Error: ${data.error || 'Failed to submit order'}`,
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Network error: ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <div className="container">
        <h1>Echobase Order System</h1>
        <p className="subtitle">Place your order and it will be processed asynchronously</p>

        <form onSubmit={handleSubmit} className="order-form">
          <div className="form-group">
            <label htmlFor="customerName">Customer Name</label>
            <input
              type="text"
              id="customerName"
              name="customerName"
              value={formData.customerName}
              onChange={handleChange}
              required
              placeholder="Enter customer name"
            />
          </div>

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

export default App;
