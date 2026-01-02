#!/usr/bin/env python3
"""
Update Lambda function environment variables to add SMS configuration
"""
import json
import sys
import subprocess

function_name = "scrapmate-node-api-production"
region = "ap-south-1"

# SMS configuration values
# Note: AWS Lambda env vars must start with a letter, so we only use SMS_* keys (not 4SMS_*)
# The code checks for both 4SMS_* and SMS_* keys, so SMS_* will work
sms_config = {
    "SMS_API_URL_NEW": "http://4sms.alp-ts.com/api/sms/v1.0/send-sms",
    "SMS_API_ENITYID": "1701173389563945545",
    "SMS_API_TOKEN": "EVLZ8267TMY1O2Z",
    "SMS_API_KEY": "/BR2+k;L(-aPKA@r%5SO*GzcCm8&Hg6o",
    "SMS_HEADER_CENTER_ID": "SCRPMT"
}

# Get current environment variables
print(f"🔍 Fetching current environment variables from {function_name}...")
result = subprocess.run(
    ["aws", "lambda", "get-function-configuration",
     "--function-name", function_name,
     "--region", region,
     "--query", "Environment.Variables",
     "--output", "json"],
    capture_output=True,
    text=True
)

if result.returncode != 0:
    print(f"❌ Error fetching current configuration: {result.stderr}")
    sys.exit(1)

current_env = json.loads(result.stdout)
print(f"✅ Current environment variables: {len(current_env)} variables")

# Merge with SMS configuration
updated_env = {**current_env, **sms_config}
print(f"✅ Updated environment variables: {len(updated_env)} variables")
print(f"   Added SMS configuration variables")

# Update Lambda function - use environment Variables parameter
print(f"\n📤 Updating Lambda function environment variables...")
env_json_str = json.dumps({"Variables": updated_env})
update_result = subprocess.run(
    ["aws", "lambda", "update-function-configuration",
     "--function-name", function_name,
     "--region", region,
     "--environment", env_json_str],
    capture_output=True,
    text=True
)

if update_result.returncode != 0:
    print(f"❌ Error updating configuration: {update_result.stderr}")
    sys.exit(1)

updated_config = json.loads(update_result.stdout)
print(f"✅ Successfully updated Lambda function!")
print(f"\n📋 Updated environment variables:")
for key in sorted(updated_config["Environment"]["Variables"].keys()):
    value = updated_config["Environment"]["Variables"][key]
    if "KEY" in key or "TOKEN" in key or "SECRET" in key or "PRIVATE" in key:
        display_value = f"{value[:10]}..." if len(value) > 10 else "***"
    else:
        display_value = value
    print(f"   ✅ {key}: {display_value}")

