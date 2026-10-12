import type { Effort } from '../types'

export type Family = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other'

export const COLORS: Record<Family, string> = {
  opus: '#ECE8DC',
  sonnet: '#8FB3E0',
  haiku: '#C6F432',
  fable: '#F5A524',
  other: '#9AA0A6',
}
export const ERROR_COLOR = '#E5534B'
export const WHITE = '#FFFFFF'
export const WARN_COLOR = '#F5A524'

/** The word each family stands for in the legend, in legend order. */
export const ROLES: ReadonlyArray<readonly [Exclude<Family, 'other'>, string]> = [
  ['opus', 'plans'],
  ['sonnet', 'edits'],
  ['haiku', 'reads'],
  ['fable', 'advises'],
]

const FULL_ID = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(?=$|-\d{8}|\[)/
const ALIAS = /^([a-z]+)(?:\[[^\]]*\])?$/

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

/** `claude-haiku-5-5` → `Haiku 5.5`, `fable` → `Fable`; anything else as given. */
export function modelName(id: string | undefined): string {
  if (id === undefined || id === '') return 'Claude'
  const full = FULL_ID.exec(id)
  if (full !== null) {
    const [, name = '', major = '', minor] = full
    return `${cap(name)} ${minor === undefined ? major : `${major}.${minor}`}`
  }
  const alias = ALIAS.exec(id)
  return alias === null ? id : cap(alias[1] ?? id)
}

export function familyOf(id: string | undefined): Family {
  const name = (id ?? '').toLowerCase()
  for (const [family] of ROLES) {
    if (name.includes(family)) return family
  }
  return 'other'
}

const oneDecimal = (n: number) => n.toFixed(1).replace(/\.0$/, '')

/** `950`, `12.4k`, `356k`, `1.2M`. */
export function tokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 99_950) return `${oneDecimal(n / 1000)}k`
  if (n < 999_500) return `${Math.round(n / 1000)}k`
  return `${oneDecimal(n / 1_000_000)}M`
}

/** `12s`, `1m 12s`, `1h 05m`. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Minute-grained on purpose: a clock ticking each second then redraws once a minute. */
export function ago(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

export const usd = (n: number): string => `$${n.toFixed(2)}`

/** Minute-grained session age that grows its unit: `12m`, `1h 05m`, `4d 01h`. */
export function minutes(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d ${String(h % 24).padStart(2, '0')}h`
}

const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** `xhigh` → four of five cells filled; a numeric effort has no bar. */
export function effortBar(effort: Effort): { filled: string; empty: string; label: string } {
  if (typeof effort === 'number') return { filled: '', empty: '', label: String(effort) }
  const n = LEVELS.indexOf(effort) + 1
  return { filled: '■'.repeat(n), empty: '□'.repeat(5 - n), label: effort }
}

export type Verb = { verb: string; noun: string }

const VERBS: Record<string, Verb> = {
  Read: { verb: 'reading', noun: 'files' },
  Grep: { verb: 'searching', noun: 'queries' },
  Glob: { verb: 'searching', noun: 'queries' },
  Edit: { verb: 'editing', noun: 'files' },
  Write: { verb: 'editing', noun: 'files' },
  NotebookEdit: { verb: 'editing', noun: 'files' },
  Bash: { verb: 'running', noun: 'commands' },
  WebFetch: { verb: 'browsing', noun: 'pages' },
  WebSearch: { verb: 'browsing', noun: 'pages' },
}

/** What a tool call reads as on a card; an MCP tool by its own last name. */
export function verbOf(tool: string): Verb {
  return VERBS[tool] ?? { verb: (tool.split('__').at(-1) ?? tool).toLowerCase(), noun: 'calls' }
}

/** Cuts a text to `max` characters, ending in `…` when it was longer. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

const lastTwo = (path: string): string => path.split('/').filter(Boolean).slice(-2).join('/')
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)

/** What a tool call works on, as a list row shows it; undefined when the tool has no plain target. */
export function target(tool: string, input: Record<string, unknown>): string | undefined {
  const raw = (() => {
    switch (tool) {
      case 'Read':
      case 'Edit':
      case 'Write': {
        const path = text(input.file_path)
        return path === undefined ? undefined : lastTwo(path)
      }
      case 'NotebookEdit': {
        const path = text(input.notebook_path)
        return path === undefined ? undefined : lastTwo(path)
      }
      case 'Grep': {
        const pattern = text(input.pattern)
        return pattern === undefined ? undefined : `"${pattern}"`
      }
      case 'Glob':
        return text(input.pattern)
      case 'Bash':
        return text(input.command)?.split('\n')[0]
      case 'WebFetch':
        return text(input.url)?.replace(/^https?:\/\//, '')
      case 'WebSearch': {
        const query = text(input.query)
        return query === undefined ? undefined : `"${query}"`
      }
      default:
        return undefined
    }
  })()
  return raw === undefined || raw === '' ? undefined : clip(raw, 80)
}

/** The first line of an answer worth showing: markdown marks stripped, at most 100 characters. */
export function firstLine(answer: string): string | undefined {
  for (const line of answer.split('\n')) {
    const shown = line.replace(/^[#>*\-\s]+/, '').trim()
    if (shown !== '') return clip(shown, 100)
  }
  return undefined
}

/** `2026-10-08 14:40:28 UTC`. */
export function utc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')} UTC`
}

/** The request ids of the latest refused responses in a transcript's text: up to `max`, each once, oldest first. */
export function refusedRequestIds(jsonl: string, max = 3): string[] {
  const found: string[] = []
  const lines = jsonl.split('\n')
  for (let i = lines.length - 1; i >= 0 && found.length < max; i--) {
    const line = lines[i] ?? ''
    if (!line.includes('"refusal"')) continue
    try {
      const entry = JSON.parse(line) as { requestId?: unknown; message?: { stop_reason?: unknown } }
      const id = entry.requestId
      if (entry.message?.stop_reason === 'refusal' && typeof id === 'string' && !found.includes(id)) found.push(id)
    } catch {
      // A line cut at the tail's start, or not JSON at all.
    }
  }
  return found.reverse()
}

/** What a support ticket about one refusal needs. */
export type Ticket = {
  at: number
  model?: string
  category: string
  sessionId?: string
  agent?: { id: string; type: string; n: number }
  requestIds: string[]
}

export function ticketText(ticket: Ticket): string {
  return [
    'Claude Code safeguard refusal',
    `time: ${utc(ticket.at)}`,
    `model: ${ticket.model ?? 'unknown'}`,
    `category: ${ticket.category}`,
    ...(ticket.sessionId === undefined ? [] : [`session: ${ticket.sessionId}`]),
    ...(ticket.agent === undefined ? [] : [`agent: ${ticket.agent.id} (${ticket.agent.type} #${ticket.agent.n})`]),
    ...(ticket.requestIds.length === 0 ? [] : [`request ids: ${ticket.requestIds.join(', ')}`]),
  ].join('\n')
}

/** Where a subagent's own transcript lives, beside the session's. */
export const agentTranscript = (sessionPath: string, agentId: string): string =>
  `${sessionPath.replace(/\.jsonl$/, '')}/subagents/agent-${agentId}.jsonl`
