import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, RenderSurface, TextProps } from 'claude-code'

import type { Card, CardStatus, Effort, Flow } from '../types'
import { COLORS, ERROR_COLOR, WARN_COLOR, WHITE, effortBar, familyOf, minutes, modelName, tokens, usd } from './format'
import { ASK_WIDTH, COMPACT_BELOW, GAP, arrows, branch, centers, chunk, grid, topRow } from './layout'
import type { Run } from './layout'
import {
  advisorState,
  cardState,
  cardsInOrder,
  instanceFigures,
  instanceState,
  instancesOf,
  isAdvisorShown,
  isGlowing,
  isViewed,
  legend,
  mainState,
  sectionCounts,
  toggleLabel,
  totalRunning,
} from './model'

export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}
export type Frame = {
  bodyColumns: number
  placement: 'dock' | 'inline'
  viewAgentId?: string
  expanded: string | null
  onToggle: (type: string) => void
  onCopy: (target: string, surface: RenderSurface) => void
}

type Look = { color: string; isDim: boolean; isBold: boolean; width: number }

export function view(kit: Kit, flow: Flow, frame: Frame): RenderElement {
  return frame.placement === 'inline' || frame.bodyColumns < COMPACT_BELOW ? compact(kit, flow, frame) : full(kit, flow, frame)
}

/** A failed agent in red, a refused one in amber, the rest in their family's color. */
function statusColor(status: CardStatus, model: string | undefined): string {
  if (status === 'failed') return ERROR_COLOR
  if (status === 'refused') return WARN_COLOR
  return COLORS[familyOf(model)]
}

/** A run of text in its color, or dim where it has none. */
function ink({ Text }: Kit, run: Run): RenderElement {
  return run.color === undefined ? <Text dimColor>{run.text}</Text> : <Text color={run.color}>{run.text}</Text>
}

function line(kit: Kit, rs: Run[]): RenderElement {
  const { Text } = kit
  return <Text wrap="truncate-end">{rs.map(run => ink(kit, run))}</Text>
}

/** Left part shrinks and truncates, right part keeps its width. */
function spread({ Box }: Kit, left: RenderElement, right: RenderElement): RenderElement {
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexShrink={1}>{left}</Box>
      <Box flexShrink={0} marginLeft={1}>
        {right}
      </Box>
    </Box>
  )
}

function card({ Box }: Kit, look: Look, rows: RenderElement[]): RenderElement {
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width={look.width}
      paddingX={1}
      borderStyle={look.isBold ? 'bold' : 'round'}
      borderColor={look.color}
      borderDimColor={look.isDim}
    >
      {rows}
    </Box>
  )
}

function effortRow(kit: Kit, effort: Effort, color: string, isDim: boolean): RenderElement {
  const { Text } = kit
  const bar = effortBar(effort)
  const parts = [<Text dimColor>{'effort '}</Text>]
  if (bar.filled !== '' || bar.empty !== '') {
    parts.push(
      <Text color={color} dimColor={isDim}>
        {bar.filled}
      </Text>,
      <Text dimColor>{`${bar.empty} `}</Text>,
    )
  }
  parts.push(
    <Text color={color} dimColor={isDim}>
      {bar.label}
    </Text>,
  )
  return <Text wrap="truncate-end">{parts}</Text>
}

/** The card's open/close control, `[ ▸ ×15 ]`, pressed by a click or, while the pane holds the keys, its digit. */
function toggle({ Button }: Kit, c: Card, index: number, frame: Frame): RenderElement {
  const label = toggleLabel(c, frame.expanded === c.type)
  const onPress = () => frame.onToggle(c.type)
  return index < 9 ? (
    <Button key={`toggle-${c.type}`} label={label} hotkey={String(index + 1)} onPress={onPress} />
  ) : (
    <Button key={`toggle-${c.type}`} label={label} onPress={onPress} />
  )
}

/** `[ copy ]`: a refusal's details, ready for a support ticket, onto the clipboard. */
function copyButton({ Button }: Kit, target: string, frame: Frame): RenderElement {
  return <Button key={`copy-${target}`} label="copy" onPress={press => frame.onCopy(target, press.surface)} />
}

function header(kit: Kit, flow: Flow): RenderElement {
  const { Box, Text } = kit
  const cost = flow.costUsd === undefined ? '' : `session ${usd(flow.costUsd)} · `
  const words = legend(flow).flatMap((entry, i) => [
    ...(i === 0 ? [] : [<Text dimColor>{' · '}</Text>]),
    <Text color={COLORS[entry.family]} bold>
      {entry.family}
    </Text>,
    <Text dimColor>{` ${entry.word}`}</Text>,
  ])

  return (
    <Box flexDirection="column" marginBottom={1}>
      {spread(kit, <Text bold>{'WORKFLOW'}</Text>, <Text dimColor>{`${cost}${minutes(flow.now - flow.startedAt)}`}</Text>)}
      {words.length === 0 ? (
        <Text dimColor>{'waiting for the first turn'}</Text>
      ) : (
        <Text wrap="truncate-end">{words}</Text>
      )}
    </Box>
  )
}

