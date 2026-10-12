import { describe, expect, test } from 'claude-code/testing'

import { arrows, branch, centers, chunk, grid, topRow } from '../hooks/layout'
import type { Run } from '../hooks/layout'

const text = (rs: Run[]) => rs.map(r => r.text).join('')

describe('layout', () => {
  test('the grid fits cards between 24 and 34 cells wide', () => {
    expect(grid(104, 2)).toEqual({ perRow: 2, width: 34 })
    expect(grid(104, 5)).toEqual({ perRow: 4, width: 24 })
    expect(grid(40, 3)).toEqual({ perRow: 1, width: 34 })
  })

  test('the top row splits around the asks arrow', () => {
    expect(topRow(104, true)).toEqual({ main: 46, advisor: 46 })
    expect(topRow(104, false)).toEqual({ main: 40, advisor: 0 })
  })

  test('centers and chunks', () => {
    expect(centers(3, 24)).toEqual([12, 38, 64])
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test('the branch lights the way from the junction to running cards', () => {
    expect(branch([2, 8], 5, [undefined, '#C6F432'])).toEqual([
      { text: '  ┌──' },
      { text: '●', color: '#FFFFFF' },
      { text: '──┐', color: '#C6F432' },
    ])
    expect(branch([5], 5, [undefined])).toEqual([{ text: '     ●' }])
    expect(text(branch([12, 38, 64], 23, [undefined, undefined, undefined]))).toBe(
      ' '.repeat(12) + '┌' + '─'.repeat(10) + '●' + '─'.repeat(14) + '┬' + '─'.repeat(25) + '┐',
    )
  })

  test('arrows point down at each card, lit when it runs', () => {
    expect(arrows([2, 8], [undefined, '#C6F432'])).toEqual([
      { text: '  ▼     ' },
      { text: '▼', color: '#C6F432' },
    ])
  })
})
