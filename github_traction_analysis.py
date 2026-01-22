#!/usr/bin/env python3
"""
Enhanced traction analysis for GitHub repositories.
Pulls meaningful metrics: downloads, dependents, contributors, activity.
"""

import urllib.request
import urllib.parse
import json
import re
from datetime import datetime, timedelta
import time

GITHUB_API = "https://api.github.com"

def api_request(url, headers=None):
    """Make an API request with error handling."""
    if headers is None:
        headers = {"User-Agent": "GitHub-Traction-Analysis"}

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        return None
    except Exception as e:
        return None

def get_html(url):
    """Fetch HTML content from a URL."""
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode('utf-8', errors='ignore')
    except:
        return None

def format_number(num):
    """Format large numbers for readability."""
    if num is None:
        return "N/A"
    if num >= 1000000:
        return f"{num/1000000:.1f}M"
    elif num >= 1000:
        return f"{num/1000:.1f}K"
    return str(num)

def get_github_repo_details(owner, repo):
    """Get detailed repo info from GitHub API."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}"
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Traction-Analysis"
    }
    return api_request(url, headers)

def get_contributor_count(owner, repo):
    """Get contributor count (approximate via pagination)."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contributors?per_page=1&anon=false"
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Traction-Analysis"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            # Check Link header for last page number
            link_header = response.getheader('Link', '')
            if 'rel="last"' in link_header:
                match = re.search(r'page=(\d+)>; rel="last"', link_header)
                if match:
                    return int(match.group(1))
            # If no pagination, count the response
            data = json.loads(response.read().decode())
            return len(data) if data else 0
    except:
        return None

