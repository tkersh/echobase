# Troubleshooting Guide

Common issues and how to diagnose them.

---

## Recommended Products Not Showing

**Symptom:** The "Recommended for you" section does not appear on the order form.

**How it works:** MCP server (durable) → API gateway calls `getRecommendedProducts` during login/registration → frontend stores result in `localStorage` → OrderForm reads and renders it.

### Step 1: Check API Gateway logs for MCP connection

```bash
# Devlocal
docker logs echobase-devlocal-api-gateway 2>&1 | grep -i "MCP\|recommend"

# CI green
docker logs echobase-green-api-gateway 2>&1 | grep -i "MCP\|recommend"
```

**Healthy output:**
```
Connecting to MCP server at http://echobase-devlocal-durable-mcp-server:3002...
MCP API key configured: yes (VCf3QHGb...)
MCP client connected successfully - product recommendations enabled
```

**Unhealthy output (key mismatch):**
```
Connecting to MCP server at http://echobase-ci-durable-mcp-server:3002...
MCP API key configured: yes (abc12345...)
Failed to connect to MCP server: ...
Product recommendations will be unavailable. If this is an auth error, the MCP server and API gateway may have different MCP_API_KEY values
```

**Unhealthy output (not configured):**
```
MCP_SERVER_ENDPOINT not configured - product recommendations unavailable
```
or
```
MCP_API_KEY not configured - product recommendations unavailable
```

### Step 2: Verify MCP server is running

```bash
# Devlocal
docker ps --filter "name=mcp-server" --format "table {{.Names}}\t{{.Status}}"

# Health check
docker exec echobase-devlocal-durable-mcp-server curl -sf http://localhost:3002/health
```

### Step 3: Compare API keys

The MCP server and API gateway must share the same `MCP_API_KEY`. In CI, each pipeline generates a new key, but the durable MCP server may retain an old one.

```bash
# API gateway's key
docker exec echobase-green-api-gateway printenv MCP_API_KEY | cut -c1-8

# MCP server's key
docker exec echobase-ci-durable-mcp-server printenv MCP_API_KEY | cut -c1-8
```

If the prefixes don't match, rerun durable setup to sync the key:

```bash
source .env
./durable/setup.sh ci    # or: ./durable/setup.sh devlocal
```

The setup script's "already running" path now ensures the MCP server is updated with the current API key.

### Step 4: Check browser localStorage

In browser DevTools console on the order page:

```javascript
JSON.parse(localStorage.getItem('recommendedProducts'))
```

If `null`, the login/registration response didn't include recommendations (MCP connection failed at that time). Log out and log back in after fixing the MCP connection.

### Root cause reference

See `docs/project_notes/bugs.md` entry "2026-01-31 - Recommended Products Missing in CI".

---

## Teardown Script Not Removing All Containers

**Symptom:** `./scripts/teardown-all.sh --volumes --include-ci` leaves containers running.

**Diagnosis:**
```bash
docker ps --filter "name=echobase" --format "table {{.Names}}\t{{.Status}}"
```

**Common causes:**
- Devlocal ephemeral containers (`echobase-devlocal-api-gateway`, etc.) use hardcoded `container_name` in `docker-compose.yml` without a `-p` flag, so they aren't found by project-based teardown. Fixed in `teardown-all.sh` with a dedicated `teardown_devlocal_ephemeral()` function.
- MCP server container was missing from the durable service list. Fixed by adding `mcp-server` to the service iteration in `teardown_durable()`.

---

## MySQL Variable Warnings During LocalStack Startup

**Symptom:** `WARN[0000] The "MYSQL_ROOT_PASSWORD" variable is not set. Defaulting to a blank string.` when running `./durable/setup.sh`.

**Explanation:** This occurs when the script starts only LocalStack before database credentials are available. Docker Compose parses all variable references in the file, even for services not being started. The warnings are cosmetic — only LocalStack starts, and the MariaDB service (which uses these variables) is not created at this point. Fixed by adding placeholder values to the temp env file.

---

## Order Total Exceeds Maximum Value

**Symptom:** Order submission returns 400 with "Order total exceeds maximum allowed value".

**Explanation:** `ORDER_MAX_VALUE` in `backend/shared/constants.js` is $1,000,000. With server-side price calculation (`product.cost * quantity`), expensive products at high quantities can exceed this. For example, Laptop ($999.99) * 9999 = ~$10M.

**Solution:** Use a lower quantity or a cheaper product. This is a business rule, not a bug.
