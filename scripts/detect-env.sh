#!/bin/bash
# Detect and export environment container information using Docker labels
# This script uses label-based discovery - no hardcoded container names!
#
# Usage: source scripts/detect-env.sh
#   or:  source scripts/detect-env.sh [devlocal|ci|blue|green]
#
# If an environment is specified, it will look for containers with that env label.
# Otherwise, it auto-detects which environments are running.
#
# Exports (all discovered via labels, not string matching):
#   DURABLE_ENV              - Durable environment: "devlocal" or "ci"
#   DURABLE_MARIADB          - Container name for durable mariadb
#   DURABLE_LOCALSTACK       - Container name for durable localstack
#   DURABLE_NGINX            - Container name for durable nginx
#   DURABLE_DB_PORT          - Host port for database
#   DURABLE_LOCALSTACK_PORT  - Host port for LocalStack
#   DURABLE_NGINX_HTTPS_PORT - Host port for nginx HTTPS
#   EPHEMERAL_ENVS           - Space-separated list of running ephemeral envs
#   EPHEMERAL_LOCALSTACK     - Container name for ephemeral localstack (first found)
#   EPHEMERAL_API_GATEWAY    - Container name for ephemeral api-gateway (first found)
#   EPHEMERAL_FRONTEND       - Container name for ephemeral frontend (first found)
#   EPHEMERAL_ORDER_PROCESSOR - Container name for ephemeral order-processor (first found)

# Don't use set -e since this is meant to be sourced

# Helper function: find container by labels
# Usage: _find_container role service [env]
# Returns container name or empty string
_find_container() {
    local role="$1"
    local service="$2"
    local env="${3:-}"

    local filters="--filter label=echobase.role=$role --filter label=echobase.service=$service"
    if [ -n "$env" ]; then
        filters="$filters --filter label=echobase.env=$env"
    fi

    docker ps --filter "status=running" $filters --format "{{.Names}}" 2>/dev/null | head -1
}

# Helper function: get label value from container
# Usage: _get_label container_name label_name
_get_label() {
    local container="$1"
    local label="$2"
    docker inspect --format "{{index .Config.Labels \"$label\"}}" "$container" 2>/dev/null
}

# Helper function: find all unique env values for a role
# Usage: _find_envs role
_find_envs() {
    local role="$1"
    docker ps --filter "status=running" --filter "label=echobase.role=$role" \
        --format '{{.Label "echobase.env"}}' 2>/dev/null | sort -u | tr '\n' ' ' | xargs
}

