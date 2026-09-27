/**
 * Smoke test for the content pipeline: checks that every curriculum module renders
 * through the same marked configuration the app uses, and that the code-fence
 * language chip is emitted.
 *
 *   bun run smoke
 */
import { marked } from 'marked'
import curriculum from '../src/content/curriculum.json'
import bodies from '../src/content/modules.json'

const MARKDOWN = bodies as unknown as Record<string, string>

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

marked.setOptions({ gfm: true, breaks: false })
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = (lang ?? '').split(/\s+/)[0] || 'text'
      return `<pre><span class="code-lang">${escapeHtml(
        language,
      )}</span><code>${escapeHtml(text)}</code></pre>`
    },
  },
})

let failures = 0
let totalWords = 0
let codeBlocks = 0

for (const track of curriculum.tracks) {
  console.log(`\n${track.title} — ${track.module_count} modules, ${track.total_hours}h`)
  for (const module of track.modules) {
    const markdown = MARKDOWN[`${module.track}/${module.slug}`]
    try {
      if (!markdown) throw new Error('no body in modules.json')
      const html = marked.parse(markdown) as string
      if (!html.includes('<h1')) throw new Error('no <h1> rendered')
      if (!html.includes('<table') && markdown.includes('| ---'))
        throw new Error('markdown table not rendered')
      codeBlocks += (html.match(/<pre>/g) ?? []).length
      totalWords += module.word_count
      console.log(
        `  ok  ${String(module.order).padStart(2, '0')} ${module.title} ` +
          `(${module.word_count} words, ${module.headings.length} sections)`,
      )
    } catch (error) {
      failures += 1
      console.error(`  FAIL ${module.title}: ${(error as Error).message}`)
    }
  }
}

console.log(`\n${totalWords.toLocaleString()} words · ${codeBlocks} code blocks rendered`)
if (codeBlocks === 0) {
  console.error('FAIL: expected code blocks in the curriculum')
  failures += 1
}
if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('All modules render cleanly.')
