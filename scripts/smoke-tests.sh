#!/bin/bash
# Post-promotion smoke tests for production verification
# Runs critical path tests against production endpoints
#
# Usage: ./smoke-tests.sh
#
# Tests performed:
#   1. API Health - GET /health returns 200
#   2. Frontend Load - Homepage returns 200
#   3. Auth Flow - Register + Login works
#   4. Order Submission - POST /api/v1/orders returns 201
#   5. OTEL Infrastructure - Collector, Prometheus, Jaeger, Loki, Grafana health
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Timing
MAX_RESPONSE_TIME=5  # seconds

# API Endpoint paths (centralized for consistency)
HEALTH_ENDPOINT="/health"
ORDERS_ENDPOINT="/api/v1/orders"
AUTH_REGISTER_ENDPOINT="/api/v1/auth/register"
AUTH_LOGIN_ENDPOINT="/api/v1/auth/login"

log_test() {
    local status=$1
    local name=$2
    local details=${3:-}

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$status" = "PASS" ]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "${GREEN}✓ PASS${NC}: $name"
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "${RED}✗ FAIL${NC}: $name"
        if [ -n "$details" ]; then
            echo -e "  ${RED}→ $details${NC}"
        fi
    fi
}

# Find production URLs — detects devlocal (direct ports) vs CI (nginx blue-green proxy)
get_production_urls() {
    # Find nginx container by labels (needed for OTEL tests in all modes)
    local nginx_container
    nginx_container=$(docker ps --filter "status=running" \
        --filter "label=echobase.role=durable" \
        --filter "label=echobase.service=nginx" \
        --format "{{.Names}}" 2>/dev/null | head -1)

    if [ -z "$nginx_container" ]; then
        echo "ERROR: No nginx container found" >&2
        return 1
    fi

    export NGINX_CONTAINER="$nginx_container"

    # Determine the host to use
    # In CI (running in container), localhost may not work - try alternatives
    local host="localhost"

    # Check if we're in a container (CI environment)
    if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup 2>/dev/null; then
        echo "Detected: Running inside a container"
        # Try host.docker.internal (Docker Desktop) or gateway IP
        if getent hosts host.docker.internal >/dev/null 2>&1; then
            host="host.docker.internal"
            echo "Using host.docker.internal to reach Docker host"
        else
            # Get the gateway IP (Docker host)
            local gateway_ip
            gateway_ip=$(ip route | grep default | awk '{print $3}' 2>/dev/null || echo "")
            if [ -n "$gateway_ip" ]; then
                host="$gateway_ip"
                echo "Using gateway IP ($gateway_ip) to reach Docker host"
            fi
        fi
    fi

    # Detect devlocal mode: frontend container running with echobase.env=devlocal
    local devlocal_frontend
    devlocal_frontend=$(docker ps --filter "status=running" \
        --filter "label=echobase.env=devlocal" \
        --filter "label=echobase.service=frontend" \
        --format "{{.Names}}" 2>/dev/null | head -1)

    if [ -n "$devlocal_frontend" ]; then
        # Devlocal mode — app services expose direct ports, not behind nginx blue-green proxy.
        # Frontend nginx proxies /health and /api/ to the API gateway.
        local frontend_https_port
        frontend_https_port=$(docker port "$devlocal_frontend" 443 2>/dev/null | head -1 | sed 's/.*://')
        if [ -z "$frontend_https_port" ]; then
            echo "WARNING: Could not determine frontend HTTPS port, defaulting to 3443"
            frontend_https_port="3443"
        fi

        FRONTEND_URL="https://${host}:${frontend_https_port}"
        API_URL="https://${host}:${frontend_https_port}/api"
        # Canonical origin matches what a browser sees — always localhost-based
        CANONICAL_ORIGIN="https://localhost:${frontend_https_port}"

        echo "Mode: devlocal (direct ports)"
    else
        # CI / blue-green mode — app accessed through durable nginx proxy
        local https_port
        https_port=$(docker inspect --format '{{index .Config.Labels "echobase.nginx.https_port"}}' "$nginx_container" 2>/dev/null || echo "443")
        [ -z "$https_port" ] && https_port="443"

        if [ "$https_port" = "443" ]; then
            FRONTEND_URL="https://${host}"
            API_URL="https://${host}/api"
            CANONICAL_ORIGIN="https://localhost"
        else
            FRONTEND_URL="https://${host}:${https_port}"
            API_URL="https://${host}:${https_port}/api"
            CANONICAL_ORIGIN="https://localhost:${https_port}"
        fi

        echo "Mode: blue-green (nginx proxy)"
    fi

    export FRONTEND_URL
    export API_URL
    export CANONICAL_ORIGIN

    echo "Endpoints:"
    echo "  Frontend: $FRONTEND_URL"
    echo "  API: $API_URL"
}

