// What one test command reported (.algebra/band.algebra.md).
export type Run = { failed: number; names: string[] }

// The session's test facts; the band derives what it shows with suiteOf.
export type Tests = {
  baseline?: Run | undefined
  last?: Run | undefined
  edited: boolean
  stale: boolean
}

export type Suite =
  | { kind: 'not-run' }
  | { kind: 'stale' }
  | { kind: 'passing' }
  | { kind: 'new-failures'; count: number; names: string[] }
  | { kind: 'failing'; count: number }

// Check findings in the files the session touched. `known` is false until findings.json has been read.
export type Findings = { known: boolean; open: string[]; first: string; fixed: number }

// One function the copy scan found; exact and shape are hashes of its normalized body (.algebra/band.algebra.md).
export type Fn = { name: string; line: number; exact: string; shape: string; lines: number }

// Every scanned file's functions, so a turn re-reads only what changed. Paths are relative to root.
export type CopyIndex = { root: string; head: string; dirty: string[]; files: Record<string, Fn[]> }

// Two or more functions with the same body: sites are file:line.
export type CopyGroup = { key: string; names: string[]; sites: string[] }

export type CopyScan = { exact: CopyGroup[]; shapes: CopyGroup[] }

// The reuse column. baseline: the exact keys at the task's first scan, so old copies never count as the session's.
export type Copies = { known: boolean; exact: CopyGroup[]; shapes: number; baseline: string[] | undefined }

export type Bead = { id: string; title: string }

export type Beads =
  | { kind: 'none' }
  | { kind: 'tracked'; current: Bead | undefined; others: number; next: Bead | undefined; epic: (Bead & { done: number; total: number }) | undefined }

export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type Band = {
  level: string
  model: string
  cost: number
  spent: number
  turns: number
  turnCosts: number[]
  tokens: Tokens
  busyMs: number
  name: string
  project: string
  session: string
  transcript: string
  created: string[]
  removed: string[]
  openCallers: string[]
  tests: Tests
  touched: string[]
  testEdited: boolean
  findings: Findings
  types: string[]
  drift: string[]
  // The repo keeps IRs (.algebra/*.md): only then does the band show the model column.
  hasIr: boolean
  debtAdded: number
  debtResolved: number
  debtAt: string
  details: boolean
  copies: Copies
  beads: Beads
}

declare module 'claude-code' {
  interface PluginState {
    // copyIndex: the functions of every scanned file, so a turn re-reads only the files that changed.
    greybeard: { band: Band; copyIndex: CopyIndex }
  }
}
