import { describe, expect, mock, test } from 'claude-code/testing'

import { boardHtml, parseCsv, tasksFrom } from '../hooks/band/board'
import type { Band } from '../hooks/band/types'
import {
  NO_TOKENS,
  addTokens,
  addedLines,
  callsIn,
  defsIn,
  duration,
  elapsed,
  fmtTokens,
  inProject,
  isTestCommand,
  mainModel,
  markdown,
  metricsSvg,
  parseDefs,
  percent,
  resume,
  sessionTitle,
  snapshot,
  testCounts,
  totalTokens,
  upsertCsv,
  CSV_HEADER,
  NO_FINDINGS,
  NO_TESTS,
  advanceFindings,
  failingNames,
  findingKey,
  irDrift,
  isTestFile,
  mergeRun,
  runOf,
  shortcuts,
  suiteOf,
  typesIn,
  webhookRequest,
  withRun,
} from '../hooks/band/metrics'

describe('board', () => {
  const CSV = 'key,started,project,name,cost_usd,turns,agent_minutes,tokens_total,tokens_output,reuse_pct,reused,new,callers_open,tests,level\n' +
    'a-1,2026-10-15 12:00,shop,"Fix ""cart"", totals\nand tax",3.10,6,26.0,1200000,85000,83,5,1,0,14 passed,full\n' +
    'b-2,2026-10-14 09:30,shop,<script>alert(1)</script>,0.50,2,1.5,40000,900,,0,0,0,not run,lite\n'

  test('reads quoted CSV fields with commas, quotes and line breaks', () => {
    const rows = parseCsv(CSV)
    expect(rows.length).toBe(3)
    expect(rows[1]?.[3]).toBe('Fix "cart", totals\nand tax')
    const tasks = tasksFrom(CSV)
    expect(tasks[0]).toEqual({ started: '2026-10-15 12:00', project: 'shop', name: 'Fix "cart", totals\nand tax', cost: 3.1, turns: 6, agentMinutes: 26, tokens: 1_200_000, reuse: 83, tests: '14 passed', level: 'full', model: '', findingsOpen: null, findingsFixed: null, irDrift: null })
    expect(tasks[1]?.reuse).toBeNull()
    expect(tasksFrom('not,a,ledger\n1,2,3')).toEqual([])
  })

  test('quality columns read as numbers, and as null where the row has none, so no import looks clean (.algebra/band.algebra.md)', () => {
    const csv = `${CSV_HEADER}\n` +
      'a-1,2026-10-15 12:00,shop,New,1.00,2,3.0,500,50,,0,0,0,1 new failure,full,claude-opus-5-5,2,7,0,0,0\n' +
      'b-2,2026-10-14 09:00,shop,Imported,1.00,2,3.0,500,50,,,,,,import,claude-opus-5-5,,,,,\n'
    const [fresh, imported] = tasksFrom(csv)
    expect([fresh?.findingsOpen, fresh?.findingsFixed, fresh?.irDrift]).toEqual([2, 7, 0])
    expect([imported?.findingsOpen, imported?.findingsFixed, imported?.irDrift]).toEqual([null, null, null])
    const html = boardHtml(tasksFrom(csv), Date.UTC(2026, 9, 15, 12, 0))
    expect(html).toContain('<th>Regressions</th>')
    expect(html).toContain('data-metric="findings"')
  })

  const dataOf = (html: string) => JSON.parse(/<script type="application\/json" id="board-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? 'null')

  test('the board carries every task as data no name can break out of', () => {
    const html = boardHtml(tasksFrom(CSV), Date.UTC(2026, 9, 15, 12, 0))
    const data = dataOf(html)
    expect(data.tasks.length).toBe(2)
    expect(data.tasks[1].name).toBe('<script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('\\u003cscript>alert(1)\\u003c/script>')
    expect(html).toContain('not a bill')
    expect(html).toContain('id="card"')
    expect(html.split('id="pt-logo"').length).toBe(2)
    expect(html).toContain('href="#pt-logo"')
    expect(html).toContain('<link rel="icon" href="data:image/svg+xml,')
    expect(html).toContain('id="c-time"')
    expect(html).not.toContain('innerHTML')
    expect(html).toContain('id="theme"')
    expect(html).toContain('<html lang="en" data-theme="dark">')
    expect(html).toContain(':root[data-theme=light]{')
    expect(html).toContain(':root[data-theme=system]{')
  })

  test('an empty board still loads and says there are no sessions yet', () => {
    const html = boardHtml([], Date.UTC(2026, 9, 15, 12, 0))
    expect(dataOf(html).tasks).toEqual([])
    expect(html).toContain('No sessions yet')
  })
})

describe('metrics', () => {
  test('adds up tokens and prints them short', () => {
    const t = addTokens(addTokens(NO_TOKENS, { input_tokens: 10, output_tokens: 90, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }), { input_tokens: 0, output_tokens: 10, cache_read_input_tokens: 140, cache_creation_input_tokens: 0 })
    expect(totalTokens(t)).toBe(1250)
    expect(t.output).toBe(100)
    expect([fmtTokens(950), fmtTokens(1234), fmtTokens(1_240_000), fmtTokens(2000)]).toEqual(['950', '1.2k', '1.2M', '2k'])
  })

  const BASE: Band = {
    level: 'full', model: 'claude-opus-5-5', cost: 31.9, spent: 3.1, turns: 6, turnCosts: [0.42], tokens: { input: 5000, output: 85_000, cacheRead: 1_100_000, cacheWrite: 10_000 },
    busyMs: 1_560_000, name: 'Fix the cart | totals, again', project: 'shop', session: '4c69e3db-57a0', transcript: '', reused: ['to_cents'], created: [],
    removed: [], openCallers: [], tests: withRun(NO_TESTS, { failed: 0, names: [] }), touched: [], testEdited: false,
    findings: NO_FINDINGS, types: [], drift: [], debtAdded: 0, debtResolved: 0, debtAt: '', details: false,
  }

  test('a band that starts again mid-session goes on from its row instead of from zero', () => {
    const csv = `${CSV_HEADER}\nother-1,2026-10-14 09:00,shop,Other,1.00,2,3.0,500,50,,0,0,0,not run,full\n4c69e3db-7,2026-10-15 01:10,shop,"Fix the cart, again",46.09,32,55.5,107900000,250000,,0,0,0,stale,full\n`
    const fresh: Band = { ...BASE, name: '', busyMs: 0, tokens: NO_TOKENS }
    const b = resume(fresh, csv, '4c69e3db-7')
    expect(b.name).toBe('Fix the cart, again')
    expect(b.busyMs).toBe(55.5 * 60000)
    expect(totalTokens(b.tokens)).toBe(107_900_000)
    expect(b.tokens.output).toBe(250_000)
    // A band that already counted more keeps its own numbers and name.
    const ahead: Band = { ...BASE, busyMs: 4_000_000, tokens: { input: 0, output: 1, cacheRead: 200_000_000, cacheWrite: 0 } }
    expect(resume(ahead, csv, '4c69e3db-7')).toEqual(ahead)
    expect(resume(fresh, csv, 'missing-1')).toEqual(fresh)
    expect(resume(fresh, '', '4c69e3db-7')).toEqual(fresh)
  })

  test('the row names the model that wrote most replies, and an older ledger keeps its rows', () => {
    expect(mainModel('"model":"claude-opus-5-5"\n"model":"claude-haiku-5-5"\n"model":"claude-opus-5-5"\n')).toBe('claude-opus-5-5')
    expect(mainModel('')).toBe('')
    const old = 'key,started,project,name,cost_usd,turns,agent_minutes,tokens_total,tokens_output,reuse_pct,reused,new,callers_open,tests,level\n' +
      'other-1,2026-10-14 09:00,shop,Other,1.00,2,3.0,500,50,,0,0,0,not run,full\n'
    const csv = upsertCsv(old, snapshot(BASE, Date.UTC(2026, 9, 15, 12, 0)))
    expect(csv.split('\n')[0]).toBe(CSV_HEADER)
    expect(csv.split('\n').filter(line => line.startsWith('key,')).length).toBe(1)
    expect(tasksFrom(csv).map(t => t.model)).toEqual(['', 'claude-opus-5-5'])
    expect(markdown(snapshot(BASE, Date.UTC(2026, 9, 15, 12, 0)))).toContain('| Model | claude-opus-5-5 |')
  })

  test('the webhook sends the token only over https, or to this machine', () => {
    const row = snapshot(BASE, Date.UTC(2026, 9, 15, 12, 0))
    const sent = webhookRequest('https://board.example.com/tasks', 'ptb_x', true, row)
    expect('refused' in sent).toBe(false)
    if (!('refused' in sent)) {
      expect(sent.init.headers.authorization).toBe('Bearer ptb_x')
      expect(JSON.parse(sent.init.body).name).toBe('Fix the cart | totals, again')
    }
    expect(webhookRequest('http://board.example.com/tasks', 'ptb_x', true, row)).toEqual({ refused: 'webhook needs https' })
    expect(webhookRequest('not a url', 'ptb_x', true, row)).toEqual({ refused: 'webhook URL is not a URL' })
    expect('refused' in webhookRequest('http://127.0.0.1:4711/tasks', 'ptb_x', true, row)).toBe(false)
    const quiet = webhookRequest('https://board.example.com/tasks', '', false, row)
    if (!('refused' in quiet)) {
      expect(quiet.init.headers.authorization).toBeUndefined()
      expect(JSON.parse(quiet.init.body).name).toBe('')
    }
  })

  test('agent time reads in seconds, minutes, hours', () => {
    expect([elapsed(45_000), elapsed(130_000), elapsed(4_320_000)]).toEqual(['45s', '2m 10s', '1h 12m'])
  })

  test('the sidebar name is the last custom-title record of the transcript', () => {
    const lines = [
      JSON.stringify({ type: 'custom-title', customTitle: 'First name', sessionId: 's' }),
      JSON.stringify({ type: 'assistant', meta: { type: 'custom-title', customTitle: 'not a record' } }),
      JSON.stringify({ type: 'custom-title', customTitle: '  GitHub issues triage  ' }),
      '{"type":"custom-title", broken',
    ]
    expect(sessionTitle(lines.join('\n'))).toBe('GitHub issues triage')
    expect(sessionTitle(lines.slice(0, 2).join('\n'))).toBe('First name')
    expect(sessionTitle(JSON.stringify({ type: 'custom-title', customTitle: ' ' }))).toBeUndefined()
    expect(sessionTitle(JSON.stringify({ type: 'user', message: { content: 'no title yet' } }))).toBeUndefined()
    expect(sessionTitle(JSON.stringify({ type: 'custom-title', customTitle: 'x'.repeat(80) }))?.length).toBe(60)
  })

  test('the Markdown export holds every value and the task name', () => {
    const md = markdown(snapshot(BASE, Date.UTC(2026, 9, 15, 12, 0)))
    expect(md.split('\n')[0]).toBe('## Fix the cart \\| totals, again')
    expect(md).toContain('| Cost | $3.10 · last turn $0.42 · ⌀ $0.52 / turn |')
    expect(md).toContain('| Agent time | 26m 0s · ⌀ 4m 20s / turn |')
    expect(md).toContain('| Tokens | 1.2M (input 5k, output 85k, cache read 1.1M, cache write 10k) |')
    expect(md).toContain('| Regressions | passing |')
    expect(md).toContain('| Check findings | – |')
  })

  test('the CSV keeps one row per task and replaces it on every turn', () => {
    const at = Date.UTC(2026, 9, 15, 12, 0)
    const first = upsertCsv('', snapshot(BASE, at))
    const lines = first.trim().split('\n')
    expect(lines.length).toBe(2)
    expect(lines[1]).toContain('"Fix the cart | totals, again"')
    const again = upsertCsv(first, snapshot({ ...BASE, spent: 4.2, turns: 7 }, at))
    expect(again.trim().split('\n').length).toBe(2)
    expect(again).toContain(',4.20,7,')
    const other = upsertCsv(again, snapshot({ ...BASE, session: 'ffff0000' }, at + 1))
    expect(other.trim().split('\n').length).toBe(3)
  })

  test('the desktop row is one SVG with real dividers, escaped and cut to fit, and no cost bars', () => {
    const svg = metricsSvg(
      [
        { key: 'callers', label: 'callers', value: '2 open', sub: 'a&b.py:1, a very long path/that/does/not/fit.py:9', tone: 'warning' },
        { key: 'spent', label: 'spent', value: '$1.20', sub: '', tone: 'muted' },
      ],
      300,
    )
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/<line /g)?.length).toBe(2)
    expect(svg).toContain('a&amp;b.py')
    expect(svg).toContain('…')
    expect(svg).toContain('class="v warning"')
    expect(svg).toContain('class="v muted"')
    expect(svg).not.toContain('<rect ')
  })

  test('finds top-level definitions per language', () => {
    expect(defsIn('a.py', 'def to_cents(x):\n    pass\nclass Cart:\n    def total(self): pass')).toEqual(['to_cents', 'Cart'])
    expect(defsIn('a.ts', 'export function formatMoney() {}\nfunction local() {}\nconst x = 1')).toEqual(['formatMoney', 'local'])
    expect(defsIn('README.md', 'def nope():')).toEqual([])
  })

  test('counts calls of existing helpers, never new ones, test files or generic names', () => {
    const known = parseDefs('utils/money.py:4:def to_cents(v):\nutils/io.py:1:def load(p):\ntests/test_x.py:1:def helper():')
    expect([...known.keys()]).toEqual(['to_cents', 'load'])
    const added = addedLines('x = 1', 'x = 1\ny = to_cents(p)\nz = load(f)\nw = parse_price(s)')
    expect(added).not.toContain('x = 1')
    expect(callsIn(added, known, ['parse_price'])).toEqual(['to_cents'])
  })

  test('only files under the project root count, with either slash', () => {
    expect(inProject('/repo/shop/cart.py', '/repo/shop')).toBe(true)
    expect(inProject('/repo/shop/cart.py', '/repo/shop/')).toBe(true)
    expect(inProject('/tmp/scratch/drive.py', '/repo/shop')).toBe(false)
    expect(inProject('/repo/shop-old/cart.py', '/repo/shop')).toBe(false)
    expect(inProject('C:\\Users\\a\\shop\\cart.py', 'C:/Users/a/shop')).toBe(true)
  })

  test('recognises test runs and their counts', () => {
    expect(isTestCommand('npm test')).toBe(true)
    expect(isTestCommand('cd api && python -m pytest -q')).toBe(true)
    expect(isTestCommand('npm install')).toBe(false)
    for (const cmd of ['sbt test', 'sbt --client test', 'sbt "testOnly klados.ViewSpec"', 'sbt clean test', 'scala-cli test .', 'mill core.test'])
      expect(isTestCommand(cmd)).toBe(true)
    expect(isTestCommand('sbt compile')).toBe(false)
    expect(testCounts('[error] Failed: Total 14, Failed 2, Errors 1, Passed 11')).toEqual({ passed: 11, failed: 3 })
    expect(testCounts('===== 14 passed, 1 failed in 0.31s =====')).toEqual({ passed: 14, failed: 1 })
    expect(testCounts('ℹ pass 141\nℹ fail 1')).toEqual({ passed: 141, failed: 1 })
    expect(testCounts('ok')).toEqual({ passed: undefined, failed: undefined })
  })

  test('failing test names come from each runner, with colors stripped', () => {
    expect(failingNames('not ok 3 - cart totals # time=1ms\n✖ rounds half up (2.1ms)\n  ● Cart › applies coupon\n')).toEqual(['cart totals', 'rounds half up', 'Cart › applies coupon'])
    expect(failingNames('FAILED tests/test_cart.py::test_tax - assert 1 == 2\n==> X klados.ViewSpec.renders lanes  0.01s\n')).toEqual(['tests/test_cart.py::test_tax', 'klados.ViewSpec.renders lanes'])
    expect(failingNames('\x1b[31m[info] - dismisses after 5s *** FAILED ***\x1b[0m')).toEqual(['dismisses after 5s'])
    // A compile error is an error exit with nothing counted: one failure.
    expect(runOf('[error] Compilation failed', true)).toEqual({ failed: 1, names: [] })
    expect(runOf('ℹ pass 14\nℹ fail 0', false)).toEqual({ failed: 0, names: [] })
  })

  test('failures already there before the first edit are never new (.algebra/band.algebra.md)', () => {
    const old = { failed: 1, names: ['csv: pandas one-liner'] }
    // merge-semilattice: idempotent and commutative on names.
    expect(mergeRun(old, old)).toEqual(old)
    expect(mergeRun(old, { failed: 1, names: ['b'] }).names.sort()).toEqual(mergeRun({ failed: 1, names: ['b'] }, old).names.sort())
    // baseline-never-new: the baseline run itself, or the same failures after an edit, read as passing.
    expect(suiteOf(withRun(NO_TESTS, old))).toEqual({ kind: 'passing' })
    const edited = { ...withRun(NO_TESTS, old), edited: true, stale: true }
    expect(suiteOf(edited)).toEqual({ kind: 'stale' })
    expect(suiteOf(withRun(edited, old))).toEqual({ kind: 'passing' })
    // frozen-after-edit: a run after the edit changes last, never the baseline.
    const broke = withRun(edited, { failed: 2, names: ['csv: pandas one-liner', 'cart totals'] })
    expect(broke.baseline).toEqual(old)
    expect(suiteOf(broke)).toEqual({ kind: 'new-failures', count: 1, names: ['cart totals'] })
    // Without names, only a higher count says something is new.
    const counted = withRun({ ...withRun(NO_TESTS, { failed: 2, names: [] }), edited: true }, { failed: 3, names: [] })
    expect(suiteOf(counted)).toEqual({ kind: 'new-failures', count: 1, names: [] })
    // No run before the first edit: failures may predate the session, so they are never called new.
    expect(suiteOf(withRun({ ...NO_TESTS, edited: true }, old))).toEqual({ kind: 'failing', count: 1 })
    expect(suiteOf(NO_TESTS)).toEqual({ kind: 'not-run' })
  })

  test('a finding that moves lines is the same finding, and fixed only grows', () => {
    expect(findingKey('src/A.scala:41 wartremover:Var var is disabled')).toBe('src/A.scala wartremover:Var var is disabled')
    const one = advanceFindings(NO_FINDINGS, ['src/A.scala:41 wartremover:Var var is disabled', 'src/A.scala:50 E198 unused'])
    expect(one).toEqual({ known: true, open: ['src/A.scala wartremover:Var var is disabled', 'src/A.scala E198 unused'], first: 'src/A.scala:41 wartremover:Var var is disabled', fixed: 0 })
    const moved = advanceFindings(one, ['src/A.scala:44 wartremover:Var var is disabled'])
    expect(moved.open.length).toBe(1)
    expect(moved.fixed).toBe(1)
    expect(advanceFindings(moved, []).fixed).toBe(2)
  })

  test('new domain types no IR names are drift; shortcuts and test files are recognised', () => {
    expect(typesIn('a.ts', 'export type Mode = "a" | "b"\nexport interface Cart {}\ntype Local = 1\nexport const x = 1')).toEqual(['Mode', 'Cart'])
    expect(typesIn('A.scala', 'enum Shape:\n  case Circle\nfinal case class Email(v: String)\nopaque type Id = String\nobject Parse')).toEqual(['Shape', 'Email', 'Id'])
    expect(irDrift(['Email', 'Shape', 'Id'], ['types:\n  - name: Email\n', 'Shape2'])).toEqual(['Shape', 'Id'])
    expect(shortcuts('// shortcut: regex, not a parser\nx\n// shortcut: no retry')).toBe(2)
    expect(['tests/cart.test.ts', 'src/test/scala/ViewSpec.scala', 'cart_test.go'].map(isTestFile)).toEqual([true, true, true])
    expect(isTestFile('src/main/scala/View.scala')).toBe(false)
    expect(defsIn('A.scala', 'object A:\n  def email(s: String) = s\n  private def hidden = 1\n    def local = 2')).toEqual(['email', 'hidden'])
  })

  test('shows the reuse share only once there is something to share, and a readable time', () => {
    expect(percent(5, 1)).toBe(83)
    expect(percent(0, 1)).toBeUndefined()
    expect(percent(0, 0)).toBeUndefined()
    expect(duration(45)).toBe('45m')
    expect(duration(210)).toBe('3h 30m')
  })
})

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

