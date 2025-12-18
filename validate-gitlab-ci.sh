#!/bin/bash

# GitLab CI Lint Validation Script

echo "GitLab CI/CD Validation"
echo "======================="
echo ""

ERRORS=0
WARNINGS=0

# Check 1: File exists
if [ ! -f .gitlab-ci.yml ]; then
    echo "❌ ERROR: .gitlab-ci.yml not found"
    exit 1
fi
echo "✓ File exists"

# Check 2: Check for tabs (should use spaces)
if grep -q $'\t' .gitlab-ci.yml; then
    echo "⚠ WARNING: File contains tabs (should use spaces)"
    ((WARNINGS++))
else
    echo "✓ No tabs found"
fi

# Check 3: Check stages are defined
if grep -q "^stages:" .gitlab-ci.yml; then
    echo "✓ Stages defined"
else
    echo "❌ ERROR: No stages defined"
    ((ERRORS++))
fi

# Check 4: Check for common keywords
for keyword in "script" "stage"; do
    if grep -q "$keyword:" .gitlab-ci.yml; then
        echo "✓ Keyword '$keyword' found"
    fi
done

# Check 5: Check cache configuration
CACHE_FILES=$(grep -A 5 "cache:" .gitlab-ci.yml | grep "files:" | wc -l)
if [ "$CACHE_FILES" -gt 0 ]; then
    FILES_COUNT=$(grep -A 10 "files:" .gitlab-ci.yml | grep "^        -" | wc -l)
    if [ "$FILES_COUNT" -gt 2 ]; then
        echo "❌ ERROR: Cache key files has $FILES_COUNT files (max 2)"
        ((ERRORS++))
    else
        echo "✓ Cache configuration OK"
    fi
else
    echo "✓ No cache files configuration (using key string)"
fi

# Check 6: Check dependencies/needs alignment
echo ""
echo "Checking dependencies/needs alignment..."
JOBS_WITH_DEPS=$(grep -B 5 "dependencies:" .gitlab-ci.yml | grep "^[a-z].*:" | sed 's/:$//' | sort -u)
for job in $JOBS_WITH_DEPS; do
    HAS_NEEDS=$(grep -A 20 "^$job:" .gitlab-ci.yml | grep "needs:" | wc -l)
    if [ "$HAS_NEEDS" -eq 0 ]; then
        echo "⚠ WARNING: Job '$job' has dependencies but no needs"
        ((WARNINGS++))
    else
        echo "✓ Job '$job' has both dependencies and needs"
    fi
done

# Check 7: Check for deprecated 'only/except' syntax
if grep -q "only:" .gitlab-ci.yml || grep -q "except:" .gitlab-ci.yml; then
    echo "⚠ INFO: Using 'only/except' (consider migrating to 'rules')"
fi

# Check 8: Validate job names
echo ""
echo "Validating job names..."
INVALID_JOBS=$(grep "^[a-z].*:" .gitlab-ci.yml | grep -v "^  " | sed 's/:$//' | grep -E "[^a-z0-9:._-]" || true)
if [ -n "$INVALID_JOBS" ]; then
    echo "❌ ERROR: Invalid job names found:"
    echo "$INVALID_JOBS"
    ((ERRORS++))
else
    echo "✓ All job names are valid"
fi

# Summary
echo ""
echo "======================="
echo "Validation Summary"
echo "======================="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "❌ Validation FAILED - Fix errors before pushing"
    exit 1
else
    echo "✅ Validation PASSED"
    if [ $WARNINGS -gt 0 ]; then
        echo "⚠ But there are $WARNINGS warnings to review"
    fi
    exit 0
fi
