import type { Advisor, Card, CardStatus, Effort, Flow, Instance } from '../types'
import { ROLES, ago, clip, duration, familyOf, tokens, verbOf } from './format'
import type { Family } from './format'

/** Bumped when the shape of `flow` changes; a session holding an older one starts over. */
export const FLOW_VERSION = 2

export const EMPTY: Flow = {
  version: FLOW_VERSION,
  startedAt: 0,
  now: 0,
  main: { tokens: 0, turnActive: false },
  advisor: { calls: 0 },
  cards: {},
  instances: {},
}

/** How long the asks arrow glows after an advisor call. */
export const GLOW_MS = 6_000

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}
export type Spawn = { agentId: string; type: string; model?: string; parentAgentId?: string; description?: string }
export type Step = { agentId?: string; model: string; effort?: Effort; usage: Usage | null; advisorEnds: number[] }
export type Outcome = Exclude<CardStatus, 'running'>
export type Line = { glyph: string; text: string }

export function sumUsage(usage: Usage | null): number {
  if (usage === null) return 0
  return usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
}

/**
 * The session began, or the module reloaded: keep what is there, stamp the start once.
 * A flow of another version starts over, keeping only when the session began.
 */
export function started(flow: Flow, now: number, advisorName?: string): Flow {
  if (flow.version !== FLOW_VERSION) {
    return { ...reset(now, advisorName), startedAt: flow.startedAt > 0 ? flow.startedAt : now }
  }
  return {
    ...flow,
    startedAt: flow.startedAt === 0 ? now : flow.startedAt,
    now,
    advisor: { ...flow.advisor, name: advisorName ?? flow.advisor.name },
  }
}

export function reset(now: number, advisorName?: string): Flow {
  return { ...EMPTY, startedAt: now, now, advisor: { calls: 0, name: advisorName } }
}

export const turnStarted = (flow: Flow): Flow => ({ ...flow, main: { ...flow.main, turnActive: true } })

export const turnEnded = (flow: Flow): Flow => ({ ...flow, main: { ...flow.main, turnActive: false } })

/** A card coming back to life starts a fresh run: its clock and its counters. */
function revived(card: Card, now: number): Card {
  return { ...card, status: 'running', runStartedAt: now, verbCounts: {}, lastTool: undefined }
}

export function spawned(flow: Flow, spawn: Spawn, now: number): Flow {
  const prior = flow.cards[spawn.type]
  const parentType = spawn.parentAgentId === undefined ? undefined : flow.instances[spawn.parentAgentId]?.type
  const base: Card =
    prior === undefined
      ? {
          type: spawn.type,
          order: Object.keys(flow.cards).length,
          parentType,
          status: 'running',
          running: 0,
          spawned: 0,
          runStartedAt: now,
          verbCounts: {},
          tokens: 0,
          model: spawn.model,
        }
      : prior.running === 0
        ? revived(prior, now)
        : prior
  const card: Card = {
    ...base,
    model: base.model ?? spawn.model,
    parentType: base.parentType ?? parentType,
    running: base.running + 1,
    spawned: base.spawned + 1,
  }
  const instance: Instance = {
    type: spawn.type,
    status: 'running',
    n: card.spawned,
    description: clip(spawn.description ?? '', 80),
    startedAt: now,
    lastAt: now,
    tools: 0,
    tokens: 0,
  }

  return {
    ...flow,
    cards: { ...flow.cards, [spawn.type]: card },
    instances: { ...flow.instances, [spawn.agentId]: instance },
  }
}

/** A known agent's loop did something: one that had ended was resumed. */
function touched(flow: Flow, agentId: string, now: number): Flow {
  const instance = flow.instances[agentId]
  if (instance === undefined || instance.status === 'running') return flow
  const prior = flow.cards[instance.type]
  if (prior === undefined) return flow
  const base = prior.running === 0 ? revived(prior, now) : prior

  return {
    ...flow,
    cards: { ...flow.cards, [instance.type]: { ...base, running: base.running + 1 } },
    instances: { ...flow.instances, [agentId]: { ...instance, status: 'running', endedAt: undefined, lastAt: now } },
  }
}

