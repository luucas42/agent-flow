import { COLORS, ERROR_COLOR, WARN_COLOR, WHITE } from './format'
import { ASK_WIDTH, COMPACT_BELOW, GAP, arrows, branch, centers, chunk, grid, topRow } from './layout'
import type { Scene, SceneCard, SceneList, Tone } from './scene'

export const INK = '#11151B'
export const CHIP = '#1C2330'
export const DIM = '#4B5563'
export const MUTED = '#8B949E'
export const BASE = '#0E1116'
export const FRAME_MS = 110
export const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const BARS = '▁▂▃▄▅▆▇█'
const GLOW = '▒▓█▓▒'

/** One run of text in one style; a line is the runs of one terminal row. */
export type Run = { text: string; fg?: string; bg?: string; bold?: true; dim?: true }
export type Line = Run[]
export type Action = { kind: 'toggle'; type: string } | { kind: 'copy'; target: string }
/** A clickable cell range on row `y`, `x1` exclusive. */
export type Hit = { y: number; x0: number; x1: number; action: Action }
export type Hud = { lines: Line[]; hits: Hit[] }
export type Look = { band: { bg: string; fg: string }; border: string; text: string; sub: string }

function cellsOf(cp: number): number {
  if (cp === 0xfe0f || cp === 0x200d || (cp >= 0x300 && cp <= 0x36f)) return 0
  const wide =
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)
  return wide ? 2 : 1
}

/** How many terminal cells a text takes. */
export function widthOf(text: string): number {
  let n = 0
  for (const ch of text) n += cellsOf(ch.codePointAt(0) ?? 0)
  return n
}

/** The text cut to at most `cells` cells, ending in `…` when it was longer. */
export function cut(text: string, cells: number): string {
  if (cells <= 0) return ''
  if (widthOf(text) <= cells) return text
  let out = ''
  let used = 0
  for (const ch of text) {
    const w = cellsOf(ch.codePointAt(0) ?? 0)
    if (used + w > cells - 1) break
    out += ch
    used += w
  }
  return `${out}…`
}

export const lineWidth = (line: Line): number => line.reduce((sum, run) => sum + widthOf(run.text), 0)

