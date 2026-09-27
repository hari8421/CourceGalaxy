import { Link } from 'react-router-dom'
import { moduleHref, readMinutes, type ModuleSummary } from '../lib/api'
import { moduleKey } from '../lib/progress'
import { accentFor } from '../theme'

type Props = {
  track: string
  module: ModuleSummary
  done: boolean
  onToggle: (key: string) => void
}

export default function ModuleCard({ track, module, done, onToggle }: Props) {
  const accent = accentFor(track)
  const key = moduleKey(track, module.slug)

  return (
    <div
      className={`group surface relative flex flex-col gap-3 p-5 transition hover:border-white/20 ${
        done ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`grid h-7 w-7 place-items-center rounded-lg font-mono text-[11px] font-bold ${
              accent.softBg
            } ${accent.text}`}
          >
            {String(module.order).padStart(2, '0')}
          </span>
          <span className="chip capitalize">{module.type}</span>
        </div>

        <button
          type="button"
          onClick={() => onToggle(key)}
          aria-pressed={done}
          title={done ? 'Mark as not done' : 'Mark as done'}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition ${
            done
              ? `${accent.border} ${accent.softBg} ${accent.text}`
              : 'border-white/20 text-slate-600 hover:border-white/30 hover:text-slate-300'
          }`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold leading-snug text-white">{module.title}</h3>
        <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-slate-400">
          {module.summary}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {module.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="chip !py-0.5 !text-[10px]">
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-3 font-mono text-[11px] text-slate-500">
        <span>
          {module.hours ? `${module.hours}h` : '—'} · {readMinutes(module.word_count)} min read
        </span>
        <Link
          to={moduleHref(track, module.slug)}
          className={`font-semibold transition ${accent.text} hover:brightness-125`}
        >
          {done ? 'Review' : 'Start'} →
        </Link>
      </div>
    </div>
  )
}
