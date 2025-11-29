#!/bin/bash

# Clean up unnecessary .sh and .md files, keeping only monolithic deployment files

echo "🧹 Cleaning up unnecessary files..."
echo ""

# Files to DELETE (microservices related)
MICROSERVICES_SH_FILES=(
    "scripts/create-all-routes-to-api.sh"
    "scripts/setup-new-api-gateway.sh"
    "scripts/view-local-logs.sh"
    "scripts/run-local.sh"
    "scripts/cloudwatch-logs.sh"
    "scripts/create-all-utility-routes.sh"
    "scripts/deploy-all-microservices.sh"
    "scripts/create-api-route.sh"
    "scripts/deploy-service.sh"
    "scripts/cleanup-md-files.sh"
    "scripts/cleanup-microservices-scripts.sh"
    "test-all-apis.sh"
)

# MD files to DELETE
MICROSERVICES_MD_FILES=(
    "scripts/aws-iam-setup.md"
    "scripts/request-s3-permissions.md"
    "scripts/setup-iam-permissions.md"
)

# Files to KEEP (monolithic deployment)
MONOLITHIC_FILES=(
    "scripts/deploy-lambda-direct.sh"
    "scripts/deploy.sh"
    "scripts/create-lambda-role.sh"
    "scripts/create-deployment-bucket.sh"
    "scripts/add-permissions-admin.sh"
    "scripts/check-iam-permissions.sh"
    "scripts/cleanup-failed-stack.sh"
    "scripts/setup-ssm-parameters.sh"
    "scripts/setup-ssm-parameters-manual.sh"
)

echo "📋 Files to be deleted:"
echo ""
echo "Shell scripts:"
for file in "${MICROSERVICES_SH_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   - $file"
    fi
done

echo ""
echo "Markdown files:"
for file in "${MICROSERVICES_MD_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   - $file"
    fi
done

echo ""
echo "✅ Files to keep (monolithic):"
for file in "${MONOLITHIC_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   - $file"
    fi
done

echo ""
read -p "Are you sure you want to delete these files? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborting cleanup."
    exit 0
fi

echo ""
echo "🗑️  Deleting files..."
DELETED_COUNT=0

for file in "${MICROSERVICES_SH_FILES[@]}" "${MICROSERVICES_MD_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        if [ $? -eq 0 ]; then
            echo "   ✅ Deleted: $file"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        else
            echo "   ❌ Failed to delete: $file"
        fi
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cleanup complete!"
echo "   Deleted: $DELETED_COUNT file(s)"
echo ""