function mainCard(kit: Kit, flow: Flow, width: number, frame: Frame): RenderElement {
  const { Box, Text } = kit
  const color = COLORS[familyOf(flow.main.model)]
  const state = mainState(flow)
  const isRefused = flow.main.refusal !== undefined
  const isLive = state.glyph !== '○'
  const rows = [
    <Text wrap="truncate-end">
      <Text bold>{modelName(flow.main.model)}</Text>
      <Text dimColor>{'  MAIN SESSION'}</Text>
    </Text>,
    ...(flow.main.effort === undefined ? [] : [effortRow(kit, flow.main.effort, color, false)]),
    spread(
      kit,
      <Text color={isRefused ? WARN_COLOR : color} dimColor={!isLive} wrap="truncate-end">
        {`${state.glyph} ${state.text}`}
      </Text>,
      <Text dimColor>{`${tokens(flow.main.tokens)} tok`}</Text>,
    ),
    ...(isRefused
      ? [
          <Box flexDirection="row" justifyContent="flex-end">
            {copyButton(kit, 'main', frame)}
          </Box>,
        ]
      : []),
  ]
  return card(kit, { color: isRefused ? WARN_COLOR : color, isDim: !isLive, isBold: false, width }, rows)
}

function advisorCard(kit: Kit, flow: Flow, width: number): RenderElement {
  const { Text } = kit
  const color = COLORS[familyOf(flow.advisor.name ?? 'fable')]
  const isLive = isGlowing(flow.advisor, flow.now)
  const rows = [
    <Text wrap="truncate-end">
      <Text bold>{modelName(flow.advisor.name ?? 'Advisor')}</Text>
      <Text color={color} bold>
        {'  ADVISOR'}
      </Text>
    </Text>,
    <Text color={color} wrap="truncate-end">
      {advisorState(flow)}
    </Text>,
    spread(
      kit,
      <Text color={color} dimColor={!isLive}>
        {isLive ? '● advised' : '○ quiet'}
      </Text>,
      <Text dimColor>{`calls ${flow.advisor.calls}`}</Text>,
    ),
  ]
  return card(kit, { color, isDim: !isLive, isBold: false, width }, rows)
}

function asks({ Box, Text }: Kit, isLive: boolean): RenderElement {
  return (
    <Box flexDirection="column" alignItems="center" width={ASK_WIDTH} flexShrink={0}>
      <Text color={COLORS.fable} dimColor={!isLive}>
        {'asks'}
      </Text>
      <Text color={COLORS.fable} dimColor={!isLive} bold={isLive}>
        {'◀──────▶'}
      </Text>
    </Box>
  )
}

function agentCard(kit: Kit, flow: Flow, c: Card, width: number, index: number, frame: Frame): RenderElement {
  const { Box, Text } = kit
  const isLive = c.status === 'running'
  const color = statusColor(c.status, c.model)
  const state = cardState(c)
  const role = [
    <Text color={color} bold dimColor={!isLive}>
      {c.type.toUpperCase()}
    </Text>,
  ]
  if (c.parentType !== undefined) role.push(<Text dimColor>{` via ${c.parentType}`}</Text>)

  const rows = [
    spread(
      kit,
      <Text bold={isLive} dimColor={!isLive} wrap="truncate-end">
        {modelName(c.model)}
      </Text>,
      toggle(kit, c, index, frame),
    ),
    <Text wrap="truncate-end">{role}</Text>,
    ...(c.effort === undefined ? [] : [effortRow(kit, c.effort, color, !isLive)]),
    <Text color={color} dimColor={!isLive && c.status !== 'refused'} wrap="truncate-end">
      {`${state.glyph} ${state.text}`}
    </Text>,
    <Box flexDirection="row" justifyContent="flex-end">
      <Text dimColor>{`${tokens(c.tokens)} tok`}</Text>
    </Box>,
  ]
  return card(kit, { color, isDim: !isLive, isBold: isViewed(flow, c, frame.viewAgentId), width }, rows)
}

/** The open card's agents, two lines each, framed in the card's color. */
function section(kit: Kit, flow: Flow, c: Card, width: number, frame: Frame): RenderElement {
  const { Box, Text } = kit
  const color = statusColor(c.status, c.model)
  const list = instancesOf(flow, c.type)
  const title = `${c.type.toUpperCase()} · ${list.length} ${list.length === 1 ? 'agent' : 'agents'}`
  const rows = list.flatMap(instance => {
    const state = instanceState(instance)
    const rowColor = statusColor(instance.status, c.model)
    const detail = (
      <Text color={rowColor} dimColor={state.isDim} wrap="truncate-end">
        {`      ${state.detail}`}
      </Text>
    )
    return [
      spread(
        kit,
        <Text wrap="truncate-end">
          <Text color={rowColor} dimColor={state.isDim}>{`${state.glyph} #${instance.n}  `}</Text>
          <Text bold={!state.isDim} dimColor={state.isDim}>
            {instance.description === '' ? 'untitled' : instance.description}
          </Text>
        </Text>,
        <Text dimColor>{instanceFigures(instance, flow.now)}</Text>,
      ),
      instance.status === 'refused' ? spread(kit, detail, copyButton(kit, instance.id, frame)) : detail,
    ]
  })

  return (
    <Box flexDirection="column" width={width} paddingX={1} borderStyle="round" borderColor={color}>
      {spread(
        kit,
        <Text color={color} bold>
          {title}
        </Text>,
        <Text dimColor>{sectionCounts(list)}</Text>,
      )}
      {rows}
    </Box>
  )
}

