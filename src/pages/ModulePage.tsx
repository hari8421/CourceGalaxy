import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useModule } from '../App'
import { moduleHref, readMinutes, type ModuleDetail } from '../lib/api'
import { loadModule } from '../lib/curriculum'
import { renderMarkdown } from '../lib/markdown'
import { moduleKey, useProgress } from '../lib/progress'
import { accentFor } from '../theme'

function Toc({ headings }: { headings: string[] }) {
  const items = headings.slice(0, 8)
  if (items.length < 2) return null

  return (
    <nav className="surface sticky top-6 hidden p-4 xl:block">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        In this module
      </p>
      <ol className="mt-3 space-y-1.5">
        {items.map((heading, index) => (
          <li key={heading} className="flex gap-2 text-[12px] leading-snug text-slate-400">
            <span className="font-mono text-[10px] text-slate-600">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 truncate">{heading}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export default function ModulePage() {
  const { track = '', slug = '' } = useParams()
  const { trackMeta } = useModule(track, slug)
  const { neighbours } = useModule(track, slug)
  const progress = useProgress()
  const accent = accentFor(track)

  const [module, setModule] = useState<ModuleDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    loadModule(track, slug)
      .then((data) => {
        if (active) setModule(data)
      })
      .catch(() => {
        if (active) setError('This module could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [track, slug])

  useEffect(() => {
    if (module) document.title = `${module.title} — DevPaths`
    return () => {
      document.title = 'DevPaths — AI Developer & Spring Boot Tracks'
    }
  }, [module])

  const html = useMemo(() => (module ? renderMarkdown(module.markdown) : ''), [module])
  const key = moduleKey(track, slug)
  const done = progress.done(key)

  return (
    <div className="animate-fade-up">
      <div className="border-b border-white/10 bg-ink-900/30">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
            <Link to={`/track/${track}`} className="transition hover:text-slate-300">
              {trackMeta?.title ?? track}
            </Link>
            <span>/</span>
            <span>{module?.type ?? 'module'}</span>
            {module && (
              <>
                <span>/</span>
                <span className="text-slate-400">{readMinutes(module.word_count)} min read</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 xl:grid-cols-[1fr_15rem]">
        <article className="min-w-0">
          {loading && (
            <div className="space-y-4">
              <div className="h-8 w-3/4 animate-pulse rounded-lg bg-white/5" />
              <div className="h-4 w-full animate-pulse rounded bg-white/5" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-white/5" />
            </div>
          )}

          {error && <p className="text-rose-300">{error}</p>}

          {module && !loading && (
            <>
              <div className="mb-8 flex flex-wrap items-center gap-2">
                <span className={`chip ${accent.badge}`}>
                  {module.type === 'module' ? `Week ${module.week}` : module.type}
                </span>
                {module.hours > 0 && <span className="chip">{module.hours}h</span>}
                <span className="chip">{module.word_count.toLocaleString()} words</span>
              </div>

              <div
                className="prose-doc"
                dangerouslySetInnerHTML={{ __html: html }}
              />

              <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
                <button
                  type="button"
                  onClick={() => progress.toggle(key)}
                  className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                    done
                      ? `${accent.border} ${accent.softBg} ${accent.text}`
                      : 'border-white/20 text-slate-300 hover:border-white/30 hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-md border ${
                      done ? accent.border : 'border-white/25'
                    }`}
                  >
                    {done ? '✓' : ''}
                  </span>
                  {done ? 'Completed' : 'Mark as completed'}
                </button>

                <p className="font-mono text-[11px] text-slate-600">
                  progress is stored in this browser
                </p>
              </div>

              <nav className="mt-6 grid gap-3 sm:grid-cols-2">
                {neighbours.prev ? (
                  <Link
                    to={moduleHref(track, neighbours.prev.slug)}
                    className="surface p-4 transition hover:border-white/25"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      ← previous
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-white">
                      {neighbours.prev.title}
                    </p>
                  </Link>
                ) : (
                  <span />
                )}
                {neighbours.next && (
                  <Link
                    to={moduleHref(track, neighbours.next.slug)}
                    className="surface p-4 text-right transition hover:border-white/25"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      next →
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-white">
                      {neighbours.next.title}
                    </p>
                  </Link>
                )}
              </nav>
            </>
          )}
        </article>

        <div className="hidden xl:block">
          <Toc headings={module?.headings ?? []} />
        </div>
      </div>
    </div>
  )
}
