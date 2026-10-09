import { atom, read, update } from 'claude-code'
import type { AgentStatus, EngineInterface, PaneOpenArgs, Register } from 'claude-code'

import type { Flow } from '../types'
import { firstLine, target } from './format'
import {
  EMPTY,
  clockKey,
  costed,
  finished,
  reset,
  runningIds,
  spawned,
  started,
  stepped,
  toolUsed,
  turnEnded,
  turnStarted,
} from './model'
import type { Outcome } from './model'
import { view } from './view'

const COMMAND = 'flow'
const PANE = 'agent-flow'
const OPEN: PaneOpenArgs = { id: PANE, title: 'agent flow', columns: 104 }
const USAGE = 'Usage: /flow [show | hide | reset]'
const TICK_MS = 1_000
const SYNC_EVERY = 5

const flow = atom({ plugin: 'agent-flow', key: 'flow' } as const, EMPTY)
const expanded = atom({ plugin: 'agent-flow', key: 'expanded' } as const, null)

const ENDED: Partial<Record<AgentStatus, Outcome>> = { completed: 'done', failed: 'failed', killed: 'stopped' }

/**
 * Applies a change stamped with the time. The panel is a bonus: a failure here
 * is swallowed, never thrown into the tool call, spawn or turn that raised it.
 */
async function apply($: EngineInterface, change: (f: Flow, now: number) => Flow): Promise<void> {
  try {
    const now = await $.clock.now()
    await update($, flow, f => ({ ...change(f, now), now }))
  } catch {
    // Drawing must never cost the session a tool call, a spawn or a turn.
  }
}

async function advisorName($: EngineInterface): Promise<string | undefined> {
  try {
    const value = (await $.settings.read()).advisorModel
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}

/** Clears the panel: a fresh flow and no list open. */
async function resetAll($: EngineInterface): Promise<void> {
  const name = await advisorName($)
  await apply($, (_, now) => reset(now, name))
  try {
    await update($, expanded, () => null)
  } catch {
    // A list left open on a fresh panel only draws its empty frame.
  }
}

/** The ticker's own state; a reload starts it over. */
type Ticking = { beats: number; isBusy: boolean }

async function tick($: EngineInterface, ticking: Ticking): Promise<void> {
  if (ticking.isBusy) return
  ticking.isBusy = true
  try {
    const now = await $.clock.now()
    const current = await read($, flow)
    const open = await read($, expanded)
    if (clockKey(current, current.now, open) !== clockKey(current, now, open)) {
      await update($, flow, f => ({ ...f, now }))
    }
    ticking.beats += 1
    if (ticking.beats % SYNC_EVERY === 0) await sync($)
  } catch {
    // Try again on the next beat.
  } finally {
    ticking.isBusy = false
  }
}

/** Every few seconds: the session's cost, and agents that ended without a turn.complete. */
async function sync($: EngineInterface): Promise<void> {
  const { cost } = await $.session.usage()
  if (cost !== undefined) {
    const current = await read($, flow)
    if (costed(current, cost.usd) !== current) await apply($, f => costed(f, cost.usd))
  }

  const running = new Set(runningIds(await read($, flow)))
  if (running.size === 0) return
  for (const agent of await $.agent.list()) {
    const outcome = ENDED[agent.status]
    if (outcome !== undefined && running.has(agent.id)) {
      await apply($, (f, now) => finished(f, agent.id, outcome, now))
    }
  }
}

export const register: Register = on => {
  const ticking: Ticking = { beats: 0, isBusy: false }
  let ticker: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Show, hide or reset the agent flow panel',
        argumentHint: '[show|hide|reset]',
        immediate: true,
      })
      const name = await advisorName($)
      await apply($, (f, now) => started(f, now, name))
      ticker?.cancel()
      ticker = $.clock.every(TICK_MS, () => void tick($, ticking))
      void $.ui.open(OPEN)
    } catch {
      // The panel is a bonus: never hold the session up.
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await apply($, turnStarted)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    const advisorEnds =
      e.agentId === undefined
        ? (response.serverToolUses ?? []).filter(use => use.name === 'advisor').map(use => use.endedAt ?? use.startedAt)
        : []
    await apply($, (f, now) =>
      stepped(f, { agentId: e.agentId, model: e.model, effort: e.effort, usage: response.usage, advisorEnds }, now),
    )
    return response
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    if (result.deny === undefined && id !== undefined) {
      await apply($, (f, now) =>
        spawned(
          f,
          { agentId: id, type: e.subagentType, model: result.model, parentAgentId: e.parentAgentId, description: e.description },
          now,
        ),
      )
    }
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const tool = String(e.tool)
      const aim = target(tool, e as unknown as Record<string, unknown>)
      await apply($, (f, now) => toolUsed(f, agentId, tool, now, aim))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    const outcome: Outcome = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
    const answer = agentId === undefined ? undefined : firstLine(e.answer)
    await apply($, (f, now) => (agentId === undefined ? turnEnded(f) : finished(f, agentId, outcome, now, answer)))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await resetAll($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'reset') {
      await resetAll($)
      await $.ui.open(OPEN)
      return { text: 'Agent flow reset.' }
    }

    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    const wantsOpen = arg === 'show' ? true : arg === 'hide' ? false : arg === '' ? !isOpen : undefined
    if (wantsOpen === undefined) return { text: USAGE }
    if (wantsOpen) {
      await $.ui.open(OPEN)
      return { text: 'Agent flow shown.' }
    }
    await $.ui.close({ id: PANE })
    return { text: 'Agent flow hidden.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, flow)
    const open = await read($, expanded)
    return view({ Box, Text, Button }, current, {
      bodyColumns: e.props.bodyColumns,
      placement: e.props.placement,
      viewAgentId: e.props.view.agentId,
      expanded: open,
      onToggle: type => void update($, expanded, was => (was === type ? null : type)),
    })
  })
}
