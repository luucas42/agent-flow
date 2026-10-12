import type { SessionRow, SessionState } from '../types'
import { firstLine, target } from './format'
import type { Notice } from './model'

/** A session idle for longer than this is quiet, not waiting. */
export const QUIET_MS = 2 * 60 * 60 * 1000
/** How much of a transcript's end is read; transcripts reach 90 MB. */
export const TAIL_BYTES = 262144

/** The fields of a registry file `~/.claude/sessions/<pid>.json` that the table uses. */
export type Registered = { pid: number; sessionId: string; cwd: string; name: string; status: string; statusUpdatedAt: number }
/** The last answer and the tool still open in a transcript's tail. */
export type Tail = { answer?: string; tool?: string }

const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** A registry file as a `Registered`; undefined when it is not JSON or lacks a pid, sessionId or cwd. */
export function parseRegistered(text: string): Registered | undefined {
  try {
    const raw: unknown = JSON.parse(text)
    if (typeof raw !== 'object' || raw === null) return undefined
    const r = raw as Record<string, unknown>
    if (typeof r.pid !== 'number' || typeof r.sessionId !== 'string' || typeof r.cwd !== 'string') return undefined
    return {
      pid: r.pid,
      sessionId: r.sessionId,
      cwd: r.cwd,
      name: typeof r.name === 'string' && r.name !== '' ? r.name : basename(r.cwd),
      status: typeof r.status === 'string' ? r.status : 'idle',
      statusUpdatedAt: num(r.statusUpdatedAt) ?? num(r.updatedAt) ?? num(r.startedAt) ?? 0,
    }
  } catch {
    return undefined
  }
}

/** Where Claude Code keeps the session's transcript. */
export const transcriptPath = (home: string, reg: Registered): string =>
  `${home}/.claude/projects/${reg.cwd.replace(/[^A-Za-z0-9]/g, '-')}/${reg.sessionId}.jsonl`

/** The last answer and the open tool of a transcript's tail; the first line may be cut and is dropped. */
export function parseTail(text: string): Tail {
  let answer: string | undefined
  const open = new Map<string, string>()
  for (const line of text.split('\n').slice(1)) {
    let entry: { type?: unknown; message?: { content?: unknown } }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const content = entry?.message?.content
    if (entry?.type === 'assistant' && Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') answer = firstLine(block.text) ?? answer
        else if (block?.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          const input = typeof block.input === 'object' && block.input !== null ? (block.input as Record<string, unknown>) : {}
          open.set(block.id, `${block.name} ${target(block.name, input) ?? ''}`.trim())
        }
      }
    } else if (entry?.type === 'user') {
      if (Array.isArray(content)) {
        for (const block of content) if (block?.type === 'tool_result') open.delete(block.tool_use_id)
      } else if (typeof content === 'string' && !content.startsWith('<')) {
        answer = undefined
        open.clear()
      }
    }
  }
  const tool = [...open.values()].pop()
  return { ...(answer === undefined ? {} : { answer }), ...(tool === undefined ? {} : { tool }) }
}

/** The pids of `ps -o pid=,comm=` lines whose command is `claude`. */
export function liveClaudePids(psOut: string): Set<number> {
  const pids = new Set<number>()
  for (const line of psOut.split('\n')) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line)
    if (match !== null && (match[2] ?? '').split('/').pop() === 'claude') pids.add(Number(match[1]))
  }
  return pids
}

/** The table state of a registry entry at `now`. */
export function stateOf(reg: Registered, now: number): SessionState {
  switch (reg.status) {
    case 'busy':
      return 'working'
    case 'idle':
      return now - reg.statusUpdatedAt <= QUIET_MS ? 'waiting' : 'quiet'
    case 'shell':
      return 'shell'
    default:
      return 'other'
  }
}

/** One table row; `what` is shown for working and waiting rows only. */
export function rowOf(reg: Registered, tail: Tail | undefined, thisId: string | undefined, now: number): SessionRow {
  const state = stateOf(reg, now)
  const what = state === 'working' ? (tail?.tool ?? tail?.answer) : state === 'waiting' ? tail?.answer : undefined
  return {
    id: reg.sessionId,
    pid: reg.pid,
    name: reg.name,
    project: basename(reg.cwd),
    state,
    status: reg.status,
    since: reg.statusUpdatedAt,
    ...(what === undefined ? {} : { what }),
    isThis: reg.sessionId === thisId,
  }
}

const RANK: Record<SessionState, number> = { waiting: 0, working: 1, shell: 2, other: 3, quiet: 4 }

/** Waiting first, then working, shell, other and quiet; newest change first within a state. */
export const sortRows = (rows: SessionRow[]): SessionRow[] => [...rows].sort((a, b) => RANK[a.state] - RANK[b.state] || b.since - a.since)

/** A notice for every other session that went from working to waiting between two polls. */
export function sessionNotices(before: SessionRow[], after: SessionRow[]): Notice[] {
  const was = new Map(before.map(row => [row.id, row.state]))
  return after
    .filter(row => row.state === 'waiting' && !row.isThis && was.get(row.id) === 'working')
    .map(row => ({ text: `● ${row.name} is waiting · ${row.project}`, sound: 'done' as const }))
}
