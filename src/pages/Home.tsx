import { Link } from 'react-router-dom'
import { useCurriculum } from '../App'
import { readMinutes } from '../lib/api'
import { accentFor, ctaGradient, trackDot } from '../theme'

export default function Home({ completed, total }: { completed: number; total: number }) {
  const { tracks, loading } = useCurriculum()
  const words = tracks.reduce(
    (sum, t) => sum + t.modules.reduce((s, m) => s + m.word_count, 0),
    0,
  )
  const hours = tracks.reduce((sum, t) => sum + t.total_hours, 0)

  return (
    <div className="animate-fade-up">
      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="grid-lines absolute inset-0 opacity-70" />
        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Five intensive tracks · project-first · practice in every section
          </p>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">
            Become an{' '}
            <span className="bg-gradient-to-r from-teal-300 to-teal-500 bg-clip-text text-transparent">
              AI developer
            </span>
            , a{' '}
            <span className="bg-gradient-to-r from-sky-300 to-sky-500 bg-clip-text text-transparent">
              Java engineer
            </span>
            , a{' '}
            <span className="bg-gradient-to-r from-lime-300 to-lime-500 bg-clip-text text-transparent">
              Spring Boot
            </span>{' '}
            pro, a{' '}
            <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
              Claude
            </span>{' '}
            specialist, or a{' '}
            <span className="bg-gradient-to-r from-rose-300 to-rose-500 bg-clip-text text-transparent">
              system designer
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Not a link list. Five opinionated, week-by-week curricula where every module
            ends in a <span className="text-slate-200">lab</span>, a{' '}
            <span className="text-slate-200">shipped deliverable</span>, and a{' '}
            <span className="text-slate-200">self-check</span> — with real code, real
            failure modes, and the practical knowledge employers actually test.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {tracks.map((track) => (
              <Link
                key={track.id}
                to={`/track/${track.id}/${track.modules[0]?.slug ?? ''}`}
                className={`btn-primary bg-gradient-to-r ${ctaGradient[track.id] ?? ctaGradient.ai}`}
              >
                {track.title}
                <span aria-hidden>→</span>
              </Link>
            ))}
            {loading && <span className="font-mono text-xs text-slate-600">loading…</span>}
          </div>

          <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
            {[
              { label: 'Modules', value: total || '—' },
              { label: 'Guided hours', value: hours || '—' },
              { label: 'Words of material', value: words ? `${(words / 1000).toFixed(0)}k` : '—' },
              { label: 'Your progress', value: total ? `${completed}/${total}` : '—' },
            ].map((stat) => (
              <div key={stat.label} className="bg-ink-950 px-5 py-6">
                <dd className="text-2xl font-bold text-white">{stat.value}</dd>
                <dt className="mt-1 text-xs uppercase tracking-wider text-slate-500">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- tracks ---------------- */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Pick your direction
        </h2>
        <p className="mt-2 max-w-2xl text-slate-400">
          Each track is a complete, ordered curriculum with a project ladder that ends in
          portfolio work.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {tracks.map((track) => {
            const accent = accentFor(track.id)
            const weeks = track.modules.filter((m) => m.type === 'module').length
            return (
              <Link
                key={track.id}
                to={`/track/${track.id}`}
                className="surface group relative overflow-hidden p-6 transition hover:border-white/25"
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b ${accent.gradient} opacity-0 transition group-hover:opacity-100`}
                />
                <div className="relative">
                  <span className={`chip ${accent.badge}`}>{track.duration}</span>
                  <h3 className="mt-4 text-xl font-bold tracking-tight text-white">
                    {track.title}
                  </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {track.tagline}
                </p>

                <ul className="mt-5 space-y-1.5">
                    {track.modules.slice(1, 4).map((module) => (
                      <li
                        key={module.slug}
                        className="flex items-center gap-2.5 text-[13px] text-slate-300"
                      >
                        <span className={`h-1 w-1 shrink-0 rounded-full ${accent.bar}`} />
                        <span className="truncate">{module.title}</span>
                      </li>
                    ))}
                    {track.modules.length > 4 && (
                      <li className="text-[13px] text-slate-500">
                        + {track.modules.length - 4} more modules
                      </li>
                    )}
                  </ul>

                  <div
                    className={`mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs ${accent.text}`}
                  >
                    <span className="font-mono">
                      {weeks} weeks · {track.total_hours}h guided
                    </span>
                    <span className="font-semibold">Open track →</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="border-y border-white/10 bg-ink-900/40">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Every section, the same shape
          </h2>
          <p className="mt-2 max-w-2xl text-slate-400">
            Consistency is what makes a curriculum finishable. Each module runs the same loop:
            learn the concept, build the lab, break it, then check yourself.
          </p>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: '01',
                title: 'Concepts',
                body: 'The 20% of theory that changes how you write code. Notes, no fluff.',
                color: 'text-teal-300',
              },
              {
                n: '02',
                title: 'Lab',
                body: 'Build it yourself from a spec — real code, your editor, no copy-paste.',
                color: 'text-teal-300',
              },
              {
                n: '03',
                title: 'Break it',
                body: 'Delete the schema, kill the connection, push past the limits. Learn the edges.',
                color: 'text-lime-300',
              },
              {
                n: '04',
                title: 'Deliver + self-check',
                body: 'Ship a repo, answer the questions out loud, then move on. No day ends uncommitted.',
                color: 'text-lime-300',
              },
            ].map((step) => (
              <li key={step.n} className="surface p-5">
                <span className={`font-mono text-2xl font-bold ${step.color}`}>{step.n}</span>
                <h3 className="mt-2 font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- practical ---------------- */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="chip">Why it works</span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Practical knowledge is not an afterthought. It is the curriculum.
            </h2>
            <p className="mt-4 leading-relaxed text-slate-400">
              Every module carries a hands-on build, a set of drills, a deliverable you push to
              GitHub, and a cheat sheet of the decisions you will face at work. The AI track
              teaches you to treat a model as a nondeterministic, token-metered dependency; the
              Spring track teaches you to ship a service that survives contact with production.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                'Runnable code in every section — not pseudocode',
                'Failure modes and the error messages you will actually see',
                'Debugging drills: break the thing on purpose',
                'Portfolio projects that end up in your CV',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-teal-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="surface overflow-hidden p-6 font-mono text-[12px] leading-relaxed">
            {tracks.map((track, index) => (
              <div key={track.id} className={index > 0 ? 'mt-4' : ''}>
                <p className="text-slate-600">$ cd {track.directory}</p>
                <p className="text-slate-600">$ ls</p>
                <ul className="mt-1 space-y-1">
                  {track.modules.map((module) => (
                    <li key={module.slug}>
                      <span className={trackDot[track.id] ?? 'text-teal-400'}>→</span>{' '}
                      <Link
                        to={`/track/${track.id}/${module.slug}`}
                        className="text-slate-300 underline decoration-white/10 underline-offset-4 hover:text-white"
                      >
                        {module.title}
                      </Link>
                      <span className="text-slate-600">
                        {'  '}
                        {readMinutes(module.word_count)} min
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-4 text-slate-500">
              <span className="text-slate-600">$</span> every module: lab → deliver → self-check
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- cta ---------------- */}
      <section className="border-t border-white/10 bg-gradient-to-b from-transparent to-teal-500/[0.06]">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Week one starts now.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Pick a track, open the first module, and get your first commit pushed before
            tonight. That is the entire difference between finishing and not finishing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {tracks.map((track) => (
              <Link
                key={track.id}
                to={`/track/${track.id}/${track.modules[0]?.slug ?? ''}`}
                className={`btn-primary bg-gradient-to-r ${ctaGradient[track.id] ?? ctaGradient.ai}`}
              >
                {track.title} · Week 1
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
