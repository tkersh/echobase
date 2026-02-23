# Plan: Add Grafana and Loki to Observability Stack

## Context

The OTEL Collector exports logs to stdout only (debug exporter) — no persistent log storage or unified dashboard. This adds **Loki** for log aggregation and **Grafana** for unified visualization of logs, metrics, and traces.

Main already has the nginx basic-auth pattern for Prometheus and Jaeger — Grafana and Loki will follow the same pattern.

## Step 1: New Files

### `otel/loki-config.yaml` — Loki configuration
- Single-instance, filesystem storage, auth disabled (behind nginx), TSDB schema v13
- `allow_structured_metadata: true` for OTLP attributes
- `analytics.reporting_enabled: false`

### `otel/Dockerfile.loki`
- `FROM grafana/loki:3.4.2`, COPY loki-config.yaml (follows Dockerfile.prometheus pattern)

### `otel/Dockerfile.grafana`
- `FROM grafana/grafana:latest`, COPY provisioning directory (follows Dockerfile.prometheus pattern)

### `otel/grafana/provisioning/datasources/datasources.yaml`
- Prometheus at `http://prometheus:9090` (default)
- Loki at `http://loki:3100` (with trace-to-log correlation to Jaeger)
- Jaeger at `http://jaeger:16686` (uid: `jaeger` for cross-referencing)

## Step 2: Modify OTEL Collector Config

### `otel/collector-config.yaml`
- Add `otlphttp/loki` exporter: `endpoint: http://loki:3100/otlp` (Loki 3.x native OTLP, not deprecated `loki` exporter)
- Update logs pipeline: `exporters: [otlphttp/loki, debug]`

## Step 3: Add Services to Durable Docker Compose

### `durable/docker-compose.yml`

**Loki service** (no direct port — accessed through nginx):
- Build from `otel/Dockerfile.loki`
- Volume: `loki-data:/loki`
- Healthcheck: `wget --spider -q http://localhost:3100/ready`
- No `ports:` section (nginx proxies it)

**Grafana service** (no direct port — accessed through nginx):
- Build from `otel/Dockerfile.grafana`
- Environment: `GF_SERVER_ROOT_URL=%(protocol)s://%(domain)s/grafana/`, `GF_SERVER_SERVE_FROM_SUB_PATH=true`, `GF_AUTH_ANONYMOUS_ENABLED=true`, `GF_AUTH_ANONYMOUS_ORG_ROLE=Admin`, `GF_AUTH_DISABLE_LOGIN_FORM=true`
- Volume: `grafana-data:/var/lib/grafana`
- depends_on: prometheus (healthy), loki (healthy)
- Healthcheck: `wget --spider -q http://localhost:3000/grafana/api/health`
- No `ports:` section (nginx proxies it)

**New volumes**: `loki-data`, `grafana-data`

## Step 4: Add Nginx Proxy Locations

### `nginx-blue-green.conf` and `nginx-blue-green.conf.template`

Add two location blocks in the main server (port 443), following existing Prometheus/Jaeger pattern:

```nginx
location /grafana/ {
    auth_basic "Observability";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://grafana:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /loki/ {
    auth_basic "Observability";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://loki:3100/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Note: Grafana uses `GF_SERVER_SERVE_FROM_SUB_PATH=true` with `GF_SERVER_ROOT_URL` to handle `/grafana/` prefix natively. Loki's `/loki/` proxy strips the prefix via trailing `/` on proxy_pass.

## Step 5: Update Infrastructure Scripts

### `durable/setup.sh`
- `print_infrastructure_details`: Add Grafana/Loki URLs (e.g., `https://localhost/grafana/`, `https://localhost/loki/`)
- "Already running" refresh path: Add `loki grafana` to `docker compose up -d` command
- Add status checks for loki and grafana containers

### `durable/teardown.sh`
- Container loop: Add `loki grafana`
- Volume loops: Add `loki-data grafana-data`

### `start.sh`
- Update HTPASSWD_CONTENTS error message to mention Grafana and Loki alongside Prometheus and Jaeger

## Step 6: Update Documentation

### `docs/project_notes/key_facts.md`
- Dev-Local table: Add `Grafana | via nginx: https://localhost/grafana/ (basic auth)` and `Loki | via nginx: https://localhost/loki/ (basic auth)`
- CI Durable table: Add same with `https://localhost:1443/` prefix

### `docs/project_notes/decisions.md`
- Add ADR-012: Grafana and Loki for Log Aggregation and Unified Dashboards

### `docs/project_notes/guidelines.md`
- Add note about observability UI auth pattern (all behind nginx basic auth)

## Key Design Decisions

1. **OTLP native** (not deprecated `loki` exporter) — Loki 3.x handles OTLP at `/otlp`
2. **No direct ports** — all observability UIs behind nginx basic auth (matches Prometheus/Jaeger pattern on main)
3. **Grafana subpath** — `GF_SERVER_SERVE_FROM_SUB_PATH=true` at `/grafana/`
4. **Baked-in config** — Dockerfiles COPY config files (matches existing pattern)

## Verification

1. Build: `docker compose -f durable/docker-compose.yml --env-file durable/.env.devlocal -p echobase-devlocal-durable up -d --build`
2. Loki ready: via nginx at `https://localhost/loki/ready` (basic auth)
3. Grafana: `https://localhost/grafana/` (basic auth)
4. Grafana data sources: All three show green in Connections > Data Sources
5. Logs visible: Grafana Explore > Loki > `{service_name=~".+"}`
