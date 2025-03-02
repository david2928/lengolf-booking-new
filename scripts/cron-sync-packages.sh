#!/bin/bash

# Set the working directory to the project root
cd "$(dirname "$0")/.."

# Load environment variables if needed
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

# Run the sync script
echo "Running CRM package sync at $(date)"
node scripts/sync-crm-packages.js

# Log completion
echo "Sync completed at $(date)" 