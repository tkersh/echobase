# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: Promote-to-Production Smoketest Auth Flow Failure

## Context

The `use_otel` branch migrated SSL certificates from baked-in files to AWS Secrets Manager (fetched at runtime). This broke two things:

1. **Durable nginx build is broken**: `durable/nginx/Dockerfile` line 14 does `COPY frontend/ssl /etc/ssl`, but `frontend/ssl/` was deleted. Fresh builds fail.
2. **API gateway may fall back to HTTP**: If the CI durable LocalStack hasn't been re-setup with the n...

### Prompt 2

Can we DRY the two 40-ssl-setup.sh files? Why are they named 40-xxx?

### Prompt 3

We should never fall back to self-signed

