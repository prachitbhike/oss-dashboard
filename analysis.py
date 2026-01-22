#!/usr/bin/env python3
"""
Enhanced analysis module with funding detection, big tech filtering,
and category tagging for investment sourcing.
"""

import urllib.request
import urllib.parse
import json
import re
from datetime import datetime, timedelta

# Big tech organizations to exclude
BIG_TECH_ORGS = {
    # FAANG+
    'microsoft', 'google', 'facebook', 'meta', 'amazon', 'apple', 'netflix',
    'alphabet', 'aws', 'azure', 'googlecloud',
    # Google-related
    'googlechrome', 'chromedevtools', 'chromium', 'googleapis', 'googlefonts',
    'googlecloudplatform', 'google-research', 'tensorflow', 'angular',
    # Microsoft-related
    'microsoftdocs', 'dotnet', 'azure-samples', 'vscode', 'typescript',
    # Other large tech
    'oracle', 'ibm', 'salesforce', 'adobe', 'vmware', 'cisco', 'intel',
    'nvidia', 'amd', 'qualcomm', 'samsung', 'huawei', 'alibaba', 'tencent',
    'baidu', 'bytedance', 'jd', 'meituan',
    # Samsung
    'samsungsailmontreal', 'samsungresearch',
    # Large tech companies
    'uber', 'lyft', 'airbnb', 'stripe', 'paypal', 'square', 'block',
    'twitter', 'x', 'snap', 'snapchat', 'pinterest', 'linkedin',
    'spotify', 'dropbox', 'slack', 'zoom', 'twilio', 'datadog',
    'snowflake', 'databricks', 'confluent', 'mongodb', 'elastic',
    # Cloud providers
    'digitalocean', 'cloudflare', 'fastly', 'vercel', 'netlify',
    # Developer platforms (large)
    'github', 'gitlab', 'atlassian', 'jetbrains', 'hashicorp',
    # AI Giants / Well-funded AI
    'openai', 'anthropic', 'anthropics', 'deepmind', 'cohere',
    'deepseek-ai', 'qwenlm', 'mistralai',
    # Chinese AI giants
    'tongyi-mai', 'alibabaresearch',
    # Other established companies
    'redhat', 'canonical', 'suse', 'cloudera', 'palantir', 'splunk',
}

# Category keywords for auto-tagging
CATEGORY_KEYWORDS = {
    'ai-ml': [
        'llm', 'gpt', 'transformer', 'neural', 'deep learning', 'machine learning',
        'ml', 'ai', 'artificial intelligence', 'nlp', 'computer vision', 'cv',
        'embedding', 'vector', 'rag', 'agent', 'chatbot', 'generative',
        'diffusion', 'stable diffusion', 'language model', 'fine-tun',
        'inference', 'training', 'model', 'pytorch', 'tensorflow', 'hugging',
    ],
    'devtools': [
        'developer', 'ide', 'editor', 'debugger', 'profiler', 'linter',
        'formatter', 'cli', 'command line', 'terminal', 'shell', 'sdk',
        'api', 'framework', 'library', 'toolkit', 'devtool', 'dx',
        'code generation', 'copilot', 'autocomplete', 'snippet',
    ],
    'infrastructure': [
        'kubernetes', 'k8s', 'docker', 'container', 'orchestration',
        'infrastructure', 'infra', 'cloud', 'serverless', 'lambda',
        'terraform', 'pulumi', 'ansible', 'helm', 'gitops', 'ci/cd',
        'pipeline', 'deployment', 'scaling', 'load balancer', 'proxy',
        'service mesh', 'istio', 'envoy', 'ingress',
    ],
    'data': [
        'database', 'sql', 'nosql', 'postgres', 'mysql', 'redis',
        'elasticsearch', 'kafka', 'streaming', 'etl', 'pipeline',
        'data warehouse', 'analytics', 'olap', 'oltp', 'timeseries',
        'graph database', 'vector database', 'data lake', 'spark',
        'flink', 'airflow', 'dagster', 'dbt', 'data engineering',
    ],
    'security': [
        'security', 'auth', 'authentication', 'authorization', 'oauth',
        'sso', 'identity', 'iam', 'rbac', 'encryption', 'cryptography',
        'vulnerability', 'scanner', 'pentest', 'penetration', 'siem',
        'firewall', 'waf', 'devsecops', 'secrets', 'vault', 'compliance',
    ],
    'observability': [
        'monitoring', 'observability', 'logging', 'tracing', 'metrics',
        'apm', 'alerting', 'dashboard', 'grafana', 'prometheus',
        'opentelemetry', 'jaeger', 'zipkin', 'elk', 'log aggregation',
    ],
    'frontend': [
        'react', 'vue', 'angular', 'svelte', 'frontend', 'ui', 'ux',
        'component', 'design system', 'css', 'tailwind', 'styled',
        'animation', 'web', 'browser', 'dom', 'javascript', 'typescript',
    ],
    'backend': [
        'backend', 'server', 'rest', 'graphql', 'grpc', 'websocket',
        'microservice', 'monolith', 'api gateway', 'rate limit',
        'caching', 'queue', 'message broker', 'event driven',
    ],
    'fintech': [
        'payment', 'fintech', 'banking', 'trading', 'crypto', 'blockchain',
        'defi', 'wallet', 'transaction', 'ledger', 'invoice', 'billing',
    ],
}

