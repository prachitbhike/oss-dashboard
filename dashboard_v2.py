#!/usr/bin/env python3
"""
Enhanced Dashboard v2 for OSS Investment Sourcing.
Features: Historical tracking, growth metrics, funding status, category filtering.
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import re
from datetime import datetime, timedelta
import threading
import time

from database import (
    init_db, get_connection, get_or_create_repo, save_snapshot,
    calculate_growth_metrics, get_all_repos_with_metrics, get_snapshots,
    update_repo_metadata, load_saved_repos, get_snapshot_count
)
from analysis import (
    is_big_tech, categorize_repo, detect_funding_status,
    calculate_investability_score, enrich_repo_data, BIG_TECH_ORGS
)

PORT = 8080
GITHUB_API = "https://api.github.com"

# Global state
app_state = {
    "repos": [],
    "last_updated": None,
    "is_loading": False,
    "snapshot_count": 0,
    "progress": {
        "current": 0,
        "total": 0,
        "current_repo": "",
        "phase": "idle"  # idle, searching, analyzing, complete
    },
    "stats": {
        "total_repos": 0,
        "npm_tracked": 0,
        "pypi_tracked": 0,
        "crates_tracked": 0,
        "by_language": {},
        "by_category": {},
    },
    "filters": {
        "exclude_big_tech": True,
        "category": "all",
        "min_stars": 0,
        "funding_status": "all"
    }
}


def api_request(url, headers=None):
    if headers is None:
        headers = {"User-Agent": "GitHub-Traction-Analysis"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except:
        return None


def get_html(url):
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode('utf-8', errors='ignore')
    except:
        return None


def get_github_repo_details(owner, repo):
    url = f"{GITHUB_API}/repos/{owner}/{repo}"
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitHub-Traction-Analysis"}
    return api_request(url, headers)


def get_contributor_count(owner, repo):
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contributors?per_page=1&anon=false"
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitHub-Traction-Analysis"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            link_header = response.getheader('Link', '')
            if 'rel="last"' in link_header:
                match = re.search(r'page=(\d+)>; rel="last"', link_header)
                if match:
                    return int(match.group(1))
            data = json.loads(response.read().decode())
            return len(data) if data else 0
    except:
        return None


def get_commit_activity(owner, repo):
    url = f"{GITHUB_API}/repos/{owner}/{repo}/stats/commit_activity"
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitHub-Traction-Analysis"}
    data = api_request(url, headers)
    if data and isinstance(data, list):
        recent_weeks = data[-12:] if len(data) >= 12 else data
        return sum(week.get('total', 0) for week in recent_weeks)
    return None


def get_issue_pr_activity(owner, repo):
    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitHub-Traction-Analysis"}

    issues_url = f"{GITHUB_API}/search/issues?q=repo:{owner}/{repo}+type:issue+created:>{thirty_days_ago}&per_page=1"
    issues_data = api_request(issues_url, headers)
    issues_count = issues_data.get('total_count', 0) if issues_data else 0

    time.sleep(0.5)

    prs_url = f"{GITHUB_API}/search/issues?q=repo:{owner}/{repo}+type:pr+created:>{thirty_days_ago}&per_page=1"
    prs_data = api_request(prs_url, headers)
    prs_count = prs_data.get('total_count', 0) if prs_data else 0

    return issues_count, prs_count


def get_npm_downloads(package_name):
    url = f"https://api.npmjs.org/downloads/point/last-week/{package_name}"
    data = api_request(url)
    return data.get('downloads') if data and 'downloads' in data else None


def get_pypi_downloads(package_name):
    url = f"https://pypistats.org/api/packages/{package_name}/recent"
    data = api_request(url)
    return data['data'].get('last_week') if data and 'data' in data else None


def get_crates_downloads(package_name):
    """Get crates.io download count for Rust packages."""
    url = f"https://crates.io/api/v1/crates/{package_name}"
    headers = {"User-Agent": "OSS-Traction-Analysis"}
    data = api_request(url, headers)
    if data and 'crate' in data:
        return data['crate'].get('recent_downloads')  # Last 90 days
    return None


def get_dependents_count(owner, repo):
    url = f"https://github.com/{owner}/{repo}/network/dependents"
    html = get_html(url)
    if html:
        match = re.search(r'([\d,]+)\s+Repositor', html)
        if match:
            return int(match.group(1).replace(',', ''))
    return None


def search_repos_with_query(query, sort="stars", per_page=100, max_pages=3):
    """Generic repo search with pagination."""
    all_items = []
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitHub-Traction-Analysis"}

    for page in range(1, max_pages + 1):
        params = {"q": query, "sort": sort, "order": "desc", "per_page": per_page, "page": page}
        url = f"{GITHUB_API}/search/repositories?{urllib.parse.urlencode(params)}"
        result = api_request(url, headers)

        if result and "items" in result:
            all_items.extend(result["items"])
            # Stop if we got fewer results than requested (no more pages)
            if len(result["items"]) < per_page:
                break
        else:
            break

        time.sleep(0.5)  # Rate limiting between pages

    return {"items": all_items, "total_count": len(all_items)}


def search_all_segments():
    """
    Search across multiple segments optimized for Series A targets:
    - Sweet spot: 200-50K stars, 5+ contributors, 6-24 months old
    - Focus on commercial potential and real usage signals
    """
    all_repos = {}
    date_24mo = (datetime.now() - timedelta(days=730)).strftime("%Y-%m-%d")
    date_12mo = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    date_6mo = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
    date_3mo = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

    searches = [
        # === SERIES A SWEET SPOT (1K-30K stars, 6-24mo old) ===
        (f"created:{date_24mo}..{date_6mo} stars:1000..30000", "stars", "series-a-sweet-spot", 5),
        (f"created:{date_24mo}..{date_6mo} stars:5000..30000", "stars", "series-a-mature", 3),

        # === EMERGING SERIES A CANDIDATES (500-5K stars) ===
        (f"created:{date_24mo}..{date_6mo} stars:500..5000", "stars", "emerging-series-a", 5),
        (f"created:{date_12mo}..{date_6mo} stars:200..1000", "stars", "emerging-early", 3),

        # === RECENT BREAKOUTS (last 6mo, high velocity) ===
        (f"created:>{date_6mo} stars:>500", "stars", "recent-breakout", 5),
        (f"created:>{date_6mo} stars:200..500", "stars", "recent-emerging", 3),
        (f"created:>{date_3mo} stars:100..500", "stars", "very-recent", 3),

        # === LANGUAGE-SPECIFIC (Series A range) ===
        # Python (AI/ML dominance)
        (f"created:{date_24mo}..{date_6mo} language:python stars:500..30000", "stars", "python-series-a", 4),
        (f"created:>{date_6mo} language:python stars:200..5000", "stars", "python-emerging", 3),

        # TypeScript (dev tools, frontend infra)
        (f"created:{date_24mo}..{date_6mo} language:typescript stars:500..30000", "stars", "typescript-series-a", 4),
        (f"created:>{date_6mo} language:typescript stars:200..5000", "stars", "typescript-emerging", 3),

        # Rust (performance, infra)
        (f"created:{date_24mo}..{date_6mo} language:rust stars:200..20000", "stars", "rust-series-a", 3),
        (f"created:>{date_6mo} language:rust stars:100..2000", "stars", "rust-emerging", 2),

        # Go (infrastructure, cloud native)
        (f"created:{date_24mo}..{date_6mo} language:go stars:300..20000", "stars", "go-series-a", 3),
        (f"created:>{date_6mo} language:go stars:150..3000", "stars", "go-emerging", 2),

        # === OLDER BUT UNFUNDED (opportunity) ===
        (f"created:>{date_24mo} stars:2000..50000", "stars", "older-unfunded", 3),

        # === HIGH ENGAGEMENT SIGNALS ===
        (f"created:>{date_12mo} stars:>200 forks:>50", "forks", "high-engagement", 3),
    ]

    for query, sort, segment, max_pages in searches:
        print(f"    Searching: {segment}...")
        result = search_repos_with_query(query, sort=sort, per_page=100, max_pages=max_pages)
        if result and "items" in result:
            for repo in result["items"]:
                full_name = repo["full_name"]
                if full_name not in all_repos:
                    repo["_segment"] = segment
                    all_repos[full_name] = repo
        time.sleep(0.5)  # Rate limiting between searches

    print(f"    Found {len(all_repos)} unique repos across all segments")
    return list(all_repos.values())


def analyze_and_store_repo(owner, name, language=None, description=None, topics=None):
    """Analyze a repo and store results in database."""
    metrics = {
        "owner": owner,
        "name": name,
        "repo": f"{owner}/{name}",
        "stars": None,
        "forks": None,
        "contributors": None,
        "commits_3mo": None,
        "issues_30d": None,
        "prs_30d": None,
        "dependents": None,
        "downloads": None,
        "download_source": None,
        "language": language,
        "description": description or "",
        "topics": topics or [],
        "url": f"https://github.com/{owner}/{name}"
    }

    # Fetch GitHub data
    details = get_github_repo_details(owner, name)
    if details:
        metrics["stars"] = details.get("stargazers_count")
        metrics["forks"] = details.get("forks_count")
        metrics["language"] = details.get("language")
        metrics["description"] = details.get("description", "")
        metrics["topics"] = details.get("topics", [])
        metrics["created_at"] = details.get("created_at", "")
        metrics["homepage"] = details.get("homepage", "")

    time.sleep(0.3)
    metrics["contributors"] = get_contributor_count(owner, name)
    time.sleep(0.3)
    metrics["commits_3mo"] = get_commit_activity(owner, name)
    time.sleep(0.3)

    issues, prs = get_issue_pr_activity(owner, name)
    metrics["issues_30d"] = issues
    metrics["prs_30d"] = prs
    time.sleep(0.3)

    metrics["dependents"] = get_dependents_count(owner, name)
    time.sleep(0.3)

    # Package downloads - check npm, PyPI, and crates.io
    lang = (language or metrics.get("language", "")).lower()
    package_name = name.lower()

    if lang in ["typescript", "javascript"]:
        downloads = get_npm_downloads(package_name)
        if downloads:
            metrics["downloads"] = downloads
            metrics["download_source"] = "npm/week"
        else:
            # Try with @ scope removed or hyphens
            alt_name = name.lower().replace("-", "")
            downloads = get_npm_downloads(alt_name)
            if downloads:
                metrics["downloads"] = downloads
                metrics["download_source"] = "npm/week"
    elif lang == "python":
        downloads = get_pypi_downloads(package_name)
        if downloads:
            metrics["downloads"] = downloads
            metrics["download_source"] = "pypi/week"
        else:
            # Try with underscores instead of hyphens
            alt_name = package_name.replace("-", "_")
            downloads = get_pypi_downloads(alt_name)
            if downloads:
                metrics["downloads"] = downloads
                metrics["download_source"] = "pypi/week"
    elif lang == "rust":
        downloads = get_crates_downloads(package_name)
        if downloads:
            metrics["downloads"] = downloads
            metrics["download_source"] = "crates/90d"
        else:
            # Try with underscores
            alt_name = package_name.replace("-", "_")
            downloads = get_crates_downloads(alt_name)
            if downloads:
                metrics["downloads"] = downloads
                metrics["download_source"] = "crates/90d"

    # Enrich with analysis
    metrics = enrich_repo_data(metrics)

    # Store in database
    repo_id = get_or_create_repo(owner, name, metrics.get("description"), metrics.get("language"))
    save_snapshot(repo_id, metrics)

    # Save metadata to repos table
    update_repo_metadata(
        repo_id,
        category=metrics.get("category"),
        funding_status=metrics.get("funding_status"),
        funding_amount=metrics.get("funding_amount"),
        is_big_tech=metrics.get("is_big_tech"),
        description=metrics.get("description"),
        language=metrics.get("language")
    )

    # Calculate growth metrics (will have effect after multiple snapshots)
    growth = calculate_growth_metrics(repo_id)
    if growth:
        metrics["growth_metrics"] = growth
        metrics["stars_wow"] = growth.get("stars_wow")
        metrics["stars_mom"] = growth.get("stars_mom")
        metrics["stars_acceleration"] = growth.get("stars_acceleration")
        # Recalculate investability with growth data
        metrics["investability_score"] = calculate_investability_score(
            metrics, growth, metrics.get("funding_status"), metrics.get("category")
        )

    # Calculate traction score
    score = 0
    if metrics["dependents"]:
        score += metrics["dependents"] * 10
    if metrics["downloads"]:
        score += metrics["downloads"] / 100
    if metrics["commits_3mo"]:
        score += metrics["commits_3mo"] * 5
    if metrics["contributors"]:
        score += metrics["contributors"] * 20
    if metrics["prs_30d"]:
        score += metrics["prs_30d"] * 50
    metrics["traction_score"] = int(score)

    # Save scores to growth_metrics table
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE growth_metrics
            SET traction_score = ?, investability_score = ?
            WHERE repo_id = ? AND calculated_at = (
                SELECT MAX(calculated_at) FROM growth_metrics WHERE repo_id = ?
            )
        ''', (metrics["traction_score"], metrics.get("investability_score", 0), repo_id, repo_id))
        conn.commit()
        conn.close()
    except Exception as e:
        pass  # Ignore if no growth_metrics entry yet

    return metrics


def fetch_data():
    """Fetch and analyze repository data."""
    global app_state
    app_state["is_loading"] = True
    app_state["progress"] = {"current": 0, "total": 0, "current_repo": "", "phase": "searching"}

    try:
        # Initialize database
        init_db()

        print("\n  Searching for repos across multiple segments...")
        app_state["progress"]["phase"] = "searching"
        all_repos = search_all_segments()

        if not all_repos:
            print("  No repos found!")
            app_state["is_loading"] = False
            app_state["progress"]["phase"] = "error"
            return

        repos_to_analyze = []
        for repo in all_repos:
            owner = repo["owner"]["login"]

            # Mark big tech repos (don't skip - let client filter)
            repo["_is_big_tech"] = is_big_tech(owner)

            # Skip repos with suspicious fork ratios (likely educational)
            stars = repo["stargazers_count"]
            forks = repo["forks_count"]
            if stars > 0 and forks / stars > 5:
                continue

            repos_to_analyze.append(repo)

        # Sort by stars to prioritize
        repos_to_analyze.sort(key=lambda r: r["stargazers_count"], reverse=True)

        analyzed = []
        total = len(repos_to_analyze)  # Analyze ALL repos

        app_state["progress"]["phase"] = "analyzing"
        app_state["progress"]["total"] = total

        print(f"\n  Analyzing {total} repos (this may take several minutes)...\n")

        for i, repo in enumerate(repos_to_analyze):
            owner = repo["owner"]["login"]
            name = repo["name"]

            # Update progress
            app_state["progress"]["current"] = i + 1
            app_state["progress"]["current_repo"] = f"{owner}/{name}"

            print(f"  [{i+1}/{total}] Analyzing {owner}/{name}...")

            try:
                analysis = analyze_and_store_repo(
                    owner, name,
                    repo.get("language"),
                    repo.get("description"),
                    repo.get("topics", [])
                )
                analyzed.append(analysis)
            except Exception as e:
                print(f"    Error analyzing {owner}/{name}: {e}")

            # Shorter delay, GitHub rate limit is 30 requests/minute for search
            time.sleep(0.3)

        # Sort by investability score
        analyzed.sort(key=lambda r: r.get("investability_score", 0), reverse=True)

        app_state["repos"] = analyzed
        app_state["last_updated"] = datetime.now().isoformat()

        # Calculate stats
        stats = {
            "total_repos": len(analyzed),
            "npm_tracked": sum(1 for r in analyzed if r.get("download_source", "").startswith("npm")),
            "pypi_tracked": sum(1 for r in analyzed if r.get("download_source", "").startswith("pypi")),
            "crates_tracked": sum(1 for r in analyzed if r.get("download_source", "").startswith("crates")),
            "by_language": {},
            "by_category": {},
        }

        for r in analyzed:
            lang = r.get("language") or "Unknown"
            stats["by_language"][lang] = stats["by_language"].get(lang, 0) + 1
            cat = r.get("category") or "other"
            stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1

        app_state["stats"] = stats

        # Count total snapshots
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM snapshots")
        app_state["snapshot_count"] = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(DISTINCT repo_id) FROM snapshots")
        app_state["unique_repos_tracked"] = cursor.fetchone()[0]
        conn.close()

        app_state["progress"]["phase"] = "complete"

        print(f"\n  Analysis complete!")
        print(f"  - Total repos: {stats['total_repos']}")
        print(f"  - npm packages: {stats['npm_tracked']}")
        print(f"  - PyPI packages: {stats['pypi_tracked']}")
        print(f"  - Crates packages: {stats['crates_tracked']}")

    except Exception as e:
        print(f"  Error during fetch: {e}")
        import traceback
        traceback.print_exc()
        app_state["progress"]["phase"] = "error"

    finally:
        app_state["is_loading"] = False
        app_state["progress"]["phase"] = "idle"


def get_historical_data(owner, name):
    """Get historical snapshots for a repo."""
    repo_id = get_or_create_repo(owner, name)
    snapshots = get_snapshots(repo_id, days=90)
    return snapshots


def load_data_from_database():
    """Load saved data from database into app_state."""
    global app_state

    try:
        repos = load_saved_repos()

        if repos:
            # Calculate stats
            stats = {
                "total_repos": len(repos),
                "npm_tracked": sum(1 for r in repos if (r.get("download_source") or "").startswith("npm")),
                "pypi_tracked": sum(1 for r in repos if (r.get("download_source") or "").startswith("pypi")),
                "crates_tracked": sum(1 for r in repos if (r.get("download_source") or "").startswith("crates")),
                "by_language": {},
                "by_category": {},
            }

            for r in repos:
                lang = r.get("language") or "Unknown"
                stats["by_language"][lang] = stats["by_language"].get(lang, 0) + 1
                cat = r.get("category") or "other"
                stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1

            app_state["repos"] = repos
            app_state["stats"] = stats
            app_state["snapshot_count"] = get_snapshot_count()
            app_state["last_updated"] = "Loaded from database"

            print(f"  Loaded {len(repos)} repos from database")
            return True
    except Exception as e:
        print(f"  Error loading from database: {e}")

    return False


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress logging

    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(get_dashboard_html().encode())

        elif self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(app_state, default=str).encode())

        elif self.path == '/api/refresh':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            if not app_state["is_loading"]:
                thread = threading.Thread(target=fetch_data)
                thread.start()

            self.wfile.write(json.dumps({"status": "refreshing"}).encode())

        elif self.path.startswith('/api/history/'):
            # Get historical data for a repo
            parts = self.path.replace('/api/history/', '').split('/')
            if len(parts) >= 2:
                owner, name = parts[0], parts[1]
                history = get_historical_data(owner, name)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(history, default=str).encode())
            else:
                self.send_response(400)
                self.end_headers()

        elif self.path.startswith('/api/filter'):
            # Update filters
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)

            if 'exclude_big_tech' in params:
                app_state["filters"]["exclude_big_tech"] = params['exclude_big_tech'][0] == 'true'
            if 'category' in params:
                app_state["filters"]["category"] = params['category'][0]

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "filters": app_state["filters"]}).encode())

        else:
            self.send_response(404)
            self.end_headers()


def get_dashboard_html():
    return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OSS Investment Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f7;
            min-height: 100vh;
            color: #1d1d1f;
        }

        .container { max-width: 1600px; margin: 0 auto; padding: 20px; }

        header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 24px; padding: 16px 20px;
            background: #fff; border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        h1 { font-size: 1.25rem; font-weight: 600; color: #1d1d1f; }

        .header-controls { display: flex; align-items: center; gap: 15px; }

        .filter-group { display: flex; align-items: center; gap: 8px; }

        .filter-group label { font-size: 0.8rem; color: #86868b; }

        select, .toggle-btn {
            padding: 6px 12px; border-radius: 6px; font-size: 0.8rem;
            background: #f5f5f7; border: 1px solid #d2d2d7;
            color: #1d1d1f; cursor: pointer;
        }

        select:focus, .toggle-btn:focus { outline: none; border-color: #0071e3; }

        .toggle-btn.active { background: #e8f0fe; border-color: #0071e3; color: #0071e3; }

        .refresh-btn {
            padding: 6px 14px; font-size: 0.8rem; font-weight: 500;
            background: #0071e3; border: none; border-radius: 6px;
            color: #fff; cursor: pointer;
        }

        .refresh-btn:hover { background: #0077ed; }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .stats-grid {
            display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px;
        }

        .stat-card {
            background: #fff; border-radius: 10px; padding: 16px;
            text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        .stat-card h3 { font-size: 1.5rem; font-weight: 600; color: #1d1d1f; margin-bottom: 2px; }
        .stat-card p { color: #86868b; font-size: 0.75rem; }

        .table-container {
            background: #fff; border-radius: 12px; overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        table { width: 100%; border-collapse: collapse; }

        th {
            background: #fafafa; padding: 10px 12px;
            text-align: left; font-weight: 500; font-size: 0.7rem;
            text-transform: uppercase; letter-spacing: 0.3px; color: #86868b;
            cursor: pointer; user-select: none; border-bottom: 1px solid #e8e8ed;
        }

        th:hover { background: #f5f5f7; }

        td { padding: 12px; border-bottom: 1px solid #f5f5f7; font-size: 0.85rem; color: #1d1d1f; }

        tr:hover { background: #fafafa; }

        .repo-name { font-weight: 500; color: #0071e3; text-decoration: none; }
        .repo-name:hover { text-decoration: underline; }

        .repo-desc {
            font-size: 0.75rem; color: #86868b; margin-top: 2px;
            max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .badge {
            display: inline-block; padding: 2px 6px; border-radius: 4px;
            font-size: 0.65rem; font-weight: 500;
        }

        .badge-lang { background: #e3f2fd; color: #1976d2; }
        .badge-category { background: #f5f5f7; color: #6e6e73; }
        .badge-funding { background: #e8f5e9; color: #2e7d32; }
        .badge-funding.unknown { background: #f5f5f7; color: #86868b; }

        .metric { font-weight: 500; font-variant-numeric: tabular-nums; color: #1d1d1f; }
        .metric.positive { color: #34c759; }
        .metric.negative { color: #ff3b30; }
        .metric.neutral { color: #86868b; }

        .growth-cell { display: flex; flex-direction: column; gap: 2px; }
        .growth-main { font-weight: 600; }
        .growth-accel { font-size: 0.7rem; }

        .score-badge {
            display: inline-block; padding: 3px 8px; border-radius: 4px;
            font-weight: 600; font-size: 0.8rem;
        }

        .score-high { background: #e8f5e9; color: #2e7d32; }
        .score-medium { background: #fff8e1; color: #f57c00; }
        .score-low { background: #f5f5f7; color: #86868b; }

        .loading-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.95); display: flex;
            flex-direction: column; justify-content: center; align-items: center; z-index: 1000;
        }

        .loading-overlay.hidden { display: none; }

        .spinner {
            width: 32px; height: 32px;
            border: 3px solid #e8e8ed; border-top-color: #0071e3;
            border-radius: 50%; animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .loading-text { margin-top: 16px; color: #86868b; font-size: 0.9rem; }

        .legend {
            display: flex; gap: 16px; padding: 12px 16px;
            background: #fff; border-radius: 8px; margin-bottom: 16px;
            font-size: 0.75rem; color: #86868b;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; }

        @media (max-width: 1200px) {
            .stats-grid { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 768px) {
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
            header { flex-direction: column; gap: 15px; }
            .header-controls { flex-wrap: wrap; justify-content: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>OSS Investment Dashboard</h1>
            <div class="header-controls">
                <button class="toggle-btn active" id="excludeBigTech" onclick="toggleBigTech()">
                    Exclude Big Tech
                </button>
                <div class="filter-group">
                    <label>Category</label>
                    <select id="categoryFilter" onchange="filterCategory()">
                        <option value="all">All</option>
                        <option value="ai-ml">AI/ML</option>
                        <option value="devtools">Dev Tools</option>
                        <option value="infrastructure">Infrastructure</option>
                        <option value="data">Data</option>
                        <option value="security">Security</option>
                        <option value="observability">Observability</option>
                        <option value="frontend">Frontend</option>
                        <option value="backend">Backend</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Funding</label>
                    <select id="fundingFilter" onchange="filterFunding()">
                        <option value="all">All</option>
                        <option value="unknown">Unfunded</option>
                        <option value="seed">Seed</option>
                        <option value="series-a">Series A+</option>
                    </select>
                </div>
                <span style="color: #86868b; font-size: 0.75rem;" id="lastUpdated"></span>
                <button class="refresh-btn" id="refreshBtn" onclick="refreshData()">Refresh</button>
            </div>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <h3 id="totalRepos">-</h3>
                <p>Repos</p>
            </div>
            <div class="stat-card">
                <h3 id="seriesAReady">-</h3>
                <p>Series A Ready</p>
            </div>
            <div class="stat-card">
                <h3 id="unfundedCount">-</h3>
                <p>Unfunded</p>
            </div>
            <div class="stat-card">
                <h3 id="commercialCount">-</h3>
                <p>Commercial</p>
            </div>
            <div class="stat-card">
                <h3 id="accelerating">-</h3>
                <p>Accelerating</p>
            </div>
            <div class="stat-card">
                <h3 id="snapshotCount">-</h3>
                <p>Snapshots</p>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th onclick="sortTable('series_a_fit')">#</th>
                        <th onclick="sortTable('repo')">Repository</th>
                        <th>Signals</th>
                        <th onclick="sortTable('stars')">Stars</th>
                        <th onclick="sortTable('stars_mom')">Growth</th>
                        <th onclick="sortTable('downloads')">Usage</th>
                        <th onclick="sortTable('contributors')">Team</th>
                        <th onclick="sortTable('series_a_fit')">Series A Fit</th>
                        <th onclick="sortTable('investability_score')">Invest Score</th>
                    </tr>
                </thead>
                <tbody id="repoTable">
                    <tr>
                        <td colspan="9" style="text-align: center; padding: 60px; color: #86868b;">
                            <p style="font-size: 1rem; margin-bottom: 4px;">No data yet</p>
                            <p style="font-size: 0.85rem;">Click Refresh to load data</p>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <div class="loading-overlay hidden" id="loadingOverlay">
        <div class="spinner"></div>
        <p class="loading-text" id="loadingPhase">Loading...</p>
        <div style="width: 280px; margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span id="progressText" style="color: #0071e3; font-weight: 500; font-size: 0.85rem;">0 / 0</span>
                <span id="progressPercent" style="color: #86868b; font-size: 0.85rem;">0%</span>
            </div>
            <div style="background: #e8e8ed; border-radius: 4px; height: 6px; overflow: hidden;">
                <div id="progressBar" style="background: #0071e3; height: 100%; width: 0%; transition: width 0.3s;"></div>
            </div>
            <p id="currentRepo" style="color: #86868b; font-size: 0.75rem; margin-top: 8px; text-align: center;">-</p>
        </div>
    </div>

    <script>
        let allRepos = [];
        let currentSort = { field: 'series_a_fit', asc: false };
        let filters = { excludeBigTech: true, category: 'all', funding: 'all' };

        function formatNumber(num) {
            if (num === null || num === undefined) return '-';
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }

        function formatGrowth(value) {
            if (value === null || value === undefined) return { text: '-', class: 'neutral' };
            const sign = value >= 0 ? '+' : '';
            return {
                text: sign + value.toFixed(1) + '%',
                class: value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
            };
        }

        function getScoreClass(score) {
            if (score >= 60) return 'score-high';
            if (score >= 30) return 'score-medium';
            return 'score-low';
        }

        function filterRepos(repos) {
            return repos.filter(r => {
                if (filters.excludeBigTech && r.is_big_tech) return false;
                if (filters.category !== 'all' && r.category !== filters.category) return false;
                if (filters.funding !== 'all') {
                    if (filters.funding === 'unknown' && r.funding_status !== 'unknown') return false;
                    if (filters.funding === 'seed' && r.funding_status !== 'seed') return false;
                    if (filters.funding === 'series-a' && !['series-a', 'series-b', 'series-c', 'series-d'].includes(r.funding_status)) return false;
                }
                return true;
            });
        }

        function sortRepos(repos, field, asc) {
            return [...repos].sort((a, b) => {
                let aVal = a[field] ?? -Infinity;
                let bVal = b[field] ?? -Infinity;
                return asc ? aVal - bVal : bVal - aVal;
            });
        }

        function sortTable(field) {
            if (currentSort.field === field) {
                currentSort.asc = !currentSort.asc;
            } else {
                currentSort = { field, asc: false };
            }
            renderTable();
        }

        function toggleBigTech() {
            filters.excludeBigTech = !filters.excludeBigTech;
            document.getElementById('excludeBigTech').classList.toggle('active', filters.excludeBigTech);
            renderTable();
        }

        function filterCategory() {
            filters.category = document.getElementById('categoryFilter').value;
            renderTable();
        }

        function filterFunding() {
            filters.funding = document.getElementById('fundingFilter').value;
            renderTable();
        }

        function updateStats(repos, globalStats) {
            document.getElementById('totalRepos').textContent = repos.length;

            // Series A ready (fit score >= 70)
            const seriesAReady = repos.filter(r => (r.series_a_fit || 0) >= 70).length;
            document.getElementById('seriesAReady').textContent = seriesAReady;

            // Unfunded with traction
            const unfunded = repos.filter(r => r.funding_status === 'unknown' && (r.stars || 0) > 500).length;
            document.getElementById('unfundedCount').textContent = unfunded;

            // Commercial signals (has pricing or enterprise or commercial_score >= 5)
            const commercial = repos.filter(r => r.has_pricing || r.has_enterprise || (r.commercial_score || 0) >= 5).length;
            document.getElementById('commercialCount').textContent = commercial;

            const accelerating = repos.filter(r => (r.stars_acceleration || 0) > 0).length;
            document.getElementById('accelerating').textContent = accelerating;
        }

        let globalStats = null;

        function renderTable() {
            let filtered = filterRepos(allRepos);
            let sorted = sortRepos(filtered, currentSort.field, currentSort.asc);

            updateStats(sorted, globalStats);

            const tbody = document.getElementById('repoTable');

            if (sorted.length === 0) {
                tbody.innerHTML = `
                    <tr><td colspan="9" style="text-align: center; padding: 60px; color: #86868b;">
                        <p style="font-size: 1rem;">No matching repos</p>
                        <p style="font-size: 0.85rem;">Try adjusting filters</p>
                    </td></tr>`;
                return;
            }

            tbody.innerHTML = sorted.map((r, i) => {
                const growth = formatGrowth(r.stars_mom);
                const accel = r.stars_acceleration;
                const accelClass = accel > 0 ? 'positive' : accel < 0 ? 'negative' : 'neutral';
                const accelText = accel != null ? (accel >= 0 ? '↑' : '↓') + Math.abs(accel).toFixed(1) + '%' : '';

                const fundingClass = r.funding_status === 'unknown' ? 'unknown' : '';

                // Build signals badges
                let signalBadges = [];
                signalBadges.push(`<span class="badge badge-funding ${fundingClass}">${r.funding_status || '?'}</span>`);
                if (r.has_pricing) signalBadges.push('<span class="badge" style="background:#e8f5e9;color:#2e7d32;">$</span>');
                if (r.has_enterprise) signalBadges.push('<span class="badge" style="background:#ede7f6;color:#5e35b1;">ENT</span>');
                if (r.commercial_score >= 5) signalBadges.push('<span class="badge" style="background:#fff8e1;color:#f57c00;">BIZ</span>');

                // Series A fit score styling
                const seriesAFit = r.series_a_fit || 0;
                const seriesAClass = seriesAFit >= 70 ? 'score-high' : seriesAFit >= 50 ? 'score-medium' : 'score-low';

                return `
                <tr>
                    <td>${i + 1}</td>
                    <td>
                        <a href="${r.url}" target="_blank" class="repo-name">${r.repo}</a>
                        <div class="repo-desc">${r.description || ''}</div>
                        <span class="badge badge-category" style="margin-top:4px;">${r.category || 'other'}</span>
                    </td>
                    <td>${signalBadges.join(' ')}</td>
                    <td class="metric">${formatNumber(r.stars)}</td>
                    <td>
                        <div class="growth-cell">
                            <span class="growth-main metric ${growth.class}">${growth.text}</span>
                            ${accelText ? `<span class="growth-accel metric ${accelClass}">${accelText}</span>` : ''}
                        </div>
                    </td>
                    <td class="metric">
                        ${formatNumber(r.downloads)}${r.download_source ? '<br><small style="color:#86868b">' + r.download_source + '</small>' : ''}
                        ${r.dependents ? '<br><small style="color:#0071e3;">' + formatNumber(r.dependents) + ' deps</small>' : ''}
                    </td>
                    <td class="metric">${formatNumber(r.contributors)}<br><small style="color:#86868b">${r.prs_30d || 0} PRs/mo</small></td>
                    <td><span class="score-badge ${seriesAClass}">${seriesAFit}</span></td>
                    <td><span class="score-badge ${getScoreClass(r.investability_score || 0)}">${r.investability_score || 0}</span></td>
                </tr>`;
            }).join('');
        }

        function updateDashboard(data) {
            if (data.last_updated) {
                const date = new Date(data.last_updated);
                document.getElementById('lastUpdated').textContent = date.toLocaleString();
            }

            document.getElementById('snapshotCount').textContent = data.snapshot_count || 0;

            globalStats = data.stats || {};
            allRepos = data.repos || [];
            renderTable();
        }

        async function fetchData() {
            try {
                const response = await fetch('/api/data');
                const data = await response.json();
                updateDashboard(data);
                return data;
            } catch (error) {
                console.error('Error:', error);
                return null;
            }
        }

        function updateProgress(progress) {
            const phaseText = {
                'idle': 'Ready',
                'searching': 'Searching GitHub for repos...',
                'analyzing': 'Analyzing repositories...',
                'complete': 'Complete!',
                'error': 'Error occurred'
            };

            document.getElementById('loadingPhase').textContent = phaseText[progress.phase] || 'Loading...';

            if (progress.phase === 'analyzing' && progress.total > 0) {
                const percent = Math.round((progress.current / progress.total) * 100);
                document.getElementById('progressText').textContent = `${progress.current} / ${progress.total}`;
                document.getElementById('progressPercent').textContent = `${percent}%`;
                document.getElementById('progressBar').style.width = `${percent}%`;
                document.getElementById('currentRepo').textContent = progress.current_repo || '-';
            } else if (progress.phase === 'searching') {
                document.getElementById('progressText').textContent = 'Searching...';
                document.getElementById('progressPercent').textContent = '';
                document.getElementById('progressBar').style.width = '10%';
                document.getElementById('currentRepo').textContent = 'Querying GitHub API...';
            }
        }

        async function refreshData() {
            const btn = document.getElementById('refreshBtn');
            const overlay = document.getElementById('loadingOverlay');

            btn.disabled = true;
            overlay.classList.remove('hidden');

            // Reset progress display
            document.getElementById('progressBar').style.width = '0%';
            document.getElementById('progressText').textContent = '0 / 0';
            document.getElementById('progressPercent').textContent = '0%';
            document.getElementById('currentRepo').textContent = 'Starting...';

            try {
                await fetch('/api/refresh');
            } catch (e) {
                console.error('Refresh request failed:', e);
            }

            const checkInterval = setInterval(async () => {
                try {
                    const response = await fetch('/api/data');
                    const data = await response.json();

                    // Update progress display
                    if (data.progress) {
                        updateProgress(data.progress);
                    }

                    // Check if done
                    if (!data.is_loading) {
                        clearInterval(checkInterval);
                        btn.disabled = false;
                        overlay.classList.add('hidden');
                        updateDashboard(data);
                    }
                } catch (e) {
                    console.error('Poll failed:', e);
                }
            }, 1000);  // Poll every second for smoother updates

            setTimeout(() => {
                clearInterval(checkInterval);
                btn.disabled = false;
                overlay.classList.add('hidden');
            }, 600000);  // 10 minute timeout
        }

        fetchData();
    </script>
</body>
</html>'''


def main():
    init_db()
    print(f"\n{'='*60}")
    print(f"  OSS Investment Dashboard v2")
    print(f"  http://localhost:{PORT}")
    print(f"{'='*60}")
    print(f"\nFeatures:")
    print(f"  - Historical tracking with SQLite database")
    print(f"  - Growth rate (WoW, MoM) & acceleration")
    print(f"  - Funding status detection")
    print(f"  - Big tech exclusion filter")
    print(f"  - Auto-categorization (AI/ML, DevTools, Infra, etc.)")
    print(f"  - Investability scoring")

    # Load existing data from database
    print(f"\nLoading saved data...")
    if load_data_from_database():
        print(f"  Data loaded successfully!")
    else:
        print(f"  No saved data found. Click Refresh in the dashboard to fetch data.")

    print(f"\nPress Ctrl+C to stop\n")

    with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
