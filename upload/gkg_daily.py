#!/usr/bin/env python3
"""
GDELT GKG Daily Raw Data Fetcher
Fetches ALL raw GKG fields for a single day and stores in SQLite.
"""

import os
import sys
import sqlite3
import re
from dotenv import load_dotenv
from datetime import datetime, timedelta
from pathlib import Path
import argparse


from google.cloud import bigquery
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

# PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "gdelt-485102")
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "gdelt-485102")
DB_DIR = Path("db")


def get_db_path(target_date: str) -> Path:
    """Generate database filename with target date."""
    date_clean = target_date.replace('-', '')
    return DB_DIR / f"gkg_{date_clean}.db"


MAX_RECORDS = 100000


# =============================================================================
# GKG FETCHER
# =============================================================================

class GKGFetcher:
    """Fetches ALL GKG data from BigQuery."""

    def __init__(self, project_id: str = PROJECT_ID):
        try:
            self.client = bigquery.Client(project=project_id)
        except Exception as e:
            # If credentials aren't available or client fails to initialize,
            # fall back to None and let fetch() handle the absence gracefully.
            print(f"[GKGFetcher] Warning: could not create BigQuery client: {e}")
            self.client = None

    def fetch(self, target_date: str, max_records: int = MAX_RECORDS) -> list:
        """Fetch ALL GKG records for a date."""
        date_obj = datetime.strptime(target_date, '%Y-%m-%d')
        next_date = date_obj + timedelta(days=1)

        # Query ALL GKG fields (using actual BigQuery field names)
        query = f"""
        SELECT
            GKGRECORDID,
            DATE,
            SourceCollectionIdentifier,
            SourceCommonName,
            DocumentIdentifier,
            Counts,
            V2Counts,
            Themes,
            V2Themes,
            Locations,
            V2Locations,
            Persons,
            V2Persons,
            Organizations,
            V2Organizations,
            V2Tone,
            Dates,
            GCAM,
            SharingImage,
            RelatedImages,
            SocialImageEmbeds,
            SocialVideoEmbeds,
            Quotations,
            AllNames,
            Amounts,
            TranslationInfo,
            Extras,
            PARSE_TIMESTAMP('%Y%m%d%H%M%S', CAST(DATE AS STRING)) as date_ts
        FROM `gdelt-bq.gdeltv2.gkg_partitioned`
        WHERE
            _PARTITIONTIME >= TIMESTAMP('{target_date}')
            AND _PARTITIONTIME < TIMESTAMP('{next_date}')
            AND DocumentIdentifier IS NOT NULL
        LIMIT {max_records}
        """

        if not self.client:
            print("[GKGFetcher] No BigQuery client available, returning empty record set.")
            return []

        try:
            result = self.client.query(query).result()
        except Exception as e:
            print(f"[GKGFetcher] BigQuery query failed: {e}")
            return []

        records = []
        for row in result:
            # Parse V2Tone -> tone_value (try to extract numeric part)
            tone_value = None
            try:
                v2t = row.V2Tone or ''
                parts = v2t.split(',')
                if len(parts) > 1:
                    tone_value = float(parts[1])
            except Exception:
                tone_value = None

            # Parse V2Counts -> mention_count (try to extract first integer)
            mention_count = None
            try:
                v2c = row.V2Counts or ''
                nums = re.findall(r"\d+", v2c)
                if nums:
                    # Heuristic: take the largest number found
                    mention_count = int(max(nums, key=lambda x: int(x)))
            except Exception:
                mention_count = None

            records.append({
                'gkg_record_id': str(row.GKGRECORDID) if row.GKGRECORDID else None,
                'date': str(row.DATE) if row.DATE else None,
                'date_ts': str(row.date_ts) if row.date_ts else None,
                'source_collection_id': str(row.SourceCollectionIdentifier) if row.SourceCollectionIdentifier else None,
                'source_common_name': row.SourceCommonName,
                'document_identifier': row.DocumentIdentifier,
                'counts': row.Counts,
                'v2_counts': row.V2Counts,
                'mention_count': mention_count,
                'themes': row.Themes,
                'v2_themes': row.V2Themes,
                'locations': row.Locations,
                'v2_locations': row.V2Locations,
                'persons': row.Persons,
                'v2_persons': row.V2Persons,
                'organizations': row.Organizations,
                'v2_organizations': row.V2Organizations,
                'v2_tone': row.V2Tone,
                'tone_value': tone_value,
                'dates': row.Dates,
                'gcam': row.GCAM,
                'sharing_image': row.SharingImage,
                'related_images': row.RelatedImages,
                'social_image_embeds': row.SocialImageEmbeds,
                'social_video_embeds': row.SocialVideoEmbeds,
                'quotations': row.Quotations,
                'all_names': row.AllNames,
                'amounts': row.Amounts,
                'translation_info': row.TranslationInfo,
                'extras': row.Extras,
            })

        return records


