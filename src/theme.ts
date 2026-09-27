export type Accent = {
  text: string
  softBg: string
  border: string
  ring: string
  badge: string
  gradient: string
  bar: string
}

export const ACCENTS: Record<string, Accent> = {
  ai: {
    text: 'text-teal-300',
    softBg: 'bg-teal-400/10',
    border: 'border-teal-400/30',
    ring: 'focus-visible:ring-teal-300/60',
    badge: 'border-teal-400/30 bg-teal-400/10 text-teal-200',
    gradient: 'from-teal-400/20 via-teal-400/5 to-transparent',
    bar: 'bg-teal-400',
  },
  spring: {
    text: 'text-lime-300',
    softBg: 'bg-lime-400/10',
    border: 'border-lime-400/30',
    ring: 'focus-visible:ring-lime-300/60',
    badge: 'border-lime-400/30 bg-lime-400/10 text-lime-200',
    gradient: 'from-lime-400/20 via-lime-400/5 to-transparent',
    bar: 'bg-lime-400',
  },
  claude: {
    text: 'text-amber-300',
    softBg: 'bg-amber-400/10',
    border: 'border-amber-400/30',
    ring: 'focus-visible:ring-amber-300/60',
    badge: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    gradient: 'from-amber-400/20 via-amber-400/5 to-transparent',
    bar: 'bg-amber-400',
  },
  system: {
    text: 'text-rose-300',
    softBg: 'bg-rose-400/10',
    border: 'border-rose-400/30',
    ring: 'focus-visible:ring-rose-300/60',
    badge: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
    gradient: 'from-rose-400/20 via-rose-400/5 to-transparent',
    bar: 'bg-rose-400',
  },
  java: {
    text: 'text-sky-300',
    softBg: 'bg-sky-400/10',
    border: 'border-sky-400/30',
    ring: 'focus-visible:ring-sky-300/60',
    badge: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
    gradient: 'from-sky-400/20 via-sky-400/5 to-transparent',
    bar: 'bg-sky-400',
  },
}

/** Full-bleed CTA gradient per track, so call-to-action buttons stay on-brand. */
export const ctaGradient: Record<string, string> = {
  ai: 'from-teal-300 to-teal-500',
  spring: 'from-lime-300 to-lime-500',
  claude: 'from-amber-300 to-amber-500',
  system: 'from-rose-300 to-rose-500',
  java: 'from-sky-300 to-sky-500',
}

/** The terminal-style module list on the landing page, one bullet colour per track. */
export const trackDot: Record<string, string> = {
  ai: 'text-teal-400',
  spring: 'text-lime-400',
  claude: 'text-amber-400',
  system: 'text-rose-400',
  java: 'text-sky-400',
}

export const accentFor = (track: string): Accent => ACCENTS[track] ?? ACCENTS.ai

export const TRACK_LABELS: Record<string, string> = {
  ai: 'AI Developer',
  spring: 'Spring Boot Developer',
  claude: 'Claude Certification',
  system: 'System Design',
  java: 'Java Developer',
}