_detect_env_main() {
    local requested_env="${1:-}"

    # ========================================
    # Discover durable infrastructure
    # ========================================

    # Find any running durable mariadb (the key indicator of durable infra)
    local durable_mariadb
    if [ -n "$requested_env" ] && { [ "$requested_env" = "devlocal" ] || [ "$requested_env" = "ci" ]; }; then
        # User specified a durable environment
        durable_mariadb=$(_find_container "durable" "mariadb" "$requested_env")
    else
        # Auto-detect: find any running durable mariadb
        durable_mariadb=$(_find_container "durable" "mariadb")
    fi

    if [ -z "$durable_mariadb" ]; then
        echo "ERROR: No durable infrastructure detected" >&2
        echo "Please start durable infrastructure first:" >&2
        echo "  ./durable/setup.sh devlocal   # For local development" >&2
        echo "  ./durable/setup.sh ci         # For CI environment" >&2
        return 1
    fi

    # Get the durable environment from the container's label
    DURABLE_ENV=$(_get_label "$durable_mariadb" "echobase.env")
    if [ -z "$DURABLE_ENV" ]; then
        echo "ERROR: Container $durable_mariadb missing echobase.env label" >&2
        return 1
    fi

    # Discover other durable containers
    DURABLE_MARIADB="$durable_mariadb"
    DURABLE_LOCALSTACK=$(_find_container "durable" "localstack" "$DURABLE_ENV")
    DURABLE_NGINX=$(_find_container "durable" "nginx" "$DURABLE_ENV")

    # Get port configuration from labels
    DURABLE_DB_PORT=$(_get_label "$DURABLE_MARIADB" "echobase.port")
    [ -z "$DURABLE_DB_PORT" ] && DURABLE_DB_PORT="3306"

    if [ -n "$DURABLE_LOCALSTACK" ]; then
        DURABLE_LOCALSTACK_PORT=$(_get_label "$DURABLE_LOCALSTACK" "echobase.port")
        [ -z "$DURABLE_LOCALSTACK_PORT" ] && DURABLE_LOCALSTACK_PORT="4566"
    else
        DURABLE_LOCALSTACK_PORT="4566"
    fi

    if [ -n "$DURABLE_NGINX" ]; then
        DURABLE_NGINX_HTTP_PORT=$(_get_label "$DURABLE_NGINX" "echobase.nginx.http_port")
        DURABLE_NGINX_HTTPS_PORT=$(_get_label "$DURABLE_NGINX" "echobase.nginx.https_port")
        DURABLE_NGINX_BLUE_PORT=$(_get_label "$DURABLE_NGINX" "echobase.nginx.blue_port")
        DURABLE_NGINX_GREEN_PORT=$(_get_label "$DURABLE_NGINX" "echobase.nginx.green_port")
        [ -z "$DURABLE_NGINX_HTTP_PORT" ] && DURABLE_NGINX_HTTP_PORT="80"
        [ -z "$DURABLE_NGINX_HTTPS_PORT" ] && DURABLE_NGINX_HTTPS_PORT="443"
        [ -z "$DURABLE_NGINX_BLUE_PORT" ] && DURABLE_NGINX_BLUE_PORT="8080"
        [ -z "$DURABLE_NGINX_GREEN_PORT" ] && DURABLE_NGINX_GREEN_PORT="8081"
    else
        DURABLE_NGINX_HTTP_PORT="80"
        DURABLE_NGINX_HTTPS_PORT="443"
        DURABLE_NGINX_BLUE_PORT="8080"
        DURABLE_NGINX_GREEN_PORT="8081"
    fi

    # ========================================
    # Discover ephemeral infrastructure
    # ========================================

    # Find all running ephemeral environments
    EPHEMERAL_ENVS=$(_find_envs "ephemeral")

    # If user specified blue/green, filter to that
    if [ -n "$requested_env" ] && { [ "$requested_env" = "blue" ] || [ "$requested_env" = "green" ]; }; then
        if echo "$EPHEMERAL_ENVS" | grep -qw "$requested_env"; then
            EPHEMERAL_ENVS="$requested_env"
        else
            echo "WARNING: Requested ephemeral environment '$requested_env' not running" >&2
            EPHEMERAL_ENVS=""
        fi
    fi

    # Get the first ephemeral environment for convenience variables
    local first_ephemeral
    first_ephemeral=$(echo "$EPHEMERAL_ENVS" | awk '{print $1}')

    if [ -n "$first_ephemeral" ]; then
        EPHEMERAL_LOCALSTACK=$(_find_container "ephemeral" "localstack" "$first_ephemeral")
        EPHEMERAL_API_GATEWAY=$(_find_container "ephemeral" "api-gateway" "$first_ephemeral")
        EPHEMERAL_FRONTEND=$(_find_container "ephemeral" "frontend" "$first_ephemeral")
        EPHEMERAL_ORDER_PROCESSOR=$(_find_container "ephemeral" "order-processor" "$first_ephemeral")
    else
        EPHEMERAL_LOCALSTACK=""
        EPHEMERAL_API_GATEWAY=""
        EPHEMERAL_FRONTEND=""
        EPHEMERAL_ORDER_PROCESSOR=""
    fi

    # ========================================
    # Export all variables
    # ========================================
    export DURABLE_ENV
    export DURABLE_MARIADB
    export DURABLE_LOCALSTACK
    export DURABLE_NGINX
    export DURABLE_DB_PORT
    export DURABLE_LOCALSTACK_PORT
    export DURABLE_NGINX_HTTP_PORT
    export DURABLE_NGINX_HTTPS_PORT
    export DURABLE_NGINX_BLUE_PORT
    export DURABLE_NGINX_GREEN_PORT
    export EPHEMERAL_ENVS
    export EPHEMERAL_LOCALSTACK
    export EPHEMERAL_API_GATEWAY
    export EPHEMERAL_FRONTEND
    export EPHEMERAL_ORDER_PROCESSOR

    return 0
}

# Run detection with any passed arguments
_detect_env_main "$@"
_detect_result=$?

# Clean up helper functions to avoid polluting namespace
unset -f _find_container
unset -f _get_label
unset -f _find_envs
unset -f _detect_env_main

# Return the result
return $_detect_result 2>/dev/null || exit $_detect_result
