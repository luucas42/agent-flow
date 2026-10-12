import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { world } from './world'

const HOME = '/H'
const START = { cwd: '/Users/x/proj', surface: null, isInteractive: false } as const
type Reg = { pid: number; sessionId: string; name: string; status: string; cwd?: string }

const registry = (reg: Reg): string =>
  JSON.stringify({ cwd: '/Users/x/proj', statusUpdatedAt: 1_000_000 - 60_000, updatedAt: 1_000_000, startedAt: 1, kind: 'interactive', ...reg })

/**
 * The machine beneath the plugin: a sessions folder, `ps` and `tail`.
 * Tests change `files` and `live` between polls and read what was asked of it.
 */
function machine(on: On, thisId = 'me') {
  const files: Record<string, string> = {}
  const live = new Set<number>()
  const reads: string[] = []
  const runs: Array<readonly string[]> = []
  const toasts: string[] = []

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'flow' } }))
  on('settings.read', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('session.id', () => ({ value: thisId }))
  on('fs.list', () => ({
    value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', (_, e) => {
    reads.push(e.path)
    const text = files[e.path.split('/').pop() ?? '']
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('process.run', (_, e) => {
    runs.push(e.argv)
    const out = e.argv[0] === 'ps' ? [...live].map(pid => `${pid} claude`).join('\n') : ''
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', () => ({ value: undefined }))
  return { files, live, reads, runs, toasts }
}

describe('the sessions poll', () => {
  test('reads the .json files, never a .key, and drops what is not live', async ($, on) => {
    const { clock, peekSessions } = world(on)
    const m = machine(on)
    m.files['10.json'] = registry({ pid: 10, sessionId: 'a', name: 'alpha', status: 'idle' })
    m.files['20.json'] = registry({ pid: 20, sessionId: 'b', name: 'beta', status: 'busy' })
    m.files['30.json'] = registry({ pid: 30, sessionId: 'c', name: 'gone', status: 'idle' })
    m.files['secret.key'] = 'DO NOT READ'
    m.live.add(10).add(20)

    await $.session.start(START)
    await clock.advance(3_000)

    expect(m.reads.some(path => path.endsWith('.key'))).toBe(false)
    expect(m.reads).toHaveLength(3)
    expect(m.runs[0]).toEqual(['ps', '-o', 'pid=,comm=', '-p', '10,20,30'])
    expect(peekSessions()?.map(row => row.id)).toEqual(['a', 'b'])
  })

  test('two live sessions are two rows, waiting before working', async ($, on) => {
    const { clock, peekSessions } = world(on)
    const m = machine(on)
    m.files['10.json'] = registry({ pid: 10, sessionId: 'a', name: 'alpha', status: 'busy' })
    m.files['20.json'] = registry({ pid: 20, sessionId: 'b', name: 'beta', status: 'idle' })
    m.files['k.key'] = 'x'
    m.live.add(10).add(20)

    await $.session.start(START)
    await clock.advance(3_000)

    expect(peekSessions()?.map(row => [row.name, row.state])).toEqual([
      ['beta', 'waiting'],
      ['alpha', 'working'],
    ])
  })

  test('the transcript is read through tail with the byte cap', async ($, on) => {
    const { clock, peekSessions } = world(on)
    const m = machine(on)
    m.files['10.json'] = registry({ pid: 10, sessionId: 'a', name: 'alpha', status: 'busy' })
    m.live.add(10)

    await $.session.start(START)
    await clock.advance(3_000)

    expect(m.runs).toContainEqual(['tail', '-c', '262144', `${HOME}/.claude/projects/-Users-x-proj/a.jsonl`])
  })

  test('a session that flips from busy to idle raises one toast, the first poll none', async ($, on) => {
    const { clock, peekSessions } = world(on)
    const m = machine(on)
    m.files['10.json'] = registry({ pid: 10, sessionId: 'a', name: 'alpha', status: 'busy' })
    m.live.add(10)

    await $.session.start(START)
    await clock.advance(3_000)
    expect(m.toasts).toEqual([])

    m.files['10.json'] = registry({ pid: 10, sessionId: 'a', name: 'alpha', status: 'idle' })
    await clock.advance(3_000)
    expect(m.toasts).toEqual(['● alpha is waiting · proj'])

    await clock.advance(3_000)
    expect(m.toasts).toHaveLength(1)
  })

  test('the same flip for this session raises no toast', async ($, on) => {
    const { clock, peekSessions } = world(on)
    const m = machine(on, 'a')
    m.files['10.json'] = registry({ pid: 10, sessionId: 'a', name: 'alpha', status: 'busy' })
    m.live.add(10)

    await $.session.start(START)
    await clock.advance(3_000)
    m.files['10.json'] = registry({ pid: 10, sessionId: 'a', name: 'alpha', status: 'idle' })
    await clock.advance(3_000)

    expect(peekSessions()?.[0]).toMatchObject({ state: 'waiting', isThis: true })
    expect(m.toasts).toEqual([])
  })
})
