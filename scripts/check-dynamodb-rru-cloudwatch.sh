#!/usr/bin/env bash
#
# Fetch DynamoDB ConsumedReadCapacityUnits (RCU) and ConsumedWriteCapacityUnits (WCU)
# per table and Global Secondary Index (GSI) from CloudWatch. Use this to see which
# tables and GSIs drive high RRU/WRU and billing.
#
# Prerequisites: AWS CLI configured (aws configure) with access to DynamoDB + CloudWatch.
#
# Usage:
#   ./scripts/check-dynamodb-rru-cloudwatch.sh [OPTIONS]
#
# Options:
#   --hours N     Time window (default: 24). Use 1, 6, 24, 48, 72.
#   --period N    CloudWatch period in seconds (default: 300 = 5 min). Max 1440 pts.
#   --region R    AWS region (default: from AWS_REGION or aws configure).
#   --profile P   AWS profile (default: default).
#   --tables T    Comma-separated table names.
#   --all-tables   Use all DynamoDB tables (default: high-RRU set). Excludes dev_*.
#   --include-dev  With --all-tables, include dev_* tables (default: exclude).
#   --reads-only   Only fetch RCU (default: fetch both RCU and WCU).
#   --verbose      Print per-period values to spot spikes.
#
# Examples:
#   ./scripts/check-dynamodb-rru-cloudwatch.sh --hours 48 --all-tables
#   ./scripts/check-dynamodb-rru-cloudwatch.sh --hours 6 --verbose
#   ./scripts/check-dynamodb-rru-cloudwatch.sh --tables users,orders,shops
#

set -e

HOURS=24
PERIOD=300
REGION="${AWS_REGION:-}"
PROFILE="${AWS_PROFILE:-default}"
TABLES=""
ALL_TABLES=0
READS_ONLY=0
VERBOSE=0
INCLUDE_DEV=0
AWS_EXTRA=()

# Default: high-RRU tables from Scan-heavy APIs (see DYNAMODB_RRU_SCAN_AUDIT.md)
DEFAULT_TABLES="users,orders,shops,customer,addresses,bulk_message_notifications"

while [[ $# -gt 0 ]]; do
  case $1 in
    --hours)       HOURS="$2";   shift 2 ;;
    --period)      PERIOD="$2";  shift 2 ;;
    --region)      REGION="$2";  shift 2 ;;
    --profile)     PROFILE="$2"; shift 2 ;;
    --tables)      TABLES="$2";  shift 2 ;;
    --all-tables)  ALL_TABLES=1; shift   ;;
    --include-dev) INCLUDE_DEV=1; shift   ;;
    --reads-only)  READS_ONLY=1; shift   ;;
    --verbose)     VERBOSE=1;    shift   ;;
    *)             echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -n "$REGION" ]]; then
  AWS_EXTRA+=(--region "$REGION")
fi
AWS_EXTRA+=(--profile "$PROFILE")

# 1440 data points max; keep (hours * 3600 / period) <= 1440
MAX_HOURS=$(( 1440 * PERIOD / 3600 ))
if [[ $HOURS -gt $MAX_HOURS ]]; then
  echo "⚠️  Reducing --hours to $MAX_HOURS (period $PERIOD s, max 1440 points)."
  HOURS=$MAX_HOURS
fi

END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if date -u -v-${HOURS}H +%Y-%m-%dT%H:%M:%SZ &>/dev/null; then
  START=$(date -u -v-${HOURS}H +%Y-%m-%dT%H:%M:%SZ)
else
  START=$(date -u -d "${HOURS} hours ago" +%Y-%m-%dT%H:%M:%SZ)
fi

echo "════════════════════════════════════════════════════════════"
echo "DynamoDB RCU/WCU (Tables + GSIs) — CloudWatch"
echo "════════════════════════════════════════════════════════════"
echo "  Window:  $START → $END  (last $HOURS h)"
echo "  Period:  ${PERIOD}s"
echo "  Profile: $PROFILE"
[[ -n "$REGION" ]] && echo "  Region:  $REGION"
echo "════════════════════════════════════════════════════════════"

