# agent-flow

A live workflow panel for Claude Code. It shows the main model, the advisor and every subagent the session spawns as cards, joined by `delegates` / `asks` arrows, drawn as an animated HUD. The panel docks on the right of the terminal and opens by itself when a session starts.

```
 ◈ WORKFLOW   $3.42  ·  ◷ 12m  ·  ● 2 live / 7  ·  1.24M tok             ▁▂▂▃▅█▇▅▃▂▃▅██▇▅▃▂▂▃  10m
 opus plans · sonnet edits · haiku reads · fable advises

 ⠸ OPUS 5.5 · MAIN SESSION          ● LIVE              FABLE · ADVISOR                   ● ASKED
│ effort ████████░░ xhigh                 │    asks    │ » last asked 2m ago                     │
│ ● delegated · waiting on 2     412k tok │ ◀━·•·•·━▶  │ ● advised                       calls 3 │
└────────────────────┬────────────────────┘            └─────────────────────────────────────────┘
                     │ delegates
               ┌──•──●──────────────────────────┬────────────────────────────────┐
               ▼                                ▼                                ▼
 ⠸ HAIKU 5.5 · EXPLORER [▾ ×5]    ✓ SONNET 5.5 · WORKER     [▸]    ⚠ SONNET 5.5 · REVIEWER   [▸]
│ ███████████░░░░░░░ 3/5 done │  │ ██████████████████████ done │  │ ███████████████████ refused │
│ ● reading · 16 files        │  │ ✓ done · 1m 12s             │  │ ⚠ refused · cyber           │
│ 356k tok         ▁▂▃▅▆▇█▆▅▃ │  │ 48k tok          ▁▁▁▃▆▆██▆▁ │  │ 12k tok          ▁▁▁▁▁▁▁▄▄█ │
└─────────────────────────────┘  └─────────────────────────────┘  └─────────────────────────────┘
 EXPLORER · 5 agents                                                                     ● 2  ✓ 3
│ ⠸ #5  map the auth module       Read auth/session.ts                   9 tools · 210k · 1m 05s │
│ ⠸ #4  find the config loader    Grep "loadConfig"                      7 tools · 146k · 1m 31s │
│ ✓ #3  list the API routes       found 14 routes in api/                    5 tools · 48k · 52s │
│ ✓ #2  read the test setup       vitest, 3 projects                         4 tools · 31k · 40s │
│ ✓ #1  scan package.json         12 scripts, pnpm                            2 tools · 9k · 18s │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## What it shows

- **One card per agent type.** Parallel agents of the same type share a card and are counted as `×N`. Each card has a coloured title band (`MODEL · ROLE`) and shows its effort level, what it is doing right now (`reading · 16 files`, `editing · 3 files`, `running · 2 commands`), its token total and a small token sparkline.
- **Bands by tone.** A band is filled in the family colour while the card is live, tinted when it is done or stopped, amber for a refusal and red for a failure.
- **Batch progress.** A card with several agents has a bar that fills as they finish (`3/5 done`). A single running agent shows a glow sweeping along its bar instead.
- **Header and sparklines.** The strip at the top shows the session cost, how long it has run (`◷ 12m`, `1h 05m`, `4d 01h`), how many agents are live out of the total, the token count and a sparkline of the last 10 minutes.
- **Animation.** Spinners turn on live bands and rows, dots flow along the `delegates` branch in the color of each running agent, and the `asks` arrow pulses for a few seconds after every advisor call. An idle session does not redraw.
- **The agent list.** Click anywhere on a card, or press its digit `1`–`9`, to open every agent of that type in place; click the card or the list's title band again to close it. The digit keys work after you have clicked on the panel. Each row shows:
  - its task;
  - its current tool and target (`Edit auth/session.ts`, `Bash npm test`);
  - `tools · tokens · time`;
  - once the agent is done, the first line of its answer.
- **Refusals.** When a safeguard refuses an agent or a main turn, it is flagged in amber as `⚠ refused · <category>`, not `✗ failed`. Its `[ copy ]` button copies what a support ticket needs:
  - the time in UTC;
  - the model;
  - the category;
  - the session;
  - the agent;
  - the request IDs of the refused responses.
- **Narrow panes.** Below 60 columns, or when the pane is inline, the panel falls back to one line per agent. Surfaces other than the terminal keep the plain card layout.

## Sessions

Below the panel, a `SESSIONS` table lists every Claude Code session running on this machine, one row each. A row shows the session's name, its project, how long it has been in its state, and what it is doing: the tool it has open while it works, or the first line of its last answer while it waits.

| State | Meaning |
| --- | --- |
| `WAITING` | idle, and waiting for you |
| `WORKING` | busy with a turn |
| `SHELL` | running a shell command |
| `quiet` | idle for more than 2 hours, so it no longer asks for you |

Any other status the registry reports shows as it is, in capitals, with its age. Waiting rows come first, then working, shell, other and quiet, newest change first. Your own session is marked `· this`. Narrow panes drop the project and the detail, and the inline layout keeps one line per session.

When another session goes from working to waiting, the panel raises a toast (`● api-work is waiting · backend`) and plays the rising ding. Your own session never toasts, and neither does the first look after a load. The toast follows the `notifications` option: it is off for `errors` and `off`.

The table is refreshed every 3 seconds. It reads only `~/.claude/sessions/*.json` and the last 256 KB of each transcript, locally, and checks with `ps` that the process is still a live `claude`, so a stale file does not show. It never opens a `*.key` file, and nothing leaves your machine.

## Notifications & sound

When something is worth looking up, the panel raises a toast and, on macOS, plays a short tone:

| When | Toast | Tone |
| --- | --- | --- |
| an agent is refused | `⚠ worker #2 refused · cyber` | low |
| an agent fails | `✗ worker #2 failed` | low |
| a main turn is refused | `⚠ main session refused · cyber` | low |
| every running agent has ended | `✓ 15 agents done · 4m 12s · 1 refused` | rising ding |
| one agent finishes (`every-agent` only) | `✓ explorer #3 done · 48s` | none |

Notices raised together arrive as one toast. At most one tone plays every 3 seconds, and the low tone wins.

You choose these two options when you install the plugin, and you can change them later in `/config`:

| Option | Values | Default |
| --- | --- | --- |
| `notifications` | `batch-and-errors`, `every-agent`, `errors` (failures and refusals only), `off` | `batch-and-errors` |
| `sound` | on / off | on |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install agent-flow --marketplace luucas42/agent-flow
```

Answer `y` to add the marketplace and pick a scope; the user scope makes it run in every session. The plugin is a function-hooks mod, so its hooks start running in that session straight away.

### Requirements

- A Claude Code build with function hooks (mods). This mod was built and tested on 2.1.294. The hooks API is early access and may change between releases.
- **Fullscreen terminal UI** (`"tui": "fullscreen"`), which docks the panel on the right. Otherwise it sits inline above the prompt.
- A pane opened automatically at session start needs a terminal at least **144 columns** wide. After you open it once with `/flow`, it opens itself from 110 columns.

## Commands

| Command | What it does |
| --- | --- |
| `/flow` | Toggle the panel |
| `/flow show` / `/flow hide` | Open or close it |
| `/flow reset` | Clear the cards and counters |

`/clear` also resets the panel.

## How it works

The mod only observes: every hook passes the session's events through untouched and never blocks a tool call, a spawn or a turn.

| Event | Feeds |
| --- | --- |
| `agent.spawn` | a card and its agent rows |
| `tool.call` (inside a subagent) | the activity line and the agent's current target |
| `turn.step` | model, effort and token counts per loop, and advisor calls on the main loop |
| `turn.complete` | done, failed, stopped or refused, plus the answer's first line |
| `$.agent.list()` | a check every 5 s that catches agents that ended without a `turn.complete` |
| `~/.claude/sessions/*.json` and `ps`, every 3 s | the `SESSIONS` table |
| `UserPromptSubmit` / `Stop` (settings hooks) | the transcript path, read only when you press `[ copy ]` |

State lives in the session's `$.state`, so a reload keeps the panel. Agent cost is shown as tokens only; dollars appear only as the session total.

## Development

```
hooks/format.ts     names, tokens, durations, effort bars, tool verbs and targets
hooks/model.ts      pure reducers over one state value (`flow`)
hooks/layout.ts     card grid and the branch/arrow glyph runs
hooks/sessions.ts   pure parsing, classifying, sorting and diffing of the sessions table rows
hooks/scene.ts      a pure `Flow` to `Scene` step: all the formatted text the HUD shows
hooks/hud.ts        a pure `Scene` to cell-exact lines and click targets, with the animation frames
hooks/flow-client.tsx  the Client that draws the HUD, animates it and posts clicks and keys
hooks/view.tsx      the plain Pane tree used off the terminal
hooks/register.tsx  the event hooks, the tickers, the sessions poll and `/flow`
sounds/             done.wav (batch ended) and alert.wav (failure or refusal)
tests/              claude plugin test (133 tests)
```

```
claude plugin validate .
claude plugin test .
```

## License

MIT
