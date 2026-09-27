"""DevPaths content API.

Serves the two learning-path markdown folders as a browsable curriculum:

    GET /api/tracks            -> both tracks with their week/module outline
    GET /api/manifest          -> every module's metadata (no body text)
    GET /api/modules/{track}/{slug} -> one module: metadata + rendered HTML
    GET /api/search?q=...      -> matching modules by title, summary, tags and body
    GET /api/health            -> liveness probe

The markdown files on disk are the single source of truth; nothing is duplicated here.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from markdown_it import MarkdownIt
from pydantic import BaseModel

# api/main.py -> repository root, so the content folders sit next to api/
ROOT = Path(__file__).resolve().parent.parent

TRACKS: dict[str, dict[str, str]] = {
    "ai": {
        "title": "AI Developer",
        "directory": "ai-developer-path",
        "tagline": "From working software developer to AI developer in 3–4 weeks",
        "accent": "teal",
        "icon": "brain",
        "duration": "3–4 weeks",
    },
    "spring": {
        "title": "Java Spring Boot Developer",
        "directory": "spring-boot-developer-path",
        "tagline": "Zero to production-grade Spring Boot, one week at a time",
        "accent": "lime",
        "icon": "leaf",
        "duration": "5 weeks",
    },
    "claude": {
        "title": "Claude Certification",
        "directory": "claude-certification-path",
        "tagline": "Pass Anthropic's Claude exams with project-first preparation",
        "accent": "amber",
        "icon": "award",
        "duration": "6 weeks",
    },
    "system": {
        "title": "System Design",
        "directory": "system-design-path",
        "tagline": "From 'it works' to 'it survives 100x, a region failure, and a cost review'",
        "accent": "rose",
        "icon": "layers",
        "duration": "6 weeks",
    },
    "java": {
        "title": "Java Developer",
        "directory": "java-developer-path",
        "tagline": "Modern Java end to end — language core, concurrency, toolchain, and the JVM",
        "accent": "sky",
        "icon": "coffee",
        "duration": "7 weeks",
    },
}

FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)

md = MarkdownIt("commonmark", {"html": False, "linkify": True})
md.enable("table")
md.enable("strikethrough")


class ModuleSummary(BaseModel):
    track: str
    slug: str
    title: str
    week: int
    order: int
    type: str
    hours: int
    summary: str
    tags: list[str]
    word_count: int
    headings: list[str]


class ModuleDetail(ModuleSummary):
    html: str
    markdown: str


class Track(BaseModel):
    id: str
    title: str
    tagline: str
    accent: str
    icon: str
    duration: str
    directory: str
    module_count: int
    total_hours: int
    modules: list[ModuleSummary]


def _parse(path: Path, track: str) -> ModuleDetail:
    raw = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(raw)
    meta: dict[str, Any] = yaml.safe_load(match.group(1)) if match else {}
    body = raw[match.end():] if match else raw

    headings = [line.lstrip("#").strip() for line in body.splitlines() if line.startswith("## ")]
    return ModuleDetail(
        track=track,
        slug=path.stem,
        title=meta.get("title", path.stem),
        week=int(meta.get("week", 0)),
        order=int(meta.get("order", 99)),
        type=meta.get("type", "module"),
        hours=int(meta.get("hours", 0)),
        summary=meta.get("summary", ""),
        tags=list(meta.get("tags", [])),
        word_count=len(body.split()),
        headings=headings,
        html=md.render(body),
        markdown=body,
    )


@lru_cache(maxsize=1)
def load_content() -> dict[str, list[ModuleDetail]]:
    content: dict[str, list[ModuleDetail]] = {}
    for track_id, track in TRACKS.items():
        directory = ROOT / track["directory"]
        modules = [_parse(p, track_id) for p in sorted(directory.glob("*.md"))]
        modules.sort(key=lambda m: (m.order, m.title))
        content[track_id] = modules
    return content


app = FastAPI(title="DevPaths API", version="1.0.0", docs_url="/api/docs")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _summary(module: ModuleDetail) -> ModuleSummary:
    return ModuleSummary(**module.model_dump(exclude={"html", "markdown"}))


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "tracks": {t: len(m) for t, m in load_content().items()},
    }


@app.get("/api/tracks", response_model=list[Track])
def get_tracks() -> list[Track]:
    content = load_content()
    tracks = []
    for track_id, track in TRACKS.items():
        modules = content.get(track_id, [])
        tracks.append(
            Track(
                id=track_id,
                title=track["title"],
                tagline=track["tagline"],
                accent=track["accent"],
                icon=track["icon"],
                duration=track["duration"],
                directory=track["directory"],
                module_count=len(modules),
                total_hours=sum(m.hours for m in modules),
                modules=[_summary(m) for m in modules],
            )
        )
    return tracks


@app.get("/api/manifest")
def get_manifest() -> list[dict[str, Any]]:
    return [_summary(m).model_dump() for modules in load_content().values() for m in modules]


@app.get("/api/search")
def search(q: str = "", limit: int = 20) -> list[dict[str, Any]]:
    query = q.strip().lower()
    if not query:
        return []
    results = []
    for track_id, modules in load_content().items():
        for module in modules:
            haystack = " ".join(
                [module.title, module.summary, " ".join(module.tags), " ".join(module.headings)]
            ).lower()
            score = 0
            if query in module.title.lower():
                score += 5
            if query in module.summary.lower():
                score += 3
            if any(query in tag.lower() for tag in module.tags):
                score += 2
            if query in haystack:
                score += 1
            if score:
                results.append({**_summary(module).model_dump(), "score": score})
    results.sort(key=lambda r: (-r["score"], r["track"], r["order"]))
    return results[:limit]


@app.get("/api/modules/{track}/{slug}", response_model=ModuleDetail)
def get_module(track: str, slug: str) -> ModuleDetail:
    for module in load_content().get(track, []):
        if module.slug == slug:
            return module
    raise HTTPException(status_code=404, detail=f"No module {slug} in track {track}")
