# 🚀 Deployment Guide - Resume Skills Classifier

## Quick Deploy (Recommended): Vercel + Supabase

### Step 1: Setup Database (Supabase - FREE)

1. Go to [Supabase](https://supabase.com)
2. Create new project
3. Copy **Database URL** from Settings → Database
   ```
   postgresql://postgres:[password]@[host]:5432/postgres
   ```

### Step 2: Run Prisma Migrations

```bash
# Install dependencies
npm install

# Set DATABASE_URL
echo 'DATABASE_URL="your-postgres-url"' > .env

# Run migrations
npx prisma migrate deploy
npx prisma generate
```

### Step 3: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add DATABASE_URL environment variable
vercel env add DATABASE_URL production

# Redeploy
vercel --prod
```

**OR** use Vercel Dashboard:
1. Import repo
2. Add `DATABASE_URL` in environment variables
3. Deploy!

---

## Alternative: Railway (All-in-One)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create project
railway init

# Add PostgreSQL
railway add --plugin postgresql

# Deploy
railway up

# Railway auto-sets DATABASE_URL!
```

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Edit .env with your PostgreSQL URL

# Run Prisma migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate

# Start dev server
npm run dev
```

Visit: http://localhost:3000

---

## Database Options

**Supabase (Recommended):**
- ✅ Free tier generous
- ✅ PostgreSQL included
- ✅ Easy setup
- ✅ Good for Vercel

**Railway:**
- ✅ Simple all-in-one
- ✅ Auto-configured DATABASE_URL
- ✅ $5/month starter

**Neon:**
- ✅ Serverless Postgres
- ✅ Free tier
- ✅ Auto-scaling

**Local PostgreSQL:**
```bash
# macOS
brew install postgresql
brew services start postgresql

# Linux
sudo apt install postgresql
sudo systemctl start postgresql

# Create database
createdb resume_skills_db
```

---

## Production Checklist

- [x] PostgreSQL database setup
- [x] Prisma migrations run
- [x] DATABASE_URL configured
- [x] Vercel deployment
- [ ] Custom domain (optional)
- [ ] Analytics setup

---

**🎉 Your app is live!**
