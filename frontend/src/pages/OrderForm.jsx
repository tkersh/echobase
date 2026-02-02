import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { orders, products } from '../services/api';
import { debug, error as logError } from '../utils/logger';
import { getRecommendedProducts } from '../utils/storage';

function OrderForm() {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const [productsList, setProductsList] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [recommendedProducts, setRecommendedProducts] = useState([]);

  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const stored = getRecommendedProducts();
    if (stored.length > 0) {
      setRecommendedProducts(stored);
    }
  }, []);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const { data } = await products.getAll(token);
        if (data.success) {
          setProductsList(data.products);
        }
      } catch (err) {
        logError('[OrderForm] Failed to fetch products:', err);
      } finally {
        setProductsLoading(false);
      }
    }
    if (token) {
      fetchProducts();
    }
  }, [token]);

  const selectedProduct = productsList.find(p => p.id === Number(selectedProductId));
  const totalPrice = selectedProduct ? parseFloat((selectedProduct.cost * quantity).toFixed(2)) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    const orderData = { productId: Number(selectedProductId), quantity };

    debug('[OrderForm] Submitting order:', orderData);
    debug('[OrderForm] User from context:', user);
    debug('[OrderForm] Token:', token ? token.substring(0, 20) + '...' : 'NO TOKEN');

    try {
      const { data } = await orders.create(orderData, token);

      debug('[OrderForm] Order submitted successfully:', data);
      setMessage({
        type: 'success',
        text: `Order submitted successfully! Message ID: ${data.messageId}`,
      });
      setSelectedProductId('');
      setQuantity(1);
    } catch (err) {
      logError('[OrderForm] Order submission error:', err);
      if (err.message.includes('Authentication') || err.message.includes('Token')) {
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
          text: `Error: ${err.message || 'Failed to submit order'}`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecommendedClick = (product) => {
    if (!product.id) {
      setMessage({ type: 'error', text: 'This recommendation is outdated. Please log out and log back in to refresh.' });
      return;
    }
    setSelectedProductId(String(product.id));
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
            <label htmlFor="productName">Product</label>
            <select
              id="productName"
              name="productName"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              required
              disabled={productsLoading}
            >
              <option value="">
                {productsLoading ? 'Loading products...' : 'Select a product'}
              </option>
              {productsList.map((product) => (
                <option key={product.id} value={String(product.id)}>
                  {product.name} — ${Number(product.cost).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="quantity">Quantity</label>
            <input
              type="number"
              id="quantity"
              name="quantity"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
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
              value={totalPrice}
              readOnly
              step="0.01"
            />
          </div>

          <button type="submit" disabled={loading || !selectedProductId} className="submit-btn">
            {loading ? 'Submitting...' : 'Submit Order'}
          </button>
        </form>

        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        {recommendedProducts.length > 0 && (
          <div className="info-section">
            <h3>Recommended for you</h3>
            {recommendedProducts.map((product) => (
              <div
                key={product.sku}
                onClick={() => handleRecommendedClick(product)}
                style={{ padding: '6px 0', borderBottom: '1px solid #eee', cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRecommendedClick(product); }}
              >
                {product.name} &mdash; ${product.cost.toFixed(2)} (SKU: {product.sku})
              </div>
            ))}
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
