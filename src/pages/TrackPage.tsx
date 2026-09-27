import { Link, useParams } from 'react-router-dom'
import { useCurriculum } from '../App'
import ModuleCard from '../components/ModuleCard'
import { moduleKey, useProgress } from '../lib/progress'
import { accentFor } from '../theme'

export default function TrackPage() {
  const { track = '' } = useParams()
  const { tracks, loading } = useCurriculum()
  const progress = useProgress()
  const trackMeta = tracks.find((t) => t.id === track)
  const accent = accentFor(track)

  if (!trackMeta) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="font-mono text-sm text-slate-500">{loading ? 'loading…' : 'not found'}</p>
      </div>
    )
  }

  const weeks = trackMeta.modules.filter((m) => m.type === 'module')
  const extras = trackMeta.modules.filter((m) => m.type !== 'module')
  const doneCount = progress.count(trackMeta.modules.map((m) => moduleKey(track, m.slug)))
  const nextUp = trackMeta.modules.find((m) => !progress.done(moduleKey(track, m.slug)))
  const allTags = Array.from(new Set(trackMeta.modules.flatMap((m) => m.tags))).slice(0, 12)

  return (
    <div className="animate-fade-up">
      {/* header */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div
          className={`pointer-events-none absolute inset-x-0 -top-32 h-64 bg-gradient-to-b ${accent.gradient}`}
        />
        <div className="relative mx-auto max-w-5xl px-6 py-16">
          <Link
            to="/"
            className="font-mono text-xs text-slate-500 transition hover:text-slate-300"
          >
            ← all paths
          </Link>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className={`chip ${accent.badge}`}>{trackMeta.duration}</span>
            <span className="chip">{trackMeta.total_hours} guided hours</span>
            <span className="chip">
              {doneCount}/{trackMeta.module_count} modules done
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            {trackMeta.title}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-400">{trackMeta.tagline}</p>

          <div className="mt-6 flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <span key={tag} className="chip !py-0.5 !text-[11px]">
                {tag}
              </span>
            ))}
          </div>

          {nextUp && (
            <div className="mt-8">
              <Link to={`/track/${track}/${nextUp.slug}`} className={`btn-primary ${accent.softBg} ${accent.text} border ${accent.border}`}>
                {doneCount ? 'Continue' : 'Start'} · {nextUp.title} →
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* week roadmap */}
      <section className="border-b border-white/10 bg-ink-900/30">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Roadmap
          </h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trackMeta.modules.map((module) => {
              const done = progress.done(moduleKey(track, module.slug))
              return (
                <li key={module.slug}>
                  <Link
                    to={`/track/${track}/${module.slug}`}
                    className="surface flex h-full flex-col gap-2 p-4 transition hover:border-white/25"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono text-[11px] font-semibold ${accent.text}`}>
                        {module.type === 'module'
                          ? `WEEK ${module.week}`
                          : module.type.toUpperCase()}
                      </span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          done ? accent.bar : 'bg-white/20'
                        }`}
                      />
                    </div>
                    <p className="text-sm font-semibold leading-snug text-white">
                      {module.title}
                    </p>
                    <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {module.summary}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {/* modules */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight text-white">Modules</h2>
          <button
            type="button"
            onClick={progress.reset}
            className="font-mono text-xs text-slate-600 transition hover:text-rose-300"
          >
            reset progress
          </button>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {weeks.map((module) => (
            <ModuleCard
              key={module.slug}
              track={track}
              module={module}
              done={progress.done(moduleKey(track, module.slug))}
              onToggle={progress.toggle}
            />
          ))}
        </div>

        {extras.length > 0 && (
          <>
            <h3 className="mt-12 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Reference &amp; projects
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {extras.map((module) => (
                <ModuleCard
                  key={module.slug}
                  track={track}
                  module={module}
                  done={progress.done(moduleKey(track, module.slug))}
                  onToggle={progress.toggle}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
