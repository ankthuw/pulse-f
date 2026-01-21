#!/usr/bin/env python3
"""
GDELT Event Database Daily Raw Data Fetcher
Fetches ALL raw Event fields for a single day and stores in SQLite.
"""

import os
import sys
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
import argparse

from google.cloud import bigquery


# =============================================================================
# CONFIGURATION
# =============================================================================

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "gdelt-483607")
DB_DIR = Path("db")


def get_db_path(target_date: str) -> Path:
    """Generate database filename with target date."""
    date_clean = target_date.replace('-', '')
    return DB_DIR / f"events_{date_clean}.db"


MAX_RECORDS = 100000


# =============================================================================
# EVENT FETCHER
# =============================================================================

class EventFetcher:
    """Fetches ALL Event data from BigQuery."""

    def __init__(self, project_id: str = PROJECT_ID):
        self.client = bigquery.Client(project=project_id)

    def fetch(self, target_date: str, max_records: int = MAX_RECORDS) -> list:
        """Fetch ALL event records for a date."""
        date_obj = datetime.strptime(target_date, '%Y-%m-%d')
        next_date = date_obj + timedelta(days=1)

        # Query ALL Event fields
        query = f"""
        SELECT
            GLOBALEVENTID,
            SQLDATE,
            MonthYear,
            Year,
            FractionDate,
            Actor1Code,
            Actor1Name,
            Actor1CountryCode,
            Actor1KnownGroupCode,
            Actor1EthnicCode,
            Actor1Religion1Code,
            Actor1Religion2Code,
            Actor1Type1Code,
            Actor1Type2Code,
            Actor1Type3Code,
            Actor2Code,
            Actor2Name,
            Actor2CountryCode,
            Actor2KnownGroupCode,
            Actor2EthnicCode,
            Actor2Religion1Code,
            Actor2Religion2Code,
            Actor2Type1Code,
            Actor2Type2Code,
            Actor2Type3Code,
            IsRootEvent,
            EventCode,
            EventBaseCode,
            EventRootCode,
            QuadClass,
            GoldsteinScale,
            NumMentions,
            NumSources,
            NumArticles,
            AvgTone,
            Actor1Geo_Type,
            Actor1Geo_FullName,
            Actor1Geo_CountryCode,
            Actor1Geo_ADM1Code,
            Actor1Geo_ADM2Code,
            Actor1Geo_Lat,
            Actor1Geo_Long,
            Actor1Geo_FeatureID,
            Actor2Geo_Type,
            Actor2Geo_FullName,
            Actor2Geo_CountryCode,
            Actor2Geo_ADM1Code,
            Actor2Geo_ADM2Code,
            Actor2Geo_Lat,
            Actor2Geo_Long,
            Actor2Geo_FeatureID,
            ActionGeo_Type,
            ActionGeo_FullName,
            ActionGeo_CountryCode,
            ActionGeo_ADM1Code,
            ActionGeo_ADM2Code,
            ActionGeo_Lat,
            ActionGeo_Long,
            ActionGeo_FeatureID,
            DATEADDED,
            SOURCEURL
        FROM `gdelt-bq.gdeltv2.events`
        WHERE
            SQLDATE >= {int(date_obj.strftime('%Y%m%d'))}
            AND SQLDATE < {int(next_date.strftime('%Y%m%d'))}
            AND Actor1Name IS NOT NULL
        LIMIT {max_records}
        """

        result = self.client.query(query).result()

        records = []
        for row in result:
            records.append({
                'global_event_id': str(row.GLOBALEVENTID) if row.GLOBALEVENTID else None,
                'sql_date': str(row.SQLDATE) if row.SQLDATE else None,
                'month_year': str(row.MonthYear) if row.MonthYear else None,
                'year': int(row.Year) if row.Year else None,
                'fraction_date': float(row.FractionDate) if row.FractionDate else None,
                'actor1_code': row.Actor1Code,
                'actor1_name': row.Actor1Name,
                'actor1_country_code': row.Actor1CountryCode,
                'actor1_known_group_code': row.Actor1KnownGroupCode,
                'actor1_ethnic_code': row.Actor1EthnicCode,
                'actor1_religion1_code': row.Actor1Religion1Code,
                'actor1_religion2_code': row.Actor1Religion2Code,
                'actor1_type1_code': row.Actor1Type1Code,
                'actor1_type2_code': row.Actor1Type2Code,
                'actor1_type3_code': row.Actor1Type3Code,
                'actor2_code': row.Actor2Code,
                'actor2_name': row.Actor2Name,
                'actor2_country_code': row.Actor2CountryCode,
                'actor2_known_group_code': row.Actor2KnownGroupCode,
                'actor2_ethnic_code': row.Actor2EthnicCode,
                'actor2_religion1_code': row.Actor2Religion1Code,
                'actor2_religion2_code': row.Actor2Religion2Code,
                'actor2_type1_code': row.Actor2Type1Code,
                'actor2_type2_code': row.Actor2Type2Code,
                'actor2_type3_code': row.Actor2Type3Code,
                'is_root_event': int(row.IsRootEvent) if row.IsRootEvent is not None else None,
                'event_code': row.EventCode,
                'event_base_code': row.EventBaseCode,
                'event_root_code': row.EventRootCode,
                'quad_class': int(row.QuadClass) if row.QuadClass is not None else None,
                'goldstein_scale': float(row.GoldsteinScale) if row.GoldsteinScale is not None else None,
                'num_mentions': int(row.NumMentions) if row.NumMentions is not None else None,
                'num_sources': int(row.NumSources) if row.NumSources is not None else None,
                'num_articles': int(row.NumArticles) if row.NumArticles is not None else None,
                'avg_tone': float(row.AvgTone) if row.AvgTone is not None else None,
                'actor1_geo_type': int(row.Actor1Geo_Type) if row.Actor1Geo_Type is not None else None,
                'actor1_geo_full_name': row.Actor1Geo_FullName,
                'actor1_geo_country_code': row.Actor1Geo_CountryCode,
                'actor1_geo_adm1_code': row.Actor1Geo_ADM1Code,
                'actor1_geo_adm2_code': row.Actor1Geo_ADM2Code,
                'actor1_geo_lat': float(row.Actor1Geo_Lat) if row.Actor1Geo_Lat is not None else None,
                'actor1_geo_long': float(row.Actor1Geo_Long) if row.Actor1Geo_Long is not None else None,
                'actor1_geo_feature_id': str(row.Actor1Geo_FeatureID) if row.Actor1Geo_FeatureID is not None else None,
                'actor2_geo_type': int(row.Actor2Geo_Type) if row.Actor2Geo_Type is not None else None,
                'actor2_geo_full_name': row.Actor2Geo_FullName,
                'actor2_geo_country_code': row.Actor2Geo_CountryCode,
                'actor2_geo_adm1_code': row.Actor2Geo_ADM1Code,
                'actor2_geo_adm2_code': row.Actor2Geo_ADM2Code,
                'actor2_geo_lat': float(row.Actor2Geo_Lat) if row.Actor2Geo_Lat is not None else None,
                'actor2_geo_long': float(row.Actor2Geo_Long) if row.Actor2Geo_Long is not None else None,
                'actor2_geo_feature_id': str(row.Actor2Geo_FeatureID) if row.Actor2Geo_FeatureID is not None else None,
                'action_geo_type': int(row.ActionGeo_Type) if row.ActionGeo_Type is not None else None,
                'action_geo_full_name': row.ActionGeo_FullName,
                'action_geo_country_code': row.ActionGeo_CountryCode,
                'action_geo_adm1_code': row.ActionGeo_ADM1Code,
                'action_geo_adm2_code': row.ActionGeo_ADM2Code,
                'action_geo_lat': float(row.ActionGeo_Lat) if row.ActionGeo_Lat is not None else None,
                'action_geo_long': float(row.ActionGeo_Long) if row.ActionGeo_Long is not None else None,
                'action_geo_feature_id': str(row.ActionGeo_FeatureID) if row.ActionGeo_FeatureID is not None else None,
                'date_added': str(row.DATEADDED) if row.DATEADDED else None,
                'source_url': row.SOURCEURL,
            })

        return records


