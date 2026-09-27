import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Language chip on code fences, so readers can tell a Python lab from a Java lab.
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? '').split(/\s+/)[0] || 'text'
      return `<pre><span class="code-lang">${escapeHtml(language)}</span><code>${escapeHtml(
        text,
      )}</code></pre>`
    },
  },
})

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source) as string, {
    ADD_ATTR: ['target', 'rel'],
  })
}
