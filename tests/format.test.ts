import { describe, expect, test } from 'claude-code/testing'

import { ago, clip, duration, effortBar, familyOf, firstLine, minutes, modelName, target, tokens, usd, verbOf } from '../hooks/format'

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
})
