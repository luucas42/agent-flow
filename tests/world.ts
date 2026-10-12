import type { On, TurnStepServerToolUse } from 'claude-code'
import { mock } from 'claude-code/testing'

import type { Flow, SessionRow } from '../types'

export const T0 = 1_000_000
export const FLOW = { plugin: 'agent-flow', key: 'flow' } as const

export const TYPED = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 314 },
} as const

/**
 * Records the plugin's writes of the flow while the kit still answers them.
 * The test's `$` has no `state` noun in this build, so `peek()` is how a test
 * reads what the panel would draw from.
 */
export function watchFlow(on: On) {
  let last: Flow | undefined
  on('state.set', (_, e, next) => {
    if (e.plugin === FLOW.plugin && e.key === FLOW.key) last = e.value as Flow
    if (e.plugin === FLOW.plugin && e.key === 'sessions') lastSessions = e.value as SessionRow[]
    return next(e)
  })
  return () => last
}

let lastSessions: SessionRow[] | undefined

/** The engine beneath the plugin: a clock, spawns that start as a1, a2, …, tools and turns that answer. */
export function world(on: On) {
  const clock = mock.clock(on, { now: T0 })
  lastSessions = undefined
  const peek = watchFlow(on)
  const upcoming = { serverToolUses: [] as TurnStepServerToolUse[], tokens: 1000 }
  let count = 0

  on('agent.spawn', (_, e) => ({ model: e.model ?? 'claude-haiku-5-5', agentId: `a${++count}` }))
  on('tool.call', () => ({ result: 'ok' as never }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      serverToolUses: upcoming.serverToolUses,
      stopReason: 'end_turn' as const,
      usage: {
        input_tokens: upcoming.tokens,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        model: e.model,
      },
    }
  })

  return { clock, upcoming, peek, peekSessions: () => lastSessions }
}

/**
 * A tool call made from inside a subagent's loop. `$.tool.call` takes `agentId`
 * at run time (the engine runs it in the session's loop) but its typing leaves
 * it out; passing the input as a built value, not a fresh literal, is how the
 * test tells the plugin whose loop it came from.
 */
export const inLoop = <T extends object>(input: T, agentId: string) => ({ ...input, agentId })

/** Reads a streaming call to its end and resolves its result. */
export async function drain<R>(stream: AsyncGenerator<unknown, R> & { readonly result: Promise<R> }): Promise<R> {
  for await (const _ of stream) {
    // A response with no chunks: nothing to read on the way.
  }
  return stream.result
}

/** An Agent call as the engine raises it. */
export const spawnOf = (subagentType: string, extra: { parentAgentId?: string; model?: string; description?: string } = {}) => ({
  tool_use_id: `tu-${subagentType}`,
  prompt: 'look around',
  description: 'look',
  subagentType,
  provider: { plugin: 'engine', tier: 'core' } as const,
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...extra,
})

/** The pane as a surface draws it. */
export const paneAt = (bodyColumns: number, placement: 'dock' | 'inline' = 'dock', agentId?: string) => ({
  plugin: 'agent-flow',
  component: 'Pane' as const,
  requestId: 'agent-flow',
  props: {
    title: 'agent flow',
    isFocused: false,
    bodyColumns,
    placement,
    scroll: { offset: 0, bodyRows: 60 },
    view: agentId === undefined ? {} : { agentId },
  },
})
