#!/bin/bash

# Script to deactivate MFA for AWS IAM user
# This script requires IAM permissions to manage MFA devices

set -e

# Load AWS credentials from aws.txt
if [ -f "aws.txt" ]; then
    source aws.txt 2>/dev/null || {
        export AWS_ACCESS_KEY_ID=$(grep AWS_ACCESS_KEY_ID aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_SECRET_ACCESS_KEY=$(grep AWS_SECRET_ACCESS_KEY aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        export AWS_REGION=$(grep AWS_REGION aws.txt | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    }
fi

# Set region
export AWS_DEFAULT_REGION=${AWS_REGION:-ap-south-1}

# Get the username from the ARN
USERNAME="scrapmate"

echo "🔍 Checking MFA devices for user: $USERNAME"
echo ""

# List MFA devices
echo "📋 Listing MFA devices..."
MFA_DEVICES=$(aws iam list-mfa-devices --user-name "$USERNAME" 2>&1)

if [ $? -ne 0 ]; then
    echo "❌ Error: Cannot list MFA devices. You may need:"
    echo "   1. IAM permissions: iam:ListMFADevices"
    echo "   2. Or use AWS Console with root/admin access"
    echo ""
    echo "Error details:"
    echo "$MFA_DEVICES"
    echo ""
    echo "📝 To deactivate MFA via AWS Console:"
    echo "   1. Go to: https://console.aws.amazon.com/iam/"
    echo "   2. Navigate to: Users → $USERNAME → Security credentials"
    echo "   3. Find 'Assigned MFA device' section"
    echo "   4. Click 'Remove' or 'Deactivate'"
    exit 1
fi

# Extract serial numbers
SERIAL_NUMBERS=$(echo "$MFA_DEVICES" | grep -oP '"SerialNumber":\s*"\K[^"]*' || echo "")

if [ -z "$SERIAL_NUMBERS" ]; then
    echo "✅ No MFA devices found for user: $USERNAME"
    echo "   MFA is already deactivated or not configured."
    exit 0
fi

echo "Found MFA devices:"
echo "$MFA_DEVICES" | grep -A 5 "SerialNumber"
echo ""

# Deactivate each MFA device
for SERIAL in $SERIAL_NUMBERS; do
    echo "🗑️  Deactivating MFA device: $SERIAL"
    aws iam deactivate-mfa-device --user-name "$USERNAME" --serial-number "$SERIAL" 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully deactivated MFA device: $SERIAL"
    else
        echo "❌ Failed to deactivate MFA device: $SERIAL"
        echo "   You may need IAM permissions: iam:DeactivateMFADevice"
    fi
    echo ""
done

# Delete virtual MFA devices
echo "🗑️  Checking for virtual MFA devices..."
VIRTUAL_MFA=$(aws iam list-virtual-mfa-devices --query "VirtualMFADevices[?User.UserName=='$USERNAME'].SerialNumber" --output text 2>&1)

if [ $? -eq 0 ] && [ ! -z "$VIRTUAL_MFA" ]; then
    for SERIAL in $VIRTUAL_MFA; do
        echo "🗑️  Deleting virtual MFA device: $SERIAL"
        aws iam delete-virtual-mfa-device --serial-number "$SERIAL" 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✅ Successfully deleted virtual MFA device: $SERIAL"
        else
            echo "❌ Failed to delete virtual MFA device: $SERIAL"
        fi
        echo ""
    done
fi

echo "✅ MFA deactivation process completed!"
echo ""
echo "🔍 Verifying MFA status..."
aws iam list-mfa-devices --user-name "$USERNAME" 2>&1 | grep -q "\[\]" && echo "✅ Confirmed: No MFA devices active" || echo "⚠️  Some MFA devices may still be active"

