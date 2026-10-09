import { describe, expect, test } from 'claude-code/testing'

import { T0, drain, inLoop, paneAt, spawnOf, world } from './world'

describe('the panel', () => {
  test('draws the main card, the advisor and two running explorers', async ($, on) => {
    const { upcoming } = world(on)
    upcoming.serverToolUses = [{ id: 'adv1', name: 'advisor', input: {}, startedAt: T0, endedAt: T0 }]
    await drain($.turn.step({ turnId: 't0', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 1 }))
    upcoming.serverToolUses = []
    await $.agent.spawn(spawnOf('explorer'))
    await $.agent.spawn(spawnOf('explorer'))
    await $.tool.call(inLoop({ tool: 'Read', file_path: '/a.ts' }, 'a1'))
    await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', effort: 'xhigh', messageCount: 1, agentId: 'a1' }))

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...paneAt(104), surface })
      expect(await ui.find({ type: 'Text', text: 'WORKFLOW' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '● delegated · waiting on 2' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Advisor' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'calls 1' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '» last asked just now' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Haiku 5.5' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'EXPLORER' })).toBeDefined()
      expect(await ui.find({ type: 'Button', text: '▸ ×2' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '● reading · 1 files' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '1k tok' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /delegates/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a narrow or inline panel falls back to one line per agent', async ($, on) => {
    world(on)
    await $.agent.spawn(spawnOf('worker', { model: 'claude-sonnet-5-5' }))
    await $.tool.call(inLoop({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' }, 'a1'))

    for (const frame of [paneAt(50), paneAt(104, 'inline')]) {
      const ui = await $.ui.mount({ ...frame, surface: 'terminal' })
      expect(await ui.find({ type: 'Text', text: ' · editing · 1 files · 0 tok' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /MAIN SESSION/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('six agent types wrap into rows and the viewed one is drawn bold', async ($, on) => {
    world(on)
    for (const type of ['worker', 'explorer', 'researcher', 'general-purpose', 'Explore', 'Plan']) {
      await $.agent.spawn(spawnOf(type))
    }

    const ui = await $.ui.mount({ ...paneAt(104, 'dock', 'a2'), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: 'PLAN' })).toBeDefined()
    const bold = (await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'bold')
    expect(bold.length).toBe(1)
    await ui.unmount()
  })

  test('an empty session shows the main card alone', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...paneAt(104), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: '○ idle' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /delegates/ })).toBeUndefined()
    await ui.unmount()
  })

  test('pressing a card opens its agents in place and pressing again closes them', async ($, on) => {
    world(on)
    await $.agent.spawn(spawnOf('worker', { model: 'claude-sonnet-5-5', description: 'refactor auth module' }))
    await $.agent.spawn(spawnOf('worker', { model: 'claude-sonnet-5-5', description: 'add login tests' }))
    await $.tool.call(inLoop({ tool: 'Edit', file_path: '/repo/src/auth/session.ts', old_string: 'a', new_string: 'b' }, 'a1'))

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...paneAt(104), surface })
      expect(await ui.find({ type: 'Text', text: 'WORKER · 2 agents' })).toBeUndefined()

      await ui.press({ key: 'toggle-worker' })
      expect(await ui.find({ type: 'Text', text: 'WORKER · 2 agents' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'refactor auth module' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'add login tests' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '      Edit auth/session.ts' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '● 2' })).toBeDefined()
      expect(await ui.find({ type: 'Button', text: '▾ ×2' })).toBeDefined()

      await ui.press({ key: 'toggle-worker' })
      expect(await ui.find({ type: 'Text', text: 'WORKER · 2 agents' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the compact list opens the same way', async ($, on) => {
    world(on)
    await $.agent.spawn(spawnOf('worker', { description: 'refactor auth module' }))

    const ui = await $.ui.mount({ ...paneAt(50), surface: 'terminal' })
    await ui.press({ key: 'toggle-worker' })
    expect(await ui.find({ type: 'Text', text: 'WORKER · 1 agent' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'refactor auth module' })).toBeDefined()
    await ui.unmount()
  })
})