# Funding-related keywords to search for
FUNDING_KEYWORDS = [
    'raised', 'funding', 'series a', 'series b', 'series c', 'seed',
    'pre-seed', 'venture', 'investment', 'investor', 'backed by',
    'yc', 'y combinator', 'a]6z', 'andreessen', 'sequoia', 'greylock',
    'accel', 'index ventures', 'benchmark', 'lightspeed', 'general catalyst',
]

# Non-investable repo patterns (educational, curated lists, not companies)
NON_INVESTABLE_PATTERNS = {
    'name_patterns': [
        'awesome-', 'awesome_', '-awesome', '_awesome',
        'cheatsheet', 'cheat-sheet', 'cheat_sheet',
        'interview', 'leetcode', 'algorithm', 'data-structure',
        'tutorial', 'learn-', 'learning-', '-tutorial',
        'example', 'sample', 'demo', 'boilerplate', 'starter',
        'course', 'roadmap', 'guide', 'handbook', 'book',
        'dotfiles', 'config', 'setup',
    ],
    'description_patterns': [
        'curated list', 'awesome list', 'collection of',
        'interview prep', 'coding interview', 'system design interview',
        'cheat sheet', 'cheatsheet', 'quick reference',
        'learning resource', 'study guide', 'course material',
        'my personal', 'my dotfiles', 'my config',
    ],
}


def is_big_tech(owner):
    """Check if the repo owner is a big tech company."""
    return owner.lower() in BIG_TECH_ORGS


def is_non_investable_repo(name, description=None):
    """
    Check if repo matches patterns indicating it's not a company/product.
    Returns (is_non_investable, reason)
    """
    name_lower = name.lower()
    desc_lower = (description or '').lower()

    # Check name patterns
    for pattern in NON_INVESTABLE_PATTERNS['name_patterns']:
        if pattern in name_lower:
            return True, f"name matches '{pattern}'"

    # Check description patterns
    for pattern in NON_INVESTABLE_PATTERNS['description_patterns']:
        if pattern in desc_lower:
            return True, f"description matches '{pattern}'"

    return False, None


def categorize_repo(description, topics=None, readme=None):
    """Auto-categorize a repo based on description, topics, and README."""
    if not description:
        description = ""

    text = description.lower()
    if topics:
        text += " " + " ".join(topics).lower()
    if readme:
        text += " " + readme.lower()[:2000]  # First 2000 chars of README

    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scores[category] = score

    if not scores:
        return 'other'

    # Return category with highest score
    return max(scores, key=scores.get)


