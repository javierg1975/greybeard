# Band

The band above the prompt reports whether the session left the code in a state greybeard's rules
accept: check findings in the files it touched, domain types missing from the IR, regressions in
the test suite, open callers, reuse and deferred shortcuts. Cost is a meter at the end.

The band stores facts as they arrive (test runs, edits, findings) and derives what it shows from
them with pure functions, so a reload or a resumed band draws the same thing from the same facts.

```yaml
module:
  name: band
  purpose: Report, after every turn, whether the session's changes pass greybeard's checks, and record it per task.
  depends_on: [check, map]

types:
  - name: Run
    kind: product
    purpose: What one test command reported.
    fields:
      - { name: failed, type: number, constraints: [">= 0"] }
      - { name: names, type: "string[]", constraints: ["failing test names, empty when the runner printed none"] }

  - name: Tests
    kind: product
    purpose: The test facts of one session.
    fields:
      - { name: baseline, type: "Run | undefined", constraints: ["merged from every run before the first code edit, then frozen"] }
      - { name: last, type: "Run | undefined" }
      - { name: edited, type: boolean, constraints: ["a code file in the project was edited this session"] }
      - { name: stale, type: boolean, constraints: ["a code file was edited after the last run"] }

  - name: Suite
    kind: sum
    purpose: What the regressions column says, derived from Tests.
    variants:
      - { name: NotRun }
      - { name: Stale }
      - { name: Passing }
      - name: NewFailures
        fields: [{ name: count, type: number }, { name: names, type: "string[]" }]
      - name: Failing
        fields: [{ name: count, type: number }]
    notes: "Failing is for failures with no baseline to compare against: they may predate the session, so they are never called new."

  - name: FindingKey
    kind: alias
    wraps: string
    purpose: "`file rule message` of a greybeard check finding, without the line, so a finding that moves lines stays the same finding."

  - name: Findings
    kind: product
    purpose: Check findings in the files the session touched.
    fields:
      - { name: open, type: "FindingKey[]" }
      - { name: first, type: string, constraints: ["the first open finding as check prints it, with its line"] }
      - { name: fixed, type: number, constraints: [">= 0", "keys open at an earlier turn end and gone at a later one"] }

  - name: HasIr
    kind: alias
    wraps: boolean
    purpose: The repo has at least one .algebra/*.md; read at each turn end, so the model column knows whether the project keeps IRs.

  - name: Task
    kind: product
    purpose: One ledger row as the board reads it; quality leads, cost and tokens follow.
    fields:
      - { name: findingsOpen, type: "number | null", constraints: ["null when the row has no value: an older ledger, an import, or check never ran"] }
      - { name: findingsFixed, type: "number | null" }
      - { name: irDrift, type: "number | null" }
      - { name: tests, type: string, constraints: ["the Suite label the band wrote"] }
      - { name: cost, type: number }
      - { name: tokens, type: number }
      - { name: agentMinutes, type: number }

algebras:
  - name: Regressions
    over: [Run, Tests, Suite]
    known_structure: null
    operations:
      - name: merge
        signature: "Run -> Run -> Run"
        description: Combine two baseline runs; names unite, failed is the larger count.
        pure: true
        total: true
      - name: suite
        signature: "Tests -> Suite"
        description: NotRun without a run; Stale after an edit since the last run; NewFailures for failures beyond the baseline; Failing when there is no baseline; Passing otherwise.
        pure: true
        total: true
    laws:
      - name: merge-semilattice
        description: merge is associative, commutative and idempotent on names, so the order of baseline runs never matters.
        formal: "merge(a, a).names == a.names"
      - name: baseline-never-new
        description: A failure already in the baseline is never reported as new.
        formal: "suite({ baseline: r, last: r, stale: false }) != NewFailures"
      - name: frozen-after-edit
        description: Once a code file is edited, later runs never change the baseline.

  - name: CheckFindings
    over: [FindingKey, Findings]
    known_structure: null
    operations:
      - name: advance
        signature: "Findings -> FindingKey[] -> string -> Findings"
        description: Replace the open set with the new one; add to fixed every key that left it.
        pure: true
        total: true
    laws:
      - name: fixed-monotone
        description: fixed never decreases within a session.
        formal: "advance(f, ks, x).fixed >= f.fixed"

  - name: Board
    over: [Task]
    known_structure: null
    operations:
      - name: tasksFrom
        signature: "string -> Task[]"
        description: Parse a ledger CSV by header name; a column the header lacks or a field left empty reads as null for the quality fields.
        pure: true
        total: true
    laws:
      - name: unknown-is-not-zero
        description: A quality field with no value is null and the page shows a dash, never "0", so an import or an older row never looks clean.
        formal: "tasksFrom(oldHeaderRow).findingsOpen == null"
      - name: lower-is-better
        description: For open findings, IR drift and new failures a fall against the previous period is shown as good; for findings fixed a rise is.

effects:
  - operation: check.record
    kind: blocking
    description: greybeard check writes its findings per checked file to `<git-path greybeard>/findings.json`; an empty list removes the file's entry.
    idempotent: true
  - operation: band.turnComplete
    kind: io
    description: Reads findings.json and the .algebra/ IRs, derives the state, writes the ledger row.
    idempotent: true

cross_cutting:
  - concern: fixed columns
    affects: [band, board]
    constraint: "The band's details view always shows check, regressions, reuse and spent, and model when the repo has .algebra/; callers and debt appear only when they have something. A value not known yet is a dash, never a number, so the layout stays put and nothing unknown looks clean."
    validation_strategy: A band test renders a fresh session and finds the four columns with dashes.
  - concern: no new compiler runs
    affects: [band]
    constraint: The band only reads what greybeard check and the test runner already produced in the session.
    validation_strategy: The band never spawns check, tsc or sbt; reviewed.
```
