import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          maxWidth: '600px',
          margin: '40px auto',
          padding: '40px',
          background: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <h1 style={{
            fontSize: '32px',
            marginBottom: '12px',
            color: '#c41e3a'
          }}>
            Something went wrong
          </h1>
          <p style={{
            fontSize: '18px',
            color: '#4a4a4a',
            marginBottom: '32px'
          }}>
            We're sorry, but an unexpected error occurred. Please refresh the page and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#0056b3',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
