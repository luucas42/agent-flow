import { describe, expect, test } from 'claude-code/testing'

import type { Flow } from '../types'
import {
  EMPTY,
  FLOW_VERSION,
  GLOW_MS,
  advisorState,
  cardState,
  clockKey,
  costed,
  finished,
  instanceFigures,
  instanceState,
  instancesOf,
  legend,
  mainState,
  reset,
  sectionCounts,
  spawned,
  started,
  stepped,
  toggleLabel,
  toolUsed,
  turnEnded,
  turnStarted,
} from '../hooks/model'

const T0 = 1_000_000
const begin = (): Flow => started(EMPTY, T0, 'fable')
const usage = (n: number) => ({
  input_tokens: n,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
})

describe('one agent', () => {
  test('spawn, tools, steps and completion move one card', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'explorer', model: 'claude-haiku-5-5' }, T0)
    f = toolUsed(f, 'a1', 'Read', T0 + 1)
    f = toolUsed(f, 'a1', 'Read', T0 + 2)
    f = toolUsed(f, 'a1', 'Grep', T0 + 3)
    f = stepped(f, { agentId: 'a1', model: 'claude-haiku-5-5', effort: 'xhigh', usage: usage(1200), advisorEnds: [] }, T0 + 4)

    const card = f.cards.explorer!
    expect(card.status).toBe('running')
    expect(cardState(card)).toEqual({ glyph: '●', text: 'searching · 1 queries' })
    expect(card.verbCounts).toEqual({ reading: 2, searching: 1 })
    expect(card.tokens).toBe(1200)
    expect(card.effort).toBe('xhigh')
    expect(mainState(f)).toEqual({ glyph: '●', text: 'delegated · waiting on 1' })

    f = finished(f, 'a1', 'done', T0 + 72_000)
    expect(f.cards.explorer!.status).toBe('done')
    expect(cardState(f.cards.explorer!)).toEqual({ glyph: '✓', text: 'done · 1m 12s' })
    expect(mainState(f)).toEqual({ glyph: '○', text: 'idle' })
  })

  test('an alias from the spawn gives way to the model the step names', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'explorer', model: 'haiku' }, T0)
    expect(f.cards.explorer!.model).toBe('haiku')
    f = stepped(f, { agentId: 'a1', model: 'claude-haiku-5-5', usage: null, advisorEnds: [] }, T0)
    expect(f.cards.explorer!.model).toBe('claude-haiku-5-5')
  })
})

describe('several agents', () => {
  test('two of a type share a card and count ×2', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'explorer' }, T0)
    f = spawned(f, { agentId: 'a2', type: 'explorer' }, T0 + 1)
    expect(f.cards.explorer!.running).toBe(2)

    f = finished(f, 'a1', 'done', T0 + 10)
    expect(f.cards.explorer!.status).toBe('running')
    expect(f.cards.explorer!.running).toBe(1)

    f = finished(f, 'a2', 'done', T0 + 20)
    expect(f.cards.explorer!.status).toBe('done')
    expect(f.cards.explorer!.lastRunMs).toBe(20)
    expect(toggleLabel(f.cards.explorer!, false)).toBe('▸ ×2')
  })

  test('a finished card comes back with fresh counters', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    f = toolUsed(f, 'a1', 'Edit', T0 + 1)
    f = finished(f, 'a1', 'done', T0 + 2)
    f = spawned(f, { agentId: 'a2', type: 'worker' }, T0 + 10)

    expect(f.cards.worker!.verbCounts).toEqual({})
    expect(f.cards.worker!.runStartedAt).toBe(T0 + 10)
    expect(f.cards.worker!.order).toBe(0)
    expect(cardState(f.cards.worker!)).toEqual({ glyph: '●', text: 'starting' })
  })

  test('new types are ordered by first spawn and nested spawns name their parent', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    f = spawned(f, { agentId: 'a2', type: 'explorer', parentAgentId: 'a1' }, T0 + 1)
    expect(f.cards.explorer!.order).toBe(1)
    expect(f.cards.explorer!.parentType).toBe('worker')
  })
})