/** `color` mixed into the dark base by `k` (0 = base, 1 = color). */
export function tint(color: string, k: number): string {
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const [a, b] = [rgb(color), rgb(BASE)]
  return `#${a.map((v, i) => Math.round(v * k + (b[i] ?? 0) * (1 - k)).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** A tone's band, border and text colours over a family colour. */
export function look(tone: Tone, color: string): Look {
  switch (tone) {
    case 'live':
      return { band: { bg: color, fg: INK }, border: color, text: color, sub: MUTED }
    case 'refused':
      return { band: { bg: WARN_COLOR, fg: INK }, border: WARN_COLOR, text: WARN_COLOR, sub: MUTED }
    case 'failed':
      return { band: { bg: ERROR_COLOR, fg: INK }, border: ERROR_COLOR, text: ERROR_COLOR, sub: MUTED }
    default:
      return { band: { bg: tint(color, 0.22), fg: color }, border: tint(color, 0.55), text: tint(color, 0.7), sub: DIM }
  }
}

export const spinner = (frame: number): string => SPINNER[frame % SPINNER.length] ?? '●'

/** A bar of `cells` with the glow passing left to right as frames go by. */
export function sweep(cells: number, frame: number): string {
  const at = (frame % (cells + GLOW.length)) - GLOW.length
  let out = ''
  for (let i = 0; i < cells; i++) out += GLOW[i - at] ?? '░'
  return out
}

/** How many of `cells` a batch with `done` of `spawned` fills. */
export const batchFill = (cells: number, done: number, spawned: number): number =>
  spawned <= 0 ? 0 : Math.round((cells * done) / spawned)

/** One bar per value, scaled to the largest; zeros are flagged so they can be dimmed. */
export function sparkline(values: number[]): Array<{ ch: string; isZero: boolean }> {
  const max = Math.max(0, ...values)
  return values.map(v => (v <= 0 || max === 0 ? { ch: BARS[0] ?? '▁', isZero: true } : { ch: BARS[Math.min(7, Math.max(0, Math.ceil((v / max) * 8) - 1))] ?? '█', isZero: false }))
}

/** A lit branch cell `distance` from the junction: a dot every fourth cell, walking outward. */
export const flowCell = (distance: number, frame: number): '•' | '─' => ((((distance - frame) % 4) + 4) % 4 === 0 ? '•' : '─')

/** The asks arrow's five inner cells. */
export const asksDots = (frame: number): string => Array.from({ length: 5 }, (_, i) => ((i + frame) % 2 === 0 ? '•' : '·')).join('')

function padRuns(runs: Run[], cells: number, style: Omit<Run, 'text'> = {}): Run[] {
  const gap = cells - lineWidth(runs)
  return gap > 0 ? [...runs, { ...style, text: ' '.repeat(gap) }] : runs
}

function cutRuns(runs: Run[], cells: number): Run[] {
  const out: Run[] = []
  let room = cells
  for (const run of runs) {
    if (room <= 0) break
    const text = widthOf(run.text) <= room ? run.text : cut(run.text, room)
    out.push({ ...run, text })
    room -= widthOf(text)
  }
  return out
}

/** `│ left … right │`, exactly `width` cells; the left side is cut first. */
export function boxRow(width: number, border: string, left: Run[], right: Run[] = []): Line {
  const inner = width - 4
  const r = cutRuns(right, inner)
  const room = inner - lineWidth(r) - (r.length > 0 ? 1 : 0)
  const l = cutRuns(left, Math.max(0, room))
  return [{ text: '│ ', fg: border }, ...padRuns(l, inner - lineWidth(r)), ...r, { text: ' │', fg: border }]
}

/** A filled band: ` left … right `, exactly `width` cells. */
export function band(width: number, lk: Look, left: string, right: string): Line {
  const style = { bg: lk.band.bg, fg: lk.band.fg, bold: true as const }
  const r = cut(right, Math.max(0, width - 2))
  const l = cut(left, Math.max(0, width - 3 - widthOf(r)))
  const gap = Math.max(0, width - 2 - widthOf(l) - widthOf(r))
  return [{ ...style, text: ` ${l}${' '.repeat(gap)}${r} ` }]
}

/** `└────┘`, with a `┬` at `tee` when given. */
export function bottom(width: number, border: string, tee?: number): Line {
  const cells = Array.from({ length: width }, (_, i) => (i === 0 ? '└' : i === width - 1 ? '┘' : i === tee ? '┬' : '─'))
  return [{ text: cells.join(''), fg: border }]
}

type Block = { lines: Line[]; hits: Hit[] }

const spaces = (n: number): Run => ({ text: ' '.repeat(Math.max(0, n)) })
const shift = (hits: Hit[], dy: number, dx = 0): Hit[] => hits.map(h => ({ ...h, y: h.y + dy, x0: h.x0 + dx, x1: h.x1 + dx }))
const pad = (text: string, cells: number): string => `${cut(text, cells)}${' '.repeat(Math.max(0, cells - widthOf(cut(text, cells))))}`
const glyphOf = (state: string, tone: Tone, frame: number): string => (tone === 'live' ? spinner(frame) : state.slice(0, 1))

/** Blocks stacked top to bottom; hits move down with their block. */
function stack(blocks: Block[]): Block {
  const out: Block = { lines: [], hits: [] }
  for (const block of blocks) {
    out.hits.push(...shift(block.hits, out.lines.length))
    out.lines.push(...block.lines)
  }
  return out
}

/** Blocks of fixed widths side by side, `gap` cells apart; hits move right with their block. */
function beside(parts: Array<{ block: Block; width: number }>, gap: number): Block {
  const rows = Math.max(...parts.map(part => part.block.lines.length))
  const lines = Array.from({ length: rows }, (_, i) =>
    parts.flatMap((part, k) => [...(k > 0 ? [spaces(gap)] : []), ...(part.block.lines[i] ?? [spaces(part.width)])]),
  )
  let x = 0
  const hits = parts.flatMap(part => {
    const moved = shift(part.block.hits, 0, x)
    x += part.width + gap
    return moved
  })
  return { lines, hits }
}

/** The line cut to `cells`, so no block can push past the panel. */
const fit = (line: Line, cells: number): Line => cutRuns(line, cells)

function headerLeft(s: Scene, withCost: boolean): Line {
  const h = s.header
  const dot: Run = { text: '  ·  ', fg: DIM }
  return [
    { text: ' ◈ WORKFLOW ', fg: WHITE, bg: CHIP, bold: true },
    spaces(2),
    ...(withCost && h.cost !== undefined ? [{ text: h.cost, fg: WHITE }, dot] : []),
    { text: `◷ ${h.age}`, fg: MUTED },
    dot,
    { text: `● ${h.live} live`, fg: COLORS.haiku },
    { text: ` / ${h.total}`, fg: DIM },
    dot,
    { text: h.tokens, fg: MUTED },
  ]
}

/** The metrics strip: the sparkline goes first when the line is too wide, then the cost. */
function headerBlock(s: Scene, columns: number): Line {
  const right: Line = [...sparkline(s.header.spark).map(c => ({ text: c.ch, fg: c.isZero ? DIM : COLORS.sonnet })), { text: '  10m', fg: DIM }]
  const full = headerLeft(s, true)
  if (lineWidth(full) + 1 + lineWidth(right) <= columns) return [...full, spaces(columns - lineWidth(full) - lineWidth(right)), ...right]
  return lineWidth(full) <= columns ? full : headerLeft(s, false)
}

function legendBlock(s: Scene): Line {
  if (s.legend.length === 0) return [{ text: ' waiting for the first turn', fg: DIM }]
  const parts = s.legend.map((entry): Line => [{ text: entry.family, fg: entry.color, bold: true }, { text: ` ${entry.word}`, fg: DIM }])
  return [spaces(1), ...parts.flatMap((part, i) => (i === 0 ? part : [{ text: ' · ', fg: DIM }, ...part]))]
}

function mainBlock(s: Scene, width: number, hasTee: boolean, frame: number): Block {
  const m = s.main
  const lk = look(m.tone, m.color)
  const status = m.tone === 'refused' ? '⚠ REFUSED' : m.tone === 'live' ? '● LIVE' : '○ IDLE'
  const title = `${m.tone === 'live' ? `${spinner(frame)} ` : ''}${m.model.toUpperCase()} · MAIN SESSION`
  const filled = m.effort === undefined ? 0 : Math.min(5, m.effort.filled) * 2
  const effort: Run[] =
    m.effort === undefined
      ? [{ text: 'effort —', fg: DIM }]
      : [{ text: 'effort ', fg: MUTED }, { text: '█'.repeat(filled), fg: m.color }, { text: '░'.repeat(10 - filled), fg: DIM }, { text: ` ${m.effort.label}`, fg: MUTED }]
  const right: Run[] = [...(m.canCopy ? [{ text: '[copy]', fg: WARN_COLOR, bold: true as const }, spaces(1)] : []), { text: m.tokens, fg: MUTED }]
  const x0 = width - 2 - lineWidth(right)
  return {
    lines: [
      band(width, lk, title, status),
      boxRow(width, lk.border, effort),
      boxRow(width, lk.border, [{ text: m.state, fg: lk.text }], right),
      bottom(width, lk.border, hasTee ? Math.floor(width / 2) : undefined),
    ],
    hits: m.canCopy && x0 >= 2 ? [{ y: 2, x0, x1: x0 + 6, action: { kind: 'copy', target: 'main' } }] : [],
  }
}

function advisorBlock(adv: NonNullable<Scene['advisor']>, width: number): Block {
  const lk = look(adv.isGlowing ? 'live' : 'idle', adv.color)
  const asked: Run[] = adv.asked.startsWith('» ') ? [{ text: '» ', fg: adv.color }, { text: adv.asked.slice(2), fg: MUTED }] : [{ text: adv.asked, fg: MUTED }]
  const state: Run = adv.isGlowing ? { text: '● advised', fg: lk.text } : { text: '○ quiet', fg: DIM }
  return {
    lines: [
      band(width, lk, `${adv.name.toUpperCase()} · ADVISOR`, adv.isGlowing ? '● ASKED' : '○ QUIET'),
      boxRow(width, lk.border, asked),
      boxRow(width, lk.border, [state], [{ text: `calls ${adv.calls}`, fg: MUTED }]),
      bottom(width, lk.border),
    ],
    hits: [],
  }
}

function asksBlock(adv: Scene['advisor'], frame: number): Block {
  const mid = (runs: Run[]): Line => {
    const left = Math.floor((ASK_WIDTH - lineWidth(runs)) / 2)
    return [spaces(left), ...runs, spaces(ASK_WIDTH - lineWidth(runs) - left)]
  }
  const arrow: Run = adv?.isGlowing === true ? { text: `◀━${asksDots(frame)}━▶`, fg: adv.color } : { text: '◀───────▶', fg: DIM }
  return { lines: [[spaces(ASK_WIDTH)], mid([{ text: 'asks', fg: MUTED }]), mid([arrow]), [spaces(ASK_WIDTH)]], hits: [] }
}

/** The main card, the asks column and the advisor card in one row. */
function topBlock(s: Scene, columns: number, hasTee: boolean, frame: number): Block {
  const { main, advisor } = topRow(columns, s.advisor !== undefined)
  const parts = [{ block: mainBlock(s, main, hasTee, frame), width: main }]
  if (s.advisor !== undefined) parts.push({ block: asksBlock(s.advisor, frame) , width: ASK_WIDTH }, { block: advisorBlock(s.advisor, advisor), width: advisor })
  return beside(parts, 0)
}

/** The layout's runs as a line; lit stretches of `─` become flowing dots. */
function flowLine(runs: ReturnType<typeof branch>, junction: number, frame: number): Line {
  let x = 0
  return runs.map(run => {
    let text = ''
    for (const ch of run.text) text += run.color !== undefined && ch === '─' ? flowCell(Math.abs(x++ - junction), frame) : (x++, ch)
    return { text, fg: run.color ?? DIM }
  })
}

function barRuns(card: SceneCard, cells: number, lk: Look, frame: number): Run[] {
  const n = Math.max(0, cells)
  if (card.spawned > 1) {
    const filled = batchFill(n, card.done, card.spawned)
    return [{ text: '█'.repeat(filled), fg: lk.text }, { text: '░'.repeat(n - filled), fg: DIM }]
  }
  return card.tone === 'live' ? [{ text: sweep(n, frame), fg: card.color }] : [{ text: '█'.repeat(n), fg: lk.text }]
}

const toggleLabel = (card: SceneCard): string => `[${card.isOpen ? '▾' : '▸'}${card.spawned > 1 ? ` ×${card.spawned}` : ''}]`

function cardBlock(card: SceneCard, width: number, frame: number): Block {
  const lk = look(card.tone, card.color)
  const label = toggleLabel(card)
  const left = `${card.isViewed ? '◉ ' : ''}${glyphOf(card.state, card.tone, frame)} ${card.model.toUpperCase()} · ${card.role}`
  const progress = card.spawned > 1 ? `${card.done}/${card.spawned} done` : card.tone === 'live' ? 'running' : card.tone
  const spark = sparkline(card.spark).map(c => ({ text: c.ch, fg: c.isZero ? DIM : lk.text }))
  const toggle = { kind: 'toggle' as const, type: card.type }
  return {
    lines: [
      band(width, lk, left, label),
      boxRow(width, lk.border, [...barRuns(card, width - 5 - widthOf(progress), lk, frame), { text: ` ${progress}`, fg: lk.sub }]),
      boxRow(width, lk.border, [{ text: card.state, fg: lk.text }]),
      boxRow(width, lk.border, [{ text: card.tokens, fg: lk.sub }], spark),
      bottom(width, lk.border),
    ],
    hits: [0, 1, 2, 3, 4].map(y => ({ y, x0: 0, x1: width, action: toggle })),
  }
}

function rowColors(tone: Tone, color: string): { glyph: string; task: string; now: string; figures: string } {
  const text = look(tone, color).text
  if (tone === 'live') return { glyph: color, task: WHITE, now: color, figures: MUTED }
  if (tone === 'refused' || tone === 'failed') return { glyph: text, task: text, now: text, figures: MUTED }
  return { glyph: text, task: DIM, now: DIM, figures: DIM }
}

/** The open card's agents, full width: a band, one boxed row each, the bottom. */
function listBlock(list: SceneList, columns: number, frame: number): Block {
  const lk = look(list.tone, list.color)
  const hits: Hit[] = []
  const rows = list.rows.map((row, i): Line => {
    const c = rowColors(row.tone, list.color)
    const right: Run[] = [...(row.canCopy ? [{ text: '[copy]', fg: WARN_COLOR, bold: true as const }, spaces(1)] : []), { text: row.figures, fg: c.figures }]
    const x0 = columns - 2 - lineWidth(right)
    if (row.canCopy && x0 >= 2) hits.push({ y: i + 1, x0, x1: x0 + 6, action: { kind: 'copy', target: row.id } })
    const task: Run = { text: `${pad(row.task, 25)} `, fg: c.task, ...(row.tone === 'live' ? { bold: true as const } : {}) }
    return boxRow(columns, lk.border, [{ text: row.tone === 'live' ? spinner(frame) : row.glyph, fg: c.glyph }, { text: ` #${row.n}  `, fg: MUTED }, task, { text: pad(row.now, 26), fg: c.now }], right)
  })
  hits.push({ y: 0, x0: 0, x1: columns, action: { kind: 'toggle', type: list.type } })
  return { lines: [band(columns, lk, list.title, `${list.counts}  ▴ close`), ...rows, bottom(columns, lk.border)], hits }
}