test('the band switches between compact and details on terminal and desktop', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'greybeard', surface, ...BAND })
    expect(await ui.find({ key: 'level' })).toBeDefined()
    expect(await ui.find({ key: 'board' })).toBeDefined()
    expect(await ui.find({ key: 'level-ultra' })).toBeUndefined()

    await ui.press({ key: 'details' })
    expect(await ui.find({ key: 'level-ultra' })).toBeDefined()
    expect(await ui.find({ key: 'board' })).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect(await ui.find({ type: 'Text', text: /spent/ })).toBeDefined()

    await ui.press({ key: 'details' })
    expect(await ui.find({ key: 'level' })).toBeDefined()
    await ui.unmount()
  }
})

test('the row takes bodyColumns only in the terminal, where a Button is as wide as its cells', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  for (const [surface, width] of [['terminal', 100], ['vscode', undefined]] as const) {
    const ui = await $.ui.mount({ plugin: 'greybeard', surface, ...BAND })
    expect((await ui.find({ type: 'Box' }))?.props.width).toBe(width)
    await ui.press({ key: 'details' })
    expect((await ui.find({ type: 'Box' }))?.props.width).toBe(width)
    await ui.unmount()
  }
})

test('the details view has its line without empty rows, and off the terminal its columns share the row', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  for (const surface of ['terminal', 'vscode'] as const) {
    const ui = await $.ui.mount({ plugin: 'greybeard', surface, ...BAND })
    await ui.press({ key: 'details' })
    expect(await ui.find({ type: 'Text', text: /─/ })).toBeDefined()
    expect((await ui.find({ type: 'Box' }))?.props.gap).toBe(0)
    // A fresh session has only the spend meter to show, so it takes the row.
    const spent = (await ui.find({ key: 'spent' }))?.props
    expect(surface === 'terminal' ? spent?.width : spent?.flexGrow).toBe(surface === 'terminal' ? 98 : 1)
    // The view is stored, so the next surface would start in details: switch back.
    await ui.press({ key: 'details' })
    await ui.unmount()
  }
  // The desktop keeps a gap above its SVG, whose top line would otherwise touch the buttons.
  const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'desktop', ...BAND })
  await ui.press({ key: 'details' })
  expect((await ui.find({ type: 'Box' }))?.props.gap).toBe(1)
  await ui.unmount()
})

