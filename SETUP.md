# Pulse - News Analytics Platform

A real-time news analytics platform inspired by GDELT, featuring importance scoring, sentiment analysis, and trending indicators.

## Prerequisites

- **Node.js** v18 or higher
- **npm** (comes with Node.js) or **Bun** (optional)
- **Git** (for cloning)

## Quick Start

### Linux / macOS

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
echo 'DATABASE_URL="file:./dev.db"' > .env

# 3. Set up database
npx prisma generate
npx prisma db push

# 4. Run development server
npx next dev -p 3001
```

### Windows (PowerShell)

```powershell
# 1. Install dependencies
npm install

# 2. Create environment file
"DATABASE_URL=`"file:./dev.db`"" | Out-File -Encoding UTF8 .env

# 3. Set up database
npx prisma generate
npx prisma db push

# 4. Run development server
npx next dev -p 3001
```

### Windows (Command Prompt)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
echo DATABASE_URL="file:./dev.db" > .env

# 3. Set up database
npx prisma generate
npx prisma db push

# 4. Run development server
npx next dev -p 3001
```

## Access the Application

Once running, open your browser to:
- **Local:** http://localhost:3001
- **Network:** http://YOUR_IP:3001

## Using Bun (Optional)

If you prefer using Bun instead of npm:

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Then use bun instead of npm
bun install
bun run dev  # Uses port 3000 by default
```

## Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (dev)
npx prisma db push

# Create a new migration
npx prisma migrate dev --name your_migration_name

# Reset database
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio
```

## Changing the Port

If port 3001 is in use, specify a different port:

```bash
npx next dev -p 4000
```

## Troubleshooting

### Port Already in Use

**Linux/macOS:**
```bash
# Find process using the port
lsof -i :3001

# Kill the process
kill -9 <PID>
```

**Windows (PowerShell):**
```powershell
# Find process using the port
netstat -ano | findstr :3001

# Kill the process
taskkill /PID <PID> /F
```

### Database Issues

If you encounter database errors, try resetting:

```bash
# Remove existing database
rm dev.db          # Linux/macOS
del dev.db         # Windows

# Re-create database
npx prisma db push
```

### Build Errors

```bash
# Clear Next.js cache
rm -rf .next       # Linux/macOS
rmdir /s /q .next  # Windows

# Clear node_modules and reinstall
rm -rf node_modules && npm install    # Linux/macOS
rmdir /s /q node_modules && npm install  # Windows
```

## Project Structure

```
gdelt/
├── src/
│   ├── app/
│   │   ├── api/news/route.ts    # News API endpoint
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Main news page
│   ├── components/
│   │   └── ui/                  # shadcn/ui components
│   ├── hooks/                   # Custom React hooks
│   └── lib/
│       └── db.ts                # Database connection
├── prisma/
│   └── schema.prisma            # Database schema
├── public/                      # Static assets
└── package.json                 # Dependencies
```

## Features

- **News Aggregation:** Fetches from multiple RSS sources
- **GDELT-Inspired Analytics:**
  - Importance scoring (0-100)
  - Sentiment analysis (Very Positive to Major)
  - Trending indicators (Viral, Hot, Trending, Rising)
  - Impact scores (Critical, High, Medium, Low)
- **Real-time Updates:** Refresh mechanism for latest articles
- **Responsive Design:** Mobile-first with dark mode support
- **Caching:** 6-hour cache for performance

## Tech Stack

- **Framework:** Next.js 15 with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **UI:** shadcn/ui (Radix UI based)
- **Database:** Prisma ORM with SQLite
- **State Management:** Zustand
- **Charts:** Recharts

## License

MIT
