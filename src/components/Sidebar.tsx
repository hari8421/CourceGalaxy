import { NavLink } from 'react-router-dom'
import type { Track } from '../lib/api'
import { moduleHref } from '../lib/api'
import { accentFor } from '../theme'

type Props = {
  tracks: Track[]
  activeTrackId: string | null
  completed: number
  totalModules: number
  onOpenSearch: () => void
}

export default function Sidebar({
  tracks,
  activeTrackId,
  completed,
  totalModules,
  onOpenSearch,
}: Props) {
  const pct = totalModules ? Math.round((completed / totalModules) * 100) : 0

  return (
    <aside className="border-b border-white/10 bg-ink-900/60 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r scrollbar-slim">
      <div className="flex items-center justify-between gap-3 p-5 lg:block">
        <NavLink to="/" className="group block">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-lime-400 font-mono text-sm font-bold text-ink-950">
              {'{ }'}
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">DevPaths</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                learn · build · ship
              </p>
            </div>
          </div>
        </NavLink>          <button
            type="button"
            onClick={onOpenSearch}
            className="mt-4 hidden w-full items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/[0.03] px-3 py-2 text-left text-xs text-slate-400 transition hover:border-white/25 hover:text-slate-200 lg:flex"
          >
          Search modules
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>

      {totalModules > 0 && (
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>Your progress</span>
            <span className="font-mono text-slate-300">
              {completed}/{totalModules}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-lime-400 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <nav className="space-y-6 px-5 pb-10">
        {tracks.map((track) => {
          const accent = accentFor(track.id)
          const inactive = activeTrackId !== null && activeTrackId !== track.id
          return (
            <div key={track.id} className={inactive ? 'opacity-70 transition' : ''}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${accent.text}`}>
                {track.title}
              </p>

              <ul className="mt-2.5 space-y-1">
                {track.modules.map((module) => (
                  <li key={module.slug}>
                    <NavLink
                      to={moduleHref(track.id, module.slug)}
                      className={({ isActive }) =>
                        [
                          'group flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] leading-snug transition',
                          isActive
                            ? `${accent.softBg} ${accent.text} font-medium`
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                        ].join(' ')
                      }
                    >
                      <span className="mt-[3px] font-mono text-[10px] text-slate-600 group-hover:text-slate-400">
                        {String(module.order).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{module.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