test('after /greybeard band the band draws nothing', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('fs.read', ($, e, next) => (e.path === '/home/u/.claude/.greybeard-band' ? { value: 'off' } : next(e)))
  // What Claude Code draws without the band.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>prompt only</Text>
  })
  const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /prompt only/ })).toBeDefined()
  expect(await ui.find({ key: 'level' })).toBeUndefined()
  expect(await ui.find({ key: 'board' })).toBeUndefined()
  await ui.unmount()
})

for (const command of ['clear', 'resume', 'branch']) {
  test(`after /${command} the band shows the level again, with no session.start`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    let session = 's1'
    on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
    on('fs.read', ($, e, next) => (e.path === '/home/u/.claude/.greybeard-active' ? { value: 'full' } : next(e)))
    on('session.repo', () => ({ value: { root: '/repo/shop' } }) as never)
    on('session.id', () => ({ value: session }))
    // /clear, /resume and /branch go on under another session id; /help stays in this one.
    on('command.run', ($, e) => {
      if (e.command !== 'help') session = 's2'
      return { text: '' }
    })
    const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'terminal', ...BAND })
    await $.command.run({ command: 'help', args: '' })
    expect(await ui.find({ key: 'level', text: /full/ })).toBeUndefined()
    await $.command.run({ command, args: '' })
    expect(await ui.find({ key: 'level', text: /full/ })).toBeDefined()
    await ui.unmount()
  })
}

