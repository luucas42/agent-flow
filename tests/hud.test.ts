import { describe, expect, test } from 'claude-code/testing'

import { DIM, INK, asksDots, band, batchFill, bottom, boxRow, cut, flowCell, hud, lineWidth, look, sparkline, spinner, sweep, tint, widthOf } from '../hooks/hud'
import { grid } from '../hooks/layout'
import { EMPTY, finished, mainRefused, spawned, stepped, turnStarted } from '../hooks/model'
import { scene } from '../hooks/scene'
import type { Flow } from '../types'

const text = (line: { text: string }[]) => line.map(r => r.text).join('')

describe('hud primitives', () => {
  test('widthOf counts wide chars as 2 and joiners as 0', () => {
    expect(widthOf('abc')).toBe(3)
    expect(widthOf('✓ ⚠ ✗ ● ◀▶')).toBe(10)
    expect(widthOf('日本')).toBe(4)
    expect(widthOf('🚀x')).toBe(3)
    expect(widthOf('é')).toBe(1)
  })

  test('cut fits text into cells with an ellipsis', () => {
    expect(cut('hello', 10)).toBe('hello')
    expect(cut('hello world', 6)).toBe('hello…')
    expect(cut('日本語テキスト', 5)).toBe('日本…')
    expect(widthOf(cut('🚀🚀🚀🚀', 5))).toBeLessThan(6)
    expect(cut('abc', 0)).toBe('')
  })

  test('tint mixes into the base', () => {
    expect(tint('#FFFFFF', 0)).toBe('#0E1116')
    expect(tint('#FFFFFF', 1)).toBe('#FFFFFF')
  })

  test('look by tone', () => {
    expect(look('live', '#C6F432')).toMatchObject({ band: { bg: '#C6F432', fg: INK }, border: '#C6F432' })
    expect(look('refused', '#C6F432').band.bg).toBe('#F5A524')
    expect(look('failed', '#C6F432').band.bg).toBe('#E5534B')
    expect(look('done', '#C6F432').band).toEqual({ bg: tint('#C6F432', 0.22), fg: '#C6F432' })
  })

  test('spinner, sweep and asks dots move with the frame', () => {
    expect(spinner(0)).toBe('⠋')
    expect(spinner(11)).toBe('⠙')
    expect(sweep(10, 0)).toBe('░░░░░░░░░░')
    expect(sweep(10, 5)).toBe('▒▓█▓▒░░░░░')
    expect(sweep(10, 8)).toBe('░░░▒▓█▓▒░░')
    expect(sweep(10, 8)).toHaveLength(10)
    expect(asksDots(0)).toBe('•·•·•')
    expect(asksDots(1)).toBe('·•·•·')
  })

  test('flow dots walk away from the junction', () => {
    expect([0, 1, 2, 3, 4].map(d => flowCell(d, 0)).join('')).toBe('•───•')
    expect([0, 1, 2, 3, 4].map(d => flowCell(d, 1)).join('')).toBe('─•───')
  })

  test('batch fill and sparkline', () => {
    expect(batchFill(16, 3, 5)).toBe(10)
    expect(batchFill(16, 0, 0)).toBe(0)
    expect(sparkline([0, 1, 4, 8]).map(c => c.ch).join('')).toBe('▁▁▄█')
    expect(sparkline([0, 0]).every(c => c.isZero)).toBe(true)
  })

  test('band, boxRow and bottom are exactly their width', () => {
    const l = look('live', '#C6F432')
    const b = band(32, l, '⠋ HAIKU 5.5 · EXPLORER', '[▾ ×5]')
    expect(lineWidth(b)).toBe(32)
    expect(text(b).endsWith('[▾ ×5] ')).toBe(true)
    const row = boxRow(32, l.border, [{ text: 'a very long left side that will not fit at all' }], [{ text: '356k tok' }])
    expect(lineWidth(row)).toBe(32)
    expect(text(row).startsWith('│ ')).toBe(true)
    expect(text(row).endsWith(' 356k tok │')).toBe(true)
    expect(text(bottom(10, DIM, 4))).toBe('└───┬────┘')
  })
})

