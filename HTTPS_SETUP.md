# HTTPS Setup - Quick Start Guide

## Overview

The Echobase application now has comprehensive HTTPS/TLS protection against Man-in-the-Middle (MITM) attacks.

## Accessing the Application

### Primary URL (HTTPS - Recommended)
```
https://localhost:3443
```

### HTTP URL (Automatically redirects to HTTPS)
```
http://localhost:3000  →  https://localhost:3443
```

## Browser Certificate Warning

**You will see a security warning** in your browser because we're using self-signed certificates for local development.

### How to Proceed:

**Chrome/Edge:**
1. Click "Advanced"
2. Click "Proceed to localhost (unsafe)"

**Firefox:**
1. Click "Advanced"
2. Click "Accept the Risk and Continue"

**Safari:**
1. Click "Show Details"
2. Click "visit this website"

**Note:** This is normal and safe for local development. In production, replace with proper CA-signed certificates.

## Security Features Enabled

### 1. End-to-End TLS/SSL Encryption
- **Frontend (Nginx):** TLS 1.2 and 1.3 with strong cipher suites
- **Backend (Express):** HTTPS with TLS encryption
- **Internal Communication:** Nginx → Backend uses HTTPS (encrypted)
- **Full encryption path:** Browser → Nginx (HTTPS) → API Gateway (HTTPS)
- All traffic encrypted at every hop - no plaintext communication

### 2. Security Headers
- **HSTS** (HTTP Strict Transport Security) - Forces HTTPS for 1 year
- **CSP** (Content Security Policy) - Prevents XSS attacks
- **X-Frame-Options** - Prevents clickjacking
- **X-Content-Type-Options** - Prevents MIME sniffing
- **X-XSS-Protection** - Browser XSS protection
- **Referrer-Policy** - Controls referrer information
- **Permissions-Policy** - Restricts browser features

### 3. Secure Reverse Proxy
- Nginx proxies API calls from HTTPS frontend to HTTPS backend
- End-to-end encryption (no unencrypted internal traffic)
- Prevents mixed content warnings
- All API calls: `https://localhost:3443/api/*` → `https://api-gateway:3001/api/*`
- Health check: `https://localhost:3443/health` → `https://api-gateway:3001/health`

## Files Changed

### Frontend Configuration
- `frontend/nginx.conf` - HTTPS config with security headers + HTTPS proxy to backend
- `frontend/Dockerfile` - SSL certificate integration
- `frontend/ssl/localhost.crt` - SSL certificate (self-signed)
- `frontend/ssl/localhost.key` - Private key

### Backend Configuration
- `backend/api-gateway/server.js` - HTTPS server with TLS support
- `backend/api-gateway/Dockerfile` - SSL certificate support + HTTPS healthcheck
- `backend/api-gateway/ssl/api-gateway.crt` - SSL certificate (self-signed)
- `backend/api-gateway/ssl/api-gateway.key` - Private key

### Environment Configuration
- `.env` - Updated CORS_ORIGIN to `https://localhost:3443`

### Docker Configuration
- `docker-compose.yml` - Exposed port 3443 for HTTPS

### Frontend Code
- `frontend/src/pages/OrderForm.jsx` - Uses same-origin API calls
- `frontend/src/pages/Login.jsx` - Uses same-origin API calls
- `frontend/src/pages/Register.jsx` - Uses same-origin API calls

## Testing HTTPS

### 1. Verify HTTPS is Working
```bash
curl -I -k https://localhost:3443
```

Expected output should include:
- `HTTP/2 200`
- `strict-transport-security: max-age=31536000`
- `content-security-policy: ...`

### 2. Verify HTTP Redirects to HTTPS
```bash
curl -I http://localhost:3000
```

Expected output:
- `HTTP/1.1 301 Moved Permanently`
- `Location: https://localhost/`

### 3. Check Security Headers
```bash
curl -k -I https://localhost:3443 | grep -E "strict-transport|content-security|x-frame"
```

## Production Deployment

### Replace Self-Signed Certificates

**Option 1: Let's Encrypt (Free)**
```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal configured automatically
```

**Option 2: Commercial CA**
- Purchase from DigiCert, GlobalSign, etc.
- Follow CA's installation instructions

### Update nginx.conf for Production
```nginx
# Replace certificate paths
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

# Enable OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;
```

### Update Environment Variables
```bash
# .env production values
CORS_ORIGIN=https://yourdomain.com
REACT_APP_API_URL=https://yourdomain.com
```

## Troubleshooting

### Certificate Errors

**Problem:** "NET::ERR_CERT_AUTHORITY_INVALID"
- **Solution:** This is expected with self-signed certs. Click "Proceed" or "Advanced."

**Problem:** Certificate expired
- **Solution:** Regenerate certificates:
```bash
cd frontend/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout localhost.key \
  -out localhost.crt \
  -subj "/C=US/ST=State/L=City/O=Echobase/OU=Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1"
```

### Mixed Content Warnings

**Problem:** "Mixed Content: The page was loaded over HTTPS, but requested an insecure resource"
- **Solution:** All API calls should use same-origin (window.location.origin) or relative URLs. Nginx proxies to backend.

### CORS Errors

**Problem:** "Access to fetch... has been blocked by CORS policy"
- **Solution:** Ensure `CORS_ORIGIN=https://localhost:3443` in `.env` and restart services:
```bash
docker-compose restart api-gateway
```

## Additional Resources

- See `SECURITY.md` for comprehensive security documentation
- See `TrustBoundaries.md` for attack surface analysis
- [OWASP TLS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)

## Quick Commands

```bash
# Rebuild and restart with HTTPS
docker-compose up --build -d

# View frontend logs
docker-compose logs -f frontend

# Test HTTPS connection
curl -k https://localhost:3443

# Check SSL certificate details
openssl s_client -connect localhost:3443 -showcerts
```

---

**Last Updated:** 2025-10-31
**Status:** ✅ MITM Protection Active