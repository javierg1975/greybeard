import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { boardHtml, tasksFrom } from './board'
import type { Band } from './types'
import type { Col, TurnFacts } from './metrics'
import {
  addedLines,
  addTokens,
  afterTurn,
  callsIn,
  defsIn,
  elapsed,
  GREP_DEFS,
  inProject,
  isCode,
  isSource,
  isTestCommand,
  isTestFile,
  mainModel,
  markdown,
  metricsSvg,
  MODEL_PATTERN,
  NO_FINDINGS,
  NO_TESTS,
  NO_TOKENS,
  parseDefs,
  percent,
  resume,
  runOf,
  sessionTitle,
  shortcuts,
  snapshot,
  suiteLabel,
  suiteOf,
  taskKey,
  TITLE_RECORD,
  typesIn,
  upsertCsv,
  webhookRequest,
  withRun,
} from './metrics'

const LEVELS = ['off', 'lite', 'full', 'ultra']
const EMPTY: Band = {
  level: 'off',
  model: '',
  cost: 0,
  spent: 0,
  turns: 0,
  turnCosts: [],
  tokens: NO_TOKENS,
  busyMs: 0,
  name: '',
  project: '',
  session: '',
  transcript: '',
  reused: [],
  created: [],
  removed: [],
  openCallers: [],
  tests: NO_TESTS,
  touched: [],
  testEdited: false,
  findings: NO_FINDINGS,
  types: [],
  drift: [],
  hasIr: false,
  debtAdded: 0,
  debtResolved: 0,
  debtAt: '',
  details: false,
}
// The counters of one task: what a new session or /clear starts over.
const TASK = {
  spent: 0,
  turns: 0,
  turnCosts: [],
  tokens: NO_TOKENS,
  busyMs: 0,
  name: '',
  model: '',
  reused: [],
  created: [],
  removed: [],
  openCallers: [],
  tests: NO_TESTS,
  touched: [],
  testEdited: false,
  findings: NO_FINDINGS,
  types: [],
  drift: [],
  debtAdded: 0,
  debtResolved: 0,
  debtAt: '',
}
const band = atom({ plugin: 'greybeard', key: 'band' } as const, EMPTY)
const known = atom({ plugin: 'greybeard', key: 'known' } as const, {} as Record<string, string>)
const remember = ($: EngineInterface, defs: Map<string, string>) => update($, known, () => Object.fromEntries(defs))
// State kept from an older version of the band lacks newer fields, and its tests had another shape.
const current = (b: Band): Band => {
  const x = { ...EMPTY, ...b }
  return 'edited' in x.tests ? x : { ...x, tests: NO_TESTS }
}
const load = async ($: EngineInterface): Promise<Band> => current(await read($, band))

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]
const base = (path: string) => path.replace(/\/+$/, '').split('/').at(-1) ?? path

