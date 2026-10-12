import { describe, expect, mock, test } from 'claude-code/testing'

import { T0, TYPED, drain, inLoop, spawnOf, watchFlow, world } from './world'

describe('the flow follows the session', () => {
  test('a spawned explorer reads, steps and finishes', async ($, on) => {
    const { clock, peek } = world(on)

    const spawn = await $.agent.spawn(spawnOf('explorer'))
    expect(spawn.agentId).toBe('a1')
    await $.tool.call(inLoop({ tool: 'Read', file_path: '/a.ts' } as const, 'a1'))
    await $.tool.call(inLoop({ tool: 'Read', file_path: '/b.ts' } as const, 'a1'))
    await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', effort: 'xhigh', messageCount: 1, agentId: 'a1' }))

    const running = peek()
    expect(running?.cards.explorer).toMatchObject({
      status: 'running',
      running: 1,
      tokens: 1000,
      effort: 'xhigh',
      verbCounts: { reading: 2 },
    })

    await clock.advance(72_000)
    await $.turn.complete({ answer: 'found it', durationMs: 72_000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })

    const done = peek()
    expect(done?.cards.explorer).toMatchObject({ status: 'done', running: 0, lastRunMs: 72_000 })
  })

  test('advisor calls on the main loop count and stamp the arrow', async ($, on) => {
    const { upcoming, peek } = world(on)
    upcoming.serverToolUses = [{ id: 'adv1', name: 'advisor', input: {}, startedAt: T0, endedAt: T0 + 500 }]

    await drain($.turn.step({ turnId: 't0', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 3 }))

    const value = peek()
    expect(value?.advisor).toMatchObject({ calls: 1, lastEndedAt: T0 + 500 })
    expect(value?.main).toMatchObject({ model: 'claude-opus-5-5', tokens: 1000, effort: 'xhigh' })
  })

  test('main turns start and end', async ($, on) => {
    const { peek } = world(on)
    await $.turn.start({ text: 'hi', turnId: 't0' })
    expect(peek()?.main.turnActive).toBe(true)
    await $.turn.complete({ answer: 'hello', durationMs: 5, isAborted: false, turnId: 't0', reason: 'answer' })
    expect(peek()?.main.turnActive).toBe(false)
  })

  test('tool calls pass through untouched, from the main loop and from strangers', async ($, on) => {
    const { peek } = world(on)
    const main = await $.tool.call({ tool: 'Read', file_path: '/a.ts' })
    const stranger = await $.tool.call(inLoop({ tool: 'Read', file_path: '/a.ts' } as const, 'ghost'))

    expect(main.result as unknown).toBe('ok')
    expect(stranger.result as unknown).toBe('ok')
    expect(peek()?.cards ?? {}).toEqual({})
  })

  test('a refused spawn draws nothing', async ($, on) => {
    mock.clock(on, { now: T0 })
    const peek = watchFlow(on)
    on('agent.spawn', () => ({ deny: 'not now' }))

    const result = await $.agent.spawn(spawnOf('worker'))
    expect(result.deny).toBe('not now')
    expect(peek()?.cards ?? {}).toEqual({})
  })

  test('/flow reset clears the panel, /flow hide closes it, anything else shows usage', async ($, on) => {
    const { peek } = world(on)
    const closed: string[] = []
    on('settings.read', () => ({ value: { advisorModel: 'fable' } }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('ui.panes', () => ({ value: [] }))
    on('ui.close', (_, e) => {
      closed.push(e.id)
      return { value: undefined }
    })

    await $.agent.spawn(spawnOf('worker'))
    const reset = await $.command.run({ ...TYPED, command: 'flow', args: 'reset' })
    expect(reset.text).toBe('Agent flow reset.')
    const value = peek()
    expect(value?.cards).toEqual({})
    expect(value?.advisor).toEqual({ calls: 0, name: 'fable' })

    const hidden = await $.command.run({ ...TYPED, command: 'flow', args: 'hide' })
    expect(hidden.text).toBe('Agent flow hidden.')
    expect(closed).toEqual(['agent-flow'])

    const usage = await $.command.run({ ...TYPED, command: 'flow', args: 'nope' })
    expect(usage.text).toBe('Usage: /flow [show | hide | reset]')
  })

  test('tool targets and answers reach the agent', async ($, on) => {
    const { peek } = world(on)
    await $.agent.spawn(spawnOf('worker', { description: 'refactor auth module' }))
    await $.tool.call(inLoop({ tool: 'Edit', file_path: '/repo/src/auth/session.ts', old_string: 'a', new_string: 'b' }, 'a1'))
    await $.turn.complete({ answer: '## Done\nall green', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })

    expect(peek()?.instances.a1).toMatchObject({
      n: 1,
      description: 'refactor auth module',
      tools: 1,
      lastTool: 'Edit',
      lastTarget: 'auth/session.ts',
      status: 'done',
      answer: 'Done',
    })
  })
  test('a refused subagent is flagged and announced with an alert', async ($, on) => {
    const { peek } = world(on)
    const toasts: string[] = []
    const sounds: string[] = []
    on('ui.toast', (_, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('audio.play', (_, e) => {
      sounds.push(JSON.stringify(e.clip))
      return { value: undefined }
    })

    await $.agent.spawn(spawnOf('worker'))
    await $.agent.spawn(spawnOf('worker'))
    await $.turn.complete({
      answer: '',
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'refusal',
      refusal: { category: 'cyber', explanation: null },
      agentId: 'a1',
    })

    expect(peek()?.instances.a1).toMatchObject({ status: 'refused', reason: 'cyber' })
    expect(toasts).toEqual(['⚠ worker #1 refused · cyber'])
    expect(sounds).toEqual(['{"asset":"sounds/alert.wav"}'])
  })

  test('a finished batch is summed up with the done sound', async ($, on) => {
    const { clock } = world(on)
    const toasts: string[] = []
    const sounds: string[] = []
    on('ui.toast', (_, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('audio.play', (_, e) => {
      sounds.push(JSON.stringify(e.clip))
      return { value: undefined }
    })

    await $.agent.spawn(spawnOf('worker'))
    await clock.advance(21_000)
    await $.turn.complete({ answer: 'ok', durationMs: 21_000, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })

    expect(toasts).toEqual(['✓ 1 agent done · 21s'])
    expect(sounds).toEqual(['{"asset":"sounds/done.wav"}'])
  })

  test('sound off and errors-only keep it quiet', { options: { sound: false, notifications: 'errors' } }, async ($, on) => {
    world(on)
    const toasts: string[] = []
    const sounds: string[] = []
    on('ui.toast', (_, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('audio.play', (_, e) => {
      sounds.push(JSON.stringify(e.clip))
      return { value: undefined }
    })

    await $.agent.spawn(spawnOf('worker'))
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' })
    expect(toasts).toEqual([])

    await $.agent.spawn(spawnOf('worker'))
    await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't2', reason: 'error', agentId: 'a2' })
    expect(toasts).toEqual(['✗ worker #2 failed'])
    expect(sounds).toEqual([])
  })
})
