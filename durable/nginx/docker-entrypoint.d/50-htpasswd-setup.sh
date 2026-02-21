#!/bin/sh
# 50-htpasswd-setup.sh — Write .htpasswd for observability UI basic auth
# Runs as an nginx docker-entrypoint.d script before nginx starts.

HTPASSWD_FILE="/etc/nginx/.htpasswd"

if [ -n "$HTPASSWD_CONTENTS" ]; then
    printf '%s\n' "$HTPASSWD_CONTENTS" > "$HTPASSWD_FILE"
    chmod 644 "$HTPASSWD_FILE"
    echo "50-htpasswd-setup: wrote $HTPASSWD_FILE (basic auth enabled for observability UIs)"
else
    echo "50-htpasswd-setup: WARNING — HTPASSWD_CONTENTS not set; observability UIs will deny all requests (fail-closed)"
    : > "$HTPASSWD_FILE"
    chmod 644 "$HTPASSWD_FILE"
fi
