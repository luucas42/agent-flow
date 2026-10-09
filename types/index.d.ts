export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number

/** One model loop's running figures. */
export type LoopInfo = {
  model?: string
  effort?: Effort
  tokens: number
}

export type CardStatus = 'running' | 'done' | 'failed' | 'stopped'

/** One subagent type: every instance of it this session, drawn as one card. */
export type Card = LoopInfo & {
  type: string
  order: number
  parentType?: string
  status: CardStatus
  running: number
  spawned: number
  runStartedAt: number
  lastRunMs?: number
  lastTool?: string
  verbCounts: Record<string, number>
}

/** One spawned agent, a row of its card's list. */
export type Instance = {
  type: string
  status: CardStatus
  n: number
  description: string
  startedAt: number
  endedAt?: number
  lastAt: number
  tools: number
  tokens: number
  lastTool?: string
  lastTarget?: string
  answer?: string
}

export type Advisor = { name?: string; calls: number; lastEndedAt?: number }

export type Flow = {
  version: number
  startedAt: number
  now: number
  costUsd?: number
  main: LoopInfo & { turnActive: boolean }
  advisor: Advisor
  cards: Record<string, Card>
  instances: Record<string, Instance>
}

declare module 'claude-code' {
  interface PluginState {
    'agent-flow': { flow: Flow; expanded: string | null }
  }
}
