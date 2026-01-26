#!/bin/bash
# Get the active production environment by querying nginx config
# This is the SINGLE SOURCE OF TRUTH for which environment is production
# Returns: "blue", "green", or "none"
#
# Exit codes:
#   0 - Success (outputs "blue", "green", or "none")
#   1 - Error (couldn't query nginx)

# Don't use set -e as we need to handle function return codes gracefully

# Find nginx container using Docker labels (no hardcoded names)
find_nginx_container() {
    echo "DEBUG: Looking for nginx container via labels..." >&2
    echo "DEBUG: Docker version: $(docker --version 2>&1)" >&2
    echo "DEBUG: DOCKER_HOST=$DOCKER_HOST" >&2

    # Find durable nginx container by labels
    local container_name
    container_name=$(docker ps --filter "status=running" \
        --filter "label=echobase.role=durable" \
        --filter "label=echobase.service=nginx" \
        --format "{{.Names}}" 2>/dev/null | head -1)

    if [ -n "$container_name" ]; then
        echo "DEBUG: Found nginx container via labels: $container_name" >&2
        echo "$container_name"
        return 0
    fi

    # Debug: show what containers have echobase labels
    echo "DEBUG: No durable nginx found. Containers with echobase labels:" >&2
    docker ps --filter "label=echobase.role" --format "  {{.Names}} (role={{.Label \"echobase.role\"}}, service={{.Label \"echobase.service\"}})" >&2 || true

    echo "DEBUG: No running nginx container found" >&2
    return 1
}

# Query nginx directly to determine active environment
get_active_from_nginx() {
    local nginx_container=$1
    local active_env

    # Query the /.active-env endpoint directly from nginx
    # This is the source of truth - nginx tells us what it's configured for
    active_env=$(docker exec "$nginx_container" \
        wget -qO- http://localhost/.active-env 2>/dev/null) || true

    if [ "$active_env" = "blue" ] || [ "$active_env" = "green" ]; then
        echo "DEBUG: nginx /.active-env endpoint returned: $active_env" >&2
        echo "$active_env"
        return 0
    fi

    # No active backend configured (bootstrap scenario)
    echo "DEBUG: /.active-env endpoint returned '$active_env' (expected 'blue' or 'green')" >&2
    return 1
}

# Main logic
main() {
    local nginx_container
    local active

    # Find nginx container (don't exit on failure)
    if ! nginx_container=$(find_nginx_container); then
        # No nginx container found - report to stderr and return "none"
        echo "DEBUG: No nginx container found (searched by labels: echobase.role=durable, echobase.service=nginx)" >&2
        echo "none"
        return 0
    fi

    echo "DEBUG: Found nginx container: $nginx_container" >&2

    # Query nginx config for active environment
    if ! active=$(get_active_from_nginx "$nginx_container"); then
        # Nginx running but no active backend configured (bootstrap)
        echo "DEBUG: nginx running but no active backend configured" >&2
        echo "none"
        return 0
    fi

    echo "$active"
    return 0
}

# Run main function
main
