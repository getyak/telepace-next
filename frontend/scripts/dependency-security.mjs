/** Local mitigation for GHSA-vfj7-8cjw-p6xm; upstream has no patched release.
 * Never suppress another advisory or claim the raw audit is clean.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const patchHash = 'cgsx2gpceumw7hfdkzi276w7ge' // pnpm 9 lockfile hash
const patchSha256 = '7efc1d8e8e8fe452332879fb9da72ae6ab0bc7740578b86e069622a4bba142a2'
const sourceHashes = {
  'index.js': '332ea07c7b006361aad12aa994ca75dc1db8e8382b884909e2f38f10b85c88a4',
  'lib/compile.js': '12639e1dc29a068e11e9e4b026e04dd8f105568a5669236552aaa69c7a48a158',
  'lib/constants.js': '22f315834a9ac27c382cc05cf12997146fe488c941dce64b29f954cbfd1317d1',
  'lib/expand.js': '9469fdd97a047497441e31bf83b82ca09f366c4168049449553d546c47ae2302',
  'lib/parse.js': 'd616c66f76a926d1a155c0d0ed70ea64906d25cbc3c82db0fd6c62d53f2bd0a1',
  'lib/stringify.js': '42fe27b1f36e0645c422e741e63d654d372fa2bc71a9f172a4e938f91e7f7e10',
  'lib/utils.js': 'b5a7596aa67730412b3c029ef09e84e6b67b8e445cffd35d1d295549c89066c7',
}
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const installed = join(root, `node_modules/.pnpm/braces@3.0.3_patch_hash=${patchHash}/node_modules/braces`)
const packageRequire = createRequire(join(root, 'apps/app/package.json'))

export function verifyInstalledMitigation() {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.pnpm.patchedDependencies['braces@3.0.3'], 'patches/braces@3.0.3.patch')
  assert.equal(sha256(join(root, 'patches/braces@3.0.3.patch')), patchSha256)
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')
  assert.ok(lock.includes(`  braces@3.0.3:\n    hash: ${patchHash}\n    path: patches/braces@3.0.3.patch\n`))
  assert.equal(JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version, '3.0.3')
  for (const [file, digest] of Object.entries(sourceHashes)) assert.equal(sha256(join(installed, file)), digest, file)

  // Resolve every currently audited dependent through its actual package links.
  for (const chain of [
    ['tailwindcss', 'chokidar', 'braces'],
    ['tailwindcss', 'fast-glob', 'micromatch', 'braces'],
    ['tailwindcss', 'micromatch', 'braces'],
    ['eslint-config-next', '@next/eslint-plugin-next', 'fast-glob', 'micromatch', 'braces'],
  ]) {
    let resolver = packageRequire
    let resolved
    for (const name of chain) {
      resolved = resolver.resolve(`${name}/package.json`)
      resolver = createRequire(resolved)
    }
    assert.equal(realpathSync(dirname(resolved)), realpathSync(installed), chain.join(' > '))
  }
  return createRequire(import.meta.url)(installed)
}

export function runMitigationRegression() {
  verifyInstalledMitigation()
  // Child process bounds hangs/crashes even if a future patch regresses.
  const result = spawnSync(process.execPath, ['--test', join(root, 'scripts/dependency-security.test.mjs'), join(root, 'scripts/tailwind-security.test.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  assert.equal(result.status, 0, 'installed-package security regressions must pass')
}

export function auditBlockers(report) {
  assert.ok(report && !report.error && report.metadata?.vulnerabilities && report.advisories, 'invalid audit response')
  const allowedPaths = new Set([
    'apps/app > eslint-config-next@15.5.28 > @next/eslint-plugin-next@15.5.28 > fast-glob@3.3.1 > micromatch@4.0.8 > braces@3.0.3',
    'apps/app > tailwindcss@3.4.19 > chokidar@3.6.0 > braces@3.0.3',
    'apps/app > tailwindcss@3.4.19 > fast-glob@3.3.3 > micromatch@4.0.8 > braces@3.0.3',
    'apps/app > tailwindcss@3.4.19 > micromatch@4.0.8 > braces@3.0.3',
  ])
  assert.ok(typeof report.advisories === 'object' && !Array.isArray(report.advisories), 'invalid advisories')
  const items = Object.values(report.advisories)
  for (const severity of ['high', 'critical']) {
    assert.ok(Number.isInteger(report.metadata.vulnerabilities[severity]) && report.metadata.vulnerabilities[severity] >= 0, 'missing severity count')
    assert.equal(report.metadata.vulnerabilities[severity],
      items.filter((item) => item.severity === severity).length, 'incomplete audit response')
  }
  const blockers = []
  for (const item of Object.values(report.advisories)) {
    if (!['info', 'low', 'moderate', 'high', 'critical'].includes(item.severity)) throw new Error('Unknown severity')
    if (!['high', 'critical'].includes(item.severity)) continue
    const mitigated = item.url === 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'
      && item.module_name === 'braces' && item.severity === 'high'
      && item.vulnerable_versions === '<=3.0.3' && item.patched_versions === '<0.0.0'
      && item.findings?.length > 0
      && item.findings.every((finding) => finding.version === '3.0.3' && finding.paths?.length > 0
        && finding.paths.every((path) => allowedPaths.has(path)))
    if (!mitigated) blockers.push(item)
  }
  return blockers
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMitigationRegression()
  if (process.argv[2] === '--audit') {
    const result = spawnSync('pnpm', ['audit', '--json', '--registry=https://registry.npmjs.org'], {
      cwd: root, encoding: 'utf8', timeout: 120_000,
    })
    const output = result.stdout ?? ''
    if (process.env.DEPENDENCY_AUDIT_REPORT) writeFileSync(process.env.DEPENDENCY_AUDIT_REPORT, output)
    process.stdout.write(output)
    assert.ok(!result.error && [0, 1].includes(result.status), 'audit transport/process failed')
    const report = JSON.parse(output)
    assert.equal(auditBlockers(report).length, 0, 'unmitigated high/critical advisory')
    console.log('High/critical gate passed with verified local braces mitigation. Raw audit remains above; moderate findings remain visible.')
  }
}