def detect_funding_status(owner, repo, description=None):
    """
    Attempt to detect funding status through various signals.
    Returns: (status, amount, source)
    - status: 'unfunded', 'seed', 'series-a', 'series-b+', 'acquired', 'unknown'
    """
    # First check if it's a known funded company
    known_funded = {
        'langchain-ai': ('series-a', '$25M', 'Sequoia'),
        'huggingface': ('series-d', '$235M', 'Known'),
        'vercel': ('series-d', '$250M', 'Known'),
        'supabase': ('series-c', '$116M', 'Known'),
        'prisma': ('series-b', '$40M', 'Known'),
        'planetscale': ('series-c', '$50M', 'Known'),
        'neon': ('series-b', '$104M', 'Known'),
        'airbyte': ('series-b', '$150M', 'Known'),
        'temporal': ('series-b', '$103M', 'Known'),
        'dagster': ('series-b', '$33M', 'Known'),
        'prefect': ('series-b', '$32M', 'Known'),
        'posthog': ('series-b', '$15M', 'Known'),
        'cal.com': ('series-a', '$25M', 'Known'),
        'dagger': ('series-a', '$20M', 'Known'),
        'infisical': ('seed', '$2.8M', 'Known'),
        'trigger.dev': ('seed', '$3M', 'Known'),
        'composio': ('seed', '$2M', 'Known'),  # ComposioHQ
    }

    owner_lower = owner.lower()
    if owner_lower in known_funded:
        return known_funded[owner_lower]

    # Check for YC badge in description
    if description:
        desc_lower = description.lower()
        if 'y combinator' in desc_lower or '(yc' in desc_lower:
            return ('seed', 'YC-backed', 'YC')

    # Default to unknown - would need API calls to get real data
    return ('unknown', None, None)


def search_for_funding_news(owner, repo):
    """
    Search for recent funding news about the project.
    This is a placeholder - would integrate with news API or Crunchbase.
    """
    # In production, you'd call:
    # - Crunchbase API
    # - Google News API
    # - TechCrunch search
    # For now, return None
    return None


