import { describe, expect, test } from 'claude-code/testing'

import { FRAME_MS, hud } from '../hooks/hud'
import type { Scene } from '../hooks/scene'
import { inLoop, paneAt, spawnOf, world } from './world'

const MODULE = 'hooks/flow-client.tsx'

/** The scene the terminal Pane last handed its Client. */
async function sceneOf(ui: { findAll: (q: { type: string }) => Promise<Array<{ props: Record<string, unknown> }>> }): Promise<Scene> {
  const clients = await ui.findAll({ type: 'Client' })
  return clients[0]?.props.props as Scene
}

/** The text of every line the Client drew. */
async function drawnText(ui: { drawn: (s: { in: string }) => Promise<unknown> }): Promise<string> {
  return JSON.stringify(await ui.drawn({ in: 'hud' }))
}

describe('the HUD client', () => {
  test('a terminal Pane draws one Client with the scene', async ($, on) => {
    world(on)
    await $.agent.spawn(spawnOf('explorer'))
    const ui = await $.ui.mount({ ...paneAt(104), surface: 'terminal' })
    const clients = await ui.findAll({ type: 'Client' })
    expect(clients).toHaveLength(1)
    expect(clients[0]?.props.module).toBe(MODULE)
    expect((await sceneOf(ui)).cards[0]?.type).toBe('explorer')
    await ui.unmount()
  })

  test('a desktop Pane draws no Client and keeps the old view', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...paneAt(104), surface: 'desktop' })
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'WORKFLOW' })).toBeDefined()
    await ui.unmount()
  })

  test('a toggle post opens a card list and a second post closes it', async ($, on) => {
    world(on)
    await $.agent.spawn(spawnOf('explorer'))
    const ui = await $.ui.mount({ ...paneAt(104), surface: 'terminal' })
    expect((await sceneOf(ui)).open).toBeUndefined()
    await ui.post({ kind: 'toggle', type: 'explorer' })
    expect((await sceneOf(ui)).open?.type).toBe('explorer')
    await ui.post({ kind: 'toggle', type: 'explorer' })
    expect((await sceneOf(ui)).open).toBeUndefined()
    await ui.unmount()
  })

  test('a copy post after a refused main turn reaches ui.copy', async ($, on) => {
    world(on)
    const copied: string[] = []
    on('ui.copy', (_, e) => {
      copied.push(e.text)
      return { value: { isCopied: true as const } }
    })
    await $.turn.start({ turnId: 't0', model: 'claude-opus-5-5' } as never)
    await $.turn.complete({ turnId: 't0', reason: 'refusal', refusal: { category: 'cyber' }, answer: '' } as never)
    const ui = await $.ui.mount({ ...paneAt(104), surface: 'terminal' })
    await ui.post({ kind: 'copy', target: 'main' })
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('cyber')
    await ui.unmount()
  })

  test('a running agent animates the drawing; an idle session stays put', async ($, on) => {
    world(on)
    await $.agent.spawn(spawnOf('explorer'))
    await $.tool.call(inLoop({ tool: 'Read', file_path: '/a.ts' }, 'a1'))
    const busy = await $.ui.mount({ ...paneAt(104), surface: 'terminal' })
    await busy.resize({ columns: 104, rows: 40 })
    const before = await drawnText(busy)
    await busy.advance(FRAME_MS)
    expect(await drawnText(busy)).not.toBe(before)
    await busy.unmount()
  })

  test('with nothing running, time passing changes nothing', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ ...paneAt(104), surface: 'terminal' })
    await ui.resize({ columns: 104, rows: 40 })
    await ui.advance(FRAME_MS)
    const before = await drawnText(ui)
    await ui.advance(FRAME_MS * 5)
    expect(await drawnText(ui)).toBe(before)
    await ui.unmount()
  })

  test('a pointer down on a card hit posts the toggle, and a digit key too', async ($, on) => {
    world(on)
    await $.agent.spawn(spawnOf('explorer'))
    const ui = await $.ui.mount({ ...paneAt(104), surface: 'terminal' })
    await ui.resize({ columns: 104, rows: 40 })
    const props = await sceneOf(ui)
    const hit = hud(props, 104, 0).hits.find(h => h.action.kind === 'toggle')
    expect(hit).toBeDefined()
    if (hit === undefined) return
    await ui.pointer({ type: 'down', x: hit.x0, y: hit.y, button: 'left' })
    expect((await sceneOf(ui)).open?.type).toBe('explorer')
    await ui.key({ key: '1' })
    expect((await sceneOf(ui)).open).toBeUndefined()
    await ui.unmount()
  })
})
