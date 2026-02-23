# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Centralize Durable Service/Volume Lists

## Context

The durable infrastructure service names and volume names are duplicated across 3 scripts. When a new service is added (as just happened with Loki/Grafana), every list must be updated independently — and `scripts/teardown-all.sh` was missed. This creates a maintenance hazard.

## Approach

Create a single `durable/services.sh` file that defines the canonical lists as shell variables. Each consuming scri...

### Prompt 2

OTEL_SERVICES are always going to be DURABLE_SERVICES, so let's $ include it into the DURABLE_SERVICES list

### Prompt 3

hook smoke-tests into run-all-tests

### Prompt 4

Smoke should be first, fail fast if it doesn't pass

### Prompt 5

~/work/echobase/durable/services.sh
Warning:(6, 1) DURABLE_SERVICES appears unused. Verify use (or export if used externally).
Warning:(7, 1) DURABLE_VOLUMES appears unused. Verify use (or export if used externally).
~/work/echobase/run-all-tests.sh
Warning:(14, 1) YELLOW appears unused. Verify use (or export if used externally).
~/work/echobase/scripts/smoke-tests.sh
Warning:(357, 9) result appears unused. Verify use (or export if used externally).

