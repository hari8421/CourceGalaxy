import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { moduleHref, readMinutes } from '../lib/api'
import { searchModules, type ModuleSummary } from '../lib/curriculum'
import { accentFor, TRACK_LABELS } from '../theme'

type Hit = ModuleSummary & { score: number }

export default function SearchPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Hit[]>([])
  const [selected, setSelected] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const term = query.trim()
    if (!term) {
      setResults([])
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      searchModules(term)
        .then((hits) => {
          setResults(hits)
          setSelected(0)
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 180)
    return () => clearTimeout(timer)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((i) => Math.min(i + 1, results.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((i) => Math.max(i - 1, 0))
      }
      if (event.key === 'Enter' && results[selected]) {
        navigate(moduleHref(results[selected].track, results[selected].slug))
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, selected, navigate, onClose])

  const grouped = useMemo(
    () =>
      results.reduce<Record<string, Hit[]>>((acc, hit) => {
        ;(acc[hit.track] ??= []).push(hit)
        return acc
      }, {}),
    [results],
  )

  if (!open) return null

  let index = -1

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl shadow-black/50 animate-fade-up">
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.4 9.84l3.63 3.63a1 1 0 0 0 1.41-1.41l-3.63-3.63A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics, tags, modules…"
            className="w-full bg-transparent py-4 text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
          {searching && <span className="font-mono text-[10px] text-slate-600">…</span>}
        </div>

        <div className="max-h-[55vh] overflow-y-auto scrollbar-slim p-2">
          {!query.trim() && (
            <p className="px-3 py-6 text-center text-xs text-slate-600">
              Try <span className="text-teal-300">RAG</span>,{' '}
              <span className="text-sky-300">virtual threads</span>,{' '}
              <span className="text-rose-300">sharding</span>,{' '}
              <span className="text-amber-300">MCP</span>, or{' '}
              <span className="text-lime-300">transactions</span>
            </p>
          )}

          {query.trim() && results.length === 0 && !searching && (
            <p className="px-3 py-6 text-center text-xs text-slate-600">
              Nothing matches “{query}”.
            </p>
          )}

          {Object.entries(grouped).map(([track, hits]) => (
            <div key={track} className="mb-2">
              <p
                className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  accentFor(track).text
                }`}
              >
                {TRACK_LABELS[track] ?? track}
              </p>
              {hits.map((hit) => {
                index += 1
                const active = index === selected
                return (
                  <button
                    key={`${hit.track}/${hit.slug}`}
                    type="button"
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => {
                      navigate(moduleHref(hit.track, hit.slug))
                      onClose()
                    }}
                    className={`block w-full rounded-lg px-3 py-2.5 text-left transition ${
                      active ? 'bg-white/[0.07]' : ''
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-white">{hit.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{hit.summary}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-600">
                      {hit.type} · {readMinutes(hit.word_count)} min read
                    </p>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2.5 font-mono text-[10px] text-slate-600">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