/** One row of cards: the branch, the arrows, the cards and, when its card is open, the list. */
function cardRowBlock(s: Scene, row: SceneCard[], columns: number, junction: number, width: number, frame: number): Block {
  const cs = centers(row.length, width)
  const colors = row.map(card => (card.tone === 'live' ? card.color : undefined))
  const lines: Line[] = [flowLine(branch(cs, junction, colors), junction, frame), flowLine(arrows(cs, colors), junction, frame)]
  const cards = beside(row.map(card => ({ block: cardBlock(card, width, frame), width })), GAP)
  const open = s.open !== undefined && row.some(card => card.isOpen) ? listBlock(s.open, columns, frame) : { lines: [], hits: [] }
  return stack([{ lines, hits: [] }, cards, open])
}

/** The delegates line, then every card row. */
function delegatesBlock(s: Scene, columns: number, junction: number, frame: number): Block {
  const isLive = s.cards.some(card => card.tone === 'live')
  const head: Line = [spaces(junction), { text: '│', fg: isLive ? WHITE : DIM }, { text: ' delegates', fg: DIM }]
  const { perRow, width } = grid(columns, s.cards.length)
  return stack([{ lines: [head], hits: [] }, ...chunk(s.cards, perRow).map(row => cardRowBlock(s, row, columns, junction, width, frame))])
}

