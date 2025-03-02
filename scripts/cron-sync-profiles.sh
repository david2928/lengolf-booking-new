#!/bin/bash

# Set the working directory to the project root
cd "$(dirname "$0")/.."

# Load environment variables if needed
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

# Run the sync script
echo "Running CRM profile sync at $(date)"
node scripts/sync-all-profiles.js

# Log completion
echo "Sync completed at $(date)" 