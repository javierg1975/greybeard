# Band

The band above the prompt reports whether the session left the code in a state greybeard's rules
accept: check findings in the files it touched, domain types missing from the IR, regressions in
the test suite, open callers, copied code and deferred shortcuts. Cost is a meter at the end. In a repo
that tracks work in beads it also says which bead is in progress, what comes next and how far its epic is.

"Reuse" means reuse-don't-reinvent, measured on the whole repo rather than on the session's edits: a
function body that appears twice is code someone reinvented instead of reused. The band reports it from
session start, so a repo you have never touched already shows where it drifted, and it marks the copies
the session added.

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
    purpose: The repo has at least one .algebra/*.md; read at each turn end, so new types in a project that keeps IRs show as in sync, and in one that keeps none show nothing.

  - name: Hash
    kind: opaque
    wraps: string
    purpose: A 53-bit string hash of a normalized function body, in base 36.

  - name: Fn
    kind: product
    purpose: One function the copy scan found.
    fields:
      - { name: name, type: string }
      - { name: line, type: number, constraints: [">= 1"] }
      - { name: exact, type: Hash, constraints: ["of the body with comments and whitespace runs collapsed"] }
      - { name: shape, type: Hash, constraints: ["of the exact text with every identifier but keywords, every string and every number replaced"] }
      - { name: lines, type: number, constraints: ["non-blank body lines that are not only closing brackets"] }
    notes: "Only TS/JS top-level functions and arrow consts, and Scala defs at any depth, with a body of at least 20 tokens."

  - name: CopyIndex
    kind: product
    purpose: The functions of every scanned file, kept between turns so a turn re-reads only what changed.
    fields:
      - { name: root, type: string, constraints: ["the cwd the paths are relative to; another cwd means a full scan"] }
      - { name: head, type: string, constraints: ["HEAD when the index was built, '' without a commit"] }
      - { name: dirty, type: "string[]", constraints: ["files that differed from HEAD then: re-read next time even if clean now"] }
      - { name: files, type: "Record<string, Fn[]>", constraints: ["path relative to root"] }

  - name: CopyGroup
    kind: product
    purpose: Two or more functions with the same body.
    fields:
      - { name: key, type: Hash }
      - { name: names, type: "string[]", constraints: ["distinct, sorted"] }
      - { name: sites, type: "string[]", constraints: ["file:line, sorted, length >= 2"] }

  - name: CopyScan
    kind: product
    fields:
      - { name: exact, type: "CopyGroup[]" }
      - { name: shapes, type: "CopyGroup[]", constraints: ["bodies of 8+ lines, not already wholly inside an exact group"] }

  - name: Copies
    kind: product
    purpose: The reuse column.
    fields:
      - { name: known, type: boolean, constraints: ["false until a scan finished"] }
      - { name: exact, type: "CopyGroup[]" }
      - { name: shapes, type: number }
      - { name: baseline, type: "Hash[] | undefined", constraints: ["exact keys at the first scan of the task; /clear resets it to the current keys"] }

  - name: Bead
    kind: product
    fields:
      - { name: id, type: string }
      - { name: title, type: string }

  - name: Beads
    kind: sum
    purpose: The repo's beads as the band shows them.
    variants:
      - { name: None, notes: "no bd, no beads database, or bd failed" }
      - name: Tracked
        fields:
          - { name: current, type: "Bead | undefined", constraints: ["the in-progress bead updated last"] }
          - { name: others, type: number, constraints: ["the other in-progress beads"] }
          - { name: next, type: "Bead | undefined", constraints: ["first ready bead, under current's epic when it has one"] }
          - { name: epic, type: "(Bead & { done: number, total: number }) | undefined" }

  - name: TurnFacts
    kind: product
    purpose: What the turn-end hook read from the engine and the repo; the only input afterTurn has besides the band.
    fields:
      - { name: cost, type: "number | undefined", constraints: ["the session's cost so far, undefined when the engine reports none"] }
      - { name: turns, type: number }
      - { name: level, type: string }
      - { name: transcript, type: string, constraints: ["path, '' when none was found"] }
      - { name: title, type: "string | undefined" }
      - { name: model, type: string, constraints: ["'' when the transcript names none"] }
      - { name: used, type: "Usage | undefined", constraints: ["the main turn's own token usage"] }
      - { name: durationMs, type: number }
      - { name: grepByName, type: "Record<string, string>", constraints: ["git grep -nw output for each removed name"] }
      - { name: findingsJson, type: "string | undefined", constraints: ["undefined: check never ran in this repo"] }
      - { name: irs, type: "string[] | undefined", constraints: ["undefined: the repo keeps no IR; else the IR texts, empty when the session has no new types"] }
      - { name: scan, type: "CopyScan | undefined", constraints: ["undefined: no git repo or too many files to scan"] }

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
  - name: CopyDetection
    over: [Fn, CopyIndex, CopyGroup, CopyScan, Copies]
    known_structure: null
    operations:
      - name: fnsIn
        signature: "string -> string -> Fn[]"
        description: The functions of one file's text; none for a file the scan skips (tests, scripts, generated).
        pure: true
        total: true
      - name: copiesOf
        signature: "Record<string, Fn[]> -> CopyScan"
        description: Group functions by exact hash, then by shape hash for long bodies.
        pure: true
        total: true
      - name: withScan
        signature: "Copies -> CopyScan -> Copies"
        description: The column after a scan; the first scan of a task becomes its baseline.
        pure: true
        total: true
      - name: copyDelta
        signature: "Copies -> { added: CopyGroup[], fixed: number }"
        description: Exact groups not in the baseline, and baseline keys no longer present.
        pure: true
        total: true
    laws:
      - name: order-free
        description: The scan depends on the files, not on the order they were read in.
        formal: "copiesOf(fromEntries(shuffle(entries(i)))) == copiesOf(i)"
      - name: rename-free-shape
        description: Renaming identifiers in a body never changes its shape hash; changing an operator does.
      - name: first-scan-adds-nothing
        description: A task's first scan is its baseline, so a repo's old copies never count as the session's.
        formal: "copyDelta(withScan(NO_COPIES, s)).added == []"
      - name: incremental-equals-full
        description: Re-reading only files dirty now, dirty at the last scan, or changed between the two HEADs gives the index a full scan would.

  - name: BeadProgress
    over: [Bead, Beads]
    known_structure: null
    operations:
      - name: beadsFrom
        signature: "string -> string -> string | undefined -> string | undefined -> Beads"
        description: From bd's JSON for in-progress beads, ready beads, the epic and its children. Unparseable input is None, never a throw.
        pure: true
        total: true
    laws:
      - name: next-is-not-current
        description: bd ready excludes in-progress beads, so next never equals current.
      - name: done-bounded
        formal: "epic.done <= epic.total"

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

  - name: TurnEnd
    over: [Band, TurnFacts]
    known_structure: null
    operations:
      - name: afterTurn
        signature: "Band -> TurnFacts -> Band"
        description: The band after a main turn. The turn-end hook only gathers TurnFacts, applies this, and writes the ledger row of the result.
        pure: true
        total: true
      - name: openCalls
        signature: "string -> string -> string[]"
        description: For a removed name and its git grep output, the file:line calls left, or none when the name is defined again.
        pure: true
        total: true
    laws:
      - name: turn-cost-non-negative
        description: A session cost below the band's baseline means the engine started over; the turn's own cost is then the new total, never negative.
        formal: "last(afterTurn(b, f).turnCosts) >= 0"
      - name: unknown-findings-kept
        description: Without findings.json the findings stay as they were, so the check column keeps its dash.
        formal: "afterTurn(b, { ...f, findingsJson: undefined }).findings == b.findings"
      - name: no-ir-no-drift
        description: A repo that keeps no IR is never held to one.
        formal: "afterTurn(b, { ...f, irs: undefined }).drift == [] && !hasIr"

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
    description: Reads findings.json, the .algebra/ IRs and the changed source files, derives the state, writes the ledger row.
    idempotent: true
  - operation: band.scanCopies
    kind: io
    description: "Session start: git ls-files and a read of every candidate file (at most 3000). Turn end: only the files the CopyIndex says changed."
    idempotent: true
  - operation: band.readBeads
    kind: io
    description: "bd list/ready/show with --json, read-only, in the background since each call takes ~0.5s: at session start, at turn end, and after any Bash call that runs bd. Writes Band.beads on its own, outside afterTurn."
    idempotent: true
  - operation: band.explainBeads
    kind: io
    description: The Beads button submits a prompt asking the model to explain the epic and its beads; nothing runs until the person presses it.
    idempotent: false

cross_cutting:
  - concern: fixed columns
    affects: [band, board]
    constraint: "The band's details view always shows reuse (copies), regressions, check and spent in that order. Model (after reuse), callers and debt appear only when they have something: model once the session adds domain types in a repo that keeps IRs, as IR drift or in sync. A value not known yet is a dash, never a number, so the layout stays put and nothing unknown looks clean."
    validation_strategy: A band test renders a fresh session and finds the four columns with dashes.
  - concern: no new compiler runs
    affects: [band]
    constraint: The band only reads what greybeard check and the test runner already produced in the session, plus git, the source text and bd's read-only commands.
    validation_strategy: The band never spawns check, tsc or sbt, and never a bd command that writes; reviewed.
```
