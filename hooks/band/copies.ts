// Repo-wide copy detection for the reuse column: a function body that appears twice is code someone
// reinvented instead of reused (.algebra/band.algebra.md, CopyDetection). Pure: the band does the I/O.

import type { CopyGroup, CopyIndex, CopyScan, Copies, Fn } from './types'

// Same skip rules as greybeard-map.js: tests, vendored and generated code.
export const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|vendor|venv|\.venv|__pycache__|coverage|\.next|target|migrations|fixtures|tests?|__tests__|spec)(\/|$)/
export const SKIP_FILE = /(^|\/)(test_[^/]*|[^/]*(_test|\.test|\.spec|\.gen|\.min|\.d)\.[a-z]+)$/
// Throwaway tooling and build output copy freely; Scala tests go by their suffix.
const COPY_SKIP = /(^|\/)(scripts|cdk\.out|\.bsp|\.metals|\.bloop)(\/|$)|(Spec|Suite|Test)\.scala$/
const COPY_EXT = /\.([cm]?[jt]sx?|scala)$/

// git pathspecs for the files the scan reads.
export const COPY_PATHSPECS = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.mts', '*.cts', '*.scala']

export const isCopySource = (file: string) => COPY_EXT.test(file) && !SKIP_DIR.test(file) && !SKIP_FILE.test(file) && !COPY_SKIP.test(file)

// Entry points every handler file defines on purpose.
const ENTRY = new Set(['handler', 'lambdaHandler', 'rawHandler', 'main', 'apply', 'unapply', 'toString', 'equals', 'hashCode'])
// shortcut: top-level functions and arrow consts only, class methods are missed; walk the AST if they matter.
const TS_DEF = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|<|[A-Za-z_$][\w$]*\s*=>))/
// Scala defs live inside objects and classes, so any depth counts.
const SCALA_DEF = /^(\s*)(?:(?:private|protected)(?:\[[^\]]*\])?\s+|(?:final|override|inline|implicit|transparent)\s+)*def\s+([A-Za-z_]\w*)/
const CLOSER = /^\s*([}\])]+[;,)]*|end\b.*)\s*$/
const KEYWORDS = new Set('return if else match case with otherwise new const let val var def yield for while do await async throw try catch finally then end extends this null undefined true false None Some Left Right'.split(' '))
const MIN_TOKENS = 20
const MIN_SHAPE_LINES = 8

const indentOf = (line: string) => line.length - line.trimStart().length

// The lines after a definition up to the first line indented no deeper, keeping that line if it only closes the body.
// A line starting with ")" closes a multi-line signature, not the body.
function bodyOf(lines: string[], at: number, indent: number): string[] {
  const rest = lines.slice(at + 1)
  const stop = rest.findIndex(l => l.trim() !== '' && indentOf(l) <= indent && !/^\s*\)/.test(l))
  if (stop === -1) return rest
  return rest.slice(0, CLOSER.test(rest[stop] ?? '') ? stop + 1 : stop)
}

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// cyrb53: a 53-bit hash, enough to tell function bodies apart without keeping their text.
export function hash(s: string): string {
  const step = ([a, b]: readonly [number, number], c: number): [number, number] => [Math.imul(a ^ c, 2654435761), Math.imul(b ^ c, 1597334677)]
  const [a, b] = Array.from(s, ch => ch.charCodeAt(0)).reduce(step, [0xdeadbeef, 0x41c6ce57])
  const h1 = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  const h2 = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// The shape of a body: every identifier but keywords, every string and every number replaced, so a renamed copy matches.
const shapeOf = (exact: string) =>
  exact
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, 's')
    .replace(/[A-Za-z_$][\w$]*/g, w => (KEYWORDS.has(w) ? w : 'x'))
    .replace(/\b\d+(\.\d+)?\b/g, '0')

export function fnsIn(file: string, text: string): Fn[] {
  if (!isCopySource(file)) return []
  const scala = file.endsWith('.scala')
  const lines = text.split('\n')
  return lines.flatMap((line, i) => {
    const m = scala ? SCALA_DEF.exec(line) : TS_DEF.exec(line)
    const name = m ? (scala ? m[2] : (m[1] ?? m[2])) : undefined
    if (!m || name === undefined || ENTRY.has(name)) return []
    const body = stripComments(bodyOf(lines, i, scala ? (m[1] ?? '').length : 0).join('\n'))
    const exact = body.replace(/\s+/g, ' ').trim()
    if ((exact.match(/[\w$]+|[^\s\w$]/g) ?? []).length < MIN_TOKENS) return []
    const real = body.split('\n').filter(l => l.trim() !== '' && !CLOSER.test(l)).length
    return [{ name, line: i + 1, exact: hash(exact), shape: hash(shapeOf(exact)), lines: real }]
  })
}

