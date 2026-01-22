#!/usr/bin/env python3
"""
Dashboard server for OSS Traction Analysis.
Serves the dashboard and provides API endpoints for data.
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import re
from datetime import datetime, timedelta
import threading
import os

PORT = 8080
GITHUB_API = "https://api.github.com"

# Global cache for data
cached_data = {
    "repos": [],
    "last_updated": None,
    "is_loading": False
}

def api_request(url, headers=None):
    """Make an API request with error handling."""
    if headers is None:
        headers = {"User-Agent": "GitHub-Traction-Analysis"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except:
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

    import time
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

def get_dependents_count(owner, repo):
    url = f"https://github.com/{owner}/{repo}/network/dependents"
    html = get_html(url)
    if html:
        match = re.search(r'([\d,]+)\s+Repositor', html)
        if match:
            return int(match.group(1).replace(',', ''))
    return None

def search_trending_repos(days_back=180, min_stars=500):
    date_threshold = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    query = f"created:>{date_threshold} stars:>{min_stars}"
    params = {"q": query, "sort": "stars", "order": "desc", "per_page": 50}
    url = f"{GITHUB_API}/search/repositories?{urllib.parse.urlencode(params)}"
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "GitHub-Traction-Analysis"}
    return api_request(url, headers)

def analyze_repo(owner, repo, language=None):
    import time
    result = {
        "repo": f"{owner}/{repo}",
        "owner": owner,
        "name": repo,
        "stars": None,
        "forks": None,
        "contributors": None,
        "commits_3mo": None,
        "issues_30d": None,
        "prs_30d": None,
        "dependents": None,
        "downloads": None,
        "download_source": None,
        "language": None,
        "description": "",
        "url": f"https://github.com/{owner}/{repo}"
    }

    details = get_github_repo_details(owner, repo)
    if details:
        result["stars"] = details.get("stargazers_count")
        result["forks"] = details.get("forks_count")
        result["language"] = details.get("language")
        result["description"] = details.get("description", "")
        result["created_at"] = details.get("created_at", "")

    time.sleep(0.3)
    result["contributors"] = get_contributor_count(owner, repo)
    time.sleep(0.3)
    result["commits_3mo"] = get_commit_activity(owner, repo)
    time.sleep(0.3)

    issues, prs = get_issue_pr_activity(owner, repo)
    result["issues_30d"] = issues
    result["prs_30d"] = prs
    time.sleep(0.3)

    result["dependents"] = get_dependents_count(owner, repo)
    time.sleep(0.3)

    lang = (language or result.get("language", "")).lower() if language or result.get("language") else ""
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

    # Calculate traction score
    score = 0
    if result["dependents"]:
        score += result["dependents"] * 10
    if result["downloads"]:
        score += result["downloads"] / 100
    if result["commits_3mo"]:
        score += result["commits_3mo"] * 5
    if result["contributors"]:
        score += result["contributors"] * 20
    if result["prs_30d"]:
        score += result["prs_30d"] * 50
    result["traction_score"] = int(score)

    return result

def fetch_data():
    """Fetch and analyze repository data."""
    global cached_data
    cached_data["is_loading"] = True

    try:
        results = search_trending_repos(days_back=180, min_stars=1000)
        if not results or "items" not in results:
            cached_data["is_loading"] = False
            return

        repos_to_analyze = []
        for repo in results["items"][:40]:
            stars = repo["stargazers_count"]
            forks = repo["forks_count"]
            if stars > 0 and forks / stars > 5:
                continue
            repos_to_analyze.append(repo)

        analyzed = []
        for repo in repos_to_analyze[:20]:
            owner, name = repo["full_name"].split("/")
            analysis = analyze_repo(owner, name, repo.get("language"))
            analyzed.append(analysis)

        analyzed.sort(key=lambda r: r.get("traction_score", 0), reverse=True)

        cached_data["repos"] = analyzed
        cached_data["last_updated"] = datetime.now().isoformat()
    finally:
        cached_data["is_loading"] = False

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
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
            self.wfile.write(json.dumps(cached_data).encode())
        elif self.path == '/api/refresh':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            if not cached_data["is_loading"]:
                thread = threading.Thread(target=fetch_data)
                thread.start()

            self.wfile.write(json.dumps({"status": "refreshing"}).encode())
        else:
            super().do_GET()

def get_dashboard_html():
    return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OSS Traction Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #e4e4e4;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            backdrop-filter: blur(10px);
        }

        h1 {
            font-size: 1.8rem;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .header-info {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .last-updated {
            font-size: 0.85rem;
            color: #888;
        }

        .refresh-btn {
            padding: 12px 24px;
            font-size: 1rem;
            font-weight: 600;
            color: white;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .refresh-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }

        .refresh-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
        }

        .refresh-btn.loading .icon {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat-card h3 {
            font-size: 2rem;
            margin-bottom: 5px;
            background: linear-gradient(90deg, #f093fb 0%, #f5576c 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .stat-card p {
            color: #888;
            font-size: 0.9rem;
        }

        .table-container {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            overflow: hidden;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th {
            background: rgba(102, 126, 234, 0.2);
            padding: 16px 12px;
            text-align: left;
            font-weight: 600;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #667eea;
        }

        td {
            padding: 16px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        tr:hover {
            background: rgba(255, 255, 255, 0.03);
        }

        .repo-name {
            font-weight: 600;
            color: #667eea;
            text-decoration: none;
        }

        .repo-name:hover {
            text-decoration: underline;
        }

        .repo-desc {
            font-size: 0.8rem;
            color: #888;
            margin-top: 4px;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .language-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 500;
            background: rgba(102, 126, 234, 0.2);
            color: #667eea;
        }

        .metric {
            font-weight: 600;
        }

        .metric.high {
            color: #4ade80;
        }

        .metric.medium {
            color: #fbbf24;
        }

        .metric.low {
            color: #888;
        }

        .traction-score {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 0.9rem;
        }

        .score-high {
            background: rgba(74, 222, 128, 0.2);
            color: #4ade80;
        }

        .score-medium {
            background: rgba(251, 191, 36, 0.2);
            color: #fbbf24;
        }

        .score-low {
            background: rgba(136, 136, 136, 0.2);
            color: #888;
        }

        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(26, 26, 46, 0.9);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }

        .loading-overlay.hidden {
            display: none;
        }

        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(102, 126, 234, 0.3);
            border-top-color: #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        .loading-text {
            margin-top: 20px;
            color: #888;
        }

        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #888;
        }

        .empty-state h2 {
            margin-bottom: 10px;
            color: #667eea;
        }

        @media (max-width: 768px) {
            header {
                flex-direction: column;
                gap: 15px;
                text-align: center;
            }

            .header-info {
                flex-direction: column;
            }

            th, td {
                padding: 12px 8px;
                font-size: 0.85rem;
            }

            .repo-desc {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>OSS Traction Dashboard</h1>
            <div class="header-info">
                <span class="last-updated" id="lastUpdated">Never updated</span>
                <button class="refresh-btn" id="refreshBtn" onclick="refreshData()">
                    <span class="icon">↻</span>
                    <span class="text">Refresh Data</span>
                </button>
            </div>
        </header>

        <div class="stats-grid" id="statsGrid">
            <div class="stat-card">
                <h3 id="totalRepos">-</h3>
                <p>Repos Analyzed</p>
            </div>
            <div class="stat-card">
                <h3 id="totalDownloads">-</h3>
                <p>Total Downloads/Week</p>
            </div>
            <div class="stat-card">
                <h3 id="totalDependents">-</h3>
                <p>Total Dependents</p>
            </div>
            <div class="stat-card">
                <h3 id="avgContributors">-</h3>
                <p>Avg Contributors</p>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Repository</th>
                        <th>Language</th>
                        <th>Stars</th>
                        <th>Downloads</th>
                        <th>Dependents</th>
                        <th>Contributors</th>
                        <th>PRs (30d)</th>
                        <th>Commits (3mo)</th>
                        <th>Traction Score</th>
                    </tr>
                </thead>
                <tbody id="repoTable">
                    <tr>
                        <td colspan="10" class="empty-state">
                            <h2>No data yet</h2>
                            <p>Click "Refresh Data" to fetch repository analytics</p>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <div class="loading-overlay hidden" id="loadingOverlay">
        <div class="spinner"></div>
        <p class="loading-text">Analyzing repositories... This may take a minute.</p>
    </div>

    <script>
        function formatNumber(num) {
            if (num === null || num === undefined) return '-';
            if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
            if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
            return num.toString();
        }

        function getMetricClass(value, thresholds) {
            if (value === null || value === undefined) return 'low';
            if (value >= thresholds.high) return 'high';
            if (value >= thresholds.medium) return 'medium';
            return 'low';
        }

        function getScoreClass(score) {
            if (score >= 5000) return 'score-high';
            if (score >= 1000) return 'score-medium';
            return 'score-low';
        }

        function updateDashboard(data) {
            // Update last updated
            if (data.last_updated) {
                const date = new Date(data.last_updated);
                document.getElementById('lastUpdated').textContent =
                    'Last updated: ' + date.toLocaleString();
            }

            const repos = data.repos || [];

            // Update stats
            document.getElementById('totalRepos').textContent = repos.length;

            const totalDownloads = repos.reduce((sum, r) => sum + (r.downloads || 0), 0);
            document.getElementById('totalDownloads').textContent = formatNumber(totalDownloads);

            const totalDependents = repos.reduce((sum, r) => sum + (r.dependents || 0), 0);
            document.getElementById('totalDependents').textContent = formatNumber(totalDependents);

            const contribs = repos.filter(r => r.contributors).map(r => r.contributors);
            const avgContribs = contribs.length > 0 ? Math.round(contribs.reduce((a, b) => a + b, 0) / contribs.length) : 0;
            document.getElementById('avgContributors').textContent = avgContribs;

            // Update table
            const tbody = document.getElementById('repoTable');

            if (repos.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="10" class="empty-state">
                            <h2>No data yet</h2>
                            <p>Click "Refresh Data" to fetch repository analytics</p>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = repos.map((repo, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td>
                        <a href="${repo.url}" target="_blank" class="repo-name">${repo.repo}</a>
                        <div class="repo-desc">${repo.description || ''}</div>
                    </td>
                    <td><span class="language-badge">${repo.language || 'N/A'}</span></td>
                    <td class="metric ${getMetricClass(repo.stars, {high: 30000, medium: 10000})}">${formatNumber(repo.stars)}</td>
                    <td class="metric ${getMetricClass(repo.downloads, {high: 10000, medium: 1000})}">${formatNumber(repo.downloads)}${repo.download_source ? ' <small style="color:#666">(' + repo.download_source + ')</small>' : ''}</td>
                    <td class="metric ${getMetricClass(repo.dependents, {high: 50, medium: 10})}">${formatNumber(repo.dependents)}</td>
                    <td class="metric ${getMetricClass(repo.contributors, {high: 50, medium: 20})}">${formatNumber(repo.contributors)}</td>
                    <td class="metric ${getMetricClass(repo.prs_30d, {high: 50, medium: 10})}">${repo.prs_30d || '-'}</td>
                    <td class="metric ${getMetricClass(repo.commits_3mo, {high: 100, medium: 30})}">${formatNumber(repo.commits_3mo)}</td>
                    <td><span class="traction-score ${getScoreClass(repo.traction_score)}">${formatNumber(repo.traction_score)}</span></td>
                </tr>
            `).join('');
        }

        async function fetchData() {
            try {
                const response = await fetch('/api/data');
                const data = await response.json();
                updateDashboard(data);
                return data;
            } catch (error) {
                console.error('Error fetching data:', error);
                return null;
            }
        }

        async function refreshData() {
            const btn = document.getElementById('refreshBtn');
            const overlay = document.getElementById('loadingOverlay');

            btn.disabled = true;
            btn.classList.add('loading');
            overlay.classList.remove('hidden');

            try {
                await fetch('/api/refresh');

                // Poll for completion
                const checkInterval = setInterval(async () => {
                    const data = await fetchData();
                    if (data && !data.is_loading) {
                        clearInterval(checkInterval);
                        btn.disabled = false;
                        btn.classList.remove('loading');
                        overlay.classList.add('hidden');
                    }
                }, 2000);

                // Timeout after 5 minutes
                setTimeout(() => {
                    clearInterval(checkInterval);
                    btn.disabled = false;
                    btn.classList.remove('loading');
                    overlay.classList.add('hidden');
                }, 300000);

            } catch (error) {
                console.error('Error refreshing:', error);
                btn.disabled = false;
                btn.classList.remove('loading');
                overlay.classList.add('hidden');
            }
        }

        // Initial load
        fetchData();
    </script>
</body>
</html>'''

def main():
    print(f"Starting OSS Traction Dashboard on http://localhost:{PORT}")
    print("Press Ctrl+C to stop the server")

    with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    main()
