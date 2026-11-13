// The repo's beads as the band shows them: the bead in progress, what comes next, and its epic's progress
// (.algebra/band.algebra.md, BeadProgress). Pure: the band runs bd and hands its JSON here.

import type { Bead, Beads } from './types'

type Issue = { id: string; title: string; status: string; updated: string; parent: string | undefined }

export const NO_BEADS: Beads = { kind: 'none' }

const str = (v: unknown) => (typeof v === 'string' ? v : '')
// The parent id goes back to bd as an argument: a leading '-' from a tampered .beads would read as an option.
const BEAD_ID = /^[A-Za-z0-9][\w.-]*$/

// bd's --json: an array of issues (bd show too). Anything else is no answer.
export function issuesOf(json: string | undefined): Issue[] | undefined {
  try {
    const all: unknown = JSON.parse(json ?? '')
    if (!Array.isArray(all)) return undefined
    return all.flatMap(x => {
      if (typeof x !== 'object' || x === null) return []
      const i = x as Record<string, unknown>
      const deps = Array.isArray(i.dependencies) ? (i.dependencies as Record<string, unknown>[]) : []
      const parent = deps.find(d => d?.type === 'parent-child')?.depends_on_id
      return str(i.id) === '' ? [] : [{ id: str(i.id), title: str(i.title), status: str(i.status), updated: str(i.updated_at), parent: typeof parent === 'string' && BEAD_ID.test(parent) ? parent : undefined }]
    })
  } catch {
    return undefined
  }
}

// The in-progress bead updated last: the one the agent is on.
export const currentOf = (inProgress: Issue[]) => [...inProgress].sort((a, b) => b.updated.localeCompare(a.updated))[0]

// The epic to ask bd about, from `bd list --status in_progress --json`.
export const epicOf = (inProgressJson: string | undefined) => currentOf(issuesOf(inProgressJson) ?? [])?.parent

const bead = (i: Issue | undefined): Bead | undefined => (i === undefined ? undefined : { id: i.id, title: i.title })

export function beadsFrom(inProgressJson: string | undefined, readyJson: string | undefined, epicJson: string | undefined, childrenJson: string | undefined): Beads {
  const inProgress = issuesOf(inProgressJson)
  if (inProgress === undefined) return NO_BEADS
  const current = currentOf(inProgress)
  const epic = issuesOf(epicJson)?.[0]
  const children = issuesOf(childrenJson) ?? []
  return {
    kind: 'tracked',
    current: bead(current),
    others: Math.max(0, inProgress.length - 1),
    next: bead(issuesOf(readyJson)?.find(i => i.id !== current?.id)),
    epic: epic === undefined ? undefined : { id: epic.id, title: epic.title, done: children.filter(c => c.status === 'closed').length, total: children.length },
  }
}

// "glp1-campaign-9opf.1" -> "9opf.1": the prefix is the same for every bead of the repo.
export const shortId = (id: string) => id.replace(/^.*-/, '')

const fit = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s)

// One line: "3/7 · 9opf.1 Fleet cost… +2 · next ydny.2". Long adds the titles of the epic and the next bead.
export function beadLine(b: Beads, long: boolean): string {
  if (b.kind === 'none') return ''
  const epic = b.epic === undefined ? [] : [long ? `epic ${shortId(b.epic.id)} ${fit(b.epic.title, 40)} ${b.epic.done}/${b.epic.total}` : `${b.epic.done}/${b.epic.total}`]
  const now = b.current === undefined ? ['nothing in progress'] : [`${long ? 'now ' : ''}${shortId(b.current.id)} ${fit(b.current.title, long ? 48 : 32)}${b.others > 0 ? ` +${b.others}` : ''}`]
  const next = b.next === undefined ? [] : [`next ${shortId(b.next.id)}${long ? ` ${fit(b.next.title, 40)}` : ''}`]
  return [...epic, ...now, ...next].join(' · ')
}

// What the Beads button asks: the model reads bd itself, so the answer is never older than the press.
export function explainPrompt(b: Beads): string {
  if (b.kind === 'none') return ''
  const scope = b.epic !== undefined ? `the epic ${b.epic.id} (run \`bd show ${b.epic.id}\` and \`bd list --parent ${b.epic.id} --all\`)` : 'the beads in progress and the ready ones (run `bd list --status in_progress` and `bd ready`)'
  const current = b.current === undefined ? '' : ` The bead in progress is ${b.current.id}.`
  return `Explain ${scope} in plain words: one sentence on what the epic is for, then one line per bead saying what it means and whether it is done, in progress, blocked or next.${current} Keep it short and change nothing.`
}
