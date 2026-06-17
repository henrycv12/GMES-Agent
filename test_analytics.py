#!/usr/bin/env python3
"""
Test script for the GMES Agent analytics endpoint.
Usage: python test_analytics.py --group_by line --date_from 2026-01-01 --date_to 2026-03-31 --top_n 10 --filter "diverter jam"
"""

import argparse
import json
import os
import sys
from datetime import datetime

import requests

# Configuration
API_BASE_URL = os.environ.get("GMES_API_URL", "https://gmes-agent-api.azurewebsites.net/api")
FUNCTION_KEY = os.environ.get("GMES_FUNCTION_KEY", "")  # Set this environment variable or pass via --key


def call_analytics(group_by, date_from=None, date_to=None, top_n=10, filter_text="", function_key="", api_base_url=API_BASE_URL, compare_lines=None, time_group=None):
    """Call the analytics endpoint and return results."""
    url = f"{api_base_url}/analytics"
    
    headers = {
        "Content-Type": "application/json",
    }
    
    if function_key:
        headers["x-functions-key"] = function_key
    
    payload = {
        "group_by": group_by,
        "top_n": top_n,
    }
    
    if date_from:
        payload["date_from"] = date_from
    if date_to:
        payload["date_to"] = date_to
    if filter_text:
        payload["filter"] = filter_text
    if compare_lines:
        payload["compare_lines"] = compare_lines
    if time_group:
        payload["time_group"] = time_group
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error calling analytics endpoint: {e}", file=sys.stderr)
        if hasattr(e, "response") and e.response is not None:
            print(f"Response: {e.response.text}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Test GMES Agent analytics endpoint")
    parser.add_argument("--group_by", default="line", 
                        help="Field to group by (line, equipment, maint_type, group) or comma-separated for multi-field (e.g., 'line,maint_type')")
    parser.add_argument("--date_from", help="Start date in ISO format (e.g., 2026-01-01)")
    parser.add_argument("--date_to", help="End date in ISO format (e.g., 2026-03-31)")
    parser.add_argument("--top_n", type=int, default=10, help="Number of top results (default: 10)")
    parser.add_argument("--filter", default="", help="Optional text filter (e.g., 'diverter jam')")
    parser.add_argument("--compare_lines", default="", help="Comma-separated lines to compare (e.g., 'EPS Line 1,Press Line 1')")
    parser.add_argument("--time_group", choices=["week", "month", "quarter"], help="Time-based aggregation (week, month, quarter)")
    parser.add_argument("--key", default=FUNCTION_KEY, help="Azure Functions key (or set GMES_FUNCTION_KEY env var)")
    parser.add_argument("--url", default=API_BASE_URL, help="API base URL (or set GMES_API_URL env var)")
    
    args = parser.parse_args()
    
    # Parse multi-field group_by
    group_by = args.group_by
    if "," in group_by:
        group_by = [f.strip() for f in group_by.split(",")]
    
    # Parse compare_lines
    compare_lines = None
    if args.compare_lines:
        compare_lines = [f.strip() for f in args.compare_lines.split(",")]
    
    print(f"Calling analytics endpoint...")
    print(f"  Group by: {group_by}")
    print(f"  Date range: {args.date_from} to {args.date_to}")
    print(f"  Top N: {args.top_n}")
    print(f"  Filter: {args.filter if args.filter else '(none)'}")
    print(f"  Compare lines: {compare_lines if compare_lines else '(none)'}")
    print(f"  Time group: {args.time_group if args.time_group else '(none)'}")
    print()
    
    results = call_analytics(
        group_by=group_by,
        date_from=args.date_from,
        date_to=args.date_to,
        top_n=args.top_n,
        filter_text=args.filter,
        function_key=args.key,
        api_base_url=args.url,
        compare_lines=compare_lines,
        time_group=args.time_group
    )
    
    print("Results:")
    print("=" * 60)
    print(f"Grouped by: {results['group_by']}")
    print(f"Date range: {results['date_from']} to {results['date_to']}")
    print(f"Filter: {results['filter'] if results['filter'] else '(none)'}")
    print()
    print("Top results:")
    for i, item in enumerate(results['results'], 1):
        print(f"  {i}. {item['value']}: {item['count']} work orders")
    print()
    print("Full JSON:")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
