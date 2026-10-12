import { describe, expect, test } from 'claude-code/testing'

import {
  agentTranscript,
  ago,
  clip,
  duration,
  effortBar,
  familyOf,
  firstLine,
  minutes,
  modelName,
  refusedRequestIds,
  target,
  ticketText,
  tokens,
  usd,
  utc,
  verbOf,
} from '../hooks/format'

describe('format', () => {
  test('names models from ids and aliases', () => {
    expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelName('claude-opus-4-20250514')).toBe('Opus 4')
    expect(modelName('fable')).toBe('Fable')
    expect(modelName('gpt-x')).toBe('gpt-x')
    expect(modelName(undefined)).toBe('Claude')
  })

  test('tells the family', () => {
    expect(familyOf('claude-sonnet-5-5')).toBe('sonnet')
    expect(familyOf('haiku')).toBe('haiku')
    expect(familyOf('mystery')).toBe('other')
    expect(familyOf(undefined)).toBe('other')
  })

  test('formats tokens', () => {
    expect(tokens(950)).toBe('950')
    expect(tokens(1000)).toBe('1k')
    expect(tokens(12_400)).toBe('12.4k')
    expect(tokens(356_000)).toBe('356k')
    expect(tokens(999_600)).toBe('1M')
    expect(tokens(1_200_000)).toBe('1.2M')
  })

  test('formats durations, ages, money and minutes', () => {
    expect(duration(12_400)).toBe('12s')
    expect(duration(72_000)).toBe('1m 12s')
    expect(duration(3_900_000)).toBe('1h 05m')
    expect(ago(30_000)).toBe('just now')
    expect(ago(150_000)).toBe('2m ago')
    expect(ago(7_200_000)).toBe('2h ago')
    expect(usd(3.4)).toBe('$3.40')
    expect(minutes(12 * 60_000 + 5)).toBe('12m')
    expect(minutes(65 * 60_000)).toBe('1h 05m')
    expect(minutes(5778 * 60_000)).toBe('4d 00h')
  })

  test('draws effort bars', () => {
    expect(effortBar('xhigh')).toEqual({ filled: '■■■■', empty: '□', label: 'xhigh' })
    expect(effortBar('medium')).toEqual({ filled: '■■', empty: '□□□', label: 'medium' })
    expect(effortBar(3)).toEqual({ filled: '', empty: '', label: '3' })
  })

  test('turns tools into verbs', () => {
    expect(verbOf('Read')).toEqual({ verb: 'reading', noun: 'files' })
    expect(verbOf('Glob')).toEqual({ verb: 'searching', noun: 'queries' })
    expect(verbOf('mcp__github__create_issue')).toEqual({ verb: 'create_issue', noun: 'calls' })
    expect(verbOf('Skill')).toEqual({ verb: 'skill', noun: 'calls' })
  })

  test('names what a tool works on', () => {
    expect(target('Edit', { file_path: '/repo/src/auth/session.ts' })).toBe('auth/session.ts')
    expect(target('Read', { file_path: 'README.md' })).toBe('README.md')
    expect(target('Grep', { pattern: 'login' })).toBe('"login"')
    expect(target('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts')
    expect(target('Bash', { command: 'npm test -- login\necho done' })).toBe('npm test -- login')
    expect(target('WebFetch', { url: 'https://docs.example.com/api' })).toBe('docs.example.com/api')
    expect(target('WebSearch', { query: 'ink borders' })).toBe('"ink borders"')
    expect(target('Skill', { skill: 'x' })).toBeUndefined()
    expect(target('Read', {})).toBeUndefined()
    expect(target('Bash', { command: 'x'.repeat(200) })).toBe(`${'x'.repeat(79)}…`)
  })

  test('takes the first line of an answer', () => {
    expect(firstLine('\n## Done\nmore')).toBe('Done')
    expect(firstLine('- updated 3 files')).toBe('updated 3 files')
    expect(firstLine('   \n  ')).toBeUndefined()
    expect(firstLine('y'.repeat(150))).toBe(`${'y'.repeat(99)}…`)
    expect(clip('short', 10)).toBe('short')
  })
  test('formats a refusal for a support ticket', () => {
    const at = Date.UTC(2026, 9, 8, 14, 40, 28)
    expect(utc(at)).toBe('2026-10-08 14:40:28 UTC')
    expect(agentTranscript('/p/sess.jsonl', 'a1')).toBe('/p/sess/subagents/agent-a1.jsonl')
    expect(
      ticketText({
        at,
        model: 'claude-mythos-5-1',
        category: 'cyber',
        sessionId: 's1',
        agent: { id: 'a1', type: 'worker', n: 3 },
        requestIds: ['req_1', 'req_2'],
      }),
    ).toBe(
      [
        'Claude Code safeguard refusal',
        'time: 2026-10-08 14:40:28 UTC',
        'model: claude-mythos-5-1',
        'category: cyber',
        'session: s1',
        'agent: a1 (worker #3)',
        'request ids: req_1, req_2',
      ].join('\n'),
    )
    expect(ticketText({ at: 0, category: 'cyber', requestIds: [] })).toBe(
      ['Claude Code safeguard refusal', 'time: 1970-01-01 00:00:00 UTC', 'model: unknown', 'category: cyber'].join('\n'),
    )
  })

  test('finds the request ids of refused responses at the end of a transcript', () => {
    const row = (id: string, stop: string) => JSON.stringify({ type: 'assistant', requestId: id, message: { stop_reason: stop } })
    const text = [
      '{"cut',
      row('req_old', 'refusal'),
      row('req_ok', 'end_turn'),
      row('req_a', 'refusal'),
      row('req_a', 'refusal'),
      row('req_b', 'refusal'),
      'not json "refusal"',
    ].join('\n')
    expect(refusedRequestIds(text)).toEqual(['req_old', 'req_a', 'req_b'])
    expect(refusedRequestIds(text, 2)).toEqual(['req_a', 'req_b'])
    expect(refusedRequestIds('')).toEqual([])
  })
})