# Determine if we should use internal networking (via docker exec)
# Sets USE_INTERNAL_NETWORK=true if localhost is not reachable
check_network_mode() {
    if [ "${NETWORK_MODE_CHECKED:-}" = "true" ]; then
        return
    fi

    export NETWORK_MODE_CHECKED=true
    export USE_INTERNAL_NETWORK=false

    # Quick test: can we reach the frontend URL via localhost?
    if curl -sk --connect-timeout 2 "${FRONTEND_URL}/" >/dev/null 2>&1; then
        echo "Network mode: direct (localhost reachable)"
        export USE_INTERNAL_NETWORK=false
    else
        echo "Network mode: internal (using docker exec, localhost not reachable)"
        export USE_INTERNAL_NETWORK=true
    fi
}

# Make curl request - either direct or via docker exec into nginx
do_curl() {
    if [ "$USE_INTERNAL_NETWORK" = "true" ] && [ -n "${NGINX_CONTAINER:-}" ]; then
        # Run curl inside nginx container, hitting localhost (nginx itself)
        # We must properly single-quote each argument to preserve special chars like \n
        # which curl's -w format string needs to interpret
        local escaped_args=""
        for arg in "$@"; do
            # Replace external URL with internal localhost (for request URLs)
            arg=$(echo "$arg" | sed "s|https://[^/]*/|http://localhost/|g")
            # Rewrite Origin to the canonical localhost-based origin so CSRF validation passes.
            # CORS_ORIGIN only allows localhost origins; the internal routing host is not in it.
            if echo "$arg" | grep -q "^Origin:"; then
                arg="Origin: ${CANONICAL_ORIGIN:-https://localhost}"
            fi
            # Single-quote the argument, escaping any embedded single quotes
            escaped_args="$escaped_args '$(echo "$arg" | sed "s/'/'\\\\''/g")'"
        done
        docker exec "$NGINX_CONTAINER" sh -c "apk add --no-cache curl >/dev/null 2>&1 || true; curl $escaped_args"
    else
        # Direct mode — still normalize Origin so it matches CORS_ORIGIN.
        # FRONTEND_URL may use a gateway IP for routing (reachable from CI containers),
        # but the API only accepts localhost-based origins. CANONICAL_ORIGIN is always
        # https://localhost:${port}, matching what a browser would send.
        local fixed_args=()
        for arg in "$@"; do
            if echo "$arg" | grep -q "^Origin:"; then
                arg="Origin: ${CANONICAL_ORIGIN:-https://localhost}"
            fi
            fixed_args+=("$arg")
        done
        curl "${fixed_args[@]}"
    fi
}

# Test 1: API Health Check
test_api_health() {
    echo ""
    echo -e "${BLUE}Test 1: API Health Check${NC}"

    local start_time
    local end_time
    local duration
    local response
    local http_code

    start_time=$(date +%s)

    # Make request and capture both body and status code
    # Use FRONTEND_URL + HEALTH_ENDPOINT which nginx routes to backend /health endpoint
    # (API_URL/health would route to /api/health which doesn't exist)
    response=$(do_curl -sk -w "\n%{http_code}" "${FRONTEND_URL}${HEALTH_ENDPOINT}" --max-time "$MAX_RESPONSE_TIME" 2>&1) || true
    http_code=$(echo "$response" | tail -n1)

    end_time=$(date +%s)
    duration=$((end_time - start_time))

    if [ "$http_code" = "200" ]; then
        if [ "$duration" -le "$MAX_RESPONSE_TIME" ]; then
            log_test "PASS" "API health endpoint responds (${duration}s)"
        else
            log_test "FAIL" "API health endpoint too slow" "Response time: ${duration}s (max: ${MAX_RESPONSE_TIME}s)"
        fi
    else
        log_test "FAIL" "API health endpoint" "HTTP $http_code (expected 200)"
    fi
}