const T = 1_000_000
const FRAME = { columnsHint: 104, isCompact: false }
const usage = (n: number) => ({ input_tokens: n, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
const plain = (h: { lines: { text: string }[][] }) => h.lines.map(l => l.map(r => r.text).join(''))

/** Five explorers (three done, one with emoji and CJK), a done worker, a refused reviewer, main active, advisor glowing. */
function busy(): Flow {
  let f: Flow = turnStarted({ ...EMPTY, startedAt: T, now: T, advisor: { calls: 0, name: 'fable' } })
  f = stepped(f, { model: 'claude-opus-5-5', effort: 'xhigh', usage: usage(412_000), advisorEnds: [T + 1000] }, T + 1000)
  for (let i = 1; i <= 5; i++) {
    const description = i === 5 ? 'map the 🚀 auth 日本 module' : `task ${i}`
    f = spawned(f, { agentId: `a${i}`, type: 'explorer', model: 'claude-haiku-5-5', description }, T + 1000)
  }
  f = stepped(f, { agentId: 'a1', model: 'claude-haiku-5-5', usage: usage(56_000), advisorEnds: [] }, T + 31_000)
  for (const id of ['a1', 'a2', 'a3']) f = finished(f, id, 'done', T + 1500, 'found it')
  f = spawned(f, { agentId: 'w1', type: 'worker', model: 'claude-sonnet-5-5', description: 'edit' }, T + 1000)
  f = finished(f, 'w1', 'done', T + 1800, 'ok')
  f = spawned(f, { agentId: 'r1', type: 'reviewer', model: 'claude-sonnet-5-5', description: 'review' }, T + 1000)
  f = finished(f, 'r1', 'refused', T + 1900, undefined, 'cyber')
  return { ...f, now: T + 2000 }
}

const open = scene(busy(), 'explorer', undefined, FRAME)

describe('hud layout', () => {
  test('every line fits at 104, 80, 61 and 45 columns', () => {
    for (const columns of [104, 80, 61, 45]) {
      for (const frame of [0, 7]) {
        const h = hud(open, columns, frame)
        for (const line of h.lines) expect(lineWidth(line)).toBeLessThanOrEqual(columns)
        for (const hit of h.hits) expect(hit.x1).toBeLessThanOrEqual(columns)
      }
    }
  })

  test('boxed list rows with emoji and CJK are exactly the panel wide', () => {
    const rows = plain(hud(open, 104, 0)).filter(l => l.includes('auth'))
    expect(rows).toHaveLength(1)
    expect(widthOf(rows[0] ?? '')).toBe(104)
  })

  test('the header shows the metrics and drops the sparkline when narrow', () => {
    expect(plain(hud(open, 104, 0))[0]).toContain('◈ WORKFLOW')
    expect(plain(hud(open, 104, 0))[0]).toContain('10m')
    expect(plain(hud(open, 61, 0))[0]).not.toContain('10m')
  })

  test('a batch of 3/5 fills three fifths of the bar', () => {
    // the bar takes the card's whole row: width - 5 - the label, so 3/5 of 20 cells at width 33
    const { width } = grid(104, open.cards.length)
    const line = plain(hud(open, 104, 0)).find(l => l.includes('3/5 done')) ?? ''
    const card = [...line].slice(0, width).join('')
    expect(card.match(/█/g)?.length).toBe(batchFill(width - 5 - '3/5 done'.length, 3, 5))
    expect(card.match(/░/g)?.length).toBe(width - 5 - '3/5 done'.length - batchFill(width - 5 - '3/5 done'.length, 3, 5))
  })

  test('bands are coloured by tone', () => {
    const bgs = hud(open, 104, 0).lines.flat().filter(r => r.bg !== undefined).map(r => r.bg)
    expect(bgs).toContain('#F5A524') // the refused reviewer
    expect(bgs).toContain('#C6F432') // the live explorer
  })

  test('the spinner and the branch dots move with the frame', () => {
    expect(plain(hud(open, 104, 0)).join('\n')).not.toBe(plain(hud(open, 104, 1)).join('\n'))
    const idle = scene({ ...EMPTY, startedAt: T, now: T }, null, undefined, FRAME)
    expect(plain(hud(idle, 104, 0)).join('\n')).toBe(plain(hud(idle, 104, 5)).join('\n'))
  })

  test('the asks arrow is dim when the advisor is quiet', () => {
    expect(plain(hud(open, 104, 0)).join('\n')).not.toContain('◀───────▶')
    const quiet = { ...open, advisor: open.advisor && { ...open.advisor, isGlowing: false } }
    expect(plain(hud(quiet, 104, 0)).join('\n')).toContain('◀───────▶')
  })

  test('a whole card is its toggle, on every card row, and the open list band closes it', () => {
    const h = hud(open, 61, 0)
    const toggles = h.hits.filter(hit => hit.action.kind === 'toggle')
    expect(toggles).toHaveLength(open.cards.length * 5 + 1)
    for (const card of open.cards) {
      const own = toggles.filter(hit => hit.action.kind === 'toggle' && hit.action.type === card.type)
      const band = own.map(hit => [...(plain(h)[hit.y] ?? '')].slice(hit.x0, hit.x1).join('')).find(text => /\[[▸▾]( ×\d+)?\]/.test(text))
      expect(band).toBeDefined()
    }
    const close = toggles.find(hit => (plain(h)[hit.y] ?? '').includes('▴ close'))
    expect(close?.action).toEqual({ kind: 'toggle', type: 'explorer' })
  })

  test('copy hits: a refused row and a refused main card', () => {
    const at = (h: ReturnType<typeof hud>, hit: { y: number; x0: number; x1: number } | undefined) =>
      [...(plain(h)[hit?.y ?? 0] ?? '')].slice(hit?.x0, hit?.x1).join('')
    const h = hud(scene(busy(), 'reviewer', undefined, FRAME), 104, 0)
    const row = h.hits.find(hit => hit.action.kind === 'copy')
    expect(row?.action).toEqual({ kind: 'copy', target: 'r1' })
    expect(at(h, row)).toBe('[copy]')
    // the main card of a refused turn carries a { kind: 'copy', target: 'main' } hit on its state row
    const refused = hud(scene(mainRefused(busy(), 'cyber', T + 1500), null, undefined, FRAME), 104, 0)
    const main = refused.hits.find(hit => hit.action.kind === 'copy')
    expect(main?.action).toEqual({ kind: 'copy', target: 'main' })
    expect(at(refused, main)).toBe('[copy]')
  })

  test('compact below 60 columns and inline', () => {
    const narrow = plain(hud(open, 45, 0))
    expect(narrow.join('\n')).not.toContain('delegates')
    expect(narrow.join('\n')).toContain('EXPLORER')
    expect(plain(hud({ ...open, isCompact: true }, 104, 0)).join('\n')).not.toContain('delegates')
    expect(plain(hud(open, 104, 0)).join('\n')).toContain('delegates')
  })

  test('compact toggle hits lie on the chip', () => {
    const h = hud(open, 45, 0)
    const toggles = h.hits.filter(hit => hit.action.kind === 'toggle')
    expect(toggles).toHaveLength(open.cards.length)
    for (const hit of toggles) expect([...(plain(h)[hit.y] ?? '')].slice(hit.x0, hit.x1).join('')).toContain('·')
  })

  test('no line is empty: an empty Text takes no row and would shift every hit below it', () => {
    const empty = scene({ ...EMPTY, startedAt: T, now: T }, null, undefined, FRAME)
    for (const sc of [open, empty]) for (const columns of [104, 61, 45]) {
      for (const line of hud(sc, columns, 0).lines) expect(lineWidth(line)).toBeGreaterThan(0)
    }
  })

  test('an empty session draws and never throws', () => {
    const empty = scene({ ...EMPTY, startedAt: T, now: T }, null, undefined, FRAME)
    for (const columns of [104, 61, 45, 10, 0]) for (const line of hud(empty, columns, 0).lines) expect(lineWidth(line)).toBeLessThanOrEqual(columns)
  })
})
