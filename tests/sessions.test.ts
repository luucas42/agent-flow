import { describe, expect, test } from 'claude-code/testing'

import { QUIET_MS, liveClaudePids, parseRegistered, parseTail, rowOf, sessionNotices, sortRows, stateOf, transcriptPath } from '../hooks/sessions'
import type { Registered } from '../hooks/sessions'
import type { SessionRow } from '../types'

const file = {
  pid: 3282, sessionId: 'abc-123', cwd: '/Users/x/Desktop/Betalux', name: 'betalux-55', status: 'busy',
  statusUpdatedAt: 5000, updatedAt: 6000, startedAt: 1000, version: '2.1.294', kind: 'interactive',
}
const reg = (over: Partial<Registered> = {}): Registered => ({ pid: 1, sessionId: 's1', cwd: '/a/proj', name: 'n', status: 'idle', statusUpdatedAt: 0, ...over })
const row = (over: Partial<SessionRow> = {}): SessionRow => ({ id: 's1', pid: 1, name: 'n', project: 'proj', state: 'waiting', status: 'idle', since: 0, isThis: false, ...over })

describe('parseRegistered', () => {
  test('a good file', () => {
    expect(parseRegistered(JSON.stringify(file))).toEqual({
      pid: 3282, sessionId: 'abc-123', cwd: '/Users/x/Desktop/Betalux', name: 'betalux-55', status: 'busy', statusUpdatedAt: 5000,
    })
  })

  test('garbage and missing ids are rejected', () => {
    expect(parseRegistered('not json')).toBeUndefined()
    expect(parseRegistered('null')).toBeUndefined()
    expect(parseRegistered(JSON.stringify({ ...file, sessionId: undefined }))).toBeUndefined()
  })

  test('defaults: the name is the folder, the status idle, the time falls back', () => {
    const r = parseRegistered(JSON.stringify({ pid: 1, sessionId: 's', cwd: '/a/b/proj', updatedAt: 7, startedAt: 3 }))
    expect(r).toEqual({ pid: 1, sessionId: 's', cwd: '/a/b/proj', name: 'proj', status: 'idle', statusUpdatedAt: 7 })
    expect(parseRegistered(JSON.stringify({ pid: 1, sessionId: 's', cwd: '/p', startedAt: 3 }))?.statusUpdatedAt).toBe(3)
    expect(parseRegistered(JSON.stringify({ pid: 1, sessionId: 's', cwd: '/p' }))?.statusUpdatedAt).toBe(0)
  })
})

test('transcriptPath slugs every char outside [A-Za-z0-9]', () => {
  expect(transcriptPath('/H', reg({ cwd: '/Users/x/Desktop/Bet-lux 2', sessionId: 'abc' }))).toBe('/H/.claude/projects/-Users-x-Desktop-Bet-lux-2/abc.jsonl')
})

describe('parseTail', () => {
  const lines = (...entries: unknown[]) => ['{"cut":', ...entries.map(e => JSON.stringify(e))].join('\n')
  const prompt = { type: 'user', message: { content: 'do it' } }
  const say = (text: string) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
  const use = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }] } }
  const result = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }

  test('the last text after a prompt is the answer', () => {
    expect(parseTail(lines(prompt, say('## Done\nmore')))).toEqual({ answer: 'Done' })
  })

  test('a tool without a result is open', () => {
    expect(parseTail(lines(prompt, use))).toEqual({ tool: 'Bash npm test' })
  })

  test('a tool closed by its result is not', () => {
    expect(parseTail(lines(prompt, use, result))).toEqual({})
  })

  test('a command echo keeps the answer, a real prompt clears it', () => {
    const echo = { type: 'user', message: { content: '<command-name>/reload-plugins</command-name>' } }
    expect(parseTail(lines(prompt, say('Done'), echo))).toEqual({ answer: 'Done' })
    expect(parseTail(lines(prompt, say('Done'), prompt))).toEqual({})
  })

  test('the first line is dropped, even when it parses', () => {
    expect(parseTail([JSON.stringify(say('cut')), JSON.stringify(say('kept'))].join('\n'))).toEqual({ answer: 'kept' })
  })

  test('empty text and garbage lines give nothing and never throw', () => {
    expect(parseTail('')).toEqual({})
    expect(parseTail('x\nnot json\nnull\n{"type":"assistant","message":null}\n')).toEqual({})
  })
})

test('liveClaudePids keeps claude and drops others', () => {
  expect(liveClaudePids(' 3282 claude\n 9999 node\n 77 /opt/bin/claude\n')).toEqual(new Set([3282, 77]))
  expect(liveClaudePids('')).toEqual(new Set())
})

test('stateOf: busy, idle around the quiet edge, shell and other', () => {
  expect(stateOf(reg({ status: 'busy' }), 0)).toBe('working')
  expect(stateOf(reg({ status: 'idle' }), QUIET_MS)).toBe('waiting')
  expect(stateOf(reg({ status: 'idle' }), QUIET_MS + 1)).toBe('quiet')
  expect(stateOf(reg({ status: 'shell' }), 0)).toBe('shell')
  expect(stateOf(reg({ status: 'weird' }), 0)).toBe('other')
})

describe('rowOf', () => {
  const tail = { answer: 'Done', tool: 'Bash ls' }
  test('what: working shows the tool, waiting the answer, the rest nothing', () => {
    expect(rowOf(reg({ status: 'busy' }), tail, undefined, 0).what).toBe('Bash ls')
    expect(rowOf(reg({ status: 'busy' }), { answer: 'Done' }, undefined, 0).what).toBe('Done')
    expect(rowOf(reg({ status: 'idle' }), tail, undefined, 0).what).toBe('Done')
    expect(rowOf(reg({ status: 'shell' }), tail, undefined, 0)).not.toHaveProperty('what')
  })

  test('project is the folder and isThis compares the session id', () => {
    expect(rowOf(reg(), undefined, 's1', 0)).toMatchObject({ id: 's1', project: 'proj', isThis: true, state: 'waiting' })
    expect(rowOf(reg(), undefined, 'other', 0).isThis).toBe(false)
  })
})

test('sortRows: waiting, working, shell, other, quiet; newest first', () => {
  const rows = [
    row({ id: 'q', state: 'quiet', since: 9 }), row({ id: 'o', state: 'other', since: 1 }), row({ id: 's', state: 'shell', since: 1 }),
    row({ id: 'w1', state: 'working', since: 1 }), row({ id: 'w2', state: 'working', since: 2 }),
    row({ id: 'a1', state: 'waiting', since: 1 }), row({ id: 'a2', state: 'waiting', since: 2 }),
  ]
  expect(sortRows(rows).map(r => r.id)).toEqual(['a2', 'a1', 'w2', 'w1', 's', 'o', 'q'])
})

describe('sessionNotices', () => {
  test('working to waiting toasts with a ding', () => {
    expect(sessionNotices([row({ state: 'working' })], [row({ name: 'api', project: 'betex' })])).toEqual([{ text: '● api is waiting · betex', sound: 'done' }])
  })

  test('never for this session, from nothing, or from waiting', () => {
    expect(sessionNotices([row({ state: 'working' })], [row({ isThis: true })])).toEqual([])
    expect(sessionNotices([], [row()])).toEqual([])
    expect(sessionNotices([row()], [row()])).toEqual([])
  })
})
