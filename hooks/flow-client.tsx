import type { ClientModule } from 'claude-code'

import { FRAME_MS, hud } from './hud'
import type { Hud } from './hud'
import type { Scene } from './scene'

type State = { mount: string; frame: number }

/** What each mounted instance drew last, by mount: the listeners read it. */
const drawn = new Map<string, { scene: Scene; hud: Hud }>()

/** The HUD: draws the scene's lines, advances the animation while anything is live, and posts clicks. */
const FlowHud: ClientModule<Scene, State> = (scene, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state

  if (state === undefined) {
    const mount = Math.random().toString(36).slice(2, 8)
    surface.every(FRAME_MS, () => {
      const s = surface.state
      if (s !== undefined && drawn.get(mount)?.scene.isAnimated === true) surface.setState({ ...s, frame: s.frame + 1 })
    })
    surface.onPointer(p => {
      if (p.type !== 'down' || (p.button !== undefined && p.button !== 'left')) return
      const hit = drawn.get(mount)?.hud.hits.find(h => h.y === p.y && p.x >= h.x0 && p.x < h.x1)
      if (hit !== undefined) surface.post(hit.action)
    })
    surface.onKey(k => {
      const n = Number(k.key)
      if (k.ctrl || k.meta || !Number.isInteger(n) || n < 1 || n > 9) return
      const card = drawn.get(mount)?.scene.cards[n - 1]
      if (card !== undefined) surface.post({ kind: 'toggle', type: card.type })
    })
    surface.setState({ mount, frame: 0 })
    return <Text>{''}</Text>
  }

  try {
    const columns = surface.columns > 0 ? surface.columns : scene.columnsHint
    const out = hud(scene, columns, state.frame)
    drawn.set(state.mount, { scene, hud: out })
    return (
      <Box flexDirection="column">
        {out.lines.map(line => (
          <Text wrap="truncate-end">
            {line.every(run => run.text === '') ? ' ' : line.map(run => (
              <Text color={run.fg} backgroundColor={run.bg} bold={run.bold} dimColor={run.dim}>
                {run.text}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  } catch (err) {
    return <Text dimColor>{`agent-flow: ${err instanceof Error ? err.message : String(err)}`}</Text>
  }
}

export default FlowHud