# Test 2: Frontend Load
test_frontend_load() {
    echo ""
    echo -e "${BLUE}Test 2: Frontend Load${NC}"

    local response
    local http_code
    local body

    response=$(do_curl -sk -w "\n%{http_code}" "${FRONTEND_URL}/" --max-time "$MAX_RESPONSE_TIME" 2>&1) || true
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        # Check for expected content (React app marker)
        if echo "$body" | grep -q "root\|app\|Echobase"; then
            log_test "PASS" "Frontend loads successfully"
        else
            log_test "FAIL" "Frontend loads but missing expected content"
        fi
    else
        log_test "FAIL" "Frontend load" "HTTP $http_code (expected 200)"
    fi
}

# Test 3: Auth Flow (Register + Login)
test_auth_flow() {
    echo ""
    echo -e "${BLUE}Test 3: Auth Flow${NC}"

    local timestamp
    local username
    local email
    local password
    local response
    local http_code
    local auth_cookie

    # Generate unique test user
    timestamp=$(date +%s%N | cut -c1-13)
    username="smoketest_${timestamp}"
    email="smoketest_${timestamp}@example.com"
    password="SmokeTest${timestamp}!"

    # 3a: Register
    response=$(do_curl -sk -w "\n%{http_code}" \
        -X POST "${FRONTEND_URL}${AUTH_REGISTER_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -H "Origin: ${FRONTEND_URL}" \
        -d "{\"username\":\"${username}\",\"email\":\"${email}\",\"fullName\":\"Smoke Test User\",\"password\":\"${password}\"}" \
        --max-time "$MAX_RESPONSE_TIME" 2>&1) || true

    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "201" ]; then
        log_test "PASS" "User registration"
    else
        log_test "FAIL" "User registration" "HTTP $http_code (expected 201)"
        return 1
    fi

    # 3b: Login (auth token is returned as an HttpOnly cookie)
    response=$(do_curl -sk -D - -w "\n%{http_code}" \
        -X POST "${FRONTEND_URL}${AUTH_LOGIN_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -H "Origin: ${FRONTEND_URL}" \
        -d "{\"username\":\"${username}\",\"password\":\"${password}\"}" \
        --max-time "$MAX_RESPONSE_TIME" 2>&1) || true

    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "200" ]; then
        # Extract auth cookie from Set-Cookie header
        auth_cookie=$(echo "$response" | grep -i 'set-cookie:' | grep -o 'echobase_token=[^;]*' | head -1 || true)
        if [ -n "$auth_cookie" ]; then
            log_test "PASS" "User login"
            # Export cookie for order test
            export AUTH_COOKIE="$auth_cookie"
        else
            log_test "FAIL" "User login" "No auth cookie in response"
            return 1
        fi
    else
        log_test "FAIL" "User login" "HTTP $http_code (expected 200)"
        return 1
    fi
}

# Test 4: Order Submission
test_order_submission() {
    echo ""
    echo -e "${BLUE}Test 4: Order Submission${NC}"

    if [ -z "${AUTH_COOKIE:-}" ]; then
        log_test "FAIL" "Order submission" "No auth cookie (login failed)"
        return 1
    fi

    local response
    local http_code

    response=$(do_curl -sk -w "\n%{http_code}" \
        -X POST "${FRONTEND_URL}${ORDERS_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -H "Origin: ${FRONTEND_URL}" \
        -b "${AUTH_COOKIE}" \
        -d '{"productId":1,"quantity":1}' \
        --max-time "$MAX_RESPONSE_TIME" 2>&1) || true

    http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "201" ]; then
        log_test "PASS" "Order submission"
    else
        log_test "FAIL" "Order submission" "HTTP $http_code (expected 201)"
    fi
}