describe('edge cases', () => {
  test('a second completion of one agent changes nothing', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'explorer' }, T0)
    f = spawned(f, { agentId: 'a2', type: 'explorer' }, T0)
    f = finished(f, 'a1', 'done', T0 + 5)
    const again = finished(f, 'a1', 'done', T0 + 6)
    expect(again).toBe(f)
    expect(again.cards.explorer!.running).toBe(1)
  })

  test('events of loops nobody spawned are ignored', () => {
    const f = begin()
    expect(toolUsed(f, 'ghost', 'Read', T0)).toBe(f)
    expect(stepped(f, { agentId: 'ghost', model: 'x', usage: usage(5), advisorEnds: [] }, T0)).toBe(f)
    expect(finished(f, 'ghost', 'done', T0)).toBe(f)
  })

  test('a resumed agent wakes its card', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    f = finished(f, 'a1', 'done', T0 + 5)
    f = toolUsed(f, 'a1', 'Bash', T0 + 100)
    expect(f.cards.worker!.status).toBe('running')
    expect(f.cards.worker!.running).toBe(1)
    expect(cardState(f.cards.worker!)).toEqual({ glyph: '●', text: 'running · 1 commands' })
  })

  test('the last instance decides how a card ends', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    f = finished(f, 'a1', 'failed', T0 + 5)
    expect(cardState(f.cards.worker!)).toEqual({ glyph: '✗', text: 'failed' })
    f = spawned(f, { agentId: 'a2', type: 'worker' }, T0 + 6)
    f = finished(f, 'a2', 'stopped', T0 + 7)
    expect(cardState(f.cards.worker!)).toEqual({ glyph: '■', text: 'stopped' })
  })
})

describe('the main loop and the advisor', () => {
  test('main turn, tokens and advisor calls', () => {
    let f = turnStarted(begin())
    expect(mainState(f)).toEqual({ glyph: '●', text: 'thinking' })

    f = stepped(f, { model: 'claude-opus-5-5', effort: 'xhigh', usage: usage(10_000), advisorEnds: [T0 + 50] }, T0 + 60)
    expect(f.main.model).toBe('claude-opus-5-5')
    expect(f.main.tokens).toBe(10_000)
    expect(f.advisor).toEqual({ name: 'fable', calls: 1, lastEndedAt: T0 + 50 })
    expect(advisorState({ ...f, now: T0 + 150_000 })).toBe('» last asked 2m ago')

    f = turnEnded(f)
    expect(mainState(f)).toEqual({ glyph: '○', text: 'idle' })
  })

  test('the clock key changes when the glow ends and each minute', () => {
    const f = stepped(begin(), { model: 'm', usage: null, advisorEnds: [T0] }, T0)
    expect(clockKey(f, T0 + 1000)).toBe(clockKey(f, T0 + 2000))
    expect(clockKey(f, T0 + 1000)).not.toBe(clockKey(f, T0 + GLOW_MS + 1))
    expect(clockKey(f, T0 + GLOW_MS + 1)).not.toBe(clockKey(f, T0 + 61_000))
  })

  test('cost rounds to cents and reset starts over', () => {
    const f = costed(begin(), 3.4249)
    expect(f.costUsd).toBe(3.42)
    expect(costed(f, 3.4201)).toBe(f)
    expect(reset(T0 + 5, 'fable')).toEqual({
      ...EMPTY,
      startedAt: T0 + 5,
      now: T0 + 5,
      advisor: { calls: 0, name: 'fable' },
    })
  })

  test('the legend lists the families on the panel', () => {
    let f = stepped(begin(), { model: 'claude-opus-5-5', usage: null, advisorEnds: [] }, T0)
    f = spawned(f, { agentId: 'a1', type: 'explorer', model: 'claude-haiku-5-5' }, T0)
    expect(legend(f)).toEqual([
      { family: 'opus', word: 'plans' },
      { family: 'haiku', word: 'reads' },
      { family: 'fable', word: 'advises' },
    ])
  })
})

