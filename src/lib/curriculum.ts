import snapshot from '../content/curriculum.json'
import { api, type ModuleDetail, type SearchHit, type Track } from './api'

export type { ModuleDetail, ModuleSummary, SearchHit, Track } from './api'

const MANIFEST = snapshot.tracks as unknown as Track[]
const ALL_MODULES = MANIFEST.flatMap((t) => t.modules)

/** Module bodies live in a separate chunk so the app shell stays small. */
let bodies: Promise<Record<string, string>> | null = null
function loadBodies() {
  bodies ??= import('../content/modules.json').then(
    (m) => m.default as unknown as Record<string, string>,
  )
  return bodies
}

/** Prefer the live FastAPI content API; fall back to the bundled markdown snapshot. */
async function withFallback<T>(live: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await live()
  } catch {
    return fallback()
  }
}

export function loadTracks(): Promise<Track[]> {
  return withFallback(() => api.tracks(), () => MANIFEST)
}

export async function loadModule(track: string, slug: string): Promise<ModuleDetail> {
  try {
    return await api.module(track, slug)
  } catch {
    const meta = ALL_MODULES.find((m) => m.track === track && m.slug === slug)
    if (!meta) throw new Error(`No module "${slug}" in track "${track}"`)
    const markdown = (await loadBodies())[`${track}/${slug}`]
    if (markdown === undefined) throw new Error(`No body for "${track}/${slug}"`)
    return { ...meta, markdown }
  }
}

function localSearch(q: string): SearchHit[] {
  const query = q.trim().toLowerCase()
  if (!query) return []

  const hits: SearchHit[] = []
  for (const module of ALL_MODULES) {
    let score = 0
    if (module.title.toLowerCase().includes(query)) score += 5
    if (module.summary.toLowerCase().includes(query)) score += 3
    if (module.tags.some((tag) => tag.toLowerCase().includes(query))) score += 2
    if (module.headings.some((h) => h.toLowerCase().includes(query))) score += 1
    if (score) hits.push({ ...module, score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 20)
}

export function searchModules(q: string): Promise<SearchHit[]> {
  return withFallback(() => api.search(q), () => localSearch(q))
}
