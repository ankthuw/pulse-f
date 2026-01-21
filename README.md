# Pulse

**A modern, AI-powered news aggregation and personalization platform**

Pulse delivers intelligent news curation with real-time GDELT data integration, sentiment analysis, and personalized briefings. Built with cutting-edge technologies for performance, scalability, and an exceptional user experience.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Development](#development)
- [Documentation](#documentation)
- [License](#license)

---

## Overview

Pulse is a next-generation news platform that combines the power of GDELT's global event database with advanced AI capabilities to deliver personalized, sentiment-aware news experiences. The platform features real-time updates, intelligent filtering, and multiple reading modes designed for different user preferences.

### Core Capabilities

- **Real-Time News Aggregation** - Automated daily ingestion of global events from GDELT
- **AI-Powered Personalization** - Intelligent briefings tailored to user interests
- **Sentiment Analysis** - Advanced emotion detection and filtering
- **Multiple Reading Modes** - Standard, doomscrolling prevention, and reading modes
- **WebSocket Integration** - Real-time updates without page refresh
- **Responsive Design** - Optimized for desktop and mobile devices

---

## Key Features

### 🎯 My Briefing
Personalized AI-generated news briefings based on your topics of interest. Configure your preferences and receive curated summaries powered by advanced language models.

### 📊 Sentiment Intelligence
- Real-time emotion detection across news articles
- Filter by sentiment (positive, neutral, negative)
- Visual sentiment indicators and analytics
- Emotion-aware content curation

### 🔄 Smart Refresh
- Automatic daily data ingestion from GDELT
- Manual refresh with rate limiting
- WebSocket-powered real-time updates
- Optimized filtering and sorting mechanisms

### 📖 Reading Modes
- **Standard Mode** - Traditional news feed experience
- **Doomscrolling Prevention** - Mindful news consumption with pacing controls
- **Reading Mode** - Distraction-free article viewing with AI-powered explainers

### 🎨 Modern UI/UX
- Dark/light theme support
- Smooth animations and transitions
- Accessible components built on Radix UI
- Responsive grid layouts

---

## Technology Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript 5** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling
- **shadcn/ui** - High-quality component library
- **Framer Motion** - Animation library
- **TanStack Query** - Server state management
- **Zustand** - Client state management

### Backend & Database
- **Prisma** - Type-safe ORM
- **PostgreSQL** - Primary database
- **NextAuth.js** - Authentication
- **WebSocket** - Real-time communication

### AI & Data Processing
- **OpenAI GPT** - Content generation and summarization
- **GDELT API** - Global event data source
- **Sentiment Analysis** - Custom emotion detection
- **Sharp** - Image optimization

### Development Tools
- **ESLint** - Code linting
- **TypeScript** - Static type checking
- **Bun** - Fast JavaScript runtime and package manager
- **Caddy** - Modern web server for reverse proxy

---

## Getting Started

### Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **PostgreSQL** 14+
- **Git**

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pulse
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your configuration:
   - Database connection string
   - OpenAI API key
   - NextAuth configuration
   - Other service credentials

4. **Initialize the database**
   ```bash
   bunx prisma migrate dev
   bunx prisma generate
   ```

5. **Seed initial data (optional)**
   ```bash
   bun run seed
   ```

### Running the Application

**Development Mode**
```bash
bun run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

**Production Build**
```bash
bun run build
bun start
```

**Database Management**
```bash
# View database in Prisma Studio
bunx prisma studio

# Create a new migration
bunx prisma migrate dev --name migration_name

# Reset database
bunx prisma migrate reset
```

---

## Project Structure

```
pulse/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   ├── briefing/          # My Briefing feature
│   │   └── vi/                # Visual interface pages
│   ├── components/            # React components
│   │   └── ui/               # shadcn/ui components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utility functions
│   └── types/                 # TypeScript type definitions
├── prisma/
│   └── schema.prisma          # Database schema
├── upload/                     # Data ingestion scripts
│   ├── events_daily.py        # GDELT events ingestion
│   └── gkg_daily.py           # GDELT GKG ingestion
├── mini-services/             # Microservices
├── skills/                    # AI skill modules
├── examples/                  # Code examples
└── docs/                      # Documentation
```

---

## Architecture

### Data Flow

1. **Ingestion Layer** - Python scripts fetch daily GDELT data
2. **Database Layer** - Prisma manages PostgreSQL schema and queries
3. **API Layer** - Next.js API routes serve data to frontend
4. **Presentation Layer** - React components render UI
5. **Real-Time Layer** - WebSocket connections for live updates

### Key Systems

- **GDELT Integration** - Automated daily data pipeline ([details](GDELT_DAILY_INGEST_MECHANISM_EXPLAINED.md))
- **Filtering & Sorting** - Advanced query optimization ([details](FILTER_SORT_AND_AUTO_REFRESH_MECHANISM_EXPLAINED.md))
- **Refresh Mechanism** - Rate-limited manual refresh ([details](REFRESH_MECHANISM_EXPLAINED.md))
- **Reading Modes** - Context-aware article display ([details](READING_MODE_AND_EXPLAINERS_EXPLAINED.md))

---

## Development

### Code Style

This project follows TypeScript and React best practices:
- Use functional components with hooks
- Implement proper TypeScript types
- Follow ESLint configuration
- Use Prettier for formatting

### Adding New Features

1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation
4. Submit pull request

### Testing

```bash
# Run unit tests
bun test

# Run E2E tests
bun test:e2e

# Run type checking
bun run type-check
```

---

## Documentation

Comprehensive documentation is available in the repository:

- [Setup Guide](SETUP.md) - Detailed installation and configuration
- [Phase 1: My Briefing](PHASE1_MY_BRIEFING_IMPLEMENTATION_LOG.md) - Feature implementation
- [Phase 2: UX Improvements](PHASE2_UX_IMPROVEMENTS.md) - Enhancement details
- [GDELT API Mechanism](GDELT_API_MECHANISM_EXPLAINED.md) - Data integration
- [Innovation Pipeline](INNOVATION_PIPELINE_NEWS_PERSONALIZATION.md) - Future roadmap

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.

---

**Built with modern web technologies for intelligent news consumption.**
