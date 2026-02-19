#!/bin/zsh

# Audit and fix vulnerabilities across the npm workspace.
#
# Strategy:
#   1. npm audit fix — safe, non-breaking updates only
#   2. Report remaining vulnerabilities for manual review
#
# IMPORTANT: This script does NOT use --force, which can downgrade
# packages and break version alignment (e.g., jest, OpenTelemetry).
# If vulnerabilities remain, fix them manually by updating the
# direct dependency that pulls in the vulnerable transitive dep,
# or add a targeted override to the root package.json.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo "=== Workspace audit ==="
echo "-------------------------------------------------------"

# Phase 1: Safe fixes only (no --force, no breaking changes)
echo "  → Running npm audit fix (safe updates only)..."
npm audit fix 2>&1

# Phase 2: Report remaining issues
echo ""
echo "  → Checking for remaining vulnerabilities..."
REMAINING=$(npm audit --json 2>/dev/null)
TOTAL=$(echo "$REMAINING" | python3 -c "import json,sys; print(json.load(sys.stdin)['metadata']['vulnerabilities']['total'])" 2>/dev/null)

if [ "$TOTAL" -gt 0 ] 2>/dev/null; then
    echo ""
    echo "  ⚠  $TOTAL vulnerabilities remain after safe fixes."
    echo ""
    echo "  To resolve manually:"
    echo "    1. Run 'npm audit' to see details"
    echo "    2. Update the direct dependency that pulls in the vulnerable package"
    echo "    3. If no update available, add a targeted override to root package.json"
    echo ""
    npm audit 2>/dev/null
else
    echo "  ✅ No vulnerabilities found."
fi

echo "-------------------------------------------------------"
echo "Done!"
