#!/bin/bash

# Script to merge developer branch to main for deployment
# Only run this when you're ready to deploy to production

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

if [ "$CURRENT_BRANCH" != "developer" ]; then
    echo "⚠️  Warning: You're not on the developer branch (currently on: $CURRENT_BRANCH)"
    read -p "Do you want to switch to developer branch first? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git checkout developer
    else
        echo "❌ Aborted. Please run this script from the developer branch."
        exit 1
    fi
fi

echo "🔄 Merging developer branch to main for deployment..."
echo ""

# Make sure we have latest changes
echo "📥 Pulling latest developer changes..."
git pull origin developer 2>/dev/null

# Switch to main
echo "🔄 Switching to main branch..."
git checkout main

# Pull latest main
echo "📥 Pulling latest main branch..."
git pull origin main 2>/dev/null

# Merge developer into main
echo "🔀 Merging developer → main..."
git merge developer --no-ff -m "Merge developer branch to main for production deployment"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully merged developer → main"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Review the merge: git log --oneline -5"
    echo "   2. Push to main: git push origin main"
    echo "   3. Switch back to developer: git checkout developer"
    echo ""
    read -p "Do you want to push to main now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git push origin main
        echo ""
        echo "✅ Pushed to main branch"
        echo ""
        read -p "Switch back to developer branch? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git checkout developer
            echo "✅ Switched back to developer branch"
        fi
    else
        echo "⚠️  Remember to push later: git push origin main"
    fi
else
    echo ""
    echo "❌ Merge conflict detected!"
    echo "⚠️  Please resolve conflicts and complete the merge manually"
    echo "   After resolving: git add . && git commit"
    exit 1
fi


