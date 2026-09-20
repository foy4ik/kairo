// Publishes a new version: bumps the version everywhere, commits, tags and pushes.
// The tag triggers .github/workflows/release.yml, which builds signed installers and publishes the update feed.
//
//   npm run release -- 0.1.1          bump, commit, tag, push
//   npm run release -- 0.1.1 --dry    only bump and commit locally (no tag, no push)
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [version, ...flags] = process.argv.slice(2)
const dry = flags.includes('--dry')
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run release -- <major.minor.patch> [--dry]   e.g. npm run release -- 0.1.1')
  process.exit(1)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) {
  console.error('The working tree has uncommitted changes. Commit or stash them first.')
  process.exit(1)
}
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') {
  console.error('Releases are made from the main branch.')
  process.exit(1)
}
if (git('tag', '--list', `v${version}`)) {
  console.error(`Tag v${version} already exists.`)
  process.exit(1)
}

const current = JSON.parse(readFileSync('package.json', 'utf8')).version
const num = (v) => v.split('.').map(Number)
const compare = (x, y) => { for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 }
if (compare(num(version), num(current)) <= 0) {
  console.error(`The new version ${version} must be higher than the current ${current}.`)
  process.exit(1)
}

function edit(file, fn) {
  const before = readFileSync(file, 'utf8')
  const after = fn(before)
  if (after === before) throw new Error(`Could not update the version in ${file}`)
  writeFileSync(file, after)
}

edit('package.json', (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`))
edit('package-lock.json', (s) => s.replace(/("name":\s*"kairo",\s*"version":\s*")[^"]+(")/, `$1${version}$2`))
edit('src-tauri/tauri.conf.json', (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`))
edit('src-tauri/Cargo.toml', (s) => s.replace(/(\[package\][^[]*?\nversion\s*=\s*")[^"]+(")/, `$1${version}$2`))
edit('src-tauri/Cargo.lock', (s) => s.replace(/(name = "kairo"\nversion = ")[^"]+(")/, `$1${version}$2`))

git('add', '-A')
git('commit', '-m', `Release v${version}`)
console.log(`Committed release v${version} (was ${current}).`)
if (dry) {
  console.log('Dry run: nothing tagged or pushed.')
  process.exit(0)
}
git('tag', '-a', `v${version}`, '-m', `Kairo ${version}`)
git('push', 'origin', 'main', `v${version}`)
console.log(`Pushed. GitHub is now building v${version}: https://github.com/foy4ik/kairo/actions`)
