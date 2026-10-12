import type { Card, CardStatus, Flow, SessionRow, SessionState } from '../types'
import { COLORS, effortBar, familyOf, minutes, modelName, tokens, usd } from './format'
import {
  CARD_BUCKETS, FLOW_BUCKETS, advisorState, bucketOf, cardState, cardsInOrder, instanceFigures, instanceState,
  instancesOf, isAdvisorShown, isGlowing, isViewed, legend, mainState, sectionCounts, sparkValues, totalRunning,
} from './model'

/** How a card, a band or a row is coloured. */
export type Tone = 'live' | 'done' | 'stopped' | 'refused' | 'failed' | 'idle'
export type SceneRow = { id: string; glyph: string; n: number; task: string; now: string; figures: string; tone: Tone; canCopy: boolean }
export type SceneList = { type: string; title: string; counts: string; color: string; tone: Tone; rows: SceneRow[] }
export type SceneCard = {
  type: string; index: number; model: string; role: string; color: string; tone: Tone
  spawned: number; done: number; isOpen: boolean; isViewed: boolean; state: string; tokens: string; spark: number[]
}
export type SceneSessionRow = { id: string; state: SessionState; name: string; project: string; label: string; what: string }
export type SceneSessions = { open: number; waiting: number; working: number; shell: number; quiet: number; rows: SceneSessionRow[] }
export type Scene = {
  columnsHint: number
  isCompact: boolean
  isAnimated: boolean
  header: { cost?: string; age: string; live: number; total: number; tokens: string; spark: number[] }
  legend: Array<{ word: string; family: string; color: string }>
  main: { model: string; color: string; tone: Tone; effort?: { filled: number; label: string }; state: string; tokens: string; canCopy: boolean }
  advisor?: { name: string; color: string; isGlowing: boolean; asked: string; calls: number }
  cards: SceneCard[]
  open?: SceneList
  sessions?: SceneSessions
}

/** The most rows an open list sends to the Client. */
export const MAX_ROWS = 60

export const toneOf = (status: CardStatus): Tone => (status === 'running' ? 'live' : status)

function sceneCard(flow: Flow, card: Card, index: number, expanded: string | null, viewAgentId: string | undefined, idx: number): SceneCard {
  const state = cardState(card)
  const role = card.type.toUpperCase()
  return {
    type: card.type,
    index,
    model: modelName(card.model),
    role: card.parentType === undefined ? role : `${role} via ${card.parentType.toUpperCase()}`,
    color: COLORS[familyOf(card.model)],
    tone: toneOf(card.status),
    spawned: card.spawned,
    done: card.spawned - card.running,
    isOpen: expanded === card.type,
    isViewed: isViewed(flow, card, viewAgentId),
    state: `${state.glyph} ${state.text}`,
    tokens: `${tokens(card.tokens)} tok`,
    spark: sparkValues(card.spark, idx, CARD_BUCKETS),
  }
}

function sceneList(flow: Flow, card: Card): SceneList {
  const list = instancesOf(flow, card.type)
  return {
    type: card.type,
    title: `${card.type.toUpperCase()} · ${list.length} ${list.length === 1 ? 'agent' : 'agents'}`,
    counts: sectionCounts(list),
    color: COLORS[familyOf(card.model)],
    tone: toneOf(card.status),
    rows: list.slice(0, MAX_ROWS).map(instance => {
      const state = instanceState(instance)
      return {
        id: instance.id,
        glyph: state.glyph,
        n: instance.n,
        task: instance.description === '' ? 'untitled' : instance.description,
        now: state.detail,
        figures: instanceFigures(instance, flow.now),
        tone: toneOf(instance.status),
        canCopy: instance.status === 'refused',
      }
    }),
  }
}

/** An age as the sessions table shows it: `12s`, `4m`, `2h`, `4d`. */
export function short(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86_400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86_400)}d`
}

const STATE_WORDS: Record<Exclude<SessionState, 'other'>, string> = { waiting: 'WAITING', working: 'WORKING', shell: 'SHELL', quiet: 'quiet' }

function sceneSessions(rows: SessionRow[], now: number): SceneSessions {
  const count = (state: SessionState) => rows.filter(row => row.state === state).length
  return {
    open: rows.length,
    waiting: count('waiting'),
    working: count('working'),
    shell: count('shell'),
    quiet: count('quiet'),
    rows: rows.map(row => ({
      id: row.id,
      state: row.state,
      name: row.isThis ? `${row.name} · this` : row.name,
      project: row.project,
      label: `${row.state === 'other' ? row.status.toUpperCase() : STATE_WORDS[row.state]} ${short(now - row.since)}`,
      what: row.what ?? '',
    })),
  }
}

/** Everything the HUD draws, as plain text and numbers: the Client's props. */
export function scene(flow: Flow, expanded: string | null, viewAgentId: string | undefined, frame: { columnsHint: number; isCompact: boolean }, sessions: SessionRow[] = []): Scene {
  const idx = bucketOf(flow, flow.now)
  const cards = cardsInOrder(flow)
  const running = totalRunning(flow)
  const main = mainState(flow)
  const bar = flow.main.effort === undefined ? undefined : effortBar(flow.main.effort)
  const allTokens = flow.main.tokens + cards.reduce((sum, card) => sum + card.tokens, 0)
  const openCard = expanded === null ? undefined : flow.cards[expanded]
  const advisorName = flow.advisor.name ?? 'fable'

  return {
    columnsHint: frame.columnsHint,
    isCompact: frame.isCompact,
    isAnimated: running > 0 || flow.main.turnActive || isGlowing(flow.advisor, flow.now) || sessions.some(row => row.state === 'working'),
    header: {
      ...(flow.costUsd === undefined ? {} : { cost: usd(flow.costUsd) }),
      age: minutes(flow.now - flow.startedAt),
      live: running,
      total: cards.reduce((sum, card) => sum + card.spawned, 0),
      tokens: `${tokens(allTokens)} tok`,
      spark: sparkValues(flow.spark, idx, FLOW_BUCKETS),
    },
    legend: legend(flow).map(entry => ({ word: entry.word, family: entry.family, color: COLORS[entry.family] })),
    main: {
      model: modelName(flow.main.model),
      color: COLORS[familyOf(flow.main.model)],
      tone: flow.main.refusal !== undefined ? 'refused' : flow.main.turnActive || running > 0 ? 'live' : 'idle',
      ...(bar === undefined ? {} : { effort: { filled: bar.filled.length, label: bar.label } }),
      state: `${main.glyph} ${main.text}`,
      tokens: `${tokens(flow.main.tokens)} tok`,
      canCopy: flow.main.refusal !== undefined,
    },
    ...(isAdvisorShown(flow)
      ? {
          advisor: {
            name: modelName(flow.advisor.name ?? 'Advisor'),
            color: COLORS[familyOf(advisorName)],
            isGlowing: isGlowing(flow.advisor, flow.now),
            asked: advisorState(flow),
            calls: flow.advisor.calls,
          },
        }
      : {}),
    cards: cards.map((card, index) => sceneCard(flow, card, index, expanded, viewAgentId, idx)),
    ...(openCard === undefined ? {} : { open: sceneList(flow, openCard) }),
    ...(sessions.length === 0 ? {} : { sessions: sceneSessions(sessions, flow.now) }),
  }
}