if [[ -z "$TABLES" ]]; then
  if [[ $ALL_TABLES -eq 1 ]]; then
    [[ $INCLUDE_DEV -eq 1 ]] && echo "  Listing all DynamoDB tables (incl. dev_*)..." || echo "  Listing DynamoDB tables (excluding dev_*)..."
    RAW=$(aws dynamodb list-tables "${AWS_EXTRA[@]}" --output text --query 'TableNames[*]' | tr '\t' '\n')
    if [[ -z "$RAW" ]]; then
      echo "  No tables found. Check AWS credentials and region."
      exit 1
    fi
    if [[ $INCLUDE_DEV -eq 0 ]]; then
      TABLES=$(echo "$RAW" | grep -v '^dev_' | tr '\n' ',' | sed 's/,$//')
    else
      TABLES=$(echo "$RAW" | tr '\n' ',' | sed 's/,$//')
    fi
    if [[ -z "$TABLES" ]]; then
      echo "  No prod tables (all are dev_*). Use --include-dev to include dev_*."
      exit 1
    fi
  else
    TABLES="$DEFAULT_TABLES"
    echo "  Using default tables (--all-tables for all, excl. dev_*): $TABLES"
  fi
fi

# Split comma-separated list
IFS=',' read -ra TARR <<< "$TABLES"

fetch_metric() {
  local tn="$1"
  local metric="$2"
  local gsi_name="${3:-}"
  if [[ -n "$gsi_name" ]]; then
    aws cloudwatch get-metric-statistics \
      --namespace AWS/DynamoDB \
      --metric-name "$metric" \
      --dimensions "Name=TableName,Value=$tn" "Name=GlobalSecondaryIndexName,Value=$gsi_name" \
      --start-time "$START" \
      --end-time "$END" \
      --period "$PERIOD" \
      --statistics Sum Maximum Average SampleCount \
      "${AWS_EXTRA[@]}" \
      --output json 2>/dev/null || echo '{"Datapoints":[]}'
  else
    aws cloudwatch get-metric-statistics \
      --namespace AWS/DynamoDB \
      --metric-name "$metric" \
      --dimensions "Name=TableName,Value=$tn" \
      --start-time "$START" \
      --end-time "$END" \
      --period "$PERIOD" \
      --statistics Sum Maximum Average SampleCount \
      "${AWS_EXTRA[@]}" \
      --output json 2>/dev/null || echo '{"Datapoints":[]}'
  fi
}

# Get list of GSIs for a table
get_table_gsis() {
  local tn="$1"
  aws dynamodb describe-table \
    --table-name "$tn" \
    "${AWS_EXTRA[@]}" \
    --output json 2>/dev/null | \
    jq -r '.Table.GlobalSecondaryIndexes[]?.IndexName // empty' 2>/dev/null || echo ""
}

if command -v jq &>/dev/null; then
  HAS_JQ=1
else
  HAS_JQ=0
  echo "  Install 'jq' for per-table RCU/WCU breakdown (brew install jq / apt install jq)."
fi

jq_sum() {
  echo "$1" | jq '([.Datapoints[].Sum // 0] | add // 0) | floor'
}
jq_max() {
  echo "$1" | jq '([.Datapoints[].Maximum // 0] | (max // 0)) | floor'
}

if [[ $READS_ONLY -eq 1 ]]; then
  echo ""
  printf "%-40s %14s %14s %12s\n" "Table" "Total RCU" "Max (period)" "Avg/period"
  echo "--------------------------------------------------------------------------------"
  TOTAL_RCU=0
  TOTAL_GSI_RCU=0
  for tn in "${TARR[@]}"; do
    tn=$(echo "$tn" | xargs)
    [[ -z "$tn" ]] && continue
    out=$(fetch_metric "$tn" "ConsumedReadCapacityUnits")
    if [[ $HAS_JQ -eq 1 ]]; then
      sum=$(jq_sum "$out"); sum=${sum:-0}
      max=$(jq_max "$out"); max=${max:-0}
      n=$(echo "$out" | jq '.Datapoints | length')
      avg=0
      [[ "${n:-0}" -gt 0 ]] && avg=$(echo "$out" | jq '([.Datapoints[].Average // 0] | add / length) | floor')
      avg=${avg:-0}
    else
      sum=0; max=0; avg=0
    fi
    TOTAL_RCU=$(( TOTAL_RCU + sum ))
    printf "%-40s %14d %14d %12d\n" "$tn" "$sum" "$max" "$avg"
    if [[ $VERBOSE -eq 1 && $HAS_JQ -eq 1 ]]; then
      echo "$out" | jq -r '.Datapoints | sort_by(.Timestamp)[] | "    \(.Timestamp)  Sum=\(.Sum // 0)  Max=\(.Maximum // 0)"'
      echo ""
    fi
    
    # Fetch GSI metrics
    if [[ $HAS_JQ -eq 1 ]]; then
      gsis=$(get_table_gsis "$tn")
      if [[ -n "$gsis" ]]; then
        while IFS= read -r gsi; do
          [[ -z "$gsi" ]] && continue
          out_gsi=$(fetch_metric "$tn" "ConsumedReadCapacityUnits" "$gsi")
          sum_gsi=$(jq_sum "$out_gsi"); sum_gsi=${sum_gsi:-0}
          max_gsi=$(jq_max "$out_gsi"); max_gsi=${max_gsi:-0}
          n_gsi=$(echo "$out_gsi" | jq '.Datapoints | length')
          avg_gsi=0
          [[ "${n_gsi:-0}" -gt 0 ]] && avg_gsi=$(echo "$out_gsi" | jq '([.Datapoints[].Average // 0] | add / length) | floor')
          avg_gsi=${avg_gsi:-0}
          TOTAL_GSI_RCU=$(( TOTAL_GSI_RCU + sum_gsi ))
          printf "  └─ GSI: %-35s %14d %14d %12d\n" "$gsi" "$sum_gsi" "$max_gsi" "$avg_gsi"
          if [[ $VERBOSE -eq 1 ]]; then
            echo "$out_gsi" | jq -r '.Datapoints | sort_by(.Timestamp)[] | "      \(.Timestamp)  Sum=\(.Sum // 0)  Max=\(.Maximum // 0)"'
            echo ""
          fi
        done <<< "$gsis"
      fi
    fi
  done
  echo "--------------------------------------------------------------------------------"
  echo ""
  echo "Total RCU (all tables): $TOTAL_RCU"
  if [[ $TOTAL_GSI_RCU -gt 0 ]]; then
    echo "Total RCU (all GSIs): $TOTAL_GSI_RCU"
    echo "Total RCU (tables + GSIs): $(( TOTAL_RCU + TOTAL_GSI_RCU ))"
  fi
