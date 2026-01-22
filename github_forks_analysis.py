#!/usr/bin/env python3
"""
Script to find the most forked GitHub repositories from the past 3-6 months.
Uses the GitHub API to query repositories by fork count and recent activity.
"""

import urllib.request
import urllib.parse
import json
from datetime import datetime, timedelta
import time

GITHUB_API = "https://api.github.com"

def search_repos(query, sort="forks", order="desc", per_page=30):
    """Search GitHub repositories with given query parameters."""
    params = {
        "q": query,
        "sort": sort,
        "order": order,
        "per_page": per_page
    }
    url = f"{GITHUB_API}/search/repositories?{urllib.parse.urlencode(params)}"

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "GitHub-Forks-Analysis"
    }

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def format_number(num):
    """Format large numbers for readability."""
    if num >= 1000000:
        return f"{num/1000000:.1f}M"
    elif num >= 1000:
        return f"{num/1000:.1f}K"
    return str(num)

def main():
    print("=" * 80)
    print("GITHUB REPOSITORY FORK ANALYSIS - PAST 3-6 MONTHS")
    print("=" * 80)

    # Calculate date ranges
    today = datetime.now()
    three_months_ago = (today - timedelta(days=90)).strftime("%Y-%m-%d")
    six_months_ago = (today - timedelta(days=180)).strftime("%Y-%m-%d")

    print(f"\nAnalysis period: {six_months_ago} to {today.strftime('%Y-%m-%d')}")
    print("-" * 80)

    # Query 1: Repos created in last 6 months, sorted by forks
    print("\n📊 NEW REPOS (Created in past 6 months) - Most Forked")
    print("-" * 80)

    query = f"created:>{six_months_ago}"
    results = search_repos(query, sort="forks", per_page=25)

    if results and "items" in results:
        print(f"{'Rank':<5} {'Repository':<45} {'Forks':<10} {'Stars':<10} {'Language':<12} {'Created'}")
        print("-" * 110)
        for i, repo in enumerate(results["items"][:25], 1):
            name = repo["full_name"][:43]
            forks = format_number(repo["forks_count"])
            stars = format_number(repo["stargazers_count"])
            lang = (repo["language"] or "N/A")[:10]
            created = repo["created_at"][:10]
            print(f"{i:<5} {name:<45} {forks:<10} {stars:<10} {lang:<12} {created}")

    time.sleep(2)  # Rate limiting

    # Query 2: Repos with recent pushes, high fork activity
    print("\n\n📈 ACTIVELY MAINTAINED REPOS (Pushed in past 3 months) - Most Forked")
    print("-" * 80)

    query = f"pushed:>{three_months_ago} stars:>1000"
    results = search_repos(query, sort="forks", per_page=25)

    if results and "items" in results:
        print(f"{'Rank':<5} {'Repository':<45} {'Forks':<10} {'Stars':<10} {'Language':<12} {'Last Push'}")
        print("-" * 110)
        for i, repo in enumerate(results["items"][:25], 1):
            name = repo["full_name"][:43]
            forks = format_number(repo["forks_count"])
            stars = format_number(repo["stargazers_count"])
            lang = (repo["language"] or "N/A")[:10]
            pushed = repo["pushed_at"][:10]
            print(f"{i:<5} {name:<45} {forks:<10} {stars:<10} {lang:<12} {pushed}")

    time.sleep(2)

    # Query 3: AI/ML focused repos (hot category for startups)
    print("\n\n🤖 AI/ML REPOS (Created in past 6 months) - Most Forked")
    print("-" * 80)

    query = f"created:>{six_months_ago} language:python stars:>500"
    results = search_repos(query, sort="forks", per_page=20)

    if results and "items" in results:
        print(f"{'Rank':<5} {'Repository':<45} {'Forks':<10} {'Stars':<10} {'Description'}")
        print("-" * 110)
        for i, repo in enumerate(results["items"][:20], 1):
            name = repo["full_name"][:43]
            forks = format_number(repo["forks_count"])
            stars = format_number(repo["stargazers_count"])
            desc = (repo.get("description") or "N/A")[:40]
            print(f"{i:<5} {name:<45} {forks:<10} {stars:<10} {desc}")

    time.sleep(2)

    # Query 4: TypeScript/JavaScript repos (common for dev tools)
    print("\n\n🛠️  TYPESCRIPT/JS REPOS (Created in past 6 months) - Most Forked")
    print("-" * 80)

    query = f"created:>{six_months_ago} language:typescript stars:>500"
    results = search_repos(query, sort="forks", per_page=20)

    if results and "items" in results:
        print(f"{'Rank':<5} {'Repository':<45} {'Forks':<10} {'Stars':<10} {'Description'}")
        print("-" * 110)
        for i, repo in enumerate(results["items"][:20], 1):
            name = repo["full_name"][:43]
            forks = format_number(repo["forks_count"])
            stars = format_number(repo["stargazers_count"])
            desc = (repo.get("description") or "N/A")[:40]
            print(f"{i:<5} {name:<45} {forks:<10} {stars:<10} {desc}")

    time.sleep(2)

    # Query 5: Repos with "startup" indicators - smaller but growing
    print("\n\n🚀 EMERGING REPOS (500-10000 stars, high fork ratio, recent)")
    print("-" * 80)

    query = f"created:>{six_months_ago} stars:500..10000"
    results = search_repos(query, sort="forks", per_page=25)

    if results and "items" in results:
        print(f"{'Rank':<5} {'Repository':<45} {'Forks':<10} {'Stars':<10} {'Fork %':<10} {'Language'}")
        print("-" * 110)
        for i, repo in enumerate(results["items"][:25], 1):
            name = repo["full_name"][:43]
            forks = repo["forks_count"]
            stars = repo["stargazers_count"]
            fork_ratio = f"{(forks/stars*100):.1f}%" if stars > 0 else "N/A"
            lang = (repo["language"] or "N/A")[:10]
            print(f"{i:<5} {name:<45} {format_number(forks):<10} {format_number(stars):<10} {fork_ratio:<10} {lang}")

    time.sleep(2)

    # Query 6: Go repos (popular for infrastructure startups)
    print("\n\n🐹 GO REPOS (Created in past 6 months) - Most Forked")
    print("-" * 80)

    query = f"created:>{six_months_ago} language:go stars:>200"
    results = search_repos(query, sort="forks", per_page=20)

    if results and "items" in results:
        print(f"{'Rank':<5} {'Repository':<45} {'Forks':<10} {'Stars':<10} {'Description'}")
        print("-" * 110)
        for i, repo in enumerate(results["items"][:20], 1):
            name = repo["full_name"][:43]
            forks = format_number(repo["forks_count"])
            stars = format_number(repo["stargazers_count"])
            desc = (repo.get("description") or "N/A")[:40]
            print(f"{i:<5} {name:<45} {forks:<10} {stars:<10} {desc}")

    time.sleep(2)

    # Query 7: Rust repos (popular for performance-focused startups)
    print("\n\n🦀 RUST REPOS (Created in past 6 months) - Most Forked")
    print("-" * 80)

    query = f"created:>{six_months_ago} language:rust stars:>200"
    results = search_repos(query, sort="forks", per_page=20)

    if results and "items" in results:
        print(f"{'Rank':<5} {'Repository':<45} {'Forks':<10} {'Stars':<10} {'Description'}")
        print("-" * 110)
        for i, repo in enumerate(results["items"][:20], 1):
            name = repo["full_name"][:43]
            forks = format_number(repo["forks_count"])
            stars = format_number(repo["stargazers_count"])
            desc = (repo.get("description") or "N/A")[:40]
            print(f"{i:<5} {name:<45} {forks:<10} {stars:<10} {desc}")

    print("\n" + "=" * 80)
    print("Analysis complete!")
    print("Note: High fork-to-star ratios often indicate practical utility (people using the code)")
    print("=" * 80)

if __name__ == "__main__":
    main()
