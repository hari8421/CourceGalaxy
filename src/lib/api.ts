const BASE = import.meta.env.VITE_API_BASE ?? '/api'

export type ModuleSummary = {
  track: string
  slug: string
  title: string
  week: number
  order: number
  type: string
  hours: number
  summary: string
  tags: string[]
  word_count: number
  headings: string[]
}

/** `html` is only present when served by the API; the bundled snapshot is rendered client-side. */
export type ModuleDetail = ModuleSummary & { html?: string; markdown: string }

export type Track = {
  id: string
  title: string
  tagline: string
  accent: string
  icon: string
  duration: string
  directory: string
  module_count: number
  total_hours: number
  modules: ModuleSummary[]
}

export type SearchHit = ModuleSummary & { score: number }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  tracks: () => get<Track[]>('/tracks'),
  module: (track: string, slug: string) => get<ModuleDetail>(`/modules/${track}/${slug}`),
  search: (q: string) => get<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`),
}

export const moduleHref = (track: string, slug: string) => `/track/${track}/${slug}`

/** Minutes needed to read a module end to end, rounded up. */
export const readMinutes = (wordCount: number) => Math.max(1, Math.round(wordCount / 200))