def get_commit_activity(owner, repo):
    """Get weekly commit count for the last year."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/stats/commit_activity"
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Traction-Analysis"
    }
    data = api_request(url, headers)
    if data and isinstance(data, list):
        # Sum commits from last 12 weeks (3 months)
        recent_weeks = data[-12:] if len(data) >= 12 else data
        return sum(week.get('total', 0) for week in recent_weeks)
    return None

def get_issue_pr_activity(owner, repo):
    """Get recent issue and PR counts."""
    thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

    # Recent issues
    issues_url = f"{GITHUB_API}/search/issues?q=repo:{owner}/{repo}+type:issue+created:>{thirty_days_ago}&per_page=1"
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Traction-Analysis"
    }
    issues_data = api_request(issues_url, headers)
    issues_count = issues_data.get('total_count', 0) if issues_data else 0

    time.sleep(0.5)

    # Recent PRs
    prs_url = f"{GITHUB_API}/search/issues?q=repo:{owner}/{repo}+type:pr+created:>{thirty_days_ago}&per_page=1"
    prs_data = api_request(prs_url, headers)
    prs_count = prs_data.get('total_count', 0) if prs_data else 0

    return issues_count, prs_count

def get_npm_downloads(package_name):
    """Get weekly npm download count."""
    url = f"https://api.npmjs.org/downloads/point/last-week/{package_name}"
    data = api_request(url)
    if data and 'downloads' in data:
        return data['downloads']
    return None

def get_pypi_downloads(package_name):
    """Get PyPI download stats from pypistats API."""
    url = f"https://pypistats.org/api/packages/{package_name}/recent"
    data = api_request(url)
    if data and 'data' in data:
        return data['data'].get('last_week', None)
    return None

def get_crates_downloads(package_name):
    """Get crates.io download count."""
    url = f"https://crates.io/api/v1/crates/{package_name}"
    headers = {"User-Agent": "GitHub-Traction-Analysis"}
    data = api_request(url, headers)
    if data and 'crate' in data:
        return data['crate'].get('downloads', None)
    return None

def get_docker_pulls(image_name):
    """Get Docker Hub pull count."""
    # Handle org/repo format
    parts = image_name.split('/')
    if len(parts) == 1:
        url = f"https://hub.docker.com/v2/repositories/library/{image_name}"
    else:
        url = f"https://hub.docker.com/v2/repositories/{image_name}"

    data = api_request(url)
    if data and 'pull_count' in data:
        return data['pull_count']
    return None

def get_dependents_count(owner, repo):
    """Scrape dependent repos count from GitHub (not in API)."""
    url = f"https://github.com/{owner}/{repo}/network/dependents"
    html = get_html(url)
    if html:
        # Look for "X Repositories" or "X,XXX Repositories"
        match = re.search(r'([\d,]+)\s+Repositor', html)
        if match:
            count_str = match.group(1).replace(',', '')
            return int(count_str)
    return None

def search_trending_repos(days_back=180, min_stars=500):
    """Search for trending repos created in the past N days."""
    date_threshold = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    query = f"created:>{date_threshold} stars:>{min_stars}"
    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": 50
    }
    url = f"{GITHUB_API}/search/repositories?{urllib.parse.urlencode(params)}"
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Traction-Analysis"
    }
    return api_request(url, headers)

def analyze_repo(owner, repo, language=None):
    """Comprehensive traction analysis for a single repo."""
    result = {
        "repo": f"{owner}/{repo}",
        "stars": None,
        "forks": None,
        "contributors": None,
        "commits_3mo": None,
        "issues_30d": None,
        "prs_30d": None,
        "dependents": None,
        "downloads": None,
        "download_source": None
    }

    # Basic GitHub stats
    details = get_github_repo_details(owner, repo)
    if details:
        result["stars"] = details.get("stargazers_count")
        result["forks"] = details.get("forks_count")
        result["language"] = details.get("language")
        result["description"] = details.get("description", "")[:50]

    time.sleep(0.3)

    # Contributors
    result["contributors"] = get_contributor_count(owner, repo)
    time.sleep(0.3)

    # Commit activity
    result["commits_3mo"] = get_commit_activity(owner, repo)
    time.sleep(0.3)

    # Issue/PR activity
    issues, prs = get_issue_pr_activity(owner, repo)
    result["issues_30d"] = issues
    result["prs_30d"] = prs
    time.sleep(0.3)

    # Dependents
    result["dependents"] = get_dependents_count(owner, repo)
    time.sleep(0.3)

    # Package downloads based on language
    lang = (language or result.get("language", "")).lower() if language or result.get("language") else ""

    # Try to find package name (usually same as repo name)
    package_name = repo.lower()

    if lang in ["typescript", "javascript"]:
        downloads = get_npm_downloads(package_name)
        if downloads:
            result["downloads"] = downloads
            result["download_source"] = "npm/week"
    elif lang == "python":
        downloads = get_pypi_downloads(package_name)
        if downloads:
            result["downloads"] = downloads
            result["download_source"] = "pypi/week"
    elif lang == "rust":
        downloads = get_crates_downloads(package_name)
        if downloads:
            result["downloads"] = downloads
            result["download_source"] = "crates/total"

    return result

def main():
    print("=" * 100)
    print("COMPREHENSIVE OSS TRACTION ANALYSIS")
    print("=" * 100)
    print("\nMetrics: Stars, Forks, Contributors, Commits (3mo), Issues/PRs (30d), Dependents, Downloads")
    print("-" * 100)

    # Get trending repos from past 6 months
    print("\n🔍 Fetching trending repositories from past 6 months...")
    results = search_trending_repos(days_back=180, min_stars=1000)

    if not results or "items" not in results:
        print("Failed to fetch repositories")
        return

    repos_to_analyze = []

    # Filter to interesting repos (exclude obvious educational/fork-bait repos)
    for repo in results["items"][:40]:
        full_name = repo["full_name"]
        # Skip repos with very low star-to-fork ratio (likely educational)
        stars = repo["stargazers_count"]
        forks = repo["forks_count"]
        if stars > 0 and forks / stars > 5:  # Skip if forks >> stars
            continue
        repos_to_analyze.append(repo)

    print(f"\n📊 Analyzing {len(repos_to_analyze[:25])} repositories...\n")

    analyzed = []
    for i, repo in enumerate(repos_to_analyze[:25], 1):
        owner, name = repo["full_name"].split("/")
        print(f"  [{i}/25] Analyzing {owner}/{name}...")

        analysis = analyze_repo(owner, name, repo.get("language"))
        analysis["description"] = (repo.get("description") or "")[:40]
        analyzed.append(analysis)

        time.sleep(1)  # Rate limiting

    # Sort by a composite score (weighted)
    def traction_score(r):
        score = 0
        if r["dependents"]:
            score += r["dependents"] * 10  # Dependents are very valuable
        if r["downloads"]:
            score += r["downloads"] / 100  # Normalize downloads
        if r["commits_3mo"]:
            score += r["commits_3mo"] * 5  # Active development
        if r["contributors"]:
            score += r["contributors"] * 20  # Community size
        if r["prs_30d"]:
            score += r["prs_30d"] * 50  # PR activity is strong signal
        return score

    analyzed.sort(key=traction_score, reverse=True)

    # Print results
    print("\n" + "=" * 100)
    print("📈 TRACTION RANKINGS (sorted by composite score)")
    print("=" * 100)
    print(f"\n{'Rank':<5} {'Repository':<35} {'Stars':<8} {'Deps':<10} {'DLs':<12} {'Contribs':<9} {'Commits':<9} {'PRs/30d':<8}")
    print("-" * 100)

    for i, r in enumerate(analyzed, 1):
        repo = r["repo"][:33]
        stars = format_number(r["stars"])
        deps = format_number(r["dependents"]) if r["dependents"] else "-"

        if r["downloads"]:
            dls = f"{format_number(r['downloads'])}"
        else:
            dls = "-"

        contribs = format_number(r["contributors"]) if r["contributors"] else "-"
        commits = format_number(r["commits_3mo"]) if r["commits_3mo"] else "-"
        prs = str(r["prs_30d"]) if r["prs_30d"] else "-"

        print(f"{i:<5} {repo:<35} {stars:<8} {deps:<10} {dls:<12} {contribs:<9} {commits:<9} {prs:<8}")

    # Detailed view of top 10
    print("\n" + "=" * 100)
    print("🏆 TOP 10 DETAILED VIEW")
    print("=" * 100)

    for i, r in enumerate(analyzed[:10], 1):
        print(f"\n{i}. {r['repo']}")
        print(f"   {r.get('description', 'No description')}")
        print(f"   ⭐ Stars: {format_number(r['stars'])} | 🍴 Forks: {format_number(r['forks'])} | 👥 Contributors: {format_number(r['contributors'])}")
        print(f"   📦 Dependents: {format_number(r['dependents']) if r['dependents'] else 'N/A'}")
        print(f"   📥 Downloads: {format_number(r['downloads'])} ({r['download_source']})" if r['downloads'] else "   📥 Downloads: N/A")
        print(f"   📝 Activity (30d): {r['issues_30d']} issues, {r['prs_30d']} PRs | Commits (3mo): {r['commits_3mo']}")

    print("\n" + "=" * 100)
    print("Analysis complete!")
    print("=" * 100)

if __name__ == "__main__":
    main()
