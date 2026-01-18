#!/bin/bash

# Script to ensure you're always on the developer branch
# Use this when starting work on any device

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

if [ "$CURRENT_BRANCH" != "developer" ]; then
    echo "🔄 Switching from '$CURRENT_BRANCH' to 'developer' branch..."
    git checkout developer 2>/dev/null || git checkout -b developer 2>/dev/null
    echo "✅ Now on developer branch"
else
    echo "✅ Already on developer branch"
fi

# Pull latest changes
echo "📥 Pulling latest changes from developer branch..."
git pull origin developer 2>/dev/null || echo "ℹ️  No remote changes or remote not set"

echo ""
echo "✅ Ready to work on developer branch!"
echo "📋 Current branch: $(git branch --show-current)"