# Test 5: OTEL Infrastructure Health
# Tests internal health endpoints from within the docker network (via nginx container).
# This bypasses nginx basic auth and verifies that each service is running and reachable.
test_otel_infrastructure() {
    echo ""
    echo -e "${BLUE}Test 5: OTEL Infrastructure${NC}"

    if [ -z "${NGINX_CONTAINER:-}" ]; then
        log_test "FAIL" "OTEL infrastructure" "No nginx container available"
        return 1
    fi

    # Helper: run wget inside the nginx container to test an internal endpoint.
    # Uses wget because alpine-based nginx image has it; curl may not be installed.
    otel_check() {
        local name="$1"
        local url="$2"
        docker exec "$NGINX_CONTAINER" wget -qO- --timeout=5 "$url" >/dev/null 2>&1 && \
            log_test "PASS" "$name" || \
            log_test "FAIL" "$name" "Could not reach $url"
    }

    otel_check "OTEL Collector health"  "http://otel-collector:13133/status"
    otel_check "Prometheus healthy"     "http://prometheus:9090/prometheus/-/healthy"
    otel_check "Jaeger status"          "http://jaeger:13133/status"
    otel_check "Loki ready"             "http://loki:3100/ready"
    otel_check "Grafana health"         "http://grafana:3000/grafana/api/health"
}

# Debug connectivity
debug_connectivity() {
    echo ""
    echo -e "${YELLOW}=== Connectivity Debug ===${NC}"

    # Check if nginx container is running
    local nginx_container
    nginx_container=$(docker ps --filter "label=echobase.service=nginx" --format "{{.Names}}" 2>/dev/null | head -1)
    echo "nginx container: ${nginx_container:-NOT FOUND}"

    if [ -n "$nginx_container" ]; then
        # Check nginx status
        echo "nginx status: $(docker inspect --format '{{.State.Status}}' "$nginx_container" 2>/dev/null || echo 'unknown')"

        # Check what ports are mapped
        echo "Port mappings:"
        docker port "$nginx_container" 2>/dev/null || echo "  (none)"

        # Check if nginx can reach backends internally
        echo ""
        echo "Testing nginx -> backend connectivity (inside container):"
        docker exec "$nginx_container" wget -q --spider --timeout=2 http://localhost/.active-env 2>/dev/null && echo "  /.active-env: OK" || echo "  /.active-env: FAIL"

        # Show active environment
        local active_env
        active_env=$(docker exec "$nginx_container" wget -qO- http://localhost/.active-env 2>/dev/null || echo "unknown")
        echo "  Active environment: $active_env"

        # Test if nginx can resolve and reach the active backend
        if [ "$active_env" = "blue" ] || [ "$active_env" = "green" ]; then
            echo ""
            echo "Testing nginx -> echobase-${active_env}-frontend (inside nginx container):"
            docker exec "$nginx_container" wget -q --spider --timeout=2 --no-check-certificate "https://echobase-${active_env}-frontend:443/" 2>/dev/null && echo "  frontend: OK" || echo "  frontend: FAIL (may be expected if not on same network)"

            echo "Testing nginx -> echobase-${active_env}-api-gateway (inside nginx container):"
            docker exec "$nginx_container" wget -q --spider --timeout=2 --no-check-certificate "https://echobase-${active_env}-api-gateway:3001/health" 2>/dev/null && echo "  api-gateway: OK" || echo "  api-gateway: FAIL"
        fi
    fi

    # Check if port is listening on host
    echo ""
    echo "Testing host connectivity to localhost:1443:"
    curl -sk --connect-timeout 2 "https://localhost:1443/" >/dev/null 2>&1 && echo "  curl localhost:1443: OK" || echo "  curl localhost:1443: FAIL"

    # Show relevant containers and networks
    echo ""
    echo "Relevant containers:"
    docker ps --filter "name=echobase" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -10

    echo ""
    echo "Relevant networks:"
    docker network ls --filter "name=echobase" --format "table {{.Name}}\t{{.Driver}}"

    echo -e "${YELLOW}=== End Debug ===${NC}"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo " Production Smoke Tests"
    echo "=========================================="

    # Get production URLs from nginx
    if ! get_production_urls; then
        echo -e "${RED}ERROR: Could not determine production URLs${NC}"
        exit 1
    fi

    # Determine network mode (direct vs docker exec)
    check_network_mode

    # Run connectivity debug before tests
    debug_connectivity

    # Run tests (|| true prevents set -e from aborting on individual test failures)
    test_api_health || true
    test_frontend_load || true
    test_auth_flow || true
    test_order_submission || true
    test_otel_infrastructure || true

    # Summary
    echo ""
    echo "=========================================="
    echo " Results: $TESTS_PASSED/$TESTS_RUN passed"
    echo "=========================================="

    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}$TESTS_FAILED test(s) failed${NC}"
        exit 1
    else
        echo -e "${GREEN}All smoke tests passed${NC}"
        exit 0
    fi
}

main "$@"
