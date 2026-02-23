# Canonical lists of durable infrastructure components.
# Source this file from scripts that iterate over durable services or volumes.
# When adding a new durable service, update ONLY this file.

export OTEL_SERVICES="otel-collector jaeger prometheus loki grafana"
export DURABLE_SERVICES="mariadb localstack nginx mcp-server $OTEL_SERVICES"
export DURABLE_VOLUMES="mariadb-data localstack-data nginx-config jaeger-badger-data prometheus-data loki-data grafana-data"
