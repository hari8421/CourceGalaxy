"""Export the markdown curriculum to a static JSON snapshot.

The React app bundles this snapshot so the site works with no backend process
running. When the FastAPI service *is* running, the frontend prefers the live API,
so editing the markdown shows up on refresh.

    python api/export_content.py

Writes:
    src/content/curriculum.json   manifest (metadata only, loaded eagerly)
    src/content/modules.json      module bodies (loaded on demand, keeps the bundle small)
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import TRACKS, load_content  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "src" / "content" / "curriculum.json"
BODIES = ROOT / "src" / "content" / "modules.json"


def build_snapshot() -> tuple[dict, dict[str, str]]:
    content = load_content()
    tracks: list[dict] = []
    bodies: dict[str, str] = {}

    for track_id, track in TRACKS.items():
        modules = content.get(track_id, [])
        entries = []
        for m in modules:
            key = f"{track_id}/{m.slug}"
            bodies[key] = m.markdown
            entries.append(
                {
                    "track": track_id,
                    "slug": m.slug,
                    "title": m.title,
                    "week": m.week,
                    "order": m.order,
                    "type": m.type,
                    "hours": m.hours,
                    "summary": m.summary,
                    "tags": m.tags,
                    "word_count": m.word_count,
                    "headings": m.headings,
                }
            )
        tracks.append(
            {
                "id": track_id,
                "title": track["title"],
                "tagline": track["tagline"],
                "accent": track["accent"],
                "icon": track["icon"],
                "duration": track["duration"],
                "directory": track["directory"],
                "module_count": len(modules),
                "total_hours": sum(m.hours for m in modules),
                "modules": entries,
            }
        )

    generated = datetime.now(timezone.utc).isoformat()
    return {"generated_at": generated, "tracks": tracks}, bodies


def main() -> None:
    manifest, bodies = build_snapshot()
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    BODIES.write_text(json.dumps(bodies, ensure_ascii=False, indent=2), encoding="utf-8")

    words = sum(m["word_count"] for t in manifest["tracks"] for m in t["modules"])
    print(
        f"wrote {MANIFEST.relative_to(ROOT)} + {BODIES.relative_to(ROOT)}: "
        f"{len(manifest['tracks'])} tracks, "
        f"{sum(t['module_count'] for t in manifest['tracks'])} modules, {words:,} words"
    )


if __name__ == "__main__":
    main()
