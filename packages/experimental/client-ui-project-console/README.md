---
description: "Workspace console page: the read-only live session task overview of one project, fed by the sessionTasks Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-project-console

English | [中文](README.zh.md)

## Summary

The page contributes one global main panel, **Project console**, and its sidebar entry. It is the browser face of a workspace-scoped live task overview: it reads the `sessionTasks` Remote for the selected workspace, lists each live session with its running activity families, and re-reads when the Session model reports status or activity changes. The package is opt-in and adds no model-facing contribution.

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

Mount the page in a Web composition that also mounts a Host controller serving the `sessionTasks` Remote; the sidebar entry opens the panel for the current workspace. No configuration is declared.

### What the page can do

- Contribute the `project-console` main panel and its sidebar entry, with copy for the eight shipped Client languages.
- Pick one Workspace, then read its live sessions, each row naming the session, its `running` or `idle` state, its working directory, and the activity families still running for it; the header summarizes visible sessions and how many run.
- Open the console from the sidebar entry, or from a Workspace row's "…" menu: that row's Workspace becomes the selected scope.
- Re-read automatically after a session status or activity event, coalescing bursts into one read; **Refresh** reads on demand.
- A failed read keeps the last rows visible and shows a compact retry notice; the full error state appears only when no rows were ever read.

### Failures and recovery

- A Remote failure renders the stored message in the notice and leaves the last successful rows in place.
- Without a mounted controller the read fails the same way; fix the composition, then **Retry**.
- The store stops timers, workspace subscriptions, and publication when the plugin disposes.

<a id="understand-the-implementation"></a>
## Understand the implementation

### Design philosophy

A global main panel fits the "one console per project" shape: the sidebar entry selects the panel, and the panel scopes its reads to the selected workspace instead of tying the page to one Session. Page state lives in one store outside React: the view subscribes to identity-stable snapshots, and event-driven refreshes coalesce so a burst of session activity causes one Remote read. Client copy stays in the package dictionary so a locale switch re-renders without a Host round trip.

### Source map

- `src/index.ts` — Host-face marker; the browser contribution is discovered through the package client declaration.
- `src/client/index.ts` — locale registration, the `main` panel registration, and the `sidebar.panellist` entry.
- `src/client/ProjectConsoleStore.ts` — Workspace selection, overview reads, failure retention, and refresh coalescing.
- `src/client/ProjectConsolePage.tsx` — the page component, skeletons, notices, rows, and the header summary.
- `src/client/ProjectConsoleMenu.tsx` — the Workspace row menu entry that opens the console on that row's Workspace.
- `src/client/ProjectConsolePage.module.css` — the page stylesheet, built from theme tokens.
- `src/client/locales.ts` — the eight language dictionaries.

### Operation flow

The client plugin registers its dictionaries, creates the store, and registers the main panel and the sidebar entry. The store reads the selected Workspace through `ctx.remote.sessionTasks.snapshot`; forwarded `api-session/status` and `api-session/activity` events plus `connection/reset` mark the overview stale, and the store coalesces a re-read. Nothing is written to the Session log.

## Further Exploration

- [Session task overview Remote](../api-session-tasks/README.md) — the Host data face this page will consume.
- [Session task overview tool](../tool-session-tasks/README.md) — the model-facing consumer of the same aggregation.
- [Client layout service](../../client/ui-layout/README.md) — the main-panel registry this page contributes to.

## Model Experience

None, as the page reads a Host Remote and renders browser UI without contributing model context or Session events.

#### KV Cache effect

No effect; the model request prefix is unchanged by this package.

## Known Limitations and Deferred Work

These limits define when this package is a poor fit or needs special operational care. They are current package constraints, not a task backlog.

- **Live sessions only** — sessions without a live Agent in this Host never appear, even when persisted jobs or schedules would report activity for them.
- **Requires the Host Remote** — the page has no data path of its own; a composition without the controller shows the failure notice.
- **No controls** — dispatch, interruption, and approvals belong to a later phase.
- **Entry points are the sidebar and the Workspace row menu** — enabling the bundle is the deferred one-step path; without the page plugin the Workspace menu slot renders no extra row.
- **Not in a bundle yet** — the package is experimental and must be mounted explicitly until an experimental bundle exists.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

#### Future: data and entry placement

Whether the page keeps an in-page workspace picker or follows the sidebar's current Workspace, and whether the sidebar entry stays global, remain undecided until the bundle increment exercises both.

</details>