def calculate_investability_score(metrics, growth_metrics=None, funding_status=None, category=None,
                                   repo_name=None, description=None, created_at=None):
    """
    Calculate an investability score (0-100) based on multiple factors.
    Higher = more attractive investment opportunity.

    Includes penalties for:
    - Non-investable repos (awesome lists, tutorials, cheatsheets)
    - Single maintainer with no recent activity
    - Old unfunded projects (likely hobby/lifestyle)

    Includes bonuses for:
    - Young breakout projects (<6mo old with strong metrics)
    """
    score = 0
    max_score = 100

    # Base traction (up to 15 points) - reduced weight, stars are vanity metric
    stars = metrics.get('stars', 0) or 0
    if stars >= 10000:
        score += 15
    elif stars >= 5000:
        score += 12
    elif stars >= 1000:
        score += 9
    elif stars >= 500:
        score += 6

    # Downloads/usage (up to 20 points)
    downloads = metrics.get('downloads', 0) or 0
    if downloads >= 100000:
        score += 20
    elif downloads >= 10000:
        score += 15
    elif downloads >= 1000:
        score += 10
    elif downloads > 0:
        score += 5

    # Dependents - STRONGEST signal for real usage (up to 25 points)
    dependents = metrics.get('dependents', 0) or 0
    if dependents >= 500:
        score += 25
    elif dependents >= 100:
        score += 20
    elif dependents >= 50:
        score += 15
    elif dependents >= 10:
        score += 10
    elif dependents > 0:
        score += 5

    # Team size / contributors (up to 10 points)
    contributors = metrics.get('contributors', 0) or 0
    if contributors >= 50:
        score += 10
    elif contributors >= 20:
        score += 7
    elif contributors >= 5:
        score += 5
    elif contributors > 1:
        score += 2

    # Activity - PRs and commits (up to 10 points)
    prs = metrics.get('prs_30d', 0) or 0
    commits = metrics.get('commits_3mo', 0) or 0
    if prs >= 50 or commits >= 200:
        score += 10
    elif prs >= 20 or commits >= 100:
        score += 7
    elif prs >= 5 or commits >= 30:
        score += 4

    # Growth/Velocity metrics (up to 20 points) - INCREASED weight for momentum
    if growth_metrics:
        stars_mom = growth_metrics.get('stars_mom', 0) or 0
        acceleration = growth_metrics.get('stars_acceleration', 0) or 0
        downloads_mom = growth_metrics.get('downloads_mom', 0) or 0

        # MoM growth - stronger weighting for velocity
        if stars_mom >= 100:
            score += 12  # Viral growth
        elif stars_mom >= 50:
            score += 10
        elif stars_mom >= 20:
            score += 7
        elif stars_mom >= 10:
            score += 4

        # Acceleration bonus (growth is speeding up)
        if acceleration > 10:
            score += 8
        elif acceleration > 5:
            score += 6
        elif acceleration > 0:
            score += 3

        # Downloads growth bonus (real usage velocity)
        if downloads_mom >= 50:
            score += 5
        elif downloads_mom >= 20:
            score += 3

    # Funding gap bonus (up to 5 points)
    # Unfunded + high traction = opportunity
    if funding_status == 'unfunded' or funding_status == 'unknown':
        if stars >= 5000 or downloads >= 10000:
            score += 5
        elif stars >= 1000:
            score += 3

    # Hot category bonus
    hot_categories = ['ai-ml', 'security', 'infrastructure', 'devtools']
    if category in hot_categories:
        score += 5

    # ============ PENALTIES (negative signals) ============

    # Non-investable repo penalty (awesome lists, tutorials, etc.)
    if repo_name and description:
        is_non_inv, reason = is_non_investable_repo(repo_name, description)
        if is_non_inv:
            score -= 30  # Heavy penalty - these are not companies

    # Single maintainer with low activity penalty
    contributors = metrics.get('contributors', 0) or 0
    prs = metrics.get('prs_30d', 0) or 0
    commits = metrics.get('commits_3mo', 0) or 0
    if contributors <= 1 and prs < 5 and commits < 20:
        score -= 15  # Likely abandoned or hobby project

    # Old unfunded project penalty (>2 years old, still unknown funding)
    if created_at and funding_status in ('unknown', 'unfunded'):
        try:
            if isinstance(created_at, str):
                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            else:
                created_date = created_at
            age_days = (datetime.now(created_date.tzinfo) if created_date.tzinfo else datetime.now() - created_date).days if hasattr(created_date, 'tzinfo') else (datetime.now() - created_date).days
            # Simpler calculation
            age_days = (datetime.utcnow() - created_date.replace(tzinfo=None)).days
            if age_days > 730:  # >2 years
                score -= 10  # Likely lifestyle/hobby project, not venture-scale
            elif age_days > 1095:  # >3 years
                score -= 15
        except:
            pass  # Skip if date parsing fails

    # ============ BONUSES (positive signals) ============

    # Recency bonus - young breakout projects (<6mo with strong metrics)
    if created_at:
        try:
            if isinstance(created_at, str):
                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            else:
                created_date = created_at
            age_days = (datetime.utcnow() - created_date.replace(tzinfo=None)).days
            stars = metrics.get('stars', 0) or 0
            dependents = metrics.get('dependents', 0) or 0

            # Young project with strong traction = hot opportunity
            if age_days < 180:  # <6 months old
                if stars >= 1000 or dependents >= 20:
                    score += 10  # Breakout project bonus
                elif stars >= 500 or dependents >= 10:
                    score += 5
        except:
            pass  # Skip if date parsing fails

    # Ensure score stays in valid range
    return max(0, min(score, max_score))


