#!/usr/bin/env python3
"""
SQLite database for storing historical OSS metrics.
Enables growth rate and acceleration calculations.
"""

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "oss_traction.db"

def get_connection():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database schema."""
    conn = get_connection()
    cursor = conn.cursor()

    # Repos table - stores latest info about each repo
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS repos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner TEXT NOT NULL,
            name TEXT NOT NULL,
            full_name TEXT NOT NULL UNIQUE,
            description TEXT,
            language TEXT,
            category TEXT,
            funding_status TEXT,
            funding_amount TEXT,
            is_big_tech BOOLEAN DEFAULT FALSE,
            is_excluded BOOLEAN DEFAULT FALSE,
            founder_contact TEXT,
            notes TEXT,
            first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Snapshots table - stores point-in-time metrics
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id INTEGER NOT NULL,
            snapshot_date DATE NOT NULL,
            stars INTEGER,
            forks INTEGER,
            contributors INTEGER,
            dependents INTEGER,
            downloads INTEGER,
            download_source TEXT,
            open_issues INTEGER,
            commits_30d INTEGER,
            prs_30d INTEGER,
            issues_30d INTEGER,
            watchers INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (repo_id) REFERENCES repos(id),
            UNIQUE(repo_id, snapshot_date)
        )
    ''')

    # Growth metrics table - calculated from snapshots
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS growth_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id INTEGER NOT NULL,
            calculated_at DATE NOT NULL,
            stars_wow REAL,           -- Week over week growth %
            stars_mom REAL,           -- Month over month growth %
            stars_acceleration REAL,  -- Change in growth rate
            forks_wow REAL,
            forks_mom REAL,
            downloads_wow REAL,
            downloads_mom REAL,
            contributors_wow REAL,
            contributors_mom REAL,
            traction_score INTEGER,
            investability_score INTEGER,
            FOREIGN KEY (repo_id) REFERENCES repos(id),
            UNIQUE(repo_id, calculated_at)
        )
    ''')

    # Watchlist table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id INTEGER NOT NULL UNIQUE,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            contacted BOOLEAN DEFAULT FALSE,
            contacted_at TIMESTAMP,
            status TEXT DEFAULT 'watching',  -- watching, contacted, passed, invested
            notes TEXT,
            FOREIGN KEY (repo_id) REFERENCES repos(id)
        )
    ''')

    # Create indexes for faster queries
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_snapshots_repo_date ON snapshots(repo_id, snapshot_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_repos_category ON repos(category)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_repos_excluded ON repos(is_excluded)')

    conn.commit()
    conn.close()
    print(f"Database initialized at {DB_PATH}")

def get_or_create_repo(owner, name, description=None, language=None):
    """Get existing repo or create new one."""
    conn = get_connection()
    cursor = conn.cursor()

    full_name = f"{owner}/{name}"

    cursor.execute('SELECT id FROM repos WHERE full_name = ?', (full_name,))
    row = cursor.fetchone()

    if row:
        repo_id = row['id']
        # Update timestamp
        cursor.execute('UPDATE repos SET updated_at = ? WHERE id = ?',
                      (datetime.now(), repo_id))
    else:
        cursor.execute('''
            INSERT INTO repos (owner, name, full_name, description, language)
            VALUES (?, ?, ?, ?, ?)
        ''', (owner, name, full_name, description, language))
        repo_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return repo_id

def save_snapshot(repo_id, metrics):
    """Save a point-in-time snapshot of repo metrics."""
    conn = get_connection()
    cursor = conn.cursor()

    today = datetime.now().date()

    cursor.execute('''
        INSERT OR REPLACE INTO snapshots
        (repo_id, snapshot_date, stars, forks, contributors, dependents,
         downloads, download_source, commits_30d, prs_30d, issues_30d)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        repo_id, today,
        metrics.get('stars'),
        metrics.get('forks'),
        metrics.get('contributors'),
        metrics.get('dependents'),
        metrics.get('downloads'),
        metrics.get('download_source'),
        metrics.get('commits_3mo'),  # Using 3mo as proxy
        metrics.get('prs_30d'),
        metrics.get('issues_30d')
    ))

    conn.commit()
    conn.close()

def get_snapshots(repo_id, days=90):
    """Get historical snapshots for a repo."""
    conn = get_connection()
    cursor = conn.cursor()

    since = (datetime.now() - timedelta(days=days)).date()

    cursor.execute('''
        SELECT * FROM snapshots
        WHERE repo_id = ? AND snapshot_date >= ?
        ORDER BY snapshot_date ASC
    ''', (repo_id, since))

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def calculate_growth_rate(current, previous):
    """Calculate percentage growth."""
    if previous is None or previous == 0:
        return None
    if current is None:
        return None
    return round(((current - previous) / previous) * 100, 2)

def calculate_growth_metrics(repo_id):
    """Calculate WoW, MoM growth and acceleration for a repo."""
    conn = get_connection()
    cursor = conn.cursor()

    today = datetime.now().date()
    week_ago = today - timedelta(days=7)
    two_weeks_ago = today - timedelta(days=14)
    month_ago = today - timedelta(days=30)
    two_months_ago = today - timedelta(days=60)

    # Get snapshots at different points
    def get_snapshot_near(date):
        cursor.execute('''
            SELECT * FROM snapshots
            WHERE repo_id = ? AND snapshot_date <= ?
            ORDER BY snapshot_date DESC LIMIT 1
        ''', (repo_id, date))
        row = cursor.fetchone()
        return dict(row) if row else None

    current = get_snapshot_near(today)
    week_ago_snap = get_snapshot_near(week_ago)
    two_weeks_snap = get_snapshot_near(two_weeks_ago)
    month_ago_snap = get_snapshot_near(month_ago)
    two_months_snap = get_snapshot_near(two_months_ago)

    if not current:
        conn.close()
        return None

    metrics = {
        'repo_id': repo_id,
        'calculated_at': today,
        'stars_wow': None,
        'stars_mom': None,
        'stars_acceleration': None,
        'forks_wow': None,
        'forks_mom': None,
        'downloads_wow': None,
        'downloads_mom': None,
        'contributors_wow': None,
        'contributors_mom': None,
    }

    # Week over week
    if week_ago_snap:
        metrics['stars_wow'] = calculate_growth_rate(current['stars'], week_ago_snap['stars'])
        metrics['forks_wow'] = calculate_growth_rate(current['forks'], week_ago_snap['forks'])
        metrics['downloads_wow'] = calculate_growth_rate(current['downloads'], week_ago_snap['downloads'])
        metrics['contributors_wow'] = calculate_growth_rate(current['contributors'], week_ago_snap['contributors'])

    # Month over month
    if month_ago_snap:
        metrics['stars_mom'] = calculate_growth_rate(current['stars'], month_ago_snap['stars'])
        metrics['forks_mom'] = calculate_growth_rate(current['forks'], month_ago_snap['forks'])
        metrics['downloads_mom'] = calculate_growth_rate(current['downloads'], month_ago_snap['downloads'])
        metrics['contributors_mom'] = calculate_growth_rate(current['contributors'], month_ago_snap['contributors'])

    # Acceleration: compare this week's growth to last week's growth
    if week_ago_snap and two_weeks_snap:
        prev_wow = calculate_growth_rate(week_ago_snap['stars'], two_weeks_snap['stars'])
        if metrics['stars_wow'] is not None and prev_wow is not None:
            metrics['stars_acceleration'] = round(metrics['stars_wow'] - prev_wow, 2)

    # Save to growth_metrics table
    cursor.execute('''
        INSERT OR REPLACE INTO growth_metrics
        (repo_id, calculated_at, stars_wow, stars_mom, stars_acceleration,
         forks_wow, forks_mom, downloads_wow, downloads_mom,
         contributors_wow, contributors_mom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        repo_id, today,
        metrics['stars_wow'], metrics['stars_mom'], metrics['stars_acceleration'],
        metrics['forks_wow'], metrics['forks_mom'],
        metrics['downloads_wow'], metrics['downloads_mom'],
        metrics['contributors_wow'], metrics['contributors_mom']
    ))

    conn.commit()
    conn.close()
    return metrics

def get_latest_growth_metrics(repo_id):
    """Get the most recent growth metrics for a repo."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM growth_metrics
        WHERE repo_id = ?
        ORDER BY calculated_at DESC LIMIT 1
    ''', (repo_id,))

    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_repo_category(repo_id, category):
    """Update the category for a repo."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE repos SET category = ? WHERE id = ?', (category, repo_id))
    conn.commit()
    conn.close()

def update_repo_funding(repo_id, funding_status, funding_amount=None):
    """Update funding info for a repo."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE repos SET funding_status = ?, funding_amount = ? WHERE id = ?',
                  (funding_status, funding_amount, repo_id))
    conn.commit()
    conn.close()

def mark_as_big_tech(repo_id, is_big_tech=True):
    """Mark a repo as belonging to big tech."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE repos SET is_big_tech = ?, is_excluded = ? WHERE id = ?',
                  (is_big_tech, is_big_tech, repo_id))
    conn.commit()
    conn.close()

def get_all_repos_with_metrics():
    """Get all repos with their latest metrics and growth data."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            r.*,
            s.stars, s.forks, s.contributors, s.dependents, s.downloads,
            s.download_source, s.prs_30d, s.commits_30d,
            g.stars_wow, g.stars_mom, g.stars_acceleration,
            g.downloads_wow, g.downloads_mom,
            g.contributors_wow
        FROM repos r
        LEFT JOIN (
            SELECT * FROM snapshots s1
            WHERE snapshot_date = (
                SELECT MAX(snapshot_date) FROM snapshots s2 WHERE s2.repo_id = s1.repo_id
            )
        ) s ON r.id = s.repo_id
        LEFT JOIN (
            SELECT * FROM growth_metrics g1
            WHERE calculated_at = (
                SELECT MAX(calculated_at) FROM growth_metrics g2 WHERE g2.repo_id = g1.repo_id
            )
        ) g ON r.id = g.repo_id
        WHERE s.stars IS NOT NULL
        ORDER BY s.stars DESC
    ''')

    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def update_repo_metadata(repo_id, category=None, funding_status=None, funding_amount=None,
                         is_big_tech=None, description=None, language=None):
    """Update repo metadata."""
    conn = get_connection()
    cursor = conn.cursor()

    updates = []
    values = []

    if category is not None:
        updates.append("category = ?")
        values.append(category)
    if funding_status is not None:
        updates.append("funding_status = ?")
        values.append(funding_status)
    if funding_amount is not None:
        updates.append("funding_amount = ?")
        values.append(funding_amount)
    if is_big_tech is not None:
        updates.append("is_big_tech = ?")
        values.append(is_big_tech)
    if description is not None:
        updates.append("description = ?")
        values.append(description)
    if language is not None:
        updates.append("language = ?")
        values.append(language)

    if updates:
        updates.append("updated_at = ?")
        values.append(datetime.now())
        values.append(repo_id)

        cursor.execute(f"UPDATE repos SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()


def load_saved_repos():
    """Load all saved repos with their latest data for dashboard display."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            r.id as repo_id,
            r.owner,
            r.name,
            r.full_name as repo,
            r.description,
            r.language,
            r.category,
            r.funding_status,
            r.funding_amount,
            r.is_big_tech,
            s.stars,
            s.forks,
            s.contributors,
            s.dependents,
            s.downloads,
            s.download_source,
            s.prs_30d,
            s.commits_30d as commits_3mo,
            s.issues_30d,
            g.stars_wow,
            g.stars_mom,
            g.stars_acceleration,
            g.downloads_wow,
            g.downloads_mom,
            g.traction_score,
            g.investability_score
        FROM repos r
        INNER JOIN snapshots s ON r.id = s.repo_id
        LEFT JOIN growth_metrics g ON r.id = g.repo_id
        WHERE s.snapshot_date = (
            SELECT MAX(s2.snapshot_date) FROM snapshots s2 WHERE s2.repo_id = r.id
        )
        AND (g.calculated_at IS NULL OR g.calculated_at = (
            SELECT MAX(g2.calculated_at) FROM growth_metrics g2 WHERE g2.repo_id = r.id
        ))
        ORDER BY s.stars DESC
    ''')

    rows = cursor.fetchall()
    conn.close()

    repos = []
    for row in rows:
        repo = dict(row)
        repo['url'] = f"https://github.com/{repo.get('repo', '')}"
        repos.append(repo)

    return repos


def get_snapshot_count():
    """Get total number of snapshots in database."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM snapshots")
    count = cursor.fetchone()[0]
    conn.close()
    return count

if __name__ == "__main__":
    init_db()
    print("Database schema created successfully!")
