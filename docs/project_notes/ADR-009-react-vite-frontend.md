# ADR-009: React + Vite Frontend

## Status

Accepted

## Date

2026-01-24

## Context

The application needs a frontend that:
- Provides user interface for registration, login, and order submission
- Communicates with the API Gateway
- Works well in containerized environments
- Has fast development iteration (hot reload)
- Produces optimized production builds

## Decision

Use **React** for the UI framework with **Vite** as the build tool, served via **nginx** in production.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Development (Vite Dev Server)                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  • Hot Module Replacement (HMR)                              ││
│  │  • Fast refresh on file changes                              ││
│  │  • Proxy API requests to backend                             ││
│  │  • Source maps for debugging                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Production (nginx serving static files)                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  • Pre-built static assets (dist/)                          ││
│  │  • Gzip compression                                          ││
│  │  • SPA routing (fallback to index.html)                     ││
│  │  • HTTPS termination                                         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Application Structure

```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   ├── pages/             # Page components (routes)
│   ├── services/          # API client services
│   ├── context/           # React context (auth state)
│   ├── hooks/             # Custom React hooks
│   └── App.jsx            # Root component with routing
├── public/                # Static assets
├── vite.config.js         # Vite configuration
└── Dockerfile             # Multi-stage build
```

### Key Features

**Routing (React Router):**
```
/              → Home page
/login         → Login form
/register      → Registration form
/orders        → Order list (protected)
/orders/new    → New order form (protected)
```

**Authentication Context:**
```javascript
// Provides auth state throughout the app
<AuthProvider>
  <App />
</AuthProvider>

// Usage in components
const { user, login, logout, isAuthenticated } = useAuth();
```

**API Client:**
```javascript
// Centralized API calls with token handling
const api = {
  auth: {
    register: (data) => post('/api/v1/auth/register', data),
    login: (data) => post('/api/v1/auth/login', data),
  },
  orders: {
    list: () => get('/api/v1/orders'),
    create: (data) => post('/api/v1/orders', data),
  },
};
```

### Docker Build

Multi-stage Dockerfile:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

## Consequences

### Positive

- **Fast development**: Vite's HMR is nearly instant
- **Modern tooling**: ES modules, fast builds, tree shaking
- **React ecosystem**: Large component library ecosystem
- **Small bundle**: Vite produces optimized production builds
- **Container-friendly**: Static files served by nginx

### Negative

- **JavaScript fatigue**: React ecosystem changes frequently
- **No SSR**: Client-side only (not needed for this app)
- **Bundle size**: React adds ~40KB to initial load

### Neutral

- **No TypeScript**: Using plain JavaScript for simplicity
- **No state management library**: React Context sufficient for current needs

## Configuration

**Environment Variables:**
```bash
VITE_API_URL=https://localhost:3001    # API Gateway URL
```

**Vite Config:**
```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'https://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,  // Disable in production
  },
});
```

## Alternatives Considered

### 1. Vue.js

**Considered**: Simpler learning curve, good documentation.
**Not chosen**: React has larger ecosystem and team familiarity.

### 2. Create React App (CRA)

**Considered**: Official React tooling.
**Not chosen**: Slower than Vite, less configurable, being deprecated.

### 3. Next.js

**Considered**: SSR, file-based routing, API routes.
**Not chosen**: Overkill for SPA, adds complexity.

### 4. Plain HTML/CSS/JS

**Considered**: Simplest approach.
**Not chosen**: Component reuse and state management would be painful.

### 5. Webpack

**Considered**: Mature, highly configurable.
**Not chosen**: Vite is faster and simpler for this use case.

## References

- `frontend/` - Frontend source code
- `frontend/vite.config.js` - Vite configuration
- `frontend/Dockerfile` - Container build
- `frontend/src/App.jsx` - Root component