test("another plugin's command runs without the band's hook, so its output is not labelled greybeard", async ($, on) => {
  let reads = 0
  on('session.id', () => (reads++, { value: 's1' }))
  on('command.run', () => ({ text: '' }))
  await $.command.run({ command: 'anymodel', args: '' })
  expect(reads).toBe(0)
})

test('the ledger is written on Windows, where there is no mkdir', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const env: Record<string, string> = { OS: 'Windows_NT', XDG_CONFIG_HOME: 'C:/Users/u/.config' }
  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('session.repo', () => ({ value: { root: 'C:/repo/shop' } }) as never)
  on('session.id', () => ({ value: 's1' }))
  on('session.turns', () => ({ value: 1 }))
  on('session.usage', () => ({ value: { startedAt: 0, cost: { usd: 0.5 } } }) as never)
  on('process.run', ($, e) => (e.argv[0] === 'mkdir' ? { deny: 'mkdir: not found' } : ({ value: { exitCode: 1, stdout: '', stderr: '' } } as never)))
  on('fs.read', () => ({ deny: 'missing' }) as never)
  on('fs.list', () => ({ value: [] }))
  const written: string[] = []
  on('fs.write', ($, e) => {
    // The engine writes the path with this OS's separator.
    written.push(e.path.replace(/\\/g, '/'))
    return { value: undefined }
  })
  const status: unknown[] = []
  on('ui.status', ($, e) => {
    status.push(e)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: 'C:/repo/shop', surface: null } as never)
  await $.turn.complete({ answer: '', durationMs: 1000 } as never)
  expect(JSON.stringify(status)).not.toContain('could not write the task ledger')
  // Off Windows a C: path is relative, so the working dir comes in front of it: compare the end.
  expect(written.length).toBe(2)
  expect(written[0]?.endsWith('C:/Users/u/.config/greybeard/band/shop.csv')).toBe(true)
  expect(written[1]?.endsWith('C:/Users/u/.config/greybeard/band/board.html')).toBe(true)
})

