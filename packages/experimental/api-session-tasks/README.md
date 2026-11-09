---
description: "Read-only browser Remote that projects the live sessions and running activity families of one Host workspace, for the project-console page."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-api-session-tasks

English | [中文](README.zh.md)

## Summary

The controller serves one read-only Remote namespace, `sessionTasks`: `snapshot` reports the live sessions of a workspace with the activity families that still run for each one, and `follow` streams one live session's row until it stops being live. It projects the Agent registry, the `workspace/session-activity` waterfall, and the `title`/`sessionListMetadata` projections; it never reads or writes Session content and adds no model-facing contribution. The package is opt-in and is meant to be mounted beside the browser page that consumes it.

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

Mount the controller in a Host composition whose browser pages need a live task overview. It requires `ctx.typert` and `ctx.agents`; a workspace-scoped read additionally needs a mounted `ctx.workspaceRegistry`. No configuration is declared.

### What the browser can do

- `sessionTasks.snapshot({ workspaceId? })` — one consistent read: the requested workspace identity and path when scoped, plus each live session's `sessionId`, optional `title`, optional `lastPromptAt`, `cwd`, `status` (`running` or `idle`), and provider activity families.
- `sessionTasks.follow({ sessionId })` — a stream of that session's row: one frame on open, one whenever the row changes, and a final frame without a row once the session stops being live. An unknown or non-live session fails with `session-tasks/session-not-found`. Frames are produced by comparing the row at `followIntervalMs` (default 750, minimum 100). Rows also carry durable derivation relations read from persisted session headers (a `parent` Session id, and up to ten `children` with their liveness and delegation depth, refreshed at `relationsRefreshMs`, default 5000), so a finished subagent stays visible after its activity ends. When a storage domain is mounted, the controller keeps one acknowledged baseline per Workspace and adds `lastSeenAt` plus `changes` (Session ids that differ from it) to `snapshot`; `sessionTasks.acknowledge({ workspaceId })` replaces that baseline and returns its time. Without a storage domain the response omits both, and acknowledging fails with `session-tasks/seen-unavailable`. When the optional `workspaceChanges` service serves a summary for the latest `workspace/changes` sequence, rows also carry that turn's changed-file totals (`changes`: total files, added and deleted lines, first three display paths). Rows also carry the outcome of the Session's last finished turn (`outcome`: `completed`, `failed`, `cancelled`, `blocked`, or `truncated`, with `outcomeAt` and a failure `outcomeReason`), folded by a host-only `sessionTaskOutcome` projection over `turn/start` and `turn/end` without reading message content.
- Activity entries carry optional `startedAt` and `lastActivityAt`; when a provider does not report them the controller stamps its first sighting and refreshes the change time only when the family's items change. A running Session whose timed activity has not changed within `stallAfterMs` (default 900000, minimum 60000) is reported with `stalled: true`; without timed activity the judgement stays absent rather than guessing.
- Omit `workspaceId` to read every live session of the Host; running sessions are listed first, then ordered by session id.
- A follow stream compares the projected row instead of subscribing to individual Host events; a change that flips twice between comparisons is observed as its latest row.
- `sessionTasks.devConsoleBlockAction({ blockId, actionId, sessionId, idempotencyKey, payload? })` — run one action of a Host-registered inline block. The Host checks that the block exists, belongs to the Session, declares the action, and is still `pending`, then stores the action record (block, action, Session, idempotency key, result, time) and settles the block to `resolved` in the same write. A repeated key returns the stored result with `replayed: true` and never runs the action again, so a double click cannot create a second task or move the status twice.
- `sessionTasks.devConsoleBlockState({ blockId, sessionId })` — the Host-owned block status (`pending`, `submitted`, `resolved`, `expired`), the accepted action ids, and the last action result, so a reloaded transcript renders the stored status instead of the status recorded when the block was created.

### Failures and recovery

- `session-tasks/workspace-not-found` — the requested workspace id is not registered.
- `session-tasks/workspace-unavailable` — a workspace was requested but no workspace registry is mounted.
- Remote access control still applies per connection; an unauthorized caller never reaches the aggregation.

<a id="understand-the-implementation"></a>
## Understand the implementation

### Design philosophy

The controller owns the browser projection only. Aggregation is a pure function over two Host ports (the Agent registry and one activity lookup), so the model-facing `session_tasks` tool and this Remote share one definition of "active session" while differing in authorization: the tool applies an agent-scoped `visibleScope`, while the Remote follows the page's workspace scope.

### Source map

- `src/index.ts` — `SessionTasksController`, the `sessionTasks` namespace, the `snapshot` method, the polling `follow` stream, its `followIntervalMs` config, and the observed-timing store behind `startedAt`/`lastActivityAt`/`stalled` (`stallAfterMs`).
- `src/aggregation.ts` — pure collection, workspace projection, and the two Remote error codes.
- `src/types.ts` — wire value types, Host ports, and the `RemoteErrorDetailsMap` declarations.
- `src/dev-console-block.ts` — block records, the Host-owned status machine, the idempotency record, and the executor that re-reads, validates, runs, and commits one action.

### Operation flow

`snapshot` resolves the optional workspace through `ctx.workspaceRegistry`, collects live agents, asks the `workspace/session-activity` waterfall per visible session, reads the title and last-prompt projections when composed, projects item identities, sorts the rows, and returns one snapshot. The workspace registry and activity providers stay Host services; the page never receives Session events.

## Further Exploration

- [Session activity seam](../../workspace/workspace/README.md) — the provider waterfall this controller reads.
- [Session task overview tool](../tool-session-tasks/README.md) — the model-facing consumer of the same aggregation.
- [Typert protocol](../../typert/protocol/README.md) — how the `sessionTasks` namespace is generated and dispatched.

## Model Experience

None, as the controller only projects Host activity to a browser Remote; it contributes no model context, tools, or Session events.

#### KV Cache effect

No effect; the model request prefix is unchanged by this package.

## Known Limitations and Deferred Work

These limits define when this package is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

- **Live sessions only** — sessions without a live Agent in this Host are invisible, even when persisted jobs or schedules would report activity for them.
- **Snapshot only** — the page must re-read after activity changes; a follow stream is deferred until the page needs push updates.
- **Read-only overview** — the overview namespace only reads; task, plan, and inline-block writes come from the Dev Console methods in the same namespace.
- **Block status is Host-owned** — a browser never writes it, and a client cannot mark a block resolved. Blocks recorded before the action bus carry no block id, so their cards keep the older proposal decision path.
- **Workspace scope needs a registry** — a scoped read errors rather than falling back to every live session when `ctx.workspaceRegistry` is not mounted.
- **No page-specific access policy yet** — connections are governed by the existing Remote access controls; per-page grants are deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

#### Future: push updates and controls

A follow stream would reuse the existing session activity events rather than add a project-level event, and control actions would extend this namespace instead of the model-facing tool.

</details>
