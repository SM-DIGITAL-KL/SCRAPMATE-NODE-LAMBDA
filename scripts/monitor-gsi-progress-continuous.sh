#!/bin/bash

# Continuous monitoring script for GSI creation progress
# Usage: ./monitor-gsi-progress-continuous.sh [index-name]
# Press Ctrl+C to stop

TABLE_NAME="users"
REGION="ap-south-1"
INDEX_NAME="${1:-}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Continuous GSI Progress Monitor${NC}"
echo "Table: $TABLE_NAME | Region: $REGION"
if [ -n "$INDEX_NAME" ]; then
    echo "Monitoring: $INDEX_NAME"
fi
echo "Press Ctrl+C to stop"
echo ""

# Function to get GSI progress from CloudWatch
get_gsi_progress() {
    local index_name=$1
    
    local progress=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/DynamoDB \
        --metric-name OnlineIndexPercentageProgress \
        --dimensions Name=TableName,Value=$TABLE_NAME Name=GlobalSecondaryIndexName,Value=$index_name \
        --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
        --period 60 \
        --statistics Average \
        --region $REGION \
        --query 'Datapoints[0].Average' \
        --output text 2>/dev/null)
    
    if [ -z "$progress" ] || [ "$progress" == "None" ]; then
        echo "N/A"
    else
        printf "%.2f" "$progress"
    fi
}

# Function to get GSI status
get_gsi_status() {
    local index_name=$1
    
    aws dynamodb describe-table \
        --table-name $TABLE_NAME \
        --region $REGION \
        --query "Table.GlobalSecondaryIndexes[?IndexName=='$index_name'].IndexStatus" \
        --output text 2>/dev/null
}

# Trap Ctrl+C
trap 'echo ""; echo "Monitoring stopped."; exit 0' INT

# Continuous monitoring loop
while true; do
    clear
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📊 GSI Creation Progress Monitor${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    if [ -z "$INDEX_NAME" ]; then
        # Monitor all GSIs
        GSIS=$(aws dynamodb describe-table \
            --table-name $TABLE_NAME \
            --region $REGION \
            --query 'Table.GlobalSecondaryIndexes[*].IndexName' \
            --output text 2>/dev/null)
        
        if [ -z "$GSIS" ]; then
            echo "❌ No GSIs found"
            sleep 30
            continue
        fi
        
        for index in $GSIS; do
            status=$(get_gsi_status "$index")
            progress=$(get_gsi_progress "$index")
            
            if [ "$status" == "ACTIVE" ]; then
                echo -e "${GREEN}✅ $index${NC}"
                echo "   Status: $status"
                echo "   Progress: 100.00% (Complete)"
            elif [ "$status" == "CREATING" ]; then
                if [ "$progress" != "N/A" ]; then
                    progress_num=$(echo "$progress" | awk '{print int($1)}')
                    echo -e "${YELLOW}⏳ $index${NC}"
                    echo "   Status: $status"
                    echo "   Progress: ${progress}%"
                    # Progress bar
                    bar_length=30
                    filled=$((progress_num * bar_length / 100))
                    bar=$(printf "%${filled}s" | tr ' ' '█')
                    empty=$(printf "%$((bar_length - filled))s" | tr ' ' '░')
                    echo "   [$bar$empty]"
                else
                    echo -e "${YELLOW}⏳ $index${NC}"
                    echo "   Status: $status"
                    echo "   Progress: Waiting for metrics..."
                fi
            else
                echo "📌 $index"
                echo "   Status: $status"
                echo "   Progress: $progress"
            fi
            echo ""
        done
    else
        # Monitor specific GSI
        status=$(get_gsi_status "$INDEX_NAME")
        progress=$(get_gsi_progress "$INDEX_NAME")
        
        if [ "$status" == "ACTIVE" ]; then
            echo -e "${GREEN}✅ $INDEX_NAME${NC}"
            echo "   Status: $status"
            echo "   Progress: 100.00% (Complete)"
        elif [ "$status" == "CREATING" ]; then
            if [ "$progress" != "N/A" ]; then
                progress_num=$(echo "$progress" | awk '{print int($1)}')
                echo -e "${YELLOW}⏳ $INDEX_NAME${NC}"
                echo "   Status: $status"
                echo "   Progress: ${progress}%"
                # Progress bar
                bar_length=40
                filled=$((progress_num * bar_length / 100))
                bar=$(printf "%${filled}s" | tr ' ' '█')
                empty=$(printf "%$((bar_length - filled))s" | tr ' ' '░')
                echo "   [$bar$empty]"
            else
                echo -e "${YELLOW}⏳ $INDEX_NAME${NC}"
                echo "   Status: $status"
                echo "   Progress: Waiting for metrics..."
            fi
        else
            echo "📌 $INDEX_NAME"
            echo "   Status: $status"
            echo "   Progress: $progress"
        fi
    fi
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Refreshing in 30 seconds... (Ctrl+C to stop)"
    
    sleep 30
done