def get_repo_readme(owner, repo):
    """Fetch the README content for categorization."""
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/main/README.md"
    headers = {"User-Agent": "OSS-Traction-Analysis"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.read().decode('utf-8', errors='ignore')
    except:
        # Try master branch
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/master/README.md"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.read().decode('utf-8', errors='ignore')
        except:
            return None


def detect_commercial_signals(description=None, readme=None, homepage=None):
    """
    Detect signals that indicate commercial intent / company behind the repo.
    Returns dict with signals found.
    """
    signals = {
        'has_company': False,
        'has_pricing': False,
        'has_enterprise': False,
        'has_cloud': False,
        'has_docs_site': False,
        'commercial_score': 0  # 0-10 score
    }

    text = ""
    if description:
        text += description.lower() + " "
    if readme:
        text += readme.lower()[:5000] + " "  # First 5000 chars

    # Check for pricing/commercial indicators
    pricing_keywords = ['pricing', 'plans', 'enterprise', 'pro version', 'premium',
                       'subscription', 'license', 'commercial', 'paid', 'free tier',
                       'contact sales', 'book a demo', 'request demo', 'talk to sales']
    for kw in pricing_keywords:
        if kw in text:
            signals['has_pricing'] = True
            signals['commercial_score'] += 2
            break

    # Check for enterprise features
    enterprise_keywords = ['enterprise', 'sso', 'saml', 'ldap', 'audit log',
                          'role-based', 'rbac', 'compliance', 'soc 2', 'hipaa',
                          'gdpr', 'on-premise', 'self-hosted', 'air-gapped']
    enterprise_count = sum(1 for kw in enterprise_keywords if kw in text)
    if enterprise_count >= 2:
        signals['has_enterprise'] = True
        signals['commercial_score'] += 3

    # Check for cloud/hosted offering
    cloud_keywords = ['cloud', 'hosted', 'saas', 'managed', 'our platform',
                     'sign up', 'get started', 'try for free', 'start free']
    for kw in cloud_keywords:
        if kw in text:
            signals['has_cloud'] = True
            signals['commercial_score'] += 2
            break

    # Check for company indicators
    company_keywords = ['our team', 'about us', 'careers', 'we are', 'our company',
                       'founded', 'investors', 'backed by', 'raised', 'funding']
    for kw in company_keywords:
        if kw in text:
            signals['has_company'] = True
            signals['commercial_score'] += 2
            break

    # Check for documentation site (indicates investment in product)
    if homepage:
        homepage_lower = homepage.lower()
        if homepage_lower and not 'github.com' in homepage_lower:
            signals['has_docs_site'] = True
            signals['commercial_score'] += 1

    return signals


def calculate_series_a_fit(metrics, funding_status=None, created_at=None, commercial_signals=None):
    """
    Calculate how well a repo fits the Series A investment profile.
    Returns a score 0-100 where higher = better Series A fit.
    """
    score = 50  # Start at neutral

    stars = metrics.get('stars', 0) or 0
    contributors = metrics.get('contributors', 0) or 0
    dependents = metrics.get('dependents', 0) or 0
    downloads = metrics.get('downloads', 0) or 0

    # === STAR RANGE (sweet spot: 1K-30K) ===
    if 1000 <= stars <= 30000:
        score += 15  # Sweet spot
    elif 500 <= stars < 1000:
        score += 10  # Emerging
    elif 30000 < stars <= 50000:
        score += 5   # Maybe late but possible
    elif stars > 50000:
        score -= 15  # Too late for Series A
    elif stars < 200:
        score -= 10  # Too early

    # === TEAM SIZE (sweet spot: 5-50 contributors) ===
    if 5 <= contributors <= 50:
        score += 10  # Real team forming
    elif contributors > 50:
        score += 5   # Large community
    elif contributors <= 2:
        score -= 15  # Single maintainer risk

    # === REAL USAGE (dependents + downloads) ===
    if dependents >= 50 or downloads >= 10000:
        score += 15  # Strong production usage
    elif dependents >= 10 or downloads >= 1000:
        score += 10  # Growing usage
    elif dependents > 0 or downloads > 0:
        score += 5   # Some usage

    # === AGE (sweet spot: 6-24 months) ===
    if created_at:
        try:
            if isinstance(created_at, str):
                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            else:
                created_date = created_at
            age_days = (datetime.utcnow() - created_date.replace(tzinfo=None)).days
            age_months = age_days / 30

            if 6 <= age_months <= 24:
                score += 10  # Sweet spot timing
            elif 3 <= age_months < 6:
                score += 5   # Emerging, might be early
            elif 24 < age_months <= 36:
                score += 0   # Neutral
            elif age_months > 36:
                score -= 10  # Why no funding yet?
        except:
            pass

    # === FUNDING STATUS ===
    if funding_status == 'seed':
        score += 15  # Perfect - ready for Series A
    elif funding_status == 'unknown':
        score += 10  # Opportunity
    elif funding_status in ('series-a', 'series-b', 'series-c', 'series-d'):
        score -= 20  # Already funded

    # === COMMERCIAL SIGNALS ===
    if commercial_signals:
        score += commercial_signals.get('commercial_score', 0)
        if commercial_signals.get('has_pricing'):
            score += 5  # Revenue potential
        if commercial_signals.get('has_enterprise'):
            score += 5  # Enterprise ready

    return max(0, min(100, score))


def enrich_repo_data(repo_data):
    """
    Enrich repository data with funding, category, investability, and Series A fit.
    """
    owner = repo_data.get('owner', '')
    name = repo_data.get('name', '')
    description = repo_data.get('description', '')

    # Check big tech
    repo_data['is_big_tech'] = is_big_tech(owner)

    # Fetch README for better analysis (only if not already present)
    readme = repo_data.get('readme')
    if not readme:
        readme = get_repo_readme(owner, name)
        repo_data['readme'] = readme

    # Category (now with README for better accuracy)
    topics = repo_data.get('topics', [])
    repo_data['category'] = categorize_repo(description, topics, readme)

    # Funding
    funding_status, funding_amount, funding_source = detect_funding_status(
        owner, name, description
    )
    repo_data['funding_status'] = funding_status
    repo_data['funding_amount'] = funding_amount
    repo_data['funding_source'] = funding_source

    # Check if repo is non-investable (for flagging in UI)
    is_non_inv, non_inv_reason = is_non_investable_repo(name, description)
    repo_data['is_non_investable'] = is_non_inv
    repo_data['non_investable_reason'] = non_inv_reason

    # Detect commercial signals
    homepage = repo_data.get('homepage', '')
    commercial_signals = detect_commercial_signals(description, readme, homepage)
    repo_data['commercial_signals'] = commercial_signals
    repo_data['commercial_score'] = commercial_signals.get('commercial_score', 0)
    repo_data['has_pricing'] = commercial_signals.get('has_pricing', False)
    repo_data['has_enterprise'] = commercial_signals.get('has_enterprise', False)

    # Investability score (now with penalties and bonuses)
    repo_data['investability_score'] = calculate_investability_score(
        repo_data,
        growth_metrics=repo_data.get('growth_metrics'),
        funding_status=funding_status,
        category=repo_data['category'],
        repo_name=name,
        description=description,
        created_at=repo_data.get('created_at')
    )

    # Series A fit score
    repo_data['series_a_fit'] = calculate_series_a_fit(
        repo_data,
        funding_status=funding_status,
        created_at=repo_data.get('created_at'),
        commercial_signals=commercial_signals
    )

    return repo_data


if __name__ == "__main__":
    # Test the module
    print("Testing analysis module...")

    # Test big tech detection
    assert is_big_tech('Microsoft') == True
    assert is_big_tech('google') == True
    assert is_big_tech('some-startup') == False
    print("✓ Big tech detection works")

    # Test categorization
    assert categorize_repo("A machine learning framework for NLP") == 'ai-ml'
    assert categorize_repo("Kubernetes deployment automation") == 'infrastructure'
    assert categorize_repo("React component library") == 'frontend'
    print("✓ Category detection works")

    # Test funding detection
    status, amount, source = detect_funding_status('langchain-ai', 'langchain')
    assert status == 'series-a'
    print("✓ Funding detection works")

    # Test non-investable detection
    is_non, reason = is_non_investable_repo('awesome-python', 'A curated list of Python frameworks')
    assert is_non == True
    is_non, reason = is_non_investable_repo('actual-startup', 'A real product that does something')
    assert is_non == False
    is_non, reason = is_non_investable_repo('leetcode-solutions', 'Interview prep materials')
    assert is_non == True
    print("✓ Non-investable detection works")

    # Test scoring with penalties
    non_investable_metrics = {'stars': 5000, 'contributors': 1, 'prs_30d': 0, 'commits_3mo': 5}
    score = calculate_investability_score(
        non_investable_metrics,
        repo_name='awesome-tools',
        description='A curated list of awesome tools'
    )
    assert score < 30, f"Expected low score for non-investable repo, got {score}"
    print("✓ Scoring penalties work")

    print("\nAll tests passed!")
