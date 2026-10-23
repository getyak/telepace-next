import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(root, 'apps/app/package.json'))
const postcss = require('postcss')
const tailwind = require('tailwindcss')
const autoprefixer = require('autoprefixer')
const loadConfig = require('tailwindcss/loadConfig')

test('Tailwind 3 compiles the actual preset, typography, apply and variants', async () => {
  const config = loadConfig(join(root, 'apps/app/tailwind.config.ts'))
  const raw = '<main class="font-sans font-display text-ink container-content md:flex hover:underline group-hover:opacity-50 [&_a]:underline before:content-[\'x\'] qa-apply"><h1 class="text-3xl">Title</h1><a href="#">Link</a></main>'
  const input = readFileSync(join(root, 'packages/ui/src/globals.css'), 'utf8')
    + '\n.qa-apply { @apply px-6 md:px-8 text-ink; }'
  const result = await postcss([
    tailwind({ ...config, content: [{ raw, extension: 'html' }] }), autoprefixer(),
  ]).process(input, { from: undefined })
  assert.equal(result.warnings().length, 0)
  assert.match(result.css, /\.qa-apply\s*\{[^}]*padding-left:\s*1\.5rem/s)
  assert.match(result.css, /@media\s*\(min-width:\s*768px\)/)
  assert.match(result.css, /\.md\\:flex/)
  assert.match(result.css, /\.hover\\:underline:hover/)
  assert.match(result.css, /\.group:hover/)
  assert.match(result.css, /font-family:/)
  assert.match(result.css, /\.text-3xl/)
  assert.ok(result.css.includes(' a'))
  assert.doesNotMatch(result.css, /@apply|@screen|@tailwind/)
  console.log(`Tailwind fixture SHA256: ${createHash('sha256').update(result.css).digest('hex')}`)
})

test('Tailwind nesting consumer preserves nested selectors and apply', async () => {
  const config = loadConfig(join(root, 'apps/app/tailwind.config.ts'))
  const result = await postcss([
    require('tailwindcss/nesting'), tailwind({ ...config, content: [{ raw: 'qa-nested', extension: 'html' }] }),
  ]).process('.qa-nested { & > a:hover { @apply underline; } }', { from: undefined })
  assert.equal(result.warnings().length, 0)
  assert.match(result.css, /\.qa-nested > a:hover/)
  assert.match(result.css, /text-decoration-line: underline/)
  assert.doesNotMatch(result.css, /@apply|&/)
  console.log(`Nesting fixture SHA256: ${createHash('sha256').update(result.css).digest('hex')}`)
})
