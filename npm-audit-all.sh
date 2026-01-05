#!/bin/zsh

# Find all directories containing package.json, excluding node_modules
TARGETS=$(find . -name "package.json" -not -path "*/node_modules/*" -exec dirname {} \;)

echo "Found $(echo $TARGETS | wc -l) node projects. Starting audit..."
echo "-------------------------------------------------------"

echo "$TARGETS" | while read -r dir; do
    echo "📂 Processing: $dir"

    # Enter the directory
    pushd "$dir" > /dev/null || exit

    # 1. Run the standard fix (safe updates)
    echo "  → Running npm audit fix..."
    npm audit fix

    # 2. Force updates for major version vulnerabilities
    # Note: This is what updates package.json declarations for breaking fixes
    echo "  → Attempting force fixes..."
    npm audit fix --force

    # 3. Regenerate/Refresh package-lock.json
    # This ensures the lockfile is perfectly in sync with the new declarations
    echo "  → Syncing package-lock..."
    npm install --package-lock-only

    # Exit the directory
    popd > /dev/null  || exit
    echo "✅ Done with $dir"
    echo "-------------------------------------------------------"
done

echo "🚀 All projects processed!"