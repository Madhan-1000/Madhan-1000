"""Derive simple metrics from fetched GitHub data.

Outputs:
- data/langs.json: list of [language, pct (0-1), color]
- data/metrics.json: streak, commit totals, repo and star counts, LOC estimate
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List

DATA_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "data")

LANG_COLORS: Dict[str, str] = {
    "Python": "#3572A5",
    "JavaScript": "#F1E05A",
    "TypeScript": "#3178C6",
    "HTML": "#E34C26",
    "CSS": "#563D7C",
    "C++": "#F34B7D",
    "C": "#555555",
    "Java": "#B07219",
    "Go": "#00ADD8",
    "Rust": "#DEA584",
    "Shell": "#89E051",
}


def load_json(path: str, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default


def normalise_iso(date_str: str) -> datetime:
    if date_str.endswith("Z"):
        date_str = date_str.replace("Z", "+00:00")
    return datetime.fromisoformat(date_str)


def compute_streak(dates: Iterable[datetime.date]) -> int:
    seen = set(dates)
    if not seen:
        return 0
    streak = 0
    today = datetime.utcnow().date()
    while (today - timedelta(days=streak)) in seen:
        streak += 1
    return streak


def build_langs(lang_totals: Dict[str, int]) -> List[List[Any]]:
    if not lang_totals:
        return []
    total_bytes = sum(lang_totals.values()) or 1
    ranked = sorted(lang_totals.items(), key=lambda item: item[1], reverse=True)
    return [
        [lang, round(bytes_used / total_bytes, 4), LANG_COLORS.get(lang, "#58A6FF")]
        for lang, bytes_used in ranked
    ]


def main() -> None:
    repos = load_json(os.path.join(DATA_DIR, "repos.json"), [])
    commits = load_json(os.path.join(DATA_DIR, "commits.json"), [])
    lang_totals = load_json(os.path.join(DATA_DIR, "lang_totals.json"), {})

    langs = build_langs(lang_totals)
    with open(os.path.join(DATA_DIR, "langs.json"), "w", encoding="utf-8") as handle:
        json.dump(langs, handle, indent=2)

    dates = [normalise_iso(item["date"]).date() for item in commits if item.get("date")]
    streak = compute_streak(dates)

    total_commits = len(commits)
    repo_count = len(repos)
    stars = sum(int(repo.get("stargazers_count", 0)) for repo in repos)
    loc_estimate = int(sum(lang_totals.values()) / 50) if lang_totals else 0

    metrics = {
        "current_streak": streak,
        "total_commits": total_commits,
        "repo_count": repo_count,
        "stars": stars,
        "loc_estimate": loc_estimate,
        "last_generated": datetime.now(timezone.utc).isoformat(),
    }

    with open(os.path.join(DATA_DIR, "metrics.json"), "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2)


if __name__ == "__main__":
    main()
