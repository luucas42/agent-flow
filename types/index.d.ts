export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number

/** One model loop's running figures. */
export type LoopInfo = {
  model?: string
  effort?: Effort
  tokens: number
}

/** Tokens added per 30 s bucket, keyed by the bucket's index since the session started. */
export type Spark = Record<string, number>

export type CardStatus = 'running' | 'done' | 'failed' | 'stopped' | 'refused'

/** One subagent type: every instance of it this session, drawn as one card. */
export type Card = LoopInfo & {
  type: string
  order: number
  parentType?: string
  status: CardStatus
  reason?: string
  running: number
  spawned: number
  runStartedAt: number
  lastRunMs?: number
  lastTool?: string
  verbCounts: Record<string, number>
  spark: Spark
}

/** One spawned agent, a row of its card's list. */
export type Instance = {
  type: string
  status: CardStatus
  reason?: string
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

/** The main loop's last turn ended in a refusal: of what kind, and when. */
export type Refusal = { category: string; at: number }

/** The agents that ran together, from the first one starting to the last one ending. */
export type Batch = { startedAt: number; ids: string[] }

export type Advisor = { name?: string; calls: number; lastEndedAt?: number }

export type Flow = {
  version: number
  startedAt: number
  now: number
  costUsd?: number
  main: LoopInfo & { turnActive: boolean; refusal?: Refusal }
  advisor: Advisor
  cards: Record<string, Card>
  instances: Record<string, Instance>
  spark: Spark
  batch?: Batch
  transcriptPath?: string
}

/** What a Claude Code session on this machine is doing, for the sessions table. */
export type SessionState = 'waiting' | 'working' | 'shell' | 'quiet' | 'other'

/** One row of the sessions table. */
export type SessionRow = {
  id: string; pid: number; name: string; project: string
  state: SessionState; status: string; since: number; what?: string; isThis: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-flow': { flow: Flow; expanded: string | null; sessions: SessionRow[] }
  }
}