export function toolUsed(flow: Flow, agentId: string, tool: string, now: number, target?: string): Flow {
  const woken = touched(flow, agentId, now)
  const instance = woken.instances[agentId]
  const card = instance === undefined ? undefined : woken.cards[instance.type]
  if (instance === undefined || card === undefined) return flow
  const { verb } = verbOf(tool)

  return {
    ...woken,
    cards: {
      ...woken.cards,
      [instance.type]: {
        ...card,
        lastTool: tool,
        verbCounts: { ...card.verbCounts, [verb]: (card.verbCounts[verb] ?? 0) + 1 },
      },
    },
    instances: {
      ...woken.instances,
      [agentId]: { ...instance, tools: instance.tools + 1, lastTool: tool, lastTarget: target, lastAt: now },
    },
  }
}

export function stepped(flow: Flow, step: Step, now: number): Flow {
  const added = sumUsage(step.usage)

  if (step.agentId === undefined) {
    const main = {
      ...flow.main,
      model: step.model,
      effort: step.effort ?? flow.main.effort,
      tokens: flow.main.tokens + added,
    }
    const asked = step.advisorEnds.length
    const advisor =
      asked === 0
        ? flow.advisor
        : { ...flow.advisor, calls: flow.advisor.calls + asked, lastEndedAt: Math.max(...step.advisorEnds) }
    return { ...flow, main, advisor }
  }

  const woken = touched(flow, step.agentId, now)
  const instance = woken.instances[step.agentId]
  const card = instance === undefined ? undefined : woken.cards[instance.type]
  if (instance === undefined || card === undefined) return flow

  return {
    ...woken,
    cards: {
      ...woken.cards,
      [instance.type]: {
        ...card,
        model: step.model,
        effort: step.effort ?? card.effort,
        tokens: card.tokens + added,
      },
    },
    instances: {
      ...woken.instances,
      [step.agentId]: { ...instance, tokens: instance.tokens + added, lastAt: now },
    },
  }
}

/** An agent ended. The card settles on how its last running instance ended. */
export function finished(flow: Flow, agentId: string, outcome: Outcome, now: number, answer?: string): Flow {
  const instance = flow.instances[agentId]
  const card = instance === undefined ? undefined : flow.cards[instance.type]
  if (instance === undefined || card === undefined || instance.status !== 'running') return flow
  const running = Math.max(0, card.running - 1)
  const settled: Card =
    running === 0
      ? { ...card, running, status: outcome, lastRunMs: now - card.runStartedAt }
      : { ...card, running }

  return {
    ...flow,
    cards: { ...flow.cards, [instance.type]: settled },
    instances: {
      ...flow.instances,
      [agentId]: { ...instance, status: outcome, endedAt: now, answer: answer ?? instance.answer },
    },
  }
}

export function costed(flow: Flow, usdTotal: number): Flow {
  const cents = Math.round(usdTotal * 100) / 100
  return flow.costUsd === cents ? flow : { ...flow, costUsd: cents }
}

export const isGlowing = (advisor: Advisor, now: number): boolean =>
  advisor.lastEndedAt !== undefined && now - advisor.lastEndedAt < GLOW_MS

/** A type's agents for its list: running first (latest activity on top), then the ended (latest end on top). */
export function instancesOf(flow: Flow, type: string): Instance[] {
  return Object.values(flow.instances)
    .filter(instance => instance.type === type)
    .sort((a, b) => {
      const isRunningA = a.status === 'running'
      const isRunningB = b.status === 'running'
      if (isRunningA !== isRunningB) return isRunningA ? -1 : 1
      return isRunningA ? b.lastAt - a.lastAt : (b.endedAt ?? 0) - (a.endedAt ?? 0)
    })
}

/**
 * Every on-screen text that moves with the clock alone; the ticker writes only when this changes.
 * An open list with a running agent shows seconds, so then every second counts.
 */
export function clockKey(flow: Flow, now: number, expanded: string | null = null): string {
  const elapsed = Math.floor((now - flow.startedAt) / 60_000)
  const asked = flow.advisor.lastEndedAt === undefined ? '' : ago(now - flow.advisor.lastEndedAt)
  const isTicking = expanded !== null && instancesOf(flow, expanded).some(instance => instance.status === 'running')
  return `${elapsed}|${isGlowing(flow.advisor, now)}|${asked}${isTicking ? `|${Math.floor(now / 1000)}` : ''}`
}