function compactBlock(s: Scene, columns: number, frame: number): Block {
  const m = s.main
  const mainGlyph = glyphOf(m.state, m.tone, frame)
  const lines: Line[] = [
    [{ text: ' ◈ WORKFLOW ', fg: WHITE, bg: CHIP, bold: true }, { text: ` ◷ ${s.header.age}`, fg: MUTED }],
    [{ text: `${mainGlyph} ${m.model} `, fg: m.color }, { text: `MAIN · ${m.state.slice(2)} · ${m.tokens}`, fg: MUTED }],
  ]
  const adv = s.advisor
  if (adv !== undefined) lines.push([{ text: `${adv.isGlowing ? '●' : '○'} ${adv.name} `, fg: adv.isGlowing ? adv.color : DIM }, { text: `advisor · ${adv.asked.replace(/^» /, '')} · calls ${adv.calls}`, fg: MUTED }])
  const hits: Hit[] = []
  for (const card of s.cards) {
    const lk = look(card.tone, card.color)
    const chip = ` ${card.isViewed ? '◉ ' : ''}${card.model} · ${card.role} `
    hits.push({ y: lines.length, x0: 0, x1: columns, action: { kind: 'toggle', type: card.type } })
    lines.push([{ text: chip, fg: lk.band.fg, bg: lk.band.bg, bold: true }, spaces(1), ...barRuns(card, 8, lk, frame), { text: ` ${card.state} · ${card.tokens}`, fg: lk.text }])
    if (s.open !== undefined && card.isOpen) {
      for (const row of s.open.rows) {
        const c = rowColors(row.tone, s.open.color)
        lines.push([{ text: `  ${row.tone === 'live' ? spinner(frame) : row.glyph} #${row.n} ${row.task} · ${row.figures}`, fg: c.now }])
      }
    }
  }
  return { lines, hits }
}

/** The whole panel as cell-exact lines and the click ranges on them. */
export function hud(s: Scene, columns: number, frame: number): Hud {
  try {
    const isCompact = s.isCompact || columns < COMPACT_BELOW
    const hasCards = s.cards.length > 0
    const junction = Math.floor(topRow(columns, s.advisor !== undefined).main / 2)
    const out = isCompact
      ? compactBlock(s, columns, frame)
      : stack([
          { lines: [headerBlock(s, columns), legendBlock(s), [spaces(1)]], hits: [] },
          topBlock(s, columns, hasCards, frame),
          hasCards ? delegatesBlock(s, columns, junction, frame) : { lines: [], hits: [] },
        ])
    return { lines: out.lines.map(line => fit(line, columns)), hits: out.hits.filter(hit => hit.x1 <= columns) }
  } catch (err) {
    return { lines: [fit([{ text: `agent-flow: ${err instanceof Error ? err.message : String(err)}`, fg: DIM }], columns)], hits: [] }
  }
}
