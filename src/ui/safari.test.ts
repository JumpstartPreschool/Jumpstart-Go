import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.tsx') && !e.name.includes('.test.') ? [join(dir, e.name)] : [])

// Safari sizes a flex-1 (zero basis) scroller to nothing when its column gets its height from content: the sheet body
// vanished on iPhone this way (2e7018d). Use flex-auto for a scroller instead.
it('never sizes a scrolling area with flex-1', () => {
  const found = files('src').flatMap((f) =>
    readFileSync(f, 'utf8').split('\n').flatMap((line, i) =>
      /\bflex-1\b/.test(line) && /\boverflow-(y-)?(auto|scroll)\b/.test(line) ? [`${f}:${i + 1}`] : []))
  expect(found).toEqual([])
})
