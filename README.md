# agent-flow

A live workflow panel for Claude Code. It shows the main model, the advisor and every subagent the session spawns as cards, joined by `delegates` / `asks` arrows. The panel docks on the right of the terminal and opens by itself when a session starts.

```
 WORKFLOW                                        session $3.42 · 12m
 opus plans · sonnet edits · haiku reads · fable advises

╭────────────────────────────────────╮        ╭──────────────────────────────╮
│ Opus 5.5  MAIN SESSION             │  asks  │ Fable  ADVISOR               │
│ effort ■■■■□ xhigh                 │◀──────▶│ » last asked 2m ago          │
│ ● delegated · waiting on 2         │        │ ○ quiet          calls 3     │
╰─────────────────┬──────────────────╯        ╰──────────────────────────────╯
                  │ delegates
        ┌─────────●──────────────┐
        ▼                        ▼
╭─────────────────────╮  ╭─────────────────────╮
│ Haiku 5.5  [ ▾ ×2 ] │  │ Sonnet 5.5  [ ▸ ]   │
│ EXPLORER            │  │ WORKER              │
│ effort ■■■■□ xhigh  │  │ effort ■■□□□ medium │
│ ● reading · 16 files│  │ ✓ done · 1m 12s     │
│           356k tok  │  │            48k tok  │
╰─────────────────────╯  ╰─────────────────────╯
╭──────────────────────────────────────────────────────────────╮
│ EXPLORER · 2 agents                                    ● 2   │
│ ● #2  map the auth module           9 tools · 210k · 1m 05s  │
│       Read auth/session.ts                                   │
│ ● #1  find the config loader        7 tools · 146k · 1m 31s  │
│       Grep "loadConfig"                                      │
╰──────────────────────────────────────────────────────────────╯
```

## What it shows

- **One card per agent type.** Parallel agents of the same type share a card and are counted as `×N`. Each card shows its model, its role, its effort level, what it is doing right now (`reading · 16 files`, `editing · 3 files`, `running · 2 commands`) and its token total. A finished card dims to `✓ done · <time>`.
- **Arrows.** The `delegates` branch lights up in the color of each running agent. The `asks` arrow glows for a few seconds after every advisor call.
- **The agent list.** Press a card's `[ ▸ ]` button, or its digit `1`–`9` while the pane has focus (ctrl+x tab), to open every agent of that type in place. Each row shows:
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
- **Header.** The session's total cost and how long the session has been running.
- **Narrow panes.** Below 60 columns, or when the pane is inline, the panel falls back to one line per agent.

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
| `UserPromptSubmit` / `Stop` (settings hooks) | the transcript path, read only when you press `[ copy ]` |

State lives in the session's `$.state`, so a reload keeps the panel. Agent cost is shown as tokens only; dollars appear only as the session total.

## Development

```
hooks/format.ts     names, tokens, durations, effort bars, tool verbs and targets
hooks/model.ts      pure reducers over one state value (`flow`)
hooks/layout.ts     card grid and the branch/arrow glyph runs
hooks/view.tsx      the Pane tree: header, cards, arrows, agent list, compact mode
hooks/register.tsx  the event hooks, the ticker and `/flow`
sounds/             done.wav (batch ended) and alert.wav (failure or refusal)
tests/              claude plugin test (60 tests)
```

```
claude plugin validate .
claude plugin test .
```

## License

MIT
