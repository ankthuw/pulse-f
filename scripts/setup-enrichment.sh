#!/bin/bash

# GDELT Enrichment Database Setup Script
# This script populates local databases with historical GDELT data
# for the enrichment system to work properly

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  GDELT Enrichment Database Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed"
    exit 1
fi

# Check if BigQuery credentials are set
if [ -z "$GOOGLE_CLOUD_PROJECT" ]; then
    echo "❌ Error: GOOGLE_CLOUD_PROJECT environment variable not set"
    echo "   Please set it: export GOOGLE_CLOUD_PROJECT=your-project-id"
    exit 1
fi

echo "✅ Python found: $(python3 --version)"
echo "✅ BigQuery project: $GOOGLE_CLOUD_PROJECT"
echo ""

# Default: ingest last 7 days
DAYS=${1:-7}

echo "📅 Will ingest data for the last $DAYS days"
echo ""

# Create db directory if it doesn't exist
mkdir -p db

# Calculate date range
END_DATE=$(date +%Y-%m-%d)
START_DATE=$(date -d "$DAYS days ago" +%Y-%m-%d)

echo "Date range: $START_DATE to $END_DATE"
echo ""
echo "⚠️  This will:"
echo "   - Query BigQuery ($DAYS days × ~600 MB = ~$(echo "$DAYS * 0.6" | bc) GB)"
echo "   - Create $(echo "$DAYS * 2" | bc) database files (~$(echo "$DAYS * 2" | bc) MB total)"
echo "   - Take approximately $(echo "$DAYS * 2" | bc) minutes"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Ingestion"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_STEPS=$((DAYS * 2))
CURRENT_STEP=0

for i in $(seq 0 $((DAYS - 1))); do
    DATE=$(date -d "$START_DATE +$i days" +%Y-%m-%d)
    DB_DATE=$(echo $DATE | sed 's/-//g')
    
    # Check if DBs already exist
    GKG_EXISTS=false
    EVENTS_EXISTS=false
    
    if [ -f "db/gkg_$DB_DATE.db" ]; then
        GKG_EXISTS=true
        echo "⏭️  GKG DB for $DATE already exists, skipping..."
    fi
    
    if [ -f "db/events_$DB_DATE.db" ]; then
        EVENTS_EXISTS=true
        echo "⏭️  Events DB for $DATE already exists, skipping..."
    fi
    
    # GKG Ingest
    if [ "$GKG_EXISTS" = false ]; then
        CURRENT_STEP=$((CURRENT_STEP + 1))
        echo "[$CURRENT_STEP/$TOTAL_STEPS] 📥 Ingesting GKG data for $DATE..."
        if python3 upload/gkg_daily.py $DATE; then
            echo "   ✅ GKG ingest complete"
        else
            echo "   ❌ GKG ingest failed"
            exit 1
        fi
    else
        CURRENT_STEP=$((CURRENT_STEP + 1))
    fi
    
    # Events Ingest
    if [ "$EVENTS_EXISTS" = false ]; then
        CURRENT_STEP=$((CURRENT_STEP + 1))
        echo "[$CURRENT_STEP/$TOTAL_STEPS] 📥 Ingesting Events data for $DATE..."
        if python3 upload/events_daily.py $DATE; then
            echo "   ✅ Events ingest complete"
        else
            echo "   ❌ Events ingest failed"
            exit 1
        fi
    else
        CURRENT_STEP=$((CURRENT_STEP + 1))
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show created files
echo "📁 Created databases:"
ls -lh db/*.db 2>/dev/null || echo "   (none)"
echo ""

# Show total size
TOTAL_SIZE=$(du -sh db/ 2>/dev/null | cut -f1)
echo "💾 Total size: $TOTAL_SIZE"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Test the enrichment system:"
echo "   npm run dev"
echo "   bash tools/quick-test.sh"
echo ""
echo "2. Set up daily automatic updates (cron job):"
echo "   crontab -e"
echo ""
echo "   Add these lines:"
echo "   # GDELT GKG ingest - runs at 12:05 AM daily"
echo "   5 0 * * * cd $(pwd) && python3 upload/gkg_daily.py \$(date +%Y-%m-%d)"
echo ""
echo "   # GDELT Events ingest - runs at 12:10 AM daily"
echo "   10 0 * * * cd $(pwd) && python3 upload/events_daily.py \$(date +%Y-%m-%d)"
echo ""
echo "3. Optional: Set up database cleanup (remove files older than 30 days):"
echo "   15 0 * * * find $(pwd)/db -name '*.db' -mtime +30 -delete"
echo ""
echo "✨ Your enrichment system is ready to use!"
echo ""
