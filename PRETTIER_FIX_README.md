# Prettier Auto-Format Prevention Guide

## The Problem

When you commit changes and close Cursor/VSCode, then reopen it later, you see many files marked as "modified" even though you didn't change them. This is caused by:

1. **Format on Save** being enabled in your editor
2. **Prettier** auto-formatting files when you open them
3. Files having slightly different formatting than what Prettier expects

## The Solution (Applied)

### 1. ✅ Created `.prettierignore`
This file tells Prettier to skip certain files:
- All `*.md` files (documentation)
- All `scripts/*.js` and `scripts/*.ts` (utility scripts)
- Generated files, builds, node_modules, etc.

### 2. ✅ Created `.vscode/settings.json`
This disables auto-formatting in the workspace:
```json
{
  "editor.formatOnSave": false,
  "editor.formatOnPaste": false,
  "editor.formatOnType": false
}
```

### 3. ✅ Created Pre-commit Hook
Located at `.githooks/pre-commit`, this hook prevents you from accidentally committing formatting-only changes.

## Setup Instructions

### Step 1: Configure Git to Use Custom Hooks
Run this command once in your repository:

```bash
cd /home/atiqul-islam/scorenews-backend-git
git config core.hooksPath .githooks
```

### Step 2: Commit These Changes
```bash
git add .prettierignore .vscode/settings.json .githooks/pre-commit
git commit -m "fix: prevent Prettier auto-formatting issues"
git push origin developer
```

### Step 3: Copy Settings to Your Local Working Directory
If you're working in `/home/atiqul-islam/Cricinfo-main/backend-nestjs/`, copy these files there too:

```bash
cp /home/atiqul-islam/scorenews-backend-git/.prettierignore /home/atiqul-islam/Cricinfo-main/backend-nestjs/
cp -r /home/atiqul-islam/scorenews-backend-git/.vscode /home/atiqul-islam/Cricinfo-main/backend-nestjs/
```

## How to Format Code (When You Want To)

Instead of auto-formatting everything, manually format only the files you're editing:

```bash
# Format a specific file
npx prettier --write src/modules/cricket/services/sportsmonks.service.ts

# Format all files in a directory
npx prettier --write "src/modules/cricket/**/*.ts"

# Check formatting without modifying files
npx prettier --check "src/**/*.ts"
```

## Troubleshooting

### If you still see uncommitted changes:
1. Check if changes are real or just formatting:
   ```bash
   git diff --ignore-all-space src/path/to/file.ts
   ```

2. If output is empty, it's just formatting. Discard it:
   ```bash
   git restore src/path/to/file.ts
   ```

3. If you want to format everything once and commit it:
   ```bash
   npx prettier --write "src/**/*.{ts,js,json}"
   git add .
   git commit -m "chore: apply prettier formatting"
   ```

### If pre-commit hook doesn't work:
```bash
# Check if hooks are configured
git config core.hooksPath

# Should output: .githooks
# If not, run:
git config core.hooksPath .githooks
```

## Best Practices

1. **Only format files you're actively editing** - Don't run Prettier on the entire codebase unless necessary
2. **Disable format-on-save globally** - You can manually format with `Ctrl+Shift+I` (or `Cmd+Shift+I` on Mac) when needed
3. **Review diffs before committing** - Use `git diff` to ensure you're only committing real changes
4. **Use the pre-commit hook** - It will catch formatting-only commits automatically

## What Changed in This Fix

- ✅ Merge conflicts resolved (developer → main)
- ✅ Pushed to GitHub successfully
- ✅ Added `.prettierignore` to prevent auto-formatting
- ✅ Added `.vscode/settings.json` to disable format-on-save
- ✅ Added pre-commit hook to prevent formatting-only commits
