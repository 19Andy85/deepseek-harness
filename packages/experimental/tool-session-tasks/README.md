---
description: "Read-only model-facing live session task overview across the sessions of one Host, for agents that coordinate work running in other sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-session-tasks

English | [中文](README.zh.md)

## Summary

The experimental `session_tasks` tool lists the live sessions of the current Host together with the activity families that still run for each one. It answers "what is running right now, and where" without returning transcript text, and its visibility is a deployment policy rather than an implicit global grant. The package is opt-in; mounting it adds one prompt section and one tool schema to every model request.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package when an agent should coordinate work that runs in other live sessions of the same Host — for example a project overview that shows which sessions are busy before dispatching more work. Avoid it as a transcript reader: the tool reports identity, state, and activity labels only, and reading content remains the job of the session-history tools.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `visibleScope` | `same-cwd` | Which live sessions the tool may reveal: `self` (the caller only), `same-cwd` (sessions created in the caller's working directory), or `host` (every live session of this Host). |

### What the model can do

- `session_tasks` — list visible sessions with `sessionId`, `cwd`, `status` (`running` or `idle`), and the activity families reported by composed providers (`turn`, `job`, `subagent`, `schedule` in the shipped composition).
- Pass `session_id` to keep one session, and `include` to keep selected activity families.
- Running sessions are listed before idle ones, then ordered by session id; an empty overview renders one sentence instead of an empty list.
- `interactive_block` — render one registered block inline by `type` and `props` and register it with the Host. The Host returns the block id and the accepted action ids; `actions` declares them explicitly, and a `choice` block defaults them to its option labels. A block without a Host registration cannot run actions, so a rendered control never pretends to be interactive.
- `console_task_suggest` — persist a pending task proposal and the block that carries its confirm/ignore actions without creating a task. The client submits those actions with `devConsoleBlockAction`; accepting still goes through the existing proposal decision, so ignoring or replaying a click never creates a duplicate task.

### Failures and recovery

The tool requires an agent-bound caller and rejects an unbound execution with `SESSION_TASKS_MISSING_AGENT`. Cancellation between session reads aborts the call. An unknown or invisible `session_id` yields an empty overview rather than an error, so a caller cannot probe for sessions outside its scope.

<a id="understand-the-implementation"></a>
## Understand the implementation

### Design philosophy

Visibility is an explicit policy: the default `same-cwd` scope mirrors the conservative cross-session rule of the session-history tools, and `host` exists for deployments that deliberately treat one Host as a single shared project. The tool reports what the existing `workspace/session-activity` providers already publish, so it adds no new activity taxonomy.

### Source map

- `src/index.ts` — plugin identity, config schema, prompt section, and the `session_tasks` tool definition.
- `src/tasks.ts` — live-agent enumeration, visibility authorization, activity aggregation, ordering, and text rendering.
- `src/console-tools.ts` — the Dev Console tool definitions: task proposal, inline block registration, plan proposal and step updates, reports, handoffs, and Brief transitions.

### Operation flow

The tool resolves the calling agent, asks the Agent registry for live sessions, filters them by `visibleScope` and the optional `session_id`, asks the `workspace/session-activity` waterfall for each visible session, filters families by `include`, sorts rows, and renders JSON text. Nothing is written to the Session log beyond the ordinary tool call and result events.

## Further Exploration

- [Session Activity seam](../../workspace/workspace/README.md) — the provider waterfall this tool reads.
- [Workspace registry](../../workspace/workspace/README.md) — durable project records and session membership.
- [Session query tools](../tool-session-query/README.md) — the authorization and read tools for session content.

## Model Experience

### System prompt

#### What the model sees

The model receives one fixed overview guidance section.

##### Live task overview guidance

```markdown
Use session_tasks to list the sessions currently active in this Host with each row's title, latest human-prompt time, working directory, state, and the activity families still running for it. Pass session_id to restrict the overview to one session and include to keep selected families. The result is a read-only snapshot; it never returns transcript text.
```

#### Token effect

One fixed concise section is present on each request while the plugin is mounted.

#### KV Cache effect

Prefix-stable while the plugin and guidance text are unchanged.

### Tool schemas

#### What the model sees

The model sees the generated [`session_tasks` schema](../../../docs/tool-catalog.md#deepseek-aidsh-experimental-tool-session-tasks) with its two optional parameters.

#### Token effect

One fixed read-only schema is sent on each request while the tool is visible.

#### KV Cache effect

Prefix-stable while tool visibility and the definition are unchanged.

### Tool results

#### What the model sees

Each successful call emits one plain-text block: JSON for a non-empty overview, or one sentence when no session is visible.

#### Token effect

Results are data-dependent and remain in logged tool history until compaction; an agent can then freely choose to start other work.

#### KV Cache effect

Append-only result text follows the reusable request prefix and does not invalidate earlier cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this package is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

- **Live sessions only** — sessions without a live Agent in this Host are invisible, even when persisted jobs or schedules would report activity for them.
- **Metadata only** — titles, recent progress summaries, and transcript excerpts are deferred; the tool reports identity, state, and activity labels.
- **No steering** — dispatch, interruption, and approval actions belong to a later phase; this package never changes another session.
- **`host` scope is unrestricted** — selecting it reveals every live session of the Host to every agent, including working directories the caller does not share.
- **No new activity taxonomy** — the visible families are exactly those the composition's providers publish.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

#### Future: titles and progress summaries

Exact-string `cwd` equality is deliberately conservative; titles and recent progress summaries would reuse the session-query authorization and are undecided in their presentation.

</details>
