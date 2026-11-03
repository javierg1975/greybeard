// What one test command reported (.algebra/band.algebra.md).
export type Run = { failed: number; names: string[] }

// The session's test facts; the band derives what it shows with suiteOf.
export type Tests = {
  baseline?: Run
  last?: Run
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
  reused: string[]
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
}

declare module 'claude-code' {
  interface PluginState {
    greybeard: { band: Band }
  }
}
