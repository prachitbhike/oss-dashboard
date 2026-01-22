# OSS Investment Sourcing Dashboard

A tool for tracking and analyzing open source projects to identify investment opportunities. Monitors GitHub repositories for traction signals, growth metrics, and investment potential.

## Features

- **Traction Analysis**: Track stars, forks, contributors, and growth over time
- **Big Tech Filtering**: Automatically exclude repositories from large tech companies (FAANG, etc.)
- **Category Tagging**: Auto-categorize repos (AI/ML, DevTools, Infrastructure, Data, Security, etc.)
- **Funding Detection**: Identify projects with existing VC backing
- **Investability Scoring**: Composite score based on growth, engagement, and market signals
- **Historical Tracking**: SQLite database for tracking metrics over time
- **Web Dashboard**: Interactive UI for browsing and filtering projects

## Setup

```bash
# Install dependencies (uses standard library, no external packages required)
python3 dashboard_v2.py
```

The dashboard will be available at `http://localhost:8080`

## Project Structure

- `dashboard_v2.py` - Main web server and dashboard UI
- `analysis.py` - Funding detection, categorization, and scoring logic
- `database.py` - SQLite database operations and metrics tracking
- `github_traction_analysis.py` - GitHub API integration for traction metrics
- `github_forks_analysis.py` - Fork analysis utilities
- `oss_traction.db` - SQLite database (auto-created)

## Categories

Projects are automatically tagged into categories:
- AI/ML
- DevTools
- Infrastructure
- Data
- Security
- Observability
- Frontend
- Backend
- Fintech

## License

MIT
