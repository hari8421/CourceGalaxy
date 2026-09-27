# DevPaths

Five complete, project-first learning paths, delivered as browsable markdown.

| Folder | What it is |
| --- | --- |
| [`ai-developer-path/`](./ai-developer-path) | **AI Developer** — 4 weeks. From working software developer to shipping AI products. |
| [`java-developer-path/`](./java-developer-path) | **Java Developer** — 7 weeks. Language core, concurrency, toolchain, and the JVM, up to Java 27. |
| [`spring-boot-developer-path/`](./spring-boot-developer-path) | **Java Spring Boot Developer** — 5 weeks. From modern Java to a containerised, secured, tested service. |
| [`claude-certification-path/`](./claude-certification-path) | **Claude Certification** — 6 weeks. Preparation for Anthropic's four Claude exams, built around the Developer track. |
| [`system-design-path/`](./system-design-path) | **System Design** — 6 weeks. From "it works" to "it survives 100x, a region failure, and a cost review". |

69,000+ words across 37 modules, 303 runnable code blocks, and a **practical section in
every single module**: a hands-on lab, a set of debugging drills, a deliverable to push to
GitHub, and a self-check.

---

## Stack

| Layer | Technology |
| --- | --- |
| Content | Markdown files with YAML frontmatter (the source of truth) |
| Backend | Python 3.10+ · FastAPI · Uvicorn · PyYAML · markdown-it-py |
| Frontend | TypeScript · React 18 · Vite 5 · Tailwind CSS 3 · marked + DOMPurify |
| Data | None — all 37 modules ship in the repository |

The frontend prefers the live FastAPI API when it is running and falls back to a bundled
snapshot, so the site works even with no backend up. The snapshot is split in two —
`curriculum.json` (metadata, eager) and `modules.json` (module bodies, loaded on demand) —
so the initial bundle stays around 91 kB gzipped.

---

## Layout

```
ai-developer-path/            # markdown — AI Developer path
java-developer-path/          # markdown — Java Developer path
spring-boot-developer-path/   # markdown — Spring Boot path
claude-certification-path/    # markdown — Claude certification path
system-design-path/           # markdown — System Design path
api/
  main.py                     # FastAPI: parses the markdown, serves tracks/modules/search
  export_content.py           # regenerates the bundled JSON snapshots
  requirements.txt
src/
  content/curriculum.json     # generated manifest (metadata only)
  content/modules.json        # generated module bodies (lazy-loaded chunk)
  lib/                        # api client, markdown renderer, progress hook
  components/                 # sidebar, search palette, module card
  pages/                      # home, track overview, module reader
scripts/smoke.ts              # renders every module, fails on any pipeline error
```

---

## Getting started

```bash
bun install

# 1. Frontend (works standalone, using the bundled snapshot)
bun run dev

# 2. Optional: the content API, for live markdown reloading
python3 -m venv .venv && source .venv/bin/activate
pip install -r api/requirements.txt
uvicorn api.main:app --reload --port 8000     # Vite proxies /api to it
```

### Regenerating the content snapshots

After editing any markdown file:

```bash
source .venv/bin/activate && python api/export_content.py
```

### Checks

```bash
bun run typecheck        # tsc -b --noEmit
bun run build            # typecheck + production bundle into dist/
bun run smoke            # render every module through the markdown pipeline
```

---

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/health` | Liveness plus module counts |
| `GET /api/tracks` | All tracks with their full module outline |
| `GET /api/manifest` | Module metadata only, no body text |
| `GET /api/modules/{track}/{slug}` | One module: metadata, raw markdown, rendered HTML |
| `GET /api/search?q=…` | Ranked matches across titles, summaries, tags, headings |
| `GET /api/docs` | Interactive OpenAPI docs |

`track` is `ai`, `java`, `spring`, `claude`, or `system`.

---

## Why the content lives in markdown

The files are the source of truth, not a rendering of some database. You can read the whole
AI path in a terminal, diff it in a pull request, fork it, or move it into your notes app —
and the site is a viewer for it. The JSON snapshots are generated output, regenerated with
one command.