else
  echo ""
  printf "%-36s %12s %12s %12s %12s\n" "Table" "Total RCU" "Total WCU" "Max RCU" "Max WCU"
  echo "--------------------------------------------------------------------------------------------"
  TOTAL_RCU=0
  TOTAL_WCU=0
  TOTAL_GSI_RCU=0
  TOTAL_GSI_WCU=0
  for tn in "${TARR[@]}"; do
    tn=$(echo "$tn" | xargs)
    [[ -z "$tn" ]] && continue
    out_r=$(fetch_metric "$tn" "ConsumedReadCapacityUnits")
    out_w=$(fetch_metric "$tn" "ConsumedWriteCapacityUnits")
    if [[ $HAS_JQ -eq 1 ]]; then
      sum_r=$(jq_sum "$out_r"); sum_r=${sum_r:-0}
      max_r=$(jq_max "$out_r"); max_r=${max_r:-0}
      sum_w=$(jq_sum "$out_w"); sum_w=${sum_w:-0}
      max_w=$(jq_max "$out_w"); max_w=${max_w:-0}
    else
      sum_r=0; max_r=0; sum_w=0; max_w=0
    fi
    TOTAL_RCU=$(( TOTAL_RCU + sum_r ))
    TOTAL_WCU=$(( TOTAL_WCU + sum_w ))
    printf "%-36s %12d %12d %12d %12d\n" "$tn" "$sum_r" "$sum_w" "$max_r" "$max_w"
    if [[ $VERBOSE -eq 1 && $HAS_JQ -eq 1 ]]; then
      echo "  RCU:" && echo "$out_r" | jq -r '.Datapoints | sort_by(.Timestamp)[] | "    \(.Timestamp)  Sum=\(.Sum // 0)"'
      echo "  WCU:" && echo "$out_w" | jq -r '.Datapoints | sort_by(.Timestamp)[] | "    \(.Timestamp)  Sum=\(.Sum // 0)"'
      echo ""
    fi
    
    # Fetch GSI metrics
    if [[ $HAS_JQ -eq 1 ]]; then
      gsis=$(get_table_gsis "$tn")
      if [[ -n "$gsis" ]]; then
        while IFS= read -r gsi; do
          [[ -z "$gsi" ]] && continue
          out_gsi_r=$(fetch_metric "$tn" "ConsumedReadCapacityUnits" "$gsi")
          out_gsi_w=$(fetch_metric "$tn" "ConsumedWriteCapacityUnits" "$gsi")
          sum_gsi_r=$(jq_sum "$out_gsi_r"); sum_gsi_r=${sum_gsi_r:-0}
          max_gsi_r=$(jq_max "$out_gsi_r"); max_gsi_r=${max_gsi_r:-0}
          sum_gsi_w=$(jq_sum "$out_gsi_w"); sum_gsi_w=${sum_gsi_w:-0}
          max_gsi_w=$(jq_max "$out_gsi_w"); max_gsi_w=${max_gsi_w:-0}
          TOTAL_GSI_RCU=$(( TOTAL_GSI_RCU + sum_gsi_r ))
          TOTAL_GSI_WCU=$(( TOTAL_GSI_WCU + sum_gsi_w ))
          printf "  └─ GSI: %-31s %12d %12d %12d %12d\n" "$gsi" "$sum_gsi_r" "$sum_gsi_w" "$max_gsi_r" "$max_gsi_w"
          if [[ $VERBOSE -eq 1 ]]; then
            echo "    RCU:" && echo "$out_gsi_r" | jq -r '.Datapoints | sort_by(.Timestamp)[] | "      \(.Timestamp)  Sum=\(.Sum // 0)"'
            echo "    WCU:" && echo "$out_gsi_w" | jq -r '.Datapoints | sort_by(.Timestamp)[] | "      \(.Timestamp)  Sum=\(.Sum // 0)"'
            echo ""
          fi
        done <<< "$gsis"
      fi
    fi
  done
  echo "--------------------------------------------------------------------------------------------"
  echo ""
  echo "Total RCU (all tables): $TOTAL_RCU"
  echo "Total WCU (all tables): $TOTAL_WCU"
  if [[ $TOTAL_GSI_RCU -gt 0 || $TOTAL_GSI_WCU -gt 0 ]]; then
    echo "Total RCU (all GSIs): $TOTAL_GSI_RCU"
    echo "Total WCU (all GSIs): $TOTAL_GSI_WCU"
    echo "Total RCU (tables + GSIs): $(( TOTAL_RCU + TOTAL_GSI_RCU ))"
    echo "Total WCU (tables + GSIs): $(( TOTAL_WCU + TOTAL_GSI_WCU ))"
  fi
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "Which API is causing RCU? (Table → likely routes)"
echo "════════════════════════════════════════════════════════════"
echo "  users     → /admin/customers, /admin/b2b-users, /admin/b2c-users,"
echo "              /admin/new-users, /admin/delivery-users, /admin/sr-users,"
echo "              /admin/dashboard/*, /admin/signUpReport, /admin/custNotification,"
echo "              /admin/vendorNotification"
echo "  orders    → /customer/orders, /customer/view-orders, /customer/recent-orders/:id,"
echo "              /admin/dashboard/recent-orders, Order.getAll, Order.findByCustomerId,"
echo "              Order.findByOrderNo, Order.findByDeliveryBoyId (v2 stats/earnings/recycling)"
echo "  shops     → /admin/b2b-users, /admin/b2c-users, /admin/new-users (Shop enrichment)"
echo "  customer  → /admin/customers (Customer.findByUserIdsBulk)"
echo "  addresses → /admin/customers (Address.findByCustomerIdsBulk)"
echo ""
echo "  To correlate: Set LOG_DYNAMODB_HIGH_RRU=1, run your Node API, then grep logs for"
echo "  [DYNAMODB-HIGH-RRU]. Match timestamps with --verbose spikes above."
echo "  See docs/DYNAMODB_RRU_SCAN_AUDIT.md and middleware/dynamodbHighRruLogMiddleware.js"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "If CloudWatch shows 0 but you have DynamoDB billing (~\$2.5/day):"
echo "════════════════════════════════════════════════════════════"
echo "  1. Region: metrics are per-region. Use --region <prod-region>."
echo "     Cost Explorer APS3 = ap-south-1 (Mumbai). Try: --region ap-south-1"
echo "     Confirm tables: aws dynamodb list-tables --region <region>"
echo "  2. Writes: WCU (writes) also drive cost. This script now shows both RCU+WCU."
echo "  3. Cost Explorer: see what drives DynamoDB cost (reads/writes/storage):"
echo '     echo '"'"'{"Dimensions":{"Key":"SERVICE","Values":["Amazon DynamoDB"]}}'"'"' > /tmp/ddb-ce-filter.json'
echo "     aws ce get-cost-and-usage --time-period Start=2026-01-23,End=2026-01-26 \\"
echo "       --granularity DAILY --metrics UnblendedCost UsageQuantity \\"
echo "       --group-by Type=DIMENSION,Key=USAGE_TYPE --filter file:///tmp/ddb-ce-filter.json"
echo "     (Requires IAM ce:GetCostAndUsage. Or use AWS Console → Billing → Cost Explorer.)"
echo "  4. Storage / backups / PITR / streams also add to DynamoDB cost."
echo ""