export const runningIds = (flow: Flow): string[] =>
  Object.entries(flow.instances)
    .filter(([, instance]) => instance.status === 'running')
    .map(([id]) => id)

export const totalRunning = (flow: Flow): number =>
  Object.values(flow.cards).reduce((sum, card) => sum + card.running, 0)

export const cardsInOrder = (flow: Flow): Card[] => Object.values(flow.cards).sort((a, b) => a.order - b.order)

export const isAdvisorShown = (flow: Flow): boolean => flow.advisor.name !== undefined || flow.advisor.calls > 0

export function mainState(flow: Flow): Line {
  const n = totalRunning(flow)
  if (n > 0) return { glyph: '●', text: `delegated · waiting on ${n}` }
  return flow.main.turnActive ? { glyph: '●', text: 'thinking' } : { glyph: '○', text: 'idle' }
}

export function cardState(card: Card): Line {
  switch (card.status) {
    case 'running': {
      if (card.lastTool === undefined) return { glyph: '●', text: 'starting' }
      const { verb, noun } = verbOf(card.lastTool)
      return { glyph: '●', text: `${verb} · ${card.verbCounts[verb] ?? 0} ${noun}` }
    }
    case 'done':
      return { glyph: '✓', text: `done · ${duration(card.lastRunMs ?? 0)}` }
    case 'failed':
      return { glyph: '✗', text: 'failed' }
    case 'stopped':
      return { glyph: '■', text: 'stopped' }
  }
}

/** A list row's glyph and its second line. */
export function instanceState(instance: Instance): { glyph: string; detail: string; isDim: boolean } {
  switch (instance.status) {
    case 'running': {
      if (instance.lastTool === undefined) return { glyph: '●', detail: 'starting', isDim: false }
      const aim = instance.lastTarget === undefined ? '' : ` ${instance.lastTarget}`
      return { glyph: '●', detail: `${instance.lastTool}${aim}`, isDim: false }
    }
    case 'done':
      return { glyph: '✓', detail: instance.answer ?? 'done', isDim: true }
    case 'failed':
      return { glyph: '✗', detail: 'failed', isDim: true }
    case 'stopped':
      return { glyph: '■', detail: 'stopped', isDim: true }
  }
}

/** `14 tools · 48k · 2m 10s`: a running agent's time runs to now. */
export const instanceFigures = (instance: Instance, now: number): string =>
  `${instance.tools} tools · ${tokens(instance.tokens)} · ${duration((instance.endedAt ?? now) - instance.startedAt)}`

const COUNTED: ReadonlyArray<readonly [string, CardStatus]> = [
  ['●', 'running'],
  ['✓', 'done'],
  ['✗', 'failed'],
  ['■', 'stopped'],
]

/** `● 9  ✓ 5  ✗ 1`: the non-zero counts of a list. */
export function sectionCounts(list: Instance[]): string {
  return COUNTED.map(([glyph, status]) => [glyph, list.filter(instance => instance.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([glyph, n]) => `${glyph} ${n}`)
    .join('  ')
}

/** `▸`, `▾ ×15`: which way the card's list goes, and how many it holds. */
export const toggleLabel = (card: Card, isOpen: boolean): string =>
  `${isOpen ? '▾' : '▸'}${card.spawned > 1 ? ` ×${card.spawned}` : ''}`

export function advisorState(flow: Flow): string {
  const at = flow.advisor.lastEndedAt
  return at === undefined ? '» waiting for opus' : `» last asked ${ago(flow.now - at)}`
}

/** The families on the panel, in legend order, each with its word. */
export function legend(flow: Flow): Array<{ family: Family; word: string }> {
  const present = new Set<Family>([
    familyOf(flow.main.model),
    ...Object.values(flow.cards).map(card => familyOf(card.model)),
  ])
  if (isAdvisorShown(flow)) present.add(familyOf(flow.advisor.name ?? 'fable'))
  return ROLES.filter(([family]) => present.has(family)).map(([family, word]) => ({ family, word }))
}

/** Is the agent whose transcript is on screen one of this card's? */
export const isViewed = (flow: Flow, card: Card, agentId: string | undefined): boolean =>
  agentId !== undefined && flow.instances[agentId]?.type === card.type
