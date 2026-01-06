"""Fetch GitHub data (repos, languages, commits) into local JSON files.

This script replaces external profile widgets by storing the raw data we need
for rendering SVGs locally. It expects GITHUB_TOKEN to be available and uses
GITHUB_USER or GITHUB_ACTOR (defaults to "Madhan-1000").
"""
import json
import os
import time
from typing import Any, Dict, Iterable, List

import requests

API_ROOT = "https://api.github.com"
TOKEN = os.environ["GITHUB_TOKEN"]
USER = os.getenv("GITHUB_USER") or os.getenv("GITHUB_ACTOR") or "Madhan-1000"
DATA_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "data")

session = requests.Session()
session.headers.update(
    {
        "Authorization": f"token {TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "local-metrics-fetcher",
    }
)


def paginated_get(url: str, params: Dict[str, Any] | None = None) -> Iterable[Dict[str, Any]]:
    """Yield items from a paginated GitHub endpoint."""
    while url:
        resp = session.get(url, params=params)
        resp.raise_for_status()
        items = resp.json()
        if not isinstance(items, list):
            break
        for item in items:
            yield item
        url = resp.links.get("next", {}).get("url")
        params = None
        time.sleep(0.15)


def write_json(path: str, payload: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def fetch_repos() -> List[Dict[str, Any]]:
    repos_url = f"{API_ROOT}/users/{USER}/repos"
    params = {"per_page": 100, "sort": "updated"}
    repos = list(paginated_get(repos_url, params=params))
    # Trim to the essentials to keep JSON compact.
    simplified = [
        {
            "name": repo.get("name"),
            "private": repo.get("private"),
            "fork": repo.get("fork"),
            "stargazers_count": repo.get("stargazers_count", 0),
            "pushed_at": repo.get("pushed_at"),
            "language": repo.get("language"),
            "languages_url": repo.get("languages_url"),
        }
        for repo in repos
        if repo.get("name")
    ]
    write_json(os.path.join(DATA_DIR, "repos.json"), simplified)
    return simplified


def fetch_languages(repos: List[Dict[str, Any]]) -> Dict[str, int]:
    totals: Dict[str, int] = {}
    for repo in repos:
        lang_url = repo.get("languages_url")
        if not lang_url:
            continue
        resp = session.get(lang_url)
        if resp.status_code == 204:
            continue  # Empty repo
        resp.raise_for_status()
        for lang, bytes_used in resp.json().items():
            totals[lang] = totals.get(lang, 0) + int(bytes_used)
        time.sleep(0.1)
    write_json(os.path.join(DATA_DIR, "lang_totals.json"), totals)
    return totals


def fetch_commits(repos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    commits: List[Dict[str, Any]] = []
    for repo in repos:
        name = repo.get("name")
        if not name or repo.get("fork"):
            continue
        url = f"{API_ROOT}/repos/{USER}/{name}/commits"
        params = {"author": USER, "per_page": 100}
        page_url = url
        while page_url:
            resp = session.get(page_url, params=params)
            if resp.status_code == 409:
                break  # Empty repository
            resp.raise_for_status()
            batch = resp.json()
            if not isinstance(batch, list) or not batch:
                break
            for commit in batch:
                info = commit.get("commit") or {}
                date = ((info.get("author") or {}).get("date"))
                if date:
                    commits.append(
                        {
                            "sha": commit.get("sha"),
                            "repo": name,
                            "date": date,
                        }
                    )
            page_url = resp.links.get("next", {}).get("url")
            params = None
            time.sleep(0.15)
    write_json(os.path.join(DATA_DIR, "commits.json"), commits)
    return commits


def main() -> None:
    repos = fetch_repos()
    fetch_languages(repos)
    fetch_commits(repos)
    print(f"Fetched {len(repos)} repos for {USER}.")


if __name__ == "__main__":
    main()