test('the transcript is found with no classic hook, in its named folder or any other', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  let session = 's1'
  const projects = '/home/u/.claude/projects'
  let titles: Record<string, string> = { [`${projects}/-repo-shop-v2/s1.jsonl`]: 'Cart totals' }
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.repo', () => ({ value: { root: '/repo/shop' } }) as never)
  on('session.root', () => ({ value: '/repo/shop.v2' }))
  on('session.id', () => ({ value: session }))
  on('session.turns', () => ({ value: 1 }))
  on('session.usage', () => ({ value: { startedAt: 0, cost: { usd: 0.5 } } }) as never)
  const listed: string[] = []
  on('fs.list', ($, e) => {
    listed.push(e.path)
    return { value: e.path === projects ? [{ name: '-repo-shop-v2', kind: 'dir' }, { name: 'notes.txt', kind: 'file' }, { name: '-wt', kind: 'dir' }] : [] } as never
  })
  on('fs.exists', ($, e) => ({ value: e.path in titles }))
  on('process.run', ($, e) => {
    const title = e.argv[0] === 'grep' && e.argv[1] === '-F' ? titles[e.argv.at(-1) ?? ''] : undefined
    return { value: { exitCode: title ? 0 : 1, stdout: title ? `${JSON.stringify({ type: 'custom-title', customTitle: title })}\n` : '', stderr: '' } } as never
  })
  on('fs.read', () => ({ deny: 'missing' }) as never)
  const rows: string[] = []
  on('fs.write', ($, e) => {
    if (e.path.endsWith('shop.csv')) rows.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  // Only non-classic events fire, as when cc-plugin-sec-default skips every classic.* hook.
  await $.session.start({ cwd: '/repo/shop.v2', surface: null } as never)
  await $.turn.complete({ answer: '', durationMs: 1000 } as never)
  expect(rows.at(-1)).toContain('Cart totals')
  // The folder its rule names held the file, so no folder was listed.
  expect(listed).not.toContain(projects)
  // A worktree moves the file under the same id, and the session is renamed there.
  titles = { [`${projects}/-wt/s1.jsonl`]: 'Cart totals, split' }
  await $.turn.complete({ answer: '', durationMs: 1000 } as never)
  expect(rows.at(-1)).toContain('Cart totals, split')
  // /clear goes on under another id, in a folder the rule does not name (a hashed long name, say).
  session = 's2'
  titles = { ...titles, [`${projects}/-wt/s2.jsonl`]: 'Refunds' }
  await $.turn.complete({ answer: '', durationMs: 1000 } as never)
  expect(rows.at(-1)).toContain('Refunds')
})

test('without HOME (Windows) the band reads its flags under USERPROFILE', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\u' : undefined }))
  // The engine may hand the path on with either separator, and off Windows a C: path is relative,
  // so the working dir comes in front of it: compare the end.
  const reads: string[] = []
  on('fs.read', ($, e, next) => {
    reads.push(e.path.replaceAll('\\', '/'))
    return reads.at(-1)?.endsWith('C:/Users/u/.claude/.greybeard-band') ? { value: 'off' } : next(e)
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>prompt only</Text>
  })
  const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'terminal', ...BAND })
  expect(reads.some(path => path.endsWith('C:/Users/u/.claude/.greybeard-band'))).toBe(true)
  expect(await ui.find({ key: 'level' })).toBeUndefined()
  await ui.unmount()
})