# =============================================================================
# DATABASE
# =============================================================================

class GKGDatabase:
    """Stores ALL GKG raw data in SQLite."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize database schema with ALL fields."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create table with ALL GKG fields
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS gkg (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gkg_record_id TEXT,
                date INTEGER,
                date_ts TEXT,
                source_collection_id TEXT,
                source_common_name TEXT,
                document_identifier TEXT,
                counts TEXT,
                v2_counts TEXT,
                mention_count INTEGER,
                themes TEXT,
                v2_themes TEXT,
                locations TEXT,
                v2_locations TEXT,
                persons TEXT,
                v2_persons TEXT,
                organizations TEXT,
                v2_organizations TEXT,
                v2_tone TEXT,
                tone_value REAL,
                dates TEXT,
                gcam TEXT,
                sharing_image TEXT,
                related_images TEXT,
                social_image_embeds TEXT,
                social_video_embeds TEXT,
                quotations TEXT,
                all_names TEXT,
                amounts TEXT,
                translation_info TEXT,
                extras TEXT
            )
        """)

        # Create indexes for common queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gkg_date ON gkg(date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gkg_source ON gkg(source_common_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gkg_record_id ON gkg(gkg_record_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gkg_document_identifier ON gkg(document_identifier)")

        conn.commit()
        conn.close()

    def store(self, records: list):
        """Store all GKG records."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        for r in records:
            cursor.execute("""
                INSERT INTO gkg (
                    gkg_record_id, date, date_ts, source_collection_id, source_common_name, document_identifier,
                    counts, v2_counts, mention_count, themes, v2_themes, locations, v2_locations,
                    persons, v2_persons, organizations, v2_organizations, v2_tone, tone_value,
                    dates, gcam, sharing_image, related_images, social_image_embeds,
                    social_video_embeds, quotations, all_names, amounts, translation_info, extras
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r['gkg_record_id'], r['date'], r['date_ts'], r['source_collection_id'], r['source_common_name'], r['document_identifier'],
                r['counts'], r.get('v2_counts'), r.get('mention_count'), r.get('themes'), r.get('v2_themes'), r.get('locations'), r.get('v2_locations'),
                r.get('persons'), r.get('v2_persons'), r.get('organizations'), r.get('v2_organizations'), r.get('v2_tone'), r.get('tone_value'),
                r.get('dates'), r.get('gcam'), r.get('sharing_image'), r.get('related_images'), r.get('social_image_embeds'),
                r.get('social_video_embeds'), r.get('quotations'), r.get('all_names'), r.get('amounts'), r.get('translation_info'), r.get('extras')
            ))

        conn.commit()
        conn.close()


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='GDELT GKG Daily Raw Data Fetcher - ALL FIELDS',
        epilog="Fetches ALL GKG fields for a single day and stores in SQLite.\n\nExample: %(prog)s 2025-01-06"
    )

    parser.add_argument('date', type=str, help='Date (YYYY-MM-DD)')
    parser.add_argument('--project', '-p', default=PROJECT_ID,
                        help=f'BigQuery project ID (default: {PROJECT_ID})')
    parser.add_argument('--max', '-m', type=int, default=MAX_RECORDS,
                        help=f'Max records to fetch (default: {MAX_RECORDS})')

    args = parser.parse_args()

    # Validate date
    try:
        datetime.strptime(args.date, '%Y-%m-%d')
    except ValueError:
        print(f"Error: Invalid date format '{args.date}'. Use YYYY-MM-DD.", file=sys.stderr)
        return 1

    # Setup
    db_path = get_db_path(args.date)
    print(f"📊 GKG Daily Raw Data - ALL FIELDS")
    print(f"📅 Date: {args.date}")
    print(f"💾 Output: {db_path}")
    print(f"📊 Max records: {args.max}\n")

    # Fetch
    print("📥 Fetching GKG data...")
    fetcher = GKGFetcher(project_id=args.project)
    records = fetcher.fetch(args.date, max_records=args.max)
    print(f"   Found {len(records)} records")

    # Store
    print("\n💾 Storing to database...")
    db = GKGDatabase(db_path)
    db.store(records)

    print(f"\n✅ Done!")
    print(f"   Records: {len(records)}")
    print(f"   Database: {db_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