describe('agents of a type', () => {
  test('each spawn keeps its own number, task, tools, tokens and answer', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker', description: 'refactor auth module' }, T0)
    f = spawned(f, { agentId: 'a2', type: 'worker', description: 'add login tests' }, T0 + 1)
    f = toolUsed(f, 'a1', 'Edit', T0 + 2, 'auth/session.ts')
    f = stepped(f, { agentId: 'a1', model: 'claude-sonnet-5-5', usage: usage(4000), advisorEnds: [] }, T0 + 3)
    f = finished(f, 'a2', 'done', T0 + 21_000, 'README updated')

    expect(f.instances.a1).toMatchObject({
      n: 1,
      description: 'refactor auth module',
      tools: 1,
      tokens: 4000,
      lastTool: 'Edit',
      lastTarget: 'auth/session.ts',
      lastAt: T0 + 3,
      status: 'running',
    })
    expect(f.instances.a2).toMatchObject({ n: 2, status: 'done', endedAt: T0 + 21_000, answer: 'README updated' })
    expect(instanceState(f.instances.a1!)).toEqual({ glyph: '●', detail: 'Edit auth/session.ts', isDim: false })
    expect(instanceState(f.instances.a2!)).toEqual({ glyph: '✓', detail: 'README updated', isDim: true })
    expect(instanceFigures(f.instances.a1!, T0 + 130_000)).toBe('1 tools · 4k · 2m 10s')
    expect(instanceFigures(f.instances.a2!, T0 + 999_999)).toBe('0 tools · 0 · 21s')
  })

  test('the list shows running agents first, latest activity on top, then the latest ended', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    f = spawned(f, { agentId: 'a2', type: 'worker' }, T0)
    f = spawned(f, { agentId: 'a3', type: 'worker' }, T0)
    f = spawned(f, { agentId: 'a4', type: 'worker' }, T0)
    f = spawned(f, { agentId: 'x1', type: 'explorer' }, T0)
    f = toolUsed(f, 'a1', 'Read', T0 + 10)
    f = toolUsed(f, 'a2', 'Read', T0 + 20)
    f = finished(f, 'a3', 'done', T0 + 30)
    f = finished(f, 'a4', 'failed', T0 + 40)

    expect(instancesOf(f, 'worker').map(i => i.n)).toEqual([2, 1, 4, 3])
    expect(sectionCounts(instancesOf(f, 'worker'))).toBe('● 2  ✓ 1  ✗ 1')
    expect(instanceState(f.instances.a4!)).toEqual({ glyph: '✗', detail: 'failed', isDim: true })
  })

  test('a resumed agent clears its end', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    f = finished(f, 'a1', 'done', T0 + 5, 'first pass')
    f = toolUsed(f, 'a1', 'Bash', T0 + 50, 'npm test')
    expect(f.instances.a1).toMatchObject({ status: 'running', lastAt: T0 + 50, tools: 1 })
    expect(f.instances.a1!.endedAt).toBeUndefined()
    expect(instanceState(f.instances.a1!).detail).toBe('Bash npm test')
  })

  test('an agent with no tool yet is starting', () => {
    const f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    expect(instanceState(f.instances.a1!)).toEqual({ glyph: '●', detail: 'starting', isDim: false })
  })

  test('the toggle label shows the direction and the count', () => {
    let f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    expect(toggleLabel(f.cards.worker!, false)).toBe('▸')
    f = spawned(f, { agentId: 'a2', type: 'worker' }, T0)
    expect(toggleLabel(f.cards.worker!, true)).toBe('▾ ×2')
  })

  test('an open list with a running agent ticks every second', () => {
    const f = spawned(begin(), { agentId: 'a1', type: 'worker' }, T0)
    expect(clockKey(f, T0 + 1000)).toBe(clockKey(f, T0 + 2000))
    expect(clockKey(f, T0 + 1000, 'worker')).not.toBe(clockKey(f, T0 + 2000, 'worker'))
    expect(clockKey(f, T0 + 1000, 'explorer')).toBe(clockKey(f, T0 + 2000, 'explorer'))
  })

  test('a flow from an older version starts over but keeps its start', () => {
    const old = { ...spawned(begin(), { agentId: 'a1', type: 'worker' }, T0), version: 1 }
    const f = started(old, T0 + 5_000, 'fable')
    expect(f.version).toBe(FLOW_VERSION)
    expect(f.cards).toEqual({})
    expect(f.instances).toEqual({})
    expect(f.startedAt).toBe(T0)
    expect(f.advisor).toEqual({ calls: 0, name: 'fable' })
  })
})