function full(kit: Kit, flow: Flow, frame: Frame): RenderElement {
  const { Box, Text } = kit
  const hasAdvisor = isAdvisorShown(flow)
  const widths = topRow(frame.bodyColumns, hasAdvisor)
  const top = (
    <Box flexDirection="row" alignItems="center">
      {mainCard(kit, flow, widths.main, frame)}
      {hasAdvisor ? asks(kit, isGlowing(flow.advisor, flow.now)) : null}
      {hasAdvisor ? advisorCard(kit, flow, widths.advisor) : null}
    </Box>
  )

  const cards = cardsInOrder(flow)
  if (cards.length === 0) {
    return (
      <Box flexDirection="column">
        {header(kit, flow)}
        {top}
      </Box>
    )
  }

  const junction = Math.floor(widths.main / 2)
  const isAnyLive = totalRunning(flow) > 0
  const { perRow, width } = grid(frame.bodyColumns, cards.length)
  const rows = chunk(cards, perRow).map((row, r) => {
    const cs = centers(row.length, width)
    const colors = row.map(c => (c.status === 'running' ? COLORS[familyOf(c.model)] : undefined))
    const open = row.find(c => c.type === frame.expanded)
    return (
      <Box flexDirection="column">
        {line(kit, branch(cs, junction, colors))}
        {line(kit, arrows(cs, colors))}
        <Box flexDirection="row" columnGap={GAP}>
          {row.map((c, i) => agentCard(kit, flow, c, width, r * perRow + i, frame))}
        </Box>
        {open === undefined ? null : section(kit, flow, open, frame.bodyColumns, frame)}
      </Box>
    )
  })

  return (
    <Box flexDirection="column">
      {header(kit, flow)}
      {top}
      <Text wrap="truncate-end">
        {ink(kit, { text: `${' '.repeat(junction)}│`, color: isAnyLive ? WHITE : undefined })}
        <Text dimColor>{' delegates'}</Text>
      </Text>
      {rows}
    </Box>
  )
}

function compact(kit: Kit, flow: Flow, frame: Frame): RenderElement {
  const { Box, Text } = kit
  const main = mainState(flow)
  const isRefused = flow.main.refusal !== undefined
  const mainLine = (
    <Text wrap="truncate-end">
      <Text color={isRefused ? WARN_COLOR : COLORS[familyOf(flow.main.model)]}>{`${main.glyph} `}</Text>
      <Text bold>{modelName(flow.main.model)}</Text>
      <Text dimColor>{`  MAIN · ${main.text} · ${tokens(flow.main.tokens)} tok`}</Text>
    </Text>
  )
  const lines: RenderElement[] = [
    spread(kit, <Text bold>{'WORKFLOW'}</Text>, <Text dimColor>{minutes(flow.now - flow.startedAt)}</Text>),
    isRefused ? spread(kit, mainLine, copyButton(kit, 'main', frame)) : mainLine,
  ]

  if (isAdvisorShown(flow)) {
    lines.push(
      <Text wrap="truncate-end">
        <Text color={COLORS.fable}>{isGlowing(flow.advisor, flow.now) ? '● ' : '○ '}</Text>
        <Text bold>{modelName(flow.advisor.name ?? 'Advisor')}</Text>
        <Text dimColor>{`  ADVISOR · calls ${flow.advisor.calls}`}</Text>
      </Text>,
    )
  }

  cardsInOrder(flow).forEach((c, index) => {
    const state = cardState(c)
    const isLive = c.status === 'running'
    const color = statusColor(c.status, c.model)
    lines.push(
      <Box flexDirection="row">
        <Box flexShrink={0} marginRight={1}>
          {toggle(kit, c, index, frame)}
        </Box>
        <Text wrap="truncate-end">
          <Text color={color} dimColor={!isLive}>{`${state.glyph} `}</Text>
          <Text bold={isLive} dimColor={!isLive}>
            {modelName(c.model)}
          </Text>
          <Text color={color} dimColor={!isLive}>
            {`  ${c.type.toUpperCase()}`}
          </Text>
          <Text dimColor>{` · ${state.text} · ${tokens(c.tokens)} tok`}</Text>
        </Text>
      </Box>,
    )
    if (frame.expanded === c.type) lines.push(section(kit, flow, c, frame.bodyColumns, frame))
  })

  return <Box flexDirection="column">{lines}</Box>
}
