import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditBlockers, verifyInstalledMitigation } from './dependency-security.mjs'

const braces = verifyInstalledMitigation()
function bounded(fn) {
  assert.throws(fn, (error) => error instanceof RangeError
    && /nesting depth exceeds maximum/.test(error.message) && !/call stack/i.test(error.message))
}

test('ordinary compile, expansion, quotes and escaping remain compatible', () => {
  const goldens = {
    'a/{b,c}/d': [['a/(b|c)/d'], ['a/b/d', 'a/c/d']],
    'x{1..3}y': [['x([1-3])y'], ['x1y', 'x2y', 'x3y']],
    '{a,{b,c},d}': [['(a|(b|c)|d)'], ['a', 'b', 'c', 'd']],
    'a\\{b,c}d': [['a{b,c}d'], ['a{b,c}d']],
    'quoted-{"x,y"}': [['quoted-{x,y}'], ['quoted-{x,y}']],
    '{a,b}/{c,d}': [['(a|b)/(c|d)'], ['a/c', 'a/d', 'b/c', 'b/d']],
  }
  for (const [input, [compiled, expanded]] of Object.entries(goldens)) {
    assert.deepEqual(braces(input), compiled)
    assert.deepEqual(braces(input, { expand: true }), expanded)
  }
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d')
})
test('deep text rejects deliberately before exhausting the stack', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const input = open.repeat(3500) + 'a' + close.repeat(3500)
    for (const fn of [braces, braces.parse, braces.expand]) bounded(() => fn(input))
    assert.doesNotThrow(() => braces(open.repeat(100) + 'a' + close.repeat(100)))
    bounded(() => braces(open.repeat(101) + 'a' + close.repeat(101)))
  }
})
test('deep and cyclic supplied ASTs reject deliberately', () => {
  const ast = (depth) => {
    let node = { type: 'text', value: 'x' }
    while (depth--) node = { type: 'brace', nodes: [node] }
    return { type: 'root', nodes: [node] }
  }
  const cycle = { type: 'text', nodes: [] }
  cycle.nodes.push(cycle)
  for (const fn of [braces.stringify, braces.compile, braces.expand]) {
    bounded(() => fn(ast(50000)))
    bounded(() => fn({ type: 'root', nodes: [cycle] }))
  }
  assert.doesNotThrow(() => braces.stringify(ast(100)))
  bounded(() => braces.stringify(ast(101)))
  const inner = { type: 'text', nodes: [{ type: 'text', value: 'x' }] }
  const outer = { type: 'text', nodes: [inner], parent: inner }
  inner.parent = outer
  bounded(() => braces.expand({ type: 'root', nodes: [outer] }))
})

const advisory = {
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', module_name: 'braces', severity: 'high',
  vulnerable_versions: '<=3.0.3', patched_versions: '<0.0.0', findings: [{ version: '3.0.3', paths: [
    'apps/app > tailwindcss@3.4.19 > micromatch@4.0.8 > braces@3.0.3',
  ] }],
}
const report = (item) => ({ metadata: { vulnerabilities: { high: item.severity === 'high' ? 1 : 0, critical: item.severity === 'critical' ? 1 : 0 } }, advisories: { item } })
test('audit policy only recognizes the exact mitigated advisory/version/path', () => {
  assert.equal(auditBlockers(report(advisory)).length, 0)
  for (const change of [
    { url: 'https://github.com/advisories/GHSA-unknown' }, { module_name: 'other' },
    { severity: 'critical' }, { findings: [] },
    { findings: [{ version: '3.0.2', paths: advisory.findings[0].paths }] },
    { findings: [{ version: '3.0.3', paths: ['unknown > braces@3.0.3'] }] },
    { findings: [{ version: '3.0.3', paths: ['apps/app > tailwindcss@3.4.19 > micromatch@4.0.8 > nested@1.0.0 > braces@3.0.3'] }] },
  ]) assert.equal(auditBlockers(report({ ...advisory, ...change })).length, 1)
  assert.throws(() => auditBlockers({ error: { message: 'registry unavailable' } }))
  assert.throws(() => auditBlockers({ metadata: { vulnerabilities: {} }, advisories: {} }))
  assert.throws(() => auditBlockers({ metadata: { vulnerabilities: { high: 1 } }, advisories: {} }))
})

test('tampered patch, lock hash, or installed source fails before mitigation is accepted', () => {
  const source = fileURLToPath(new URL('..', import.meta.url))
  const fixture = mkdtempSync(join(tmpdir(), 'telepace-dependency-security-'))
  const target = 'node_modules/.pnpm/braces@3.0.3_patch_hash=cgsx2gpceumw7hfdkzi276w7ge/node_modules/braces'
  try {
    for (const file of ['package.json', 'pnpm-lock.yaml', 'patches/braces@3.0.3.patch', 'scripts/dependency-security.mjs']) {
      mkdirSync(dirname(join(fixture, file)), { recursive: true })
      cpSync(join(source, file), join(fixture, file))
    }
    mkdirSync(dirname(join(fixture, target)), { recursive: true })
    cpSync(join(source, target), join(fixture, target), { recursive: true })
    for (const file of ['patches/braces@3.0.3.patch', 'pnpm-lock.yaml', `${target}/lib/compile.js`]) {
      const path = join(fixture, file)
      const original = readFileSync(path)
      writeFileSync(path, file === 'pnpm-lock.yaml' ? original.toString().replace('cgsx2gpceumw7hfdkzi276w7ge', 'wronghash') : `${original}\n// tampered\n`)
      const result = spawnSync(process.execPath, [join(fixture, 'scripts/dependency-security.mjs')], {
        encoding: 'utf8', timeout: 10_000,
      })
      assert.notEqual(result.status, 0, file)
      assert.match(result.stderr, /AssertionError/, file)
      writeFileSync(path, original)
    }
    // Same package name/version and even identical patched bytes are insufficient:
    // the consumer must resolve the exact lock-bound directory, not a nested copy.
    const tailwind = join(fixture, 'apps/app/node_modules/tailwindcss')
    const chokidar = join(tailwind, 'node_modules/chokidar')
    for (const [directory, name] of [[tailwind, 'tailwindcss'], [chokidar, 'chokidar']]) {
      mkdirSync(directory, { recursive: true })
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
    }
    cpSync(join(fixture, target), join(chokidar, 'node_modules/braces'), { recursive: true })
    const redirected = spawnSync(process.execPath, [join(fixture, 'scripts/dependency-security.mjs')], {
      encoding: 'utf8', timeout: 10_000,
    })
    assert.notEqual(redirected.status, 0)
    assert.match(redirected.stderr, /AssertionError \[ERR_ASSERTION\]: tailwindcss > chokidar > braces/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
