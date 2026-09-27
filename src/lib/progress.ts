import { useCallback, useEffect, useState } from 'react'

const KEY = 'devpaths.progress.v1'

type Progress = Record<string, boolean>

function read(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Progress
  } catch {
    return {}
  }
}

export function moduleKey(track: string, slug: string) {
  return `${track}/${slug}`
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress))
    } catch {
      /* storage disabled: progress simply does not persist */
    }
  }, [progress])

  const toggle = useCallback((key: string) => {
    setProgress((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const reset = useCallback(() => {
    setProgress({})
  }, [])

  const done = useCallback(
    (key: string) => Boolean(progress[key]),
    [progress],
  )

  const count = useCallback(
    (keys: string[]) => keys.filter((key) => progress[key]).length,
    [progress],
  )

  return { progress, toggle, reset, done, count }
}
