import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { loadTracks, type ModuleSummary, type Track } from './lib/curriculum'
import { moduleHref } from './lib/api'
import { moduleKey } from './lib/progress'
import { useProgress } from './lib/progress'
import Sidebar from './components/Sidebar'
import SearchPalette from './components/SearchPalette'
import Home from './pages/Home'
import TrackPage from './pages/TrackPage'
import ModulePage from './pages/ModulePage'

type Curriculum = {
  tracks: Track[]
  loading: boolean
  error: string | null
}

const CurriculumContext = createContext<Curriculum>({
  tracks: [],
  loading: true,
  error: null,
})

export const useCurriculum = () => useContext(CurriculumContext)

export function useModule(track: string, slug: string) {
  const { tracks } = useCurriculum()
  const trackMeta = tracks.find((t) => t.id === track)

  const neighbours = useMemo(() => {
    if (!trackMeta) return { prev: null, next: null }
    const flat = trackMeta.modules
    const index = flat.findIndex((m) => m.slug === slug)
    return {
      prev: index > 0 ? flat[index - 1] : null,
      next: index >= 0 && index < flat.length - 1 ? flat[index + 1] : null,
    }
  }, [trackMeta, slug])

  return { trackMeta, neighbours }
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="font-mono text-sm text-slate-500">404</p>
      <h1 className="mt-3 text-2xl font-bold text-white">That module does not exist</h1>
      <p className="mt-2 text-slate-400">
        The markdown file may have been renamed, or the link is stale.
      </p>
      <Link to="/" className="btn-ghost mt-8">
        Back to the paths
      </Link>
    </div>
  )
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const progress = useProgress()

  useEffect(() => {
    let active = true
    loadTracks()
      .then((data) => {
        if (!active) return
        setTracks(data)
        setError(null)
      })
      .catch(() => {
        if (active) setError('The curriculum could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const curriculum = useMemo<Curriculum>(
    () => ({ tracks, loading, error }),
    [tracks, loading, error],
  )

  const activeTrackId = location.pathname.split('/')[2] ?? null
  const totalModules = tracks.reduce((sum, t) => sum + t.module_count, 0)
  const completed = progress.count(
    tracks.flatMap((t) => t.modules.map((m: ModuleSummary) => moduleKey(t.id, m.slug))),
  )

  return (
    <CurriculumContext.Provider value={curriculum}>
      <div className="min-h-full lg:grid lg:grid-cols-[19rem_1fr]">
        <Sidebar
          tracks={tracks}
          activeTrackId={activeTrackId}
          completed={completed}
          totalModules={totalModules}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main className="min-w-0">
          {error ? (
            <div className="mx-auto max-w-3xl px-6 py-24">
              <div className="surface p-8">
                <h1 className="text-xl font-bold text-white">{error}</h1>
                <p className="mt-3 text-slate-400">
                  Regenerate the bundled content with:
                </p>
                <pre className="mt-6 overflow-x-auto rounded-xl border border-white/10 bg-ink-950 p-4 font-mono text-xs text-teal-200">
                  pip install -r api/requirements.txt{'\n'}
                  python api/export_content.py
                </pre>
              </div>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<Home completed={completed} total={totalModules} />} />
              <Route path="/track/:track" element={<TrackPage />} />
              <Route path="/track/:track/:slug" element={<ModulePage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </main>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </CurriculumContext.Provider>
  )
}

export { moduleHref }
