#!/usr/bin/env python3
"""
DynamoDB cost breakdown via AWS Cost Explorer.
Run: python3 scripts/dynamodb-cost-explorer.py [--days 5] [--profile default]
Requires: aws cli, ce:GetCostAndUsage permission.
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta


def main():
    ap = argparse.ArgumentParser(description="DynamoDB cost by USAGE_TYPE (reads/writes/storage)")
    ap.add_argument("--days", type=int, default=5, help="Number of days to query (default 5)")
    ap.add_argument("--profile", default="default", help="AWS profile")
    ap.add_argument("--region", default="us-east-1", help="CE API region (us-east-1)")
    args = ap.parse_args()

    end = datetime.utcnow().date()
    start = end - timedelta(days=args.days)
    start_s = start.isoformat()
    end_s = end.isoformat()

    filt = {"Dimensions": {"Key": "SERVICE", "Values": ["Amazon DynamoDB"]}}
    filt_path = "/tmp/ddb-ce-filter.json"
    with open(filt_path, "w") as f:
        json.dump(filt, f)

    cmd = [
        "aws", "ce", "get-cost-and-usage",
        "--time-period", f"Start={start_s},End={end_s}",
        "--granularity", "DAILY",
        "--metrics", "UnblendedCost", "UsageQuantity",
        "--group-by", "Type=DIMENSION,Key=USAGE_TYPE",
        "--filter", f"file://{filt_path}",
        "--profile", args.profile,
        "--region", args.region,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(out.stdout)
    except subprocess.CalledProcessError as e:
        print(e.stderr or str(e), file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print("Failed to parse Cost Explorer output:", e, file=sys.stderr)
        sys.exit(1)

    print("════════════════════════════════════════════════════════════")
    print("DynamoDB cost by USAGE_TYPE (Cost Explorer)")
    print("════════════════════════════════════════════════════════════")
    print(f"  Period: {start_s} → {end_s}  ({args.days} days)")
    print(f"  Profile: {args.profile}")
    print("════════════════════════════════════════════════════════════\n")

    results = data.get("ResultsByTime") or []
    grand_total = 0.0
    by_type = {}

    for r in results:
        period = r.get("TimePeriod") or {}
        start_d = period.get("Start", "")
        groups = r.get("Groups") or []
        day_total = 0.0
        for g in groups:
            keys = g.get("Keys") or []
            usage_type = keys[0] if keys else "?"
            m = g.get("Metrics") or {}
            cost = float(m.get("UnblendedCost", {}).get("Amount", 0) or 0)
            qty = m.get("UsageQuantity", {}).get("Amount", "0")
            try:
                qty_f = float(qty)
                qty_s = f"{qty_f:,.0f}" if qty_f >= 1000 else f"{qty_f:.2f}"
            except (TypeError, ValueError):
                qty_s = str(qty)
            day_total += cost
            grand_total += cost
            by_type[usage_type] = by_type.get(usage_type, 0) + cost
            print(f"  {start_d}  {usage_type:32s}  ${cost:7.4f}  (usage: {qty_s})")
        if groups:
            print(f"  {start_d}  {'(day total)':32s}  ${day_total:7.4f}")
            print("")

    print("--------------------------------------------------------------------------------")
    print("Totals by USAGE_TYPE (all days):")
    for k, v in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"  {k:32s}  ${v:.4f}")
    print("--------------------------------------------------------------------------------")
    print(f"  Grand total (DynamoDB): ${grand_total:.4f}")
    print("")
    print("  ReadRequestUnits = RCU (reads). WriteRequestUnits = WCU (writes).")
    print("  APS3 = ap-south-1 (Mumbai). Use --region ap-south-1 for check-dynamodb-rru-cloudwatch.sh.")
    print("  Storage, backups, PITR appear as separate USAGE_TYPEs.")
    print("")


if __name__ == "__main__":
    main()
