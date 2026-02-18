#!/bin/zsh

# Audit and fix vulnerabilities across the npm workspace.
# All projects share the root package-lock.json.
#
# Strategy:
#   1. npm audit fix           — safe, non-breaking updates
#   2. npm audit fix --force   — breaking updates if needed
#   3. If vulnerabilities remain with no fix available via npm,
#      extract the fix versions from advisories and add overrides
#      to package.json, then clean-install to apply them.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo "=== Workspace audit ==="
echo "-------------------------------------------------------"

# Phase 1: Standard fixes
echo "  → Running npm audit fix..."
npm audit fix 2>/dev/null

echo "  → Attempting force fixes..."
npm audit fix --force 2>/dev/null

# Phase 2: Check for remaining vulnerabilities that need overrides
REMAINING=$(npm audit --json 2>/dev/null)
TOTAL=$(echo "$REMAINING" | python3 -c "import json,sys; print(json.load(sys.stdin)['metadata']['vulnerabilities']['total'])" 2>/dev/null)

if [ "$TOTAL" -gt 0 ] 2>/dev/null; then
    echo ""
    echo "  ⚠  $TOTAL vulnerabilities remain after npm audit fix."
    echo "  → Checking for override candidates..."

    # Extract root-cause packages and their fix versions from advisory data.
    # Advisory range looks like ">=4.1.3 <5.3.6" — the upper bound is the fix.
    OVERRIDES=$(echo "$REMAINING" | python3 -c "
import json, sys

data = json.load(sys.stdin)
overrides = {}

for name, vuln in data.get('vulnerabilities', {}).items():
    for item in vuln.get('via', []):
        if isinstance(item, dict):
            pkg = item['name']
            range_str = item.get('range', '')
            # Parse fix version from range upper bound: '>=X <FIX'
            parts = range_str.split('<')
            if len(parts) == 2:
                fix = parts[1].strip()
                if fix and pkg not in overrides:
                    overrides[pkg] = fix

if overrides:
    print(json.dumps(overrides))
" 2>/dev/null)

    if [ -n "$OVERRIDES" ] && [ "$OVERRIDES" != "{}" ]; then
        echo "  → Applying overrides: $OVERRIDES"

        # Merge overrides into package.json
        python3 -c "
import json, sys

with open('package.json', 'r') as f:
    pkg = json.load(f)

new_overrides = json.loads(sys.argv[1])
existing = pkg.get('overrides', {})
existing.update(new_overrides)
pkg['overrides'] = existing

with open('package.json', 'w') as f:
    json.dump(pkg, f, indent=4)
    f.write('\n')
" "$OVERRIDES"

        echo "  → Clean-installing to apply overrides..."
        rm -rf node_modules package-lock.json
        npm install 2>/dev/null

        # Verify
        AFTER=$(npm audit --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['metadata']['vulnerabilities']['total'])" 2>/dev/null)
        if [ "$AFTER" -gt 0 ] 2>/dev/null; then
            echo "  ⚠  $AFTER vulnerabilities still remain. Manual review needed."
            npm audit 2>/dev/null
        else
            echo "  ✅ All vulnerabilities resolved via overrides."
        fi
    else
        echo "  ⚠  No auto-fixable overrides found. Manual review needed:"
        npm audit 2>/dev/null
    fi
else
    echo "  ✅ No vulnerabilities found."
fi

echo "-------------------------------------------------------"
echo "🚀 All projects processed!"