# =============================================================================
# DATABASE
# =============================================================================

class EventDatabase:
    """Stores ALL Event raw data in SQLite."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize database schema with ALL fields."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create table with ALL Event fields
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                global_event_id TEXT UNIQUE,
                sql_date INTEGER,
                month_year INTEGER,
                year INTEGER,
                fraction_date REAL,
                actor1_code TEXT,
                actor1_name TEXT,
                actor1_country_code TEXT,
                actor1_known_group_code TEXT,
                actor1_ethnic_code TEXT,
                actor1_religion1_code TEXT,
                actor1_religion2_code TEXT,
                actor1_type1_code TEXT,
                actor1_type2_code TEXT,
                actor1_type3_code TEXT,
                actor2_code TEXT,
                actor2_name TEXT,
                actor2_country_code TEXT,
                actor2_known_group_code TEXT,
                actor2_ethnic_code TEXT,
                actor2_religion1_code TEXT,
                actor2_religion2_code TEXT,
                actor2_type1_code TEXT,
                actor2_type2_code TEXT,
                actor2_type3_code TEXT,
                is_root_event INTEGER,
                event_code TEXT,
                event_base_code TEXT,
                event_root_code TEXT,
                quad_class INTEGER,
                goldstein_scale REAL,
                num_mentions INTEGER,
                num_sources INTEGER,
                num_articles INTEGER,
                avg_tone REAL,
                actor1_geo_type INTEGER,
                actor1_geo_full_name TEXT,
                actor1_geo_country_code TEXT,
                actor1_geo_adm1_code TEXT,
                actor1_geo_adm2_code TEXT,
                actor1_geo_lat REAL,
                actor1_geo_long REAL,
                actor1_geo_feature_id TEXT,
                actor2_geo_type INTEGER,
                actor2_geo_full_name TEXT,
                actor2_geo_country_code TEXT,
                actor2_geo_adm1_code TEXT,
                actor2_geo_adm2_code TEXT,
                actor2_geo_lat REAL,
                actor2_geo_long REAL,
                actor2_geo_feature_id TEXT,
                action_geo_type INTEGER,
                action_geo_full_name TEXT,
                action_geo_country_code TEXT,
                action_geo_adm1_code TEXT,
                action_geo_adm2_code TEXT,
                action_geo_lat REAL,
                action_geo_long REAL,
                action_geo_feature_id TEXT,
                date_added INTEGER,
                source_url TEXT
            )
        """)

        # Create indexes for common queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_date ON events(sql_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_actor1 ON events(actor1_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_actor2 ON events(actor2_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_event_code ON events(event_code)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_goldstein ON events(goldstein_scale)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_global_id ON events(global_event_id)")

        conn.commit()
        conn.close()

    def store(self, records: list):
        """Store all event records."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        for r in records:
            cursor.execute("""
                INSERT OR IGNORE INTO events (
                    global_event_id, sql_date, month_year, year, fraction_date,
                    actor1_code, actor1_name, actor1_country_code, actor1_known_group_code,
                    actor1_ethnic_code, actor1_religion1_code, actor1_religion2_code,
                    actor1_type1_code, actor1_type2_code, actor1_type3_code,
                    actor2_code, actor2_name, actor2_country_code, actor2_known_group_code,
                    actor2_ethnic_code, actor2_religion1_code, actor2_religion2_code,
                    actor2_type1_code, actor2_type2_code, actor2_type3_code,
                    is_root_event, event_code, event_base_code, event_root_code, quad_class,
                    goldstein_scale, num_mentions, num_sources, num_articles, avg_tone,
                    actor1_geo_type, actor1_geo_full_name, actor1_geo_country_code,
                    actor1_geo_adm1_code, actor1_geo_adm2_code, actor1_geo_lat, actor1_geo_long,
                    actor1_geo_feature_id,
                    actor2_geo_type, actor2_geo_full_name, actor2_geo_country_code,
                    actor2_geo_adm1_code, actor2_geo_adm2_code, actor2_geo_lat, actor2_geo_long,
                    actor2_geo_feature_id,
                    action_geo_type, action_geo_full_name, action_geo_country_code,
                    action_geo_adm1_code, action_geo_adm2_code, action_geo_lat, action_geo_long,
                    action_geo_feature_id,
                    date_added, source_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r['global_event_id'], r['sql_date'], r['month_year'], r['year'], r['fraction_date'],
                r['actor1_code'], r['actor1_name'], r['actor1_country_code'], r['actor1_known_group_code'],
                r['actor1_ethnic_code'], r['actor1_religion1_code'], r['actor1_religion2_code'],
                r['actor1_type1_code'], r['actor1_type2_code'], r['actor1_type3_code'],
                r['actor2_code'], r['actor2_name'], r['actor2_country_code'], r['actor2_known_group_code'],
                r['actor2_ethnic_code'], r['actor2_religion1_code'], r['actor2_religion2_code'],
                r['actor2_type1_code'], r['actor2_type2_code'], r['actor2_type3_code'],
                r['is_root_event'], r['event_code'], r['event_base_code'], r['event_root_code'], r['quad_class'],
                r['goldstein_scale'], r['num_mentions'], r['num_sources'], r['num_articles'], r['avg_tone'],
                r['actor1_geo_type'], r['actor1_geo_full_name'], r['actor1_geo_country_code'],
                r['actor1_geo_adm1_code'], r['actor1_geo_adm2_code'], r['actor1_geo_lat'], r['actor1_geo_long'],
                r['actor1_geo_feature_id'],
                r['actor2_geo_type'], r['actor2_geo_full_name'], r['actor2_geo_country_code'],
                r['actor2_geo_adm1_code'], r['actor2_geo_adm2_code'], r['actor2_geo_lat'], r['actor2_geo_long'],
                r['actor2_geo_feature_id'],
                r['action_geo_type'], r['action_geo_full_name'], r['action_geo_country_code'],
                r['action_geo_adm1_code'], r['action_geo_adm2_code'], r['action_geo_lat'], r['action_geo_long'],
                r['action_geo_feature_id'],
                r['date_added'], r['source_url']
            ))

        conn.commit()
        conn.close()


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='GDELT Event Database Daily Raw Data Fetcher - ALL FIELDS',
        epilog="Fetches ALL Event fields for a single day and stores in SQLite.\n\nExample: %(prog)s 2025-01-06"
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
    print(f"📊 Event Database Daily Raw Data - ALL FIELDS")
    print(f"📅 Date: {args.date}")
    print(f"💾 Output: {db_path}")
    print(f"📊 Max records: {args.max}\n")

    # Fetch
    print("📥 Fetching Event data...")
    fetcher = EventFetcher(project_id=args.project)
    records = fetcher.fetch(args.date, max_records=args.max)
    print(f"   Found {len(records)} records")

    # Store
    print("\n💾 Storing to database...")
    db = EventDatabase(db_path)
    db.store(records)

    print(f"\n✅ Done!")
    print(f"   Records: {len(records)}")
    print(f"   Database: {db_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