type Site = Fn & { site: string }

function groupBy<T>(xs: readonly T[], keyOf: (x: T) => string): T[][] {
  const sorted = [...xs].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0))
  const starts = sorted.flatMap((x, i) => (i === 0 || keyOf(sorted[i - 1] as T) !== keyOf(x) ? [i] : []))
  return starts.map((s, j) => sorted.slice(s, starts[j + 1] ?? sorted.length))
}

const groupsOf = (fns: readonly Site[], keyOf: (f: Site) => string): CopyGroup[] =>
  groupBy(fns, keyOf)
    .filter(g => g.length >= 2)
    .map(g => ({ key: keyOf(g[0] as Site), names: [...new Set(g.map(f => f.name))].sort(), sites: g.map(f => f.site).sort() }))
    .sort((a, b) => b.sites.length - a.sites.length || (a.sites[0] ?? '').localeCompare(b.sites[0] ?? ''))

export function copiesOf(files: Record<string, Fn[]>): CopyScan {
  const all = Object.entries(files).flatMap(([file, fns]) => fns.map(f => ({ ...f, site: `${file}:${f.line}` })))
  const exact = groupsOf(all, f => f.exact)
  const inExact = new Set(exact.flatMap(g => g.sites))
  const shapes = groupsOf(all.filter(f => f.lines >= MIN_SHAPE_LINES), f => f.shape).filter(g => !g.sites.every(s => inExact.has(s)))
  return { exact, shapes }
}

export const NO_COPIES: Copies = { known: false, exact: [], shapes: 0, baseline: undefined }
export const NO_INDEX: CopyIndex = { root: '', head: '', dirty: [], files: {} }

// The first scan of a task is its baseline.
export const withScan = (c: Copies, s: CopyScan): Copies => ({ known: true, exact: s.exact, shapes: s.shapes.length, baseline: c.baseline ?? s.exact.map(g => g.key) })

export function copyDelta(c: Copies): { added: CopyGroup[]; fixed: number } {
  const baseline = c.baseline
  if (baseline === undefined) return { added: [], fixed: 0 }
  return { added: c.exact.filter(g => !baseline.includes(g.key)), fixed: baseline.filter(k => !c.exact.some(g => g.key === k)).length }
}

// /clear starts a new task: the copies there now are its baseline.
export const rebase = (c: Copies): Copies => (c.known ? { ...c, baseline: c.exact.map(g => g.key) } : { ...c, baseline: undefined })

// The shortest path tails that still tell the files apart: two Compiler.scala become core/Compiler.scala and arkhitekton/Compiler.scala.
function shortPaths(paths: string[]): string[] {
  const parts = paths.map(p => p.split('/'))
  const depth = Array.from({ length: Math.max(...parts.map(p => p.length)) }, (_, i) => i + 1).find(d => new Set(parts.map(p => p.slice(-d).join('/'))).size === paths.length)
  return parts.map(p => p.slice(-(depth ?? p.length)).join('/'))
}

// "metricsOf: schedule-request.ts ≡ calendar.ts", or the names when a copy was renamed.
export function copyLabel(g: CopyGroup): string {
  const files = shortPaths([...new Set(g.sites.map(s => s.replace(/:\d+$/, '')))])
  return g.names.length > 1 ? g.names.join(' ≡ ') : `${g.names[0] ?? ''}${g.sites.length > 2 ? ` ×${g.sites.length}` : ''}: ${files.join(' ≡ ')}`
}

export const copyCount = (n: number) => (n === 0 ? 'no copies' : `${n} ${n === 1 ? 'copy' : 'copies'}`)

// The files a turn must re-read: dirty now, dirty at the last scan (they may be clean again), or changed between the two HEADs.
export const toReread = (idx: CopyIndex, dirty: readonly string[], headChanged: readonly string[]) =>
  [...new Set([...dirty, ...idx.dirty, ...headChanged])].filter(isCopySource)

// The index after a re-read; a file that could not be read is gone.
export function reindex(idx: CopyIndex, head: string, dirty: readonly string[], read: Record<string, Fn[] | undefined>): CopyIndex {
  const kept = Object.entries(idx.files).filter(([f]) => !(f in read))
  const fresh = Object.entries(read).flatMap(([f, fns]) => (fns === undefined ? [] : [[f, fns] as const]))
  return { root: idx.root, head, dirty: [...dirty], files: Object.fromEntries([...kept, ...fresh]) }
}
