import { WHITE } from './format'

export const GAP = 2
export const MIN_CARD = 24
export const MAX_CARD = 34
export const ASK_WIDTH = 10
export const MAIN_ALONE = 40
export const COMPACT_BELOW = 60

export type Run = { text: string; color?: string }

type Cell = { ch: string; color?: string }

/** How many cards a row holds and how wide each one is. */
export function grid(bodyColumns: number, count: number): { perRow: number; width: number } {
  const fit = Math.max(1, Math.floor((bodyColumns + GAP) / (MIN_CARD + GAP)))
  const perRow = Math.max(1, Math.min(count, fit))
  const width = Math.min(MAX_CARD, Math.floor((bodyColumns - GAP * (perRow - 1)) / perRow))
  return { perRow, width }
}

/** The top row: the main card's width and the advisor's (0 when it is not shown). */
export function topRow(bodyColumns: number, hasAdvisor: boolean): { main: number; advisor: number } {
  if (!hasAdvisor) return { main: Math.min(bodyColumns, MAIN_ALONE), advisor: 0 }
  const main = Math.floor((bodyColumns - ASK_WIDTH) / 2)
  return { main, advisor: bodyColumns - ASK_WIDTH - main }
}

export function chunk<T>(list: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size))
  return rows
}

/** The column under the middle of each card of a row. */
export function centers(count: number, width: number): number[] {
  return Array.from({ length: count }, (_, i) => i * (width + GAP) + Math.floor(width / 2))
}

/** Merges neighbouring cells of one color into runs of text. */
export function runs(cells: Cell[]): Run[] {
  const out: Run[] = []
  for (const cell of cells) {
    const last = out.at(-1)
    if (last !== undefined && last.color === cell.color) {
      last.text += cell.ch
    } else {
      out.push(cell.color === undefined ? { text: cell.ch } : { text: cell.ch, color: cell.color })
    }
  }
  return out
}

/**
 * The branch line from the junction to each card's center: `┌──●──┬──┐`.
 * A stretch is lit in a running card's color when that card lies at or beyond
 * it, going outward from the junction; the junction is white while any is lit.
 */
export function branch(cs: number[], junction: number, colors: Array<string | undefined>): Run[] {
  const lo = Math.min(junction, ...cs)
  const hi = Math.max(junction, ...cs)
  const isAnyLit = colors.some(color => color !== undefined)
  const litFrom = (x: number): string | undefined => {
    let best: number | undefined
    cs.forEach((c, i) => {
      if (colors[i] === undefined) return
      const isOutward = x < junction ? c <= x : c >= x
      if (isOutward && (best === undefined || Math.abs(c - x) < Math.abs((cs[best] ?? 0) - x))) best = i
    })
    return best === undefined ? undefined : colors[best]
  }

  const cells: Cell[] = []
  for (let x = 0; x <= hi; x++) {
    if (x < lo) {
      cells.push({ ch: ' ' })
    } else if (x === junction) {
      cells.push({ ch: '●', color: isAnyLit ? WHITE : undefined })
    } else {
      const ch = !cs.includes(x) ? '─' : x === lo ? '┌' : x === hi ? '┐' : '┬'
      cells.push({ ch, color: litFrom(x) })
    }
  }
  return runs(cells)
}

/** `▼` under the branch at each card's center, in its color while it runs. */
export function arrows(cs: number[], colors: Array<string | undefined>): Run[] {
  const hi = Math.max(...cs)
  const cells: Cell[] = []
  for (let x = 0; x <= hi; x++) {
    const i = cs.indexOf(x)
    cells.push(i === -1 ? { ch: ' ' } : { ch: '▼', color: colors[i] })
  }
  return runs(cells)
}