test('another mod drawing above the prompt shows below the band, in compact and in details', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  // Another mod in the same slot, beneath greybeard in the chain.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'greybeard', surface, ...BAND })
    expect(await ui.find({ key: 'level' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /other band/ })).toBeDefined()

    await ui.press({ key: 'details' })
    expect(await ui.find({ key: 'level-ultra' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /other band/ })).toBeDefined()
    // back to compact for the next surface
    await ui.press({ key: 'details' })
    await ui.unmount()
  }
})

test('review and audit run the same commands a person types', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const sent: string[] = []
  on('command.run', ($, e) => {
    sent.push(`/${e.command} ${e.args}`.trim())
    return { text: '' }
  })
  const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'terminal', ...BAND })
  // The level pill opens the four levels instead of switching: no command, no turn.
  await ui.press({ key: 'level' })
  expect(await ui.find({ key: 'level-ultra' })).toBeDefined()
  expect(sent).toEqual([])
  await ui.press({ key: 'level-lite' })
  expect(sent).toEqual(['/greybeard:greybeard lite'])
  sent.length = 0
  await ui.press({ key: 'review' })
  await ui.press({ key: 'audit' })
  expect(sent).toEqual(['/greybeard:greybeard-review', '/greybeard:greybeard-audit'])
  await ui.unmount()
})

