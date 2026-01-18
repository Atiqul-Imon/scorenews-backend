# Developer Branch Workflow - Quick Start

## ⚡ Quick Commands

### Starting Work (Always do this first!)

```bash
cd backend-nestjs
./scripts/checkout-developer.sh
```

Or manually:
```bash
git checkout developer
git pull origin developer
```

### Making Changes

```bash
# Make your changes, then:
git add .
git commit -m "feat: your change description"
git push origin developer
```

### Deploying to Production

When ready to deploy to DigitalOcean:

```bash
./scripts/merge-to-main.sh
```

This will:
1. Merge developer → main
2. Push to main (triggers deployment)
3. Switch you back to developer branch

## 🔒 Protection

**Main branch is protected!** You cannot push directly to main. The pre-push hook will block it.

If you try `git push origin main`, you'll get an error. This is intentional!

Always push to: `git push origin developer`

## 📋 Current Status

Check your branch:
```bash
git branch --show-current
```

Should show: `developer`

---

**Remember**: Always work on `developer`, merge to `main` only for deployment! 🚀