// Windows sets USERPROFILE, not HOME.
const home = async ($: EngineInterface) => (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
const claudeDir = async ($: EngineInterface) => (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}/.claude`

// `/greybeard band` (the mode tracker) leaves "off" here to hide the band. Absent flag = shown.
async function bandHidden($: EngineInterface): Promise<boolean> {
  try {
    return (await $.fs.read(`${await claudeDir($)}/.greybeard-band`)).trim() === 'off'
  } catch {
    return false
  }
}

// The level greybeard's own hooks write. Absent flag = off.
// shortcut: the shared flag the statusline reads, so two sessions in different repos show the last switch; read the per-project flag if that matters.
async function readLevel($: EngineInterface): Promise<string> {
  const dir = await claudeDir($)
  try {
    const level = (await $.fs.read(`${dir}/.greybeard-active`)).trim()
    return LEVELS.includes(level) ? level : 'off'
  } catch {
    return 'off'
  }
}

// The same commands a person types, so greybeard's own skills and hooks stay the only logic.
const run = ($: EngineInterface, command: string, args = '') => $.command.run({ command, args })

type Options = { readonly [field: string]: unknown }

// The session's sidebar name. grep, because $.fs.read refuses files over 4 MiB and transcripts grow past that.
// shortcut: without grep (Windows) only a transcript under 4 MiB is read; findstr would lift that.
async function readTitle($: EngineInterface, transcript: string): Promise<string | undefined> {
  if (transcript === '') return undefined
  const grep = await $.process.run(['grep', '-F', TITLE_RECORD, transcript]).catch(() => undefined)
  const text = grep !== undefined && grep.exitCode <= 1 ? grep.stdout : await $.fs.read(transcript).catch(() => '')
  return sessionTitle(text)
}

// The model that wrote most of the session's replies, so the board can tell models apart.
async function readModel($: EngineInterface, transcript: string): Promise<string> {
  if (transcript === '') return ''
  const grep = await $.process.run(['grep', '-o', MODEL_PATTERN, transcript]).catch(() => undefined)
  return grep?.exitCode === 0 ? mainModel(grep.stdout) : ''
}

// Where Claude Code keeps the session's transcript: on managed, Team and Enterprise machines its cc-plugin-sec-default skips every classic.* hook, so no hook hands the path over.
// First the folder its rule names, then every project folder: it hashes names past 200 characters, and /cd, worktrees and /resume can put the file elsewhere.
// shortcut: with persistence off there is no file, so every turn checks every folder, read the path from the engine once it offers one.
async function findTranscript($: EngineInterface, session: string): Promise<string> {
  const projects = `${await claudeDir($)}/projects`
  const exists = (file: string) => $.fs.exists(file).catch(() => false)
  const root = await $.session.root().catch(() => '')
  const named = `${projects}/${root.replace(/[^a-zA-Z0-9]/g, '-')}/${session}.jsonl`
  if (root !== '' && (await exists(named))) return named
  const dirs = (await $.fs.list(projects).catch(() => [])).filter(d => d.kind === 'dir')
  // One at a time: thousands of checks in flight at once are slower than in turn. Once found, the rest is skipped.
  return dirs.reduce<Promise<string>>(async (found, dir) => {
    const prior = await found
    const file = `${projects}/${dir.name}/${session}.jsonl`
    return prior !== '' ? prior : (await exists(file)) ? file : ''
  }, Promise.resolve(''))
}

// Where the task ledgers and the board live.
// shortcut: ~/.config only (XDG respected); Windows would want %APPDATA%.
async function ledgerDir($: EngineInterface) {
  return `${(await $.env.get('XDG_CONFIG_HOME')) ?? `${await home($)}/.config`}/greybeard/band`
}

const ledgerFile = (dir: string, project: string) => `${dir}/${project.replace(/[^\w.-]/g, '_')}.csv`

// After every turn: the task's row in a CSV per project, and the same row to a webhook if one is set.
async function record($: EngineInterface, b: Band, options: Options) {
  const startedAt = (await $.session.usage()).startedAt
  const row = snapshot(b, startedAt)
  if (options.ledger !== false && b.project !== '') {
    const dir = await ledgerDir($)
    const file = ledgerFile(dir, b.project)
    const existing = await $.fs.read(file).catch(() => '')
    // $.fs.write creates the directory: no mkdir, which Windows does not have.
    await $.fs.write(file, upsertCsv(existing, row))
    // The board is a plain file a refresh rereads, so it is rebuilt with every row.
    await writeBoard($, dir)
  }
  const url = typeof options.webhookUrl === 'string' ? options.webhookUrl.trim() : ''
  if (url !== '') {
    const token = typeof options.webhookToken === 'string' ? options.webhookToken.trim() : ''
    const request = webhookRequest(url, token, options.sendNames !== false, row)
    if ('refused' in request) {
      $.ui.status(`greybeard band: ${request.refused}`)
      return
    }
    // Not awaited: a slow endpoint must never hold up the turn.
    void $.http
      .fetch(request.url, request.init)
      .then(r => $.ui.status(r.ok ? undefined : `greybeard band: webhook answered ${r.status}`))
      .catch(() => $.ui.status('greybeard band: webhook unreachable'))
  }
}

// Builds board.html from every project's ledger.
async function writeBoard($: EngineInterface, dir: string) {
  const entries = await $.fs.list(dir).catch(() => [])
  const texts = await Promise.all(entries.filter(f => f.kind === 'file' && f.name.endsWith('.csv')).map(f => $.fs.read(`${dir}/${f.name}`).catch(() => '')))
  const file = `${dir}/board.html`
  await $.fs.write(file, boardHtml(texts.flatMap(tasksFrom), await $.clock.now()))
  return file
}

// Builds the board fresh and opens it in the browser.
async function openBoard($: EngineInterface) {
  const file = await writeBoard($, await ledgerDir($))
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  const mac = !windows && (await $.process.run(['uname'])).stdout.trim() === 'Darwin'
  await $.process.run(windows ? ['cmd', '/c', 'start', '', file] : [mac ? 'open' : 'xdg-open', file])
}

// Sets the band up for a session (level, project, task row, cost baseline); returns the definitions that exist now.
async function start($: EngineInterface): Promise<Map<string, string>> {
  const grep = await $.process.run(['git', 'grep', '--untracked', '-nE', GREP_DEFS]).catch(() => undefined)
  const level = await readLevel($)
  const details = (await $.store.get('details')) === true
  const repo = await $.session.repo().catch(() => null)
  const project = base(repo?.root ?? (await $.session.cwd()))
  const session = await $.session.id()
  // The cost so far is the baseline for the last turn's own cost.
  const usage = await $.session.usage().catch(() => undefined)
  const csv = usage ? await $.fs.read(ledgerFile(await ledgerDir($), project)).catch(() => '') : ''
  const key = usage ? taskKey(session, usage.startedAt) : ''
  await update($, band, b => resume({ ...EMPTY, ...b, level, details, project, session, cost: usage?.cost?.usd ?? b.cost }, csv, key))
  return grep?.exitCode === 0 ? parseDefs(grep.stdout) : new Map()
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await remember($, await start($))
    return next(e)
  }).catch(($, e, next) => next(e))

  // /clear, /resume and /branch go on under another session id with an empty band and no session.start, so the band
  // showed "off" until the first turn ended. Set it up again once one of them has moved the session.
  // Only these commands: the engine labels a command's output with every plugin its hook chain ran through, so a hook on
  // every command printed "greybeard+<plugin>:" before other plugins' commands.
  // shortcut: after /clear, greybeard-activate.js may reset the flag to the default level after this, so a level switched
  // before /clear can show until the first turn ends; a session skips a plugin's classic.SessionStart hook, the one later point.
  on('command.run', { command: ['clear', 'resume', 'branch'] }, async ($, e, next) => {
    const session = await $.session.id()
    const result = await next(e)
    if ((await $.session.id()) !== session) await start($).then(defs => remember($, defs)).catch(() => undefined)
    return result
  }).catch(($, e, next) => next(e))

  // /clear starts a new task: the counters start over, the cost baseline stays.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, band, b => ({ ...EMPTY, ...b, ...TASK }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // The first prompt names the task until the session has a sidebar name.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (e.origin.kind !== 'plugin' && text !== '' && !text.startsWith('/')) {
      const name = (text.split('\n')[0] ?? '').slice(0, 60)
      await update($, band, b => (b.name === '' ? { ...EMPTY, ...b, name } : b))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Bash') {
      const ran = await next(e)
      if (ran.deny === undefined && isTestCommand(e.command)) {
        const run = runOf(ran.text ?? '', ran.isError === true)
        await update($, band, b => ({ ...current(b), tests: withRun(current(b).tests, run) }))
      }
      return ran
    }

    if (e.tool !== 'Edit' && e.tool !== 'Write') return next(e)

    const file = e.file_path
    // A scratch script outside the project is never reused or called by it (#1300).
    const repo = await $.session.repo().catch(() => null)
    if (!inProject(file, repo?.root ?? (await $.session.cwd()))) return next(e)
    const before = e.tool === 'Write' ? await $.fs.read(file).catch(() => '') : e.old_string
    const after = e.tool === 'Write' ? e.content : e.new_string
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const oldDefs = defsIn(file, before)
    const newDefs = defsIn(file, after)
    const created = isSource(file) ? newDefs.filter(n => !oldDefs.includes(n)) : []
    const removed = oldDefs.filter(n => !newDefs.includes(n))
    const reused = isSource(file) ? callsIn(addedLines(before, after), new Map(Object.entries(await read($, known))), newDefs) : []
    const oldTypes = typesIn(file, before)
    const types = isSource(file) ? typesIn(file, after).filter(n => !oldTypes.includes(n)) : []
    const added = shortcuts(addedLines(before, after))
    const resolved = shortcuts(addedLines(after, before))
    const code = isCode(file)

    await update($, band, x => {
      const b = current(x)
      return {
        ...b,
        reused: union(b.reused, reused),
        created: union(b.created, created),
        removed: union(b.removed, removed),
        touched: code ? union(b.touched, [file]) : b.touched,
        testEdited: b.testEdited || isTestFile(file),
        types: union(b.types, types),
        debtAdded: b.debtAdded + added,
        debtResolved: b.debtResolved + resolved,
        debtAt: added > 0 ? base(file) : b.debtAt,
        tests: code ? { ...b.tests, edited: true, stale: b.tests.last !== undefined } : b.tests,
      }
    })

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const used = e.usage
    if (e.agentId !== undefined) {
      // A subagent's tokens count; its cost is already in the session cost the main turn reads.
      if (used) await update($, band, b => ({ ...EMPTY, ...b, tokens: addTokens(b.tokens ?? NO_TOKENS, used) }))
      return next(e)
    }

    // Gather what afterTurn needs; every decision about the next band is made there (.algebra/band.algebra.md).
    const usage = await $.session.usage()
    const before = await load($)
    const session = await $.session.id()
    // Here, not at start: the first turn writes the file, and a new id (/clear, /resume) or a move (/cd, a worktree) changes it.
    const kept = base(before.transcript) === `${session}.jsonl` && (await $.fs.exists(before.transcript).catch(() => false))
    const transcript = kept ? before.transcript : await findTranscript($, session)
    // One grep at a time, as before.
    const grepByName = await before.removed.reduce<Promise<Record<string, string>>>(async (found, name) => {
      const grep = await $.process.run(['git', 'grep', '--untracked', '-nw', '-e', name]).catch(() => undefined)
      return { ...(await found), [name]: grep?.stdout ?? '' }
    }, Promise.resolve({}))
    // Read only: the band starts no compiler.
    const root = (await $.session.repo().catch(() => null))?.root ?? (await $.session.cwd())
    const gitPath = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-path', 'greybeard/findings.json']).catch(() => undefined)
    const irDir = `${root}/.algebra`
    const irFiles = (await $.fs.list(irDir).catch(() => [])).filter(f => f.kind === 'file' && f.name.endsWith('.md'))
    const facts: TurnFacts = {
      cost: usage.cost?.usd,
      turns: await $.session.turns(),
      level: await readLevel($),
      transcript,
      title: await readTitle($, transcript),
      model: await readModel($, transcript),
      used,
      durationMs: e.durationMs,
      grepByName,
      findingsJson: gitPath?.exitCode === 0 ? await $.fs.read(gitPath.stdout.trim()).catch(() => undefined) : undefined,
      irs: irFiles.length === 0 ? undefined : before.types.length > 0 ? await Promise.all(irFiles.map(f => $.fs.read(`${irDir}/${f.name}`).catch(() => ''))) : [],
    }

    const b = await update($, band, x => afterTurn(current(x), facts))
    await record($, b, options).catch(() => $.ui.status('greybeard band: could not write the task ledger'))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await bandHidden($))) return next(e)
    // Other mods share this slot: draw theirs below ours instead of replacing it.
    // next(e) rejects only when nothing answers beneath (the test harness): the band still draws.
    const below = await next(e).catch(() => undefined)

    const b = await load($)
    const now = await $.clock.now()
    const startedAt = (await $.session.usage().catch(() => undefined))?.startedAt ?? now
    const reuse = percent(b.reused.length, b.created.length)
    const suite = suiteOf(b.tests)
    const findings = b.findings.open.length
    const hasOpen = b.openCallers.length > 0
    // Nothing to judge until the session has changed code.
    const clean = b.tests.edited && findings === 0 && b.drift.length === 0 && !hasOpen && suite.kind === 'passing'
    const suiteTone = suite.kind === 'new-failures' ? ('error' as const) : suite.kind === 'failing' ? ('warning' as const) : suite.kind === 'passing' ? ('success' as const) : undefined
    const showSuite = b.tests.last !== undefined || b.tests.edited

    const setLevel = async (level: string) => {
      await update($, band, x => ({ ...x, level }))
      await run($, 'greybeard:greybeard', level)
    }
    const toggle = async () => {
      await update($, band, x => ({ ...x, details: !x.details }))
      await $.store.set('details', !b.details)
    }
    const review = () => run($, 'greybeard:greybeard-review')
    const audit = () => run($, 'greybeard:greybeard-audit')
    const debt = () => run($, 'greybeard:greybeard-debt')
    const board = () => openBoard($).catch(() => $.ui.toast('greybeard band: could not open the board'))
    const copy = async () => {
      const done = await $.ui.copy({ text: markdown(snapshot(await load($), startedAt)), surface: e.surface })
      $.ui.toast(done.isCopied ? 'Task copied as Markdown' : `Copy failed: ${done.reason}`)
    }

    const { Box, Text, Button } = $.ui.resolve(e)
    // bodyColumns counts terminal cells; a graphical surface draws Buttons wider than their cells, so a row sized to it wraps there.
    const width = e.surface === 'terminal' ? e.props.bodyColumns : undefined
    const sized = width === undefined ? {} : { width }
    const stack =(mine: NonNullable<typeof below>) => (below ? <Box flexDirection="column">{mine}{below}</Box> : mine)

    if (!b.details) {
      return stack(
        <Box flexDirection="row" alignItems="center" gap={2} {...sized}>
          {/* A click opens the four levels: one click, one turn, no stops on levels nobody wanted. */}
          <Button key="level" plain onPress={toggle}>
            <Text color={b.level === 'off' ? 'inactive' : 'suggestion'}>●</Text> {b.level}
          </Button>
          {/* State reads from color and words; no status glyphs. */}
          {clean && <Text color="success">clean</Text>}
          {findings > 0 && <Text color="warning">{findings} {findings === 1 ? 'finding' : 'findings'}</Text>}
          {b.drift.length > 0 && <Text color="warning">IR drift</Text>}
          {showSuite && suite.kind !== 'passing' && (
            <Text {...(suiteTone === undefined ? {} : { color: suiteTone })} dimColor={suiteTone === undefined}>
              {suite.kind === 'stale' || suite.kind === 'not-run' ? `tests ${suiteLabel(suite)}` : suiteLabel(suite)}
            </Text>
          )}
          {hasOpen && <Text color="warning">{b.openCallers.length} callers open</Text>}
          {reuse !== undefined && <Text>{reuse}% reuse</Text>}
          {b.debtAdded > 0 && <Text dimColor>+{b.debtAdded} debt</Text>}
          <Box flexGrow={1} />
          <Text dimColor>${b.spent.toFixed(2)}</Text>
          <Button key="review" plain label="Review" onPress={review} />
          <Button key="audit" plain label="Audit" onPress={audit} />
          <Button key="board" plain label="Board" onPress={board} />
          <Button key="details" plain label="Details" onPress={toggle} />
        </Box>
      )
    }

    // Fixed columns, a dash until there is something to say: reuse first, then the session's own checks; spend is the meter at the end.
    // Callers and debt join only when they have something (.algebra/band.algebra.md).
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
    const dash = (key: string, sub: string): Col => ({ key, label: key, value: '–', sub, tone: 'muted' })
    const suiteSub = suite.kind === 'new-failures' ? suite.names.slice(0, 2).join(', ') : suite.kind === 'failing' ? 'no earlier run to compare' : suite.kind === 'stale' ? 'code changed since the last run' : suite.kind === 'passing' ? (b.created.length > 0 && !b.testEdited ? 'new logic, no test edited' : 'no new failures') : ''
    const cols: Col[] = [
      reuse !== undefined ? { key: 'reuse', label: 'reuse', value: `${reuse}%`, sub: `${b.reused.length} used · ${b.created.length} new` } : dash('reuse', 'no new code yet'),
      ...(b.drift.length > 0
        ? [{ key: 'model', label: 'model', value: 'IR drift', sub: `${b.drift.slice(0, 2).join(', ')} not in .algebra/`, tone: 'warning' } as const]
        : b.hasIr && b.types.length > 0
          ? [{ key: 'model', label: 'model', value: 'in sync', sub: 'new types are in .algebra/', tone: 'success' } as const]
          : []),
      showSuite
        ? { key: 'regressions', label: 'regressions', value: suite.kind === 'passing' ? 'none' : suiteLabel(suite), sub: suiteSub, tone: suiteTone }
        : dash('regressions', 'no tests run yet'),
      ...(hasOpen ? [{ key: 'callers', label: 'callers', value: `${b.openCallers.length} open`, sub: b.openCallers.slice(0, 2).join(', '), tone: 'warning' } as const] : []),
      !b.findings.known
        ? dash('check', 'greybeard check not run')
        : b.touched.length === 0
          ? dash('check', 'no files touched yet')
          : findings > 0
            ? { key: 'check', label: 'check', value: `${findings} open`, sub: b.findings.first, tone: 'warning' }
            : { key: 'check', label: 'check', value: 'clean', sub: b.findings.fixed > 0 ? `${b.findings.fixed} fixed` : '', tone: 'success' },
      ...(b.debtAdded > 0 || b.debtResolved > 0
        ? [{ key: 'debt', label: 'debt', value: `+${b.debtAdded} −${b.debtResolved}`, sub: b.debtAt === '' ? '' : `last added in ${b.debtAt}` }]
        : []),
      { key: 'spent', label: 'spent', value: `$${b.spent.toFixed(2)}`, sub: `${elapsed(b.busyMs)} · ${plural(b.turns, 'turn')}`, tone: 'muted' },
    ]

    // Text glyphs make broken lines in the desktop's proportional font; an SVG draws real ones.
    const Svg = e.surface === 'desktop' ? $.ui.resolve(e).Svg : undefined
    const metrics = Svg ? (
      <Svg source={metricsSvg(cols)} alt={cols.map(c => `${c.label} ${c.value}`).join(', ')} />
    ) : (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          {'─'.repeat(e.props.bodyColumns)}
        </Text>
        <Box flexDirection="row" gap={2}>
          {cols.map(c => (
            // Off the terminal the columns share the row; a width in cells would leave most of it empty and cut the text.
            <Box key={c.key} flexDirection="column" {...(width === undefined ? { flexGrow: 1 } : { width: Math.max(10, Math.floor(width / cols.length) - 2) })}>
              <Text dimColor>{c.label}</Text>
              <Text bold={c.tone !== 'muted'} dimColor={c.tone === 'muted'} {...(c.tone === undefined || c.tone === 'muted' ? {} : { color: c.tone })}>
                {c.value}
              </Text>
              <Text dimColor wrap="truncate-end">
                {c.sub}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    )

    return stack(
      // The desktop's SVG draws its own line at the top, which would touch the buttons without the gap.
      <Box flexDirection="column" {...sized} gap={e.surface === 'desktop' ? 1 : 0}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          {LEVELS.map(level => (
            <Button
              key={`level-${level}`}
              label={level}
              {...(level === b.level ? { variant: 'primary' as const } : { plain: true as const, dimColor: true })}
              onPress={() => setLevel(level)}
            />
          ))}
          <Box flexGrow={1} />
          <Button key="copy" plain label="Copy" onPress={copy} />
          <Button key="review" plain label="Review" onPress={review} />
          <Button key="audit" plain label="Audit" onPress={audit} />
          <Button key="debt" plain label="Debt" onPress={debt} />
          <Button key="board" plain label="Board" onPress={board} />
          <Button key="details" plain label="Compact" onPress={toggle} />
        </Box>
        {metrics}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