test('copy hands the task to the clipboard as Markdown', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const copied: string[] = []
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'terminal', ...BAND })
  await ui.press({ key: 'details' })
  expect(await ui.find({ key: 'task' })).toBeUndefined()
  await ui.press({ key: 'copy' })
  expect(copied.length).toBe(1)
  expect(copied[0]).toContain('## Untitled session')
  expect(copied[0]).toContain('| Turns | 0 |')
  await ui.unmount()
})

test('the band reports new failures against the runs before the first edit, in words with no glyphs', async ($, on) => {
  mock.clock(on)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  let output = 'ℹ pass 13\nℹ fail 1\n✖ csv: pandas one-liner (3ms)'
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: output, stderr: '', interrupted: false }, text: output, isError: true }) as never)
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'ok' }) as never)
  const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'terminal', ...BAND })

  // A failure before any edit is the baseline: nothing to report.
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  expect(await ui.find({ type: 'Text', text: /fail/ })).toBeUndefined()

  // A scratch script outside the project changes nothing (#1300).
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/scratch/drive.py', old_string: 'a = 1', new_string: 'def send():\n  pass', replace_all: false } as never)
  expect(await ui.find({ type: 'Text', text: /stale/ })).toBeUndefined()

  await $.tool.call({ tool: 'Edit', file_path: '/repo/cart.ts', old_string: 'a = 1', new_string: '// shortcut: no tax\na = 2', replace_all: false } as never)
  expect(await ui.find({ type: 'Text', text: /^tests stale$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\+1 debt/ })).toBeDefined()

  output = 'ℹ pass 12\nℹ fail 2\n✖ csv: pandas one-liner (3ms)\n✖ cart totals (1ms)'
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  expect(await ui.find({ type: 'Text', text: /^1 new failure$/ })).toBeDefined()

  output = 'ℹ pass 13\nℹ fail 1\n✖ csv: pandas one-liner (3ms)'
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  expect(await ui.find({ type: 'Text', text: /new failure/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /[✓✗⚠]/ })).toBeUndefined()
  await ui.unmount()
})

