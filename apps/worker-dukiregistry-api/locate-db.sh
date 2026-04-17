#!/bin/bash

# Define the search directory relative to the script location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SEARCH_DIR="$SCRIPT_DIR/.wrangler/state/v3/d1"

if [ ! -d "$SEARCH_DIR" ]; then
    echo "Error: Directory $SEARCH_DIR does not exist."
    echo "Make sure you have run 'pnpm dev' (wrangler dev) at least once."
    exit 1
fi

# Find the .sqlite file
# We use 'find' to locate file ending in .sqlite
DB_FILES=$(find "$SEARCH_DIR" -name "*.sqlite")

if [ -z "$DB_FILES" ]; then
    echo "No .sqlite database files found in $SEARCH_DIR"
    exit 1
fi

# Count number of files found
COUNT=$(echo "$DB_FILES" | wc -l | xargs)

if [ "$COUNT" -gt 1 ]; then
    echo "Found multiple database files:"
    echo "$DB_FILES"
    echo ""
    echo "You can check which one corresponds to your DB binding."
else
    echo "Found local D1 database:"
    echo "$DB_FILES"
fi
