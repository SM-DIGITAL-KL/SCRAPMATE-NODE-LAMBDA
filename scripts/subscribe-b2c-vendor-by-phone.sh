#!/bin/bash

# =============================================================================
# Subscribe B2C Vendor by Phone Number - One Month Subscription
# =============================================================================
# Usage: ./subscribe-b2c-vendor-by-phone.sh <phone_number> [package_id]
# Example: ./subscribe-b2c-vendor-by-phone.sh 9074135121
# Example with package: ./subscribe-b2c-vendor-by-phone.sh 9074135121 pkg_123
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="$(dirname "$SCRIPT_DIR")"

# Check if phone number is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Phone number is required${NC}"
    echo ""
    echo "Usage: $0 <phone_number> [package_id]"
    echo "Example: $0 9074135121"
    echo "Example with package: $0 9074135121 pkg_123"
    echo ""
    echo "This script will:"
    echo "  1. Find the B2C vendor by phone number"
    echo "  2. Add a 1-month subscription"
    echo "  3. Update shop subscription status"
    echo "  4. Create an approved invoice"
    exit 1
fi

PHONE_NUMBER="$1"
PACKAGE_ID="${2:-}"

echo -e "${BLUE}=============================================================================${NC}"
echo -e "${BLUE}  Subscribe B2C Vendor - One Month Subscription${NC}"
echo -e "${BLUE}=============================================================================${NC}"
echo ""
echo -e "${YELLOW}📱 Phone Number:${NC} $PHONE_NUMBER"
if [ -n "$PACKAGE_ID" ]; then
    echo -e "${YELLOW}📦 Package ID:${NC} $PACKAGE_ID"
else
    echo -e "${YELLOW}📦 Package ID:${NC} Auto-select monthly B2C package"
fi
echo ""

# Change to lambda directory
cd "$LAMBDA_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${RED}❌ Error: node_modules not found. Please run 'npm install' first.${NC}"
    exit 1
fi

# Run the Node.js script
echo -e "${GREEN}🚀 Running subscription script...${NC}"
echo ""

if [ -n "$PACKAGE_ID" ]; then
    node scripts/addSubscriptionByMobile.js "$PHONE_NUMBER" "$PACKAGE_ID"
else
    node scripts/addSubscriptionByMobile.js "$PHONE_NUMBER"
fi

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}=============================================================================${NC}"
    echo -e "${GREEN}  ✅ Subscription completed successfully!${NC}"
    echo -e "${GREEN}=============================================================================${NC}"
    echo ""
    echo -e "${BLUE}📱 Next steps for the vendor:${NC}"
    echo "   1. Close and reopen the vendor app, OR"
    echo "   2. Pull to refresh on the profile/subscription screen"
    echo "   3. The subscription will appear in the subscription list"
    echo ""
else
    echo -e "${RED}=============================================================================${NC}"
    echo -e "${RED}  ❌ Subscription failed!${NC}"
    echo -e "${RED}=============================================================================${NC}"
    exit $exit_code
fi
