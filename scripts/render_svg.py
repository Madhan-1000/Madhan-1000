"""Render SVG assets from local JSON metrics.

Generates:
- assets/languages.svg
- assets/streak.svg
- assets/repos.svg
- assets/loc.svg
"""
from __future__ import annotations

import json
import os
from typing import Any, List

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
ASSET_DIR = os.path.join(BASE_DIR, "assets")


def load_json(name: str, default: Any) -> Any:
    path = os.path.join(DATA_DIR, name)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default


def write_asset(name: str, content: str) -> None:
    os.makedirs(ASSET_DIR, exist_ok=True)
    path = os.path.join(ASSET_DIR, name)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)


def render_languages(langs: List[List[Any]]) -> None:
    if not langs:
        placeholder = """<svg xmlns='http://www.w3.org/2000/svg' width='300' height='120'>\n<rect width='100%' height='100%' rx='6' fill='#0D1117'/>\n<text x='20' y='65' fill='#58A6FF' font-size='14' font-family='Segoe UI'>Run the workflow to populate languages.</text>\n</svg>"""
        write_asset("languages.svg", placeholder)
        return

    header = """<svg xmlns='http://www.w3.org/2000/svg' width='300' height='165' viewBox='0 0 300 165'>\n<style>\n.header { font: 600 18px 'Segoe UI'; fill: #58A6FF; }\n.lang { font: 400 11px 'Segoe UI'; fill: #C3D1D9; }\n.bar { animation: grow 0.6s ease forwards; }\n@keyframes grow { from { width: 0; } to { width: var(--w); } }\n</style>\n<rect width='100%' height='100%' rx='6' fill='#0D1117'/>\n<text x='20' y='30' class='header'>Most Used Languages</text>\n"""

    x = 20
    bars = []
    legend_y = 90
    for lang, pct, color in langs[:6]:
        width = max(6, int(250 * float(pct)))
        bars.append(
            f"<rect x='{x}' y='50' height='8' fill='{color}' class='bar' style='--w:{width}px'/>"
        )
        bars.append(
            f"<text x='{x}' y='{legend_y}' class='lang'>{lang} {(pct*100):.1f}%</text>"
        )
        legend_y += 16
        x += width

    body = "\n".join(bars)
    footer = "\n</svg>"
    write_asset("languages.svg", header + body + footer)


def render_streak(metrics: dict[str, Any]) -> None:
    streak = metrics.get("current_streak", 0)
    commits = metrics.get("total_commits", 0)
    content = f"""<svg xmlns='http://www.w3.org/2000/svg' width='300' height='110'>\n<rect width='100%' height='100%' rx='6' fill='#0D1117'/>\n<text x='20' y='35' fill='#58A6FF' font-size='18' font-family='Segoe UI'>Commit Streak</text>\n<text x='20' y='70' fill='#C3D1D9' font-size='14' font-family='Segoe UI'>Current: {streak} days</text>\n<text x='20' y='92' fill='#8B949E' font-size='12' font-family='Segoe UI'>Total commits: {commits}</text>\n</svg>"""
    write_asset("streak.svg", content)


def render_repos(metrics: dict[str, Any]) -> None:
    repo_count = metrics.get("repo_count", 0)
    stars = metrics.get("stars", 0)
    content = f"""<svg xmlns='http://www.w3.org/2000/svg' width='300' height='110'>\n<rect width='100%' height='100%' rx='6' fill='#0D1117'/>\n<text x='20' y='35' fill='#58A6FF' font-size='18' font-family='Segoe UI'>Repositories</text>\n<text x='20' y='70' fill='#C3D1D9' font-size='14' font-family='Segoe UI'>Owned: {repo_count}</text>\n<text x='20' y='92' fill='#8B949E' font-size='12' font-family='Segoe UI'>Stars across repos: {stars}</text>\n</svg>"""
    write_asset("repos.svg", content)


def render_loc(metrics: dict[str, Any]) -> None:
    loc = metrics.get("loc_estimate", 0)
    content = f"""<svg xmlns='http://www.w3.org/2000/svg' width='300' height='110'>\n<rect width='100%' height='100%' rx='6' fill='#0D1117'/>\n<text x='20' y='35' fill='#58A6FF' font-size='18' font-family='Segoe UI'>Code Volume</text>\n<text x='20' y='70' fill='#C3D1D9' font-size='14' font-family='Segoe UI'>Estimated LOC: {loc:,}</text>\n<text x='20' y='92' fill='#8B949E' font-size='12' font-family='Segoe UI'>Based on GitHub language byte totals</text>\n</svg>"""
    write_asset("loc.svg", content)


def main() -> None:
    langs = load_json("langs.json", [])
    metrics = load_json("metrics.json", {})

    render_languages(langs)
    render_streak(metrics)
    render_repos(metrics)
    render_loc(metrics)
    print("SVG assets written to assets/ directory.")


if __name__ == "__main__":
    main()