test('at turn end the band reads check findings for touched files and IR drift, starting no compiler', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.id', () => ({ value: 's1' }))
  on('session.turns', () => ({ value: 1 }))
  on('session.usage', () => ({ value: { startedAt: 0, cost: { usd: 0.5 } } }) as never)
  const ran: string[] = []
  on('process.run', ($, e) => {
    ran.push(e.argv.join(' '))
    const gitPath = e.argv.includes('--git-path')
    return { value: { exitCode: gitPath ? 0 : 1, stdout: gitPath ? '/repo/.git/greybeard/findings.json\n' : '', stderr: '' } } as never
  })
  const findings: Record<string, string[]> = { '/repo/src/A.scala': ['src/A.scala:41 wartremover:Var var is disabled'], '/repo/src/Other.scala': ['src/Other.scala:1 E198 unused'] }
  let ir = 'types:\n  - name: Lane\n'
  on('fs.read', ($, e) => {
    if (e.path === '/repo/.git/greybeard/findings.json') return { value: JSON.stringify(findings) }
    if (e.path === '/repo/.algebra/feed.algebra.md') return { value: ir }
    return { deny: 'missing' } as never
  })
  on('fs.list', ($, e) => ({ value: e.path === '/repo/.algebra' ? [{ name: 'feed.algebra.md', kind: 'file' }] : [] }) as never)
  on('fs.write', () => ({ value: undefined }))
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'ok' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ℹ pass 3\nℹ fail 0', stderr: '', interrupted: false }, text: 'ℹ pass 3\nℹ fail 0' }) as never)
  on('turn.complete', () => ({ text: '' }))
  const ui = await $.ui.mount({ plugin: 'greybeard', surface: 'terminal', ...BAND })

  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/A.scala', old_string: 'x', new_string: 'enum ToastLevel:\n  case Info\ncase class Lane(n: Int)', replace_all: false } as never)
  await $.turn.complete({ answer: '', durationMs: 1000 } as never)
  // Only the touched file's finding counts; Lane is in an IR, ToastLevel is not.
  expect(await ui.find({ type: 'Text', text: /^1 finding$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^IR drift$/ })).toBeDefined()
  await ui.press({ key: 'details' })
  expect(await ui.find({ type: 'Text', text: /wartremover:Var/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ToastLevel not in/ })).toBeDefined()
  await ui.press({ key: 'details' })
  expect(ran.some(c => /\b(tsc|sbt)\b|greybeard check/.test(c))).toBe(false)

  // The finding is fixed and the type gets its IR: the session reads clean once tests pass.
  findings['/repo/src/A.scala'] = []
  ir = 'Lane ToastLevel'
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await $.turn.complete({ answer: '', durationMs: 1000 } as never)
  expect(await ui.find({ type: 'Text', text: /^clean$/ })).toBeDefined()
  await ui.unmount()
})
