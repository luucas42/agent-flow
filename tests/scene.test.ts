import { describe, expect, test } from 'claude-code/testing'

import { EMPTY, finished, mainRefused, spawned, stepped, turnStarted } from '../hooks/model'
import { MAX_ROWS, scene, toneOf } from '../hooks/scene'
import type { Flow } from '../types'

const T = 1_000_000
const FRAME = { columnsHint: 104, isCompact: false }
const base: Flow = { ...EMPTY, startedAt: T, now: T }
const usage = (n: number) => ({ input_tokens: n, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })

function fiveExplorers(): Flow {
  let f = base
  for (let i = 1; i <= 5; i++) f = spawned(f, { agentId: `a${i}`, type: 'explorer', model: 'claude-haiku-5-5', description: `task ${i}` }, T)
  for (const id of ['a1', 'a2', 'a3']) f = finished(f, id, 'done', T + 1000, 'found it')
  return { ...f, now: T + 2000 }
}

describe('scene', () => {
  test('tones follow the status', () => {
    expect(toneOf('running')).toBe('live')
    expect(toneOf('done')).toBe('done')
    expect(toneOf('refused')).toBe('refused')
  })

  test('a batch of five with three done', () => {
    const s = scene(fiveExplorers(), null, undefined, FRAME)
    expect(s.cards).toHaveLength(1)
    expect(s.cards[0]).toMatchObject({ type: 'explorer', index: 0, model: 'Haiku 5.5', role: 'EXPLORER', tone: 'live', spawned: 5, done: 3, isOpen: false })
    expect(s.header).toMatchObject({ live: 2, total: 5, age: '0m' })
    expect(s.isAnimated).toBe(true)
    expect(s.open).toBeUndefined()
  })

  test('the open list: running first, then done, with figures', () => {
    const s = scene(fiveExplorers(), 'explorer', undefined, FRAME)
    expect(s.open?.title).toBe('EXPLORER · 5 agents')
    expect(s.open?.rows.map(r => r.tone)).toEqual(['live', 'live', 'done', 'done', 'done'])
    expect(s.open?.rows[4]).toMatchObject({ glyph: '✓', now: 'found it', canCopy: false })
    expect(s.cards[0]?.isOpen).toBe(true)
  })

  test('the main card: idle, live, refused with copy', () => {
    expect(scene(base, null, undefined, FRAME).main).toMatchObject({ tone: 'idle', canCopy: false, state: '○ idle' })
    expect(scene(turnStarted(base), null, undefined, FRAME).main.tone).toBe('live')
    const refused = mainRefused(base, 'cyber', T)
    expect(scene(refused, null, undefined, FRAME).main).toMatchObject({ tone: 'refused', canCopy: true })
  })

  test('an idle session is not animated; tokens and sparks are summed', () => {
    const f = stepped(base, { model: 'claude-opus-5-5', usage: usage(1500), advisorEnds: [] }, T)
    const s = scene({ ...f, now: T }, null, undefined, FRAME)
    expect(s.isAnimated).toBe(false)
    expect(s.header.tokens).toBe('1.5k tok')
    expect(s.header.spark).toHaveLength(20)
    expect(s.header.spark.at(-1)).toBe(1500)
  })

  test('a refused agent row can be copied', () => {
    let f = spawned(base, { agentId: 'r1', type: 'reviewer', model: 'claude-sonnet-5-5' }, T)
    f = finished(f, 'r1', 'refused', T + 500, undefined, 'cyber')
    const s = scene(f, 'reviewer', undefined, FRAME)
    expect(s.cards[0]?.tone).toBe('refused')
    expect(s.open?.rows[0]).toMatchObject({ id: 'r1', canCopy: true, tone: 'refused' })
  })

  test('a list longer than MAX_ROWS is cut, and props stay small', () => {
    let f = base
    for (let i = 0; i < 200; i++) f = spawned(f, { agentId: `x${i}`, type: 'explorer', model: 'claude-haiku-5-5', description: 'a fairly long task description for size' }, T)
    const s = scene(f, 'explorer', undefined, FRAME)
    expect(s.open?.rows).toHaveLength(MAX_ROWS)
    expect(JSON.stringify(s).length).toBeLessThan(100_000)
  })
})
